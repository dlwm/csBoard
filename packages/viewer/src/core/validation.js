import { VALIDATORS } from './generated/validators.js';
// Only built-in profiles have generated validators. Hosts validate extensions.
// 中文：共享字段错误保留 JSON Pointer，便于 UI 与 AI 定位；不猜测宿主扩展。
export function contractIssue(profile, kind, name, value) {
 const validate=VALIDATORS[`${profile}:${kind}:${name}`];
 if(!validate || validate(value))return null;
 const error=validate.errors[0];
 const suffix=error.keyword==='required'?error.params.missingProperty:error.keyword==='additionalProperties'?error.params.additionalProperty:null;
 const path=error.instancePath+(suffix?`/${String(suffix).replaceAll('~','~0').replaceAll('/','~1')}`:'');
 return {path,keyword:error.keyword,message:error.message,...error.params};
}
