// Source 2 Viewer's entity text and KV3 physics dumps are developer inputs.
// Keep parsing strict: an unsupported structure must be reported, never guessed.
export function parseEntities(text) {
  return text.split(/^====\d+====\s*$/m).slice(1).map(block => {
    const entity = {};
    for (const line of block.split('\n')) {
      const match = /^([a-zA-Z0-9_]+)\s+(.+)$/.exec(line); if (!match) continue;
      let value = match[2].trim();
      if (value.startsWith('resource_name:')) value = value.slice(14);
      try { entity[match[1]] = JSON.parse(value); } catch { entity[match[1]] = value; }
    }
    return entity;
  });
}
export function parsePhysics(text) {
  const start = text.indexOf('<!-- kv3'); if (start < 0) throw new Error('Missing KV3 physics block');
  const body = text.slice(text.indexOf('-->',start)+3);
  const tokens = body.match(/#\[[\s\S]*?\]|"(?:\\.|[^"\\])*"|[{}\[\]=,]|[^\s{}\[\]=,]+/g) || [];
  let index=0;
  function value() {
    const token=tokens[index++];
    if (token === '{') { const result={}; while(tokens[index] !== '}') { const key=tokens[index++]; if (!key || tokens[index++] !== '=') throw new Error('Unsupported KV3 object'); result[key]=value(); if(tokens[index]===',') index++; } index++; return result; }
    if (token === '[') { const result=[]; while(tokens[index]!==']') { if (index>=tokens.length) throw new Error('Unclosed KV3 array'); if(tokens[index]===',') {index++;continue;} result.push(value()); } index++; return result; }
    if (token?.startsWith('#[')) { const bytes=token.slice(2,-1).trim().split(/\s+/).filter(Boolean); if(bytes.some(v=>!/^[\da-f]{2}$/i.test(v))) throw new Error('Invalid KV3 blob'); return Buffer.from(bytes.map(v=>parseInt(v,16))); }
    if (token?.startsWith('"')) return JSON.parse(token);
    if (token==='true' || token==='false') return token==='true'; if(token==='null') return null;
    const number=Number(token); if(Number.isFinite(number)) return number;
    throw new Error(`Unsupported KV3 token: ${token}`);
  }
  const root=value(), hulls=[];
  if(root.m_bindPose?.length) throw new Error('Animated/bone-transformed place volumes are unsupported');
  for(const part of root.m_parts || []) for(const item of part.m_rnShape?.m_hulls || []) {
    const hull=item.m_Hull, bytes=hull?.m_Planes;
    if(!Buffer.isBuffer(bytes) || !bytes.length || bytes.length%16) throw new Error('Missing convex hull planes');
    const planes=[]; for(let offset=0;offset<bytes.length;offset+=16) planes.push([0,4,8,12].map(i=>bytes.readFloatLE(offset+i)));
    if(planes.flat().some(v=>!Number.isFinite(v))) throw new Error('Invalid hull plane');
    const centroid=hull.m_vCentroid;
    if(!centroid || !planes.every(p=>p[0]*centroid[0]+p[1]*centroid[1]+p[2]*centroid[2]<=p[3]+.1)) throw new Error('Unsupported hull plane orientation');
    hulls.push({planes});
  }
  if(!hulls.length) throw new Error('No convex physics hulls');
  return hulls;
}
export { insideVolume, groundHeight } from '../../src/data/placeGeometry.js';
