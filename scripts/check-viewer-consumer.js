import { ensureElectronRuntime } from './lib/electron-runtime.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { replayPackage } from '../tests/fixtures/replayPackage.js';

// Test the distributable in a temporary project outside the repository. Source
// aliases and ancestor node_modules must not hide undeclared dependencies.
// 在仓库外安装实际 tar 包，避免源码别名和上层依赖掩盖漏打包。
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'build/qa/viewer-consumer');
const consumer=await fs.mkdtemp(path.join(os.tmpdir(),'csboard-viewer-consumer-'));
await fs.mkdir(artifacts,{recursive:true});
for(const name of ['result.json','window.png','minimal.png','process.log'])await fs.rm(path.join(artifacts,name),{force:true});
let log='',server,failure;
async function run(command,args,{cwd=root,env=process.env}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});let output='';
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;log+=chunk;});
    child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error(`${path.basename(command)} exited ${code}: ${output.slice(-4000)}`)));
  });
}
try {
  // Resolve npm from PATH where Node installers use another layout (Windows/CI).
  const npm=async args=>process.platform==='win32'
    ? run(process.execPath,[process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...args],{cwd:consumer})
    : run('npm',args,{cwd:consumer});
  await npm(['pack',path.join(root,'packages/viewer'),'--pack-destination',consumer,'--ignore-scripts','--json']);
  const archive=(await fs.readdir(consumer)).find(file=>file.endsWith('.tgz'));
  if(!archive)throw Error('npm pack produced no archive');
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  const dependencies=Object.fromEntries(['three','three-mesh-bvh'].map(name=>[name,lock.packages[`node_modules/${name}`].version]));
  dependencies['@csboard/viewer']=`file:./${archive}`;
  await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({name:'external-viewer-check',private:true,type:'module',dependencies},null,2));
  await npm(['install','--ignore-scripts','--no-audit','--no-fund','--package-lock=false']);
  const packageJson=JSON.parse(await fs.readFile(path.join(consumer,'node_modules/@csboard/viewer/package.json'),'utf8'));
  if((await fs.lstat(path.join(consumer,'node_modules/@csboard/viewer'))).isSymbolicLink())throw Error('Consumer installed a source symlink instead of packed files');
  const imports=Object.keys(packageJson.exports).map(key=>key==='.'?'@csboard/viewer':`@csboard/viewer${key.slice(1)}`);
  await fs.writeFile(path.join(consumer,'check-exports.mjs'),imports.map(name=>`await import(${JSON.stringify(name)});`).join('\n'));
  await run(process.execPath,[path.join(consumer,'check-exports.mjs')],{cwd:consumer});
  await fs.cp(path.join(root,'scripts/fixtures/viewer-consumer'),consumer,{recursive:true});
  await fs.cp(path.join(consumer,'node_modules/@csboard/viewer/examples/minimal'),path.join(consumer,'minimal'),{recursive:true});
  const dist=path.join(consumer,'dist');
  await fs.writeFile(path.join(consumer,'vite.config.mjs'),`export default {root:${JSON.stringify(consumer)},publicDir:false,build:{outDir:${JSON.stringify(dist)},emptyOutDir:true,rollupOptions:{input:{acceptance:${JSON.stringify(path.join(consumer,'index.html'))},minimal:${JSON.stringify(path.join(consumer,'minimal/index.html'))}}}}};\n`);
  await run(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config',path.join(consumer,'vite.config.mjs')],{cwd:consumer});
  await fs.writeFile(path.join(dist,'fixture.cs2df'),replayPackage());
  const navPath=path.join(consumer,'nav.json'),replayPath=path.join(consumer,'fixture.cs2df'),invalidPath=path.join(consumer,'invalid.cs2df');
  await fs.writeFile(navPath,JSON.stringify({areas:{one:{corners:[{x:-100,y:-100,z:20},{x:100,y:-100,z:20},{x:100,y:100,z:20},{x:-100,y:100,z:20}]}}}));
  await fs.writeFile(replayPath,replayPackage());
  await fs.writeFile(invalidPath,Buffer.from([80,75]));
  const contentTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.cs2df':'application/zip'};
  server=http.createServer(async(req,res)=>{
    try {
      const file=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));
      if(path.relative(dist,file).startsWith('..'))throw Error('Invalid path');
      const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':contentTypes[path.extname(file)] || 'application/octet-stream'});res.end(body);
    }catch{if(!res.headersSent)res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const spec=path.join(consumer,'browser.json');
  await fs.writeFile(spec,JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,artifacts,exports:imports,files:{nav:navPath,replay:replayPath,invalid:invalidPath}}));
  const electron=await ensureElectronRuntime();
  await run(electron,[...(process.platform==='linux'?['--no-sandbox']:[]),path.join(root,'scripts/lib/viewer-consumer-browser.cjs'),spec]);
  const result=JSON.parse(await fs.readFile(path.join(artifacts,'result.json'),'utf8'));
  if(!result.ok)throw Error(result.error || 'External viewer check failed');
  console.log(`Installed viewer consumer passed: ${result.checks.length} browser checks, ${imports.length} public entry points`);
}catch(error){failure=error;}
finally {
  await fs.writeFile(path.join(artifacts,'process.log'),log+(failure?'\n'+failure.stack:''));
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.rm(consumer,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
if(failure)throw failure;
