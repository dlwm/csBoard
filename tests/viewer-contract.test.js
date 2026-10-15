import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewerController } from '../packages/viewer/src/core/controller.js';
import { createViewerToolAdapter } from '../packages/viewer/src/core/toolAdapter.js';
import { createCommandRegistry } from '../packages/viewer/src/core/commandRegistry.js';
import { contractIssue } from '../packages/viewer/src/core/validation.js';

function fixture() {
 let edits=0,approvals=0, viewer;
 const observerErrors=[],events=[];
 viewer=createViewerController({profile:'standalone',commands:createCommandRegistry({
  'player.rename':()=>{edits++;viewer.notify('workspace.changed',{playerCount:1},{changed:true});},
  'camera.mode':()=>{},
 }),readState:()=>({ready:true}),policy:()=>{approvals++;},onObserverError:error=>observerErrors.push(error)});
 viewer.on('*',event=>events.push(event));
 return {viewer,observerErrors,events,get edits(){return edits;},get approvals(){return approvals;}};
}
test('invalid public edits are rejected before approval or mutation with field diagnostics',async()=>{
 const f=fixture();
 for(const command of [{type:'player.rename',id:'one',name:'new',position:[0,0,0]},{type:'player.rename',id:'one'},{type:'camera.mode',mode:'wrong'}]){
  const result=await f.viewer.execute(command);
  assert.equal(result.status,'failed');assert.equal(result.error.code,'invalid_argument');
  assert.ok(result.error.details.issue.path.startsWith('/'));assert.ok(result.error.details.parameters);
 }
 assert.equal(f.edits,0);assert.equal(f.approvals,0);assert.equal(f.viewer.getState().revision,0);
 const result=await f.viewer.execute({type:'player.rename',id:'one',name:'new'});
 assert.equal(result.status,'succeeded');assert.equal(f.edits,1);assert.equal(f.approvals,1);assert.equal(result.revision,1);
 assert.equal(f.observerErrors.length,0);f.viewer.dispose();
});
test('invalid contexts return structured failures and leave the operation lane usable',async()=>{
 const f=fixture();
 for(const context of [null,[],{origin:3},{operationId:''},{expectedRevision:NaN},{signal:{}}]){
  const result=await f.viewer.execute({type:'camera.mode',mode:'2d'},context);
  assert.equal(result.status,'failed');assert.equal(result.error.code,'invalid_context');
 }
 assert.equal((await f.viewer.execute({type:'camera.mode',mode:'2d'})).status,'succeeded');
 assert.equal(f.observerErrors.length,0);f.viewer.dispose();
});
test('invalid event payloads reach the diagnostic hook without contaminating subscribers',()=>{
 const f=fixture();f.viewer.notify('selection.changed',{id:123});
 assert.equal(f.observerErrors[0].code,'invalid_event');assert.equal(f.observerErrors[0].details.issue.path,'/id');
 assert.equal(f.events.length,0);f.viewer.notify('selection.changed',{id:null});assert.equal(f.events.length,1);
 assert.equal(contractIssue('standalone','event','selection.changed',f.events[0].payload),null);
 f.viewer.dispose();f.viewer.dispose();assert.equal(f.events.filter(e=>e.type==='lifecycle.disposed').length,1);
});
test('AI tool results preserve actionable argument diagnostics and reject duplicate state sections',async()=>{
 const f=fixture(),tools=createViewerToolAdapter(f.viewer);
 const result=await tools.invoke('viewer_execute',{command:{type:'player.rename',id:'one'}});
 assert.equal(result.error.details.issue.path,'/name');
 const query=await tools.invoke('viewer_get_state',{sections:['ready','ready']});assert.equal(query.error.code,'invalid_argument');
 f.viewer.dispose();
});
test('an asynchronous non-serializable result remains a structured failure and releases the lane',async()=>{
 const circular={};circular.self=circular;
 const viewer=createViewerController({commands:createCommandRegistry({'bad':async()=>circular,'good':()=>42}),readState:()=>({})});
 const result=await viewer.execute({type:'bad'});assert.equal(result.status,'failed');assert.equal(result.error.code,'invalid_data');
 assert.equal((await viewer.execute({type:'good'})).value,42);viewer.dispose();
});

test('malformed envelopes remain structured failures with valid operation events',async()=>{
 const f=fixture();
 for(const command of [null,[],{}, {type:123}]) {
  const result=await f.viewer.execute(command);assert.equal(result.status,'failed');assert.equal(result.error.code,'invalid_command');
 }
 assert.equal(f.observerErrors.length,0);assert.equal(f.events.length,4);
 for(const event of f.events)assert.equal(contractIssue('standalone','event',event.type,event.payload),null);
 assert.throws(()=>f.viewer.on('',()=>{}),error=>error.code==='invalid_argument');f.viewer.dispose();
});

test('malformed driver diagnostics cannot break structured failures or the operation lane',async()=>{
 const details={};details.self=details;
 const viewer=createViewerController({commands:createCommandRegistry({'bad':()=>{throw {code:'driver_failed',message:123,details};},'good':()=>42}),readState:()=>({})});
 const result=await viewer.execute({type:'bad'});assert.equal(result.status,'failed');assert.equal(result.error.code,'driver_failed');assert.equal(result.error.message,'123');assert.equal(result.error.details.serializationError,'invalid_data');
 assert.equal((await viewer.execute({type:'good'})).value,42);viewer.dispose();
});

test('subscriber edits cannot interleave revisions while an operation publishes its changes',async()=>{
 const f=fixture();let nested;
 f.viewer.on('workspace.changed',()=>{nested=f.viewer.execute({type:'player.rename',id:'one',name:'nested'});});
 const result=await f.viewer.execute({type:'player.rename',id:'one',name:'outer'});
 assert.equal(nested.status,'failed');assert.equal(nested.error.code,'operation_busy');assert.equal(result.status,'succeeded');assert.equal(result.revision,1);assert.equal(f.edits,1);
 assert.equal(f.viewer.getState().lastAction.status,'succeeded');f.viewer.dispose();
});
