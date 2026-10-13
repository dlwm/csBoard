import test from 'node:test';
import assert from 'node:assert/strict';
import { createPackageWriter } from '../src/formats/packageIO.js';
import { openReplayPackageSource, REPLAY_PROFILE_VERSION } from '../packages/viewer/src/formats/index.js';

// Small authored standard fixture. No local Demo, game installation or network.
// 手写标准数据覆盖边界，不依赖开发机的大型 Demo 或游戏资源。
function replayPackage({brokenSegment=false}={}) {
  const writer=createPackageWriter();
  const player={...Object.fromEntries(['position','yaw','pitch','health','alive','weapon','inventory','armor','helmet','defuseKit','hasBomb','ammo','crouchAmount','airborne','walking','flashDurationSeconds','scoped','money','placeName','input'].map(key=>[key,null])),playerId:'player-1',side:'T',producerFields:{}};
  const segment={id:'round-1',frames:[0,32,64].map(tick=>({tick,players:[{...player,position:[tick,2,3]}],producerFields:{}})),preparationFrames:[],projectiles:[],smokeFrames:[{tick:32,entityId:'smoke-1',origin:[1,2,3],sequence:0,voxels:[0,32767],producerFields:{}}],fireFrames:[],voiceFrames:[],producerFields:{}};
  writer.add('manifest.json',{schemaVersion:REPLAY_PROFILE_VERSION,kind:'match',producer:{name:'Fixture',version:'1',parser:'authored'},mapName:'de_dust2',tickRate:64,sampleRate:2,coordinateSpace:'source2-world-units',capabilities:{replay:{status:'available'},smokeVoxels:{status:'available'},voice:{status:'unknown'}},files:{metadata:'metadata.json',players:'players.json',events:'events.json'},segments:[{id:'round-1',file:'segments/1.json',startTick:0,activeStartTick:0,endTick:64,sourceRound:1}]},'replayManifest');
  writer.add('metadata.json',{name:'Fixture',sourceFileName:null,producerFields:{}},'replayMetadata');
  writer.add('players.json',[{id:'player-1',name:'Player',steamId:null,producerFields:{}}],'replayPlayers');
  writer.add('events.json',[],'replayEvents');
  writer.add('segments/1.json',brokenSegment ? {invalid:true} : segment,brokenSegment ? undefined : 'replaySegment');
  return writer.finish();
}
const rows=async (lease,track,query)=>{const result=[];for await(const batch of lease.readTrack(track,query))result.push(...batch);return result;};

test('standard ZIP round-trip preserves coordinates, missing health and recorded smoke',async()=>{
  const source=await openReplayPackageSource(new Blob([replayPackage()]));
  try {
    const lease=await source.openSegment({segmentId:'round-1'});
    try {
      const frames=await rows(lease,'frames',{startTick:32,endTick:64,batchSize:1});
      assert.deepEqual(frames.map(frame=>frame.tick),[32,64]);
      assert.deepEqual(frames[0].players[0].position,[32,2,3]);
      assert.equal(frames[0].players[0].health,null);
      assert.deepEqual((await rows(lease,'smokeFrames'))[0].voxels,[0,32767]);
      assert.equal(lease.getCapabilities().voiceFrames.status,'unknown');
      await assert.rejects(rows(lease,'voiceFrames'),/unknown/);
    } finally {lease.dispose();}
  } finally {source.dispose();}
});
test('segment validation is lazy but invalid data cannot reach playback',async()=>{
  const source=await openReplayPackageSource(replayPackage({brokenSegment:true}));
  try {assert.equal(source.listSegments().length,1);await assert.rejects(source.openSegment({segmentId:'round-1'}),error=>error.code==='invalid_schema');}
  finally {source.dispose();}
});
test('cancelled reads and disposed leases cannot yield further replay rows',async()=>{
  const abort=new AbortController();abort.abort(new Error('Read cancelled'));
  await assert.rejects(openReplayPackageSource(replayPackage(),{signal:abort.signal}),/Read cancelled/);
  const source=await openReplayPackageSource(replayPackage());
  const lease=await source.openSegment({segmentId:'round-1'});
  await assert.rejects(rows(lease,'frames',{signal:abort.signal}),/Read cancelled/);
  lease.dispose();await assert.rejects(rows(lease,'frames'),/closed/);
  source.dispose();source.dispose();assert.throws(()=>source.listSegments(),/disposed/);
});
test('truncated input fails with a format error rather than a DataView crash',async()=>{
  await assert.rejects(openReplayPackageSource(new Uint8Array([80,75])),error=>error.code==='invalid_zip');
});
