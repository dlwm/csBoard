import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { decodeStoredValue } from '../shared/storage-codec.js';
import { predictSmokeVoxels, compareSmokeVoxels, smokeVoxelToSource } from '../packages/viewer/src/smoke/index.js';
import { createSmokeCollisionWorld } from '../packages/viewer/src/smoke/three.js';

// Real, unmodified recorded voxels; do not tune against the evaluation rounds.
// 中文：逐一对照真实样本，保留失败项；没有误差阈值通过就等于精确复现的说法。
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const serve=process.argv.includes('--serve');
const args=process.argv.slice(2).filter(arg=>arg!=='--serve');
const get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
if(args.includes('--help')){console.log('make smoke-compare ARGS="--model path/to/de_dust2.glb [--out .local/smoke-prediction] [--serve]"');process.exit(0);}
if(!get('--model'))throw Error('Provide the real Dust2 world GLB with --model; coordinates must already match the CSBoard scene.');
for(let i=0;i<args.length;i+=2)if(!['--model','--out'].includes(args[i])||!args[i+1])throw Error('Unknown or missing argument; use --help');
const model=path.resolve(get('--model')),out=path.resolve(get('--out')||path.join(root,'.local/smoke-prediction'));
const bytes=await fs.readFile(model);
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),path.dirname(model)+'/');
const example=decodeStoredValue(gunzipSync(await fs.readFile(path.join(root,'docs/presets/demos/operation-guide.json.gz'))).toString());
const start=performance.now(),collision=createSmokeCollisionWorld({root:scene}),samples=[];
const serialize=frame=>({...frame,voxels:Array.from(frame.voxels)});
try {
  for(const round of example.rounds)for(const reference of round.smokeVoxelFrames){
    const before=performance.now(),baseline=predictSmokeVoxels({origin:reference.origin});
    const referenceCollidingCells=[...reference.voxels].filter(voxel=>collision.isCellBlocked(smokeVoxelToSource(voxel,reference.origin),10)).length;
    const sample={round:round.round,tick:reference.tick,entityId:reference.entityId,reference:serialize(reference),referenceCollidingCells,baseline:serialize(baseline.frame),baselineMetrics:compareSmokeVoxels(reference,baseline.frame)};
    try {
      const predicted=predictSmokeVoxels({origin:reference.origin,collision});
      // Independent check of occupied-cell probes, not merely an algorithm flag.
      let collidingCells=0;
      for(const voxel of predicted.frame.voxels)if(collision.isCellBlocked(smokeVoxelToSource(voxel,reference.origin),10))collidingCells++;
      Object.assign(sample,{prediction:serialize(predicted.frame),parameters:predicted.parameters,diagnostics:predicted.diagnostics,metrics:compareSmokeVoxels(reference,predicted.frame),collidingCells});
    }catch(error){sample.error={code:error.code||'error',message:error.message};}
    sample.elapsedMs=performance.now()-before;samples.push(sample);
  }
  const valid=samples.filter(s=>s.metrics),mean=key=>valid.length ? valid.reduce((sum,s)=>sum+s.metrics[key],0)/valid.length : null;
  const baselineMean=key=>valid.length ? valid.reduce((sum,s)=>sum+s.baselineMetrics[key],0)/valid.length : null;
  const report={algorithm:'reachable-ellipsoid/1',source:example.sourceFileName,map:'de_dust2',
    notes:['Recorded frames contain only 40–44 occupied cells each; retain this sparse representation unchanged.','Static approximate cloud only, not Valve physics. Model geometry may differ from actual collision geometry.','All samples are evaluation examples; no constants were fitted to these examples.','Collision validity does not imply agreement with recorded shape or render-time wall clipping.'],
    summary:{samples:samples.length,referenceCells:samples.reduce((n,s)=>n+s.reference.voxels.length,0),referenceCollidingCells:samples.reduce((n,s)=>n+s.referenceCollidingCells,0),succeeded:valid.length,failed:samples.length-valid.length,meanIoU:mean('iou'),meanToleranceF1:mean('f1'),meanDistanceInches:mean('meanDistance'),matchedBaseline:{samples:valid.length,meanIoU:baselineMean('iou'),meanToleranceF1:baselineMean('f1'),meanDistanceInches:baselineMean('meanDistance')},collidingCells:valid.reduce((n,s)=>n+s.collidingCells,0),elapsedMs:performance.now()-start},collision:collision.getStats(),samples};
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  const template=await fs.readFile(path.join(root,'scripts/fixtures/smoke-comparison.html'),'utf8');
  await fs.writeFile(path.join(out,'index.html'),template);
  const summary=report.summary;
  const markdown=`# Smoke prediction comparison\n\nSource: ${report.source}; map: Dust2.\n\n${report.notes.map(n=>'- '+n).join('\n')}\n\n## Results\n\n- Samples: ${summary.samples}; generated: ${summary.succeeded}; explicitly rejected: ${summary.failed}.\n- Mean exact IoU: ${(summary.meanIoU*100).toFixed(2)}%.\n- Mean F1 within 20 Source inches: ${(summary.meanToleranceF1*100).toFixed(2)}%.\n- Mean symmetric nearest-cell distance: ${summary.meanDistanceInches?.toFixed(2) ?? 'n/a'} Source inches.\n- Recorded cells touching the conservative visual-model probes: ${summary.referenceCollidingCells}/${summary.referenceCells}. This measures disagreement between recorded data and this model/probe method, not a claim that the game smoke is wrong.\n- Occupied cells crossing snapshot geometry in the independent corner-probe check: ${summary.collidingCells}.\n- Total elapsed: ${(summary.elapsedMs/1000).toFixed(2)}s (includes collision snapshot and independent checks).\n\nMatched unconstrained baseline (${summary.matchedBaseline.samples} successful cases): IoU ${((summary.matchedBaseline.meanIoU??0)*100).toFixed(2)}%; F1 ${((summary.matchedBaseline.meanToleranceF1??0)*100).toFixed(2)}%; distance ${summary.matchedBaseline.meanDistanceInches?.toFixed(2) ?? 'n/a'} inches.\n\nThese are measurements, not accuracy approval. Exact shape agreement is currently insufficient for game-accurate prediction. The API is experimental and opt-in.\n\nUse index.html through the project Vite server for recorded / predicted / unconstrained views; raw data are in comparison.json.\n`;
  await fs.writeFile(path.join(out,'REPORT.md'),markdown);console.log(JSON.stringify(summary,null,2));console.log(`Report: ${path.relative(root,out)}/REPORT.md`);
}finally{collision.dispose();scene.traverse(object=>{object.geometry?.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)material?.dispose();});}

if(serve){
  const {createServer}=await import('vite');
  const server=await createServer({configFile:false,root,server:{host:'127.0.0.1',port:5188,strictPort:true,fs:{allow:[root,out]}}});
  await server.listen();
  const relative=path.relative(root,path.join(out,'index.html')).split(path.sep).join('/');
  const url=relative.startsWith('../')?`/@fs/${path.join(out,'index.html')}`:`/${relative}`;
  console.log(`Comparison preview: http://127.0.0.1:5188${url}`);
}
