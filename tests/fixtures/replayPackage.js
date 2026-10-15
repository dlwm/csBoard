import { createPackageWriter } from '../../src/formats/packageIO.js';
import { REPLAY_PROFILE_VERSION } from '../../packages/viewer/src/formats/index.js';

// Small authored standard fixture. No local Demo, game installation or network.
// 手写标准数据覆盖边界，不依赖开发机的大型 Demo 或游戏资源。
export function replayPackage({brokenSegment=false}={}) {
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
