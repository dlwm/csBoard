// Event payloads are part of the public contract, not implementation diaries.
// 中文：共享事件定义明确字段；宿主扩展保留自己的结构与校验责任。
import { WORKSPACE_PLAYER_SCHEMA } from '../data/workspace.js';
const text={type:'string'}, num={type:'number'}, bool={type:'boolean'};
const nullable=s=>({anyOf:[s,{type:'null'}]});
const object=(properties={},required=Object.keys(properties),additionalProperties=false)=>({type:'object',properties,required,additionalProperties});
const list=items=>({type:'array',items});
const enumeration=values=>({enum:values});
const vec=list(num);vec.minItems=vec.maxItems=3;
const error=nullable(object({code:text,message:text,details:{}},['code','message'],true));
const follow=object({playerId:nullable(text),status:enumeration(['idle','following','unavailable'])});
const director=object({mode:enumeration([null,'follow','fixed','chase']),status:enumeration(['idle','following','unavailable']),eventKey:nullable(text),playerId:nullable(text),reason:enumeration([null,'missing_event','missing_target_or_pose'])});
const camera=object({position:vec,target:vec,mode:enumeration(['2d','3d']),follow,director,monitorIds:list(text)});
const segment=nullable(object({id:text,startTick:num,activeStartTick:num,endTick:num},undefined,true));
const playback=object({status:enumeration(['empty','loading','ready','error']),playing:bool,tick:num,speed:num,segment,error,capabilities:{type:'object',additionalProperties:object({status:enumeration(['available','empty','unknown','unsupported']),reason:text},['status'])},trackCounts:{type:'object',additionalProperties:{type:'integer',minimum:0}}});
const voice=object({enabled:bool,muted:bool,volume:{type:'number',minimum:0,maximum:1},side:enumeration(['all','T','CT']),status:enumeration(['unknown','unsupported','empty','idle','loading','ready','partial','limited','error']),capability:enumeration(['unknown','unsupported','empty','available']),error,speakingIds:list(text),frameCount:num,clipCount:num,audioReady:nullable(bool)});
const placement=object({id:text,referenceId:nullable(text),kind:nullable(text),position:vec,effectPosition:nullable(vec)});
const operation=object({type:text,status:enumeration(['succeeded','failed','cancelled']),operationId:text,revision:{type:'integer',minimum:0},origin:text,error},['status','operationId','revision','origin'],true);
const schemas={
 'workspace.playersChanged':object({players:{type:'array',maxItems:256,items:WORKSPACE_PLAYER_SCHEMA}}),
 'utility.placementsChanged':object({action:enumeration(['placed','moved','removed']),id:text,placements:list(placement)}),
 'operation.started':object({type:text}), 'operation.succeeded':operation,'operation.failed':operation,'operation.cancelled':operation,
 'lifecycle.ready':object({ready:bool}),'lifecycle.disposed':object(),
 'selection.changed':object({id:nullable(text)}),'camera.changed':camera,'camera.follow':follow,'camera.director':director,
 'equipment.ready':object({playerId:text,weapon:text,key:text}),'equipment.failed':object({playerId:text,weapon:text,message:text}),
 'map.floor':object({id:text}), 'model.visibility':object({visible:bool}),
 'model.style':object({opacity:num,focus:enumeration(['full','pointer','camera']),range:num}),
 'model.objectsChanged':object({signature:text,ids:list({type:'integer',minimum:0}),visible:bool}),
 'resource.state':object({key:text,status:enumeration(['idle','loading','ready','cancelled','error']),phase:nullable(text),loaded:num,total:num,error}),
 'playback.display':object({effects:bool,trajectories:bool}),
 'playback.overlays':object({enabled:bool,hurt:bool,flash:bool,reducedEffects:bool,maxFlashOpacity:num}),
 'voice.state':voice,'voice.options':voice,
};
for(const name of ['source','loading','ready','failed','cancelled','play','pause','seek','speed','time','ended'])schemas[`playback.${name}`]=playback;
export function describeViewerEvents(profile) {
 return [...Object.entries(schemas).map(([name,payloadSchema])=>({name,support:'optional',delivery:name==='playback.time'?'sampled':'state-change',schemaStatus:profile==='application' && name==='camera.changed'?'partial':'complete',payloadSchema:profile==='application' && name==='camera.changed'?object({mode:enumeration(['2d','3d']),follow,director},['mode','follow','director'],true):payloadSchema})),
 {name:'workspace.changed',support:'optional',delivery:'state-change',schemaStatus:'partial',payloadSchema:{type:'object',additionalProperties:true},description:'Host-specific change summary; read getWorkspace for the common layout.'}];
}
