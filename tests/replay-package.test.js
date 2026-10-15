import test from 'node:test';
import assert from 'node:assert/strict';
import { replayPackage } from './fixtures/replayPackage.js';
import { openReplayPackageSource } from '../packages/viewer/src/formats/index.js';

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
