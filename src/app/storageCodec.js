const tag = '__csboard_value_v1__';
const arrays = { Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array };

// Keep typed voxel buffers intact across JSON RPC and SQLite. Escape tag-shaped
// user objects as well, so imported descriptions cannot masquerade as a buffer.
export function encodeStoredValue(value) {
  const visit = value => {
    if (value === undefined) return { [tag]: 'undefined' };
    if (typeof value === 'bigint') return { [tag]: 'bigint', value: String(value) };
    if (typeof value === 'number' && !Number.isFinite(value)) return { [tag]: 'number', value: String(value) };
    if (ArrayBuffer.isView(value)) {
      if (value instanceof DataView) return { [tag]: 'DataView', value: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      if (!arrays[value.constructor.name]) throw new Error('Unsupported stored buffer type');
      return { [tag]: value.constructor.name, value: Array.from(value, visit) };
    }
    if (value instanceof ArrayBuffer) return { [tag]: 'ArrayBuffer', value: Array.from(new Uint8Array(value)) };
    if (value instanceof Date) return { [tag]: 'Date', value: value.toISOString() };
    if (value instanceof Map) return { [tag]: 'Map', value: Array.from(value, ([k, v]) => [visit(k), visit(v)]) };
    if (value instanceof Set) return { [tag]: 'Set', value: Array.from(value, visit) };
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([k, v]) => [k, visit(v)]);
      return Object.hasOwn(value, tag) ? { [tag]: 'Object', value: entries } : Object.fromEntries(entries);
    }
    return value;
  };
  return JSON.stringify(visit(value));
}

export function decodeStoredValue(encoded) {
  const visit = value => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const type = value[tag];
    if (!type) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    if (type === 'undefined') return undefined;
    if (type === 'bigint') return BigInt(value.value);
    if (type === 'number') return Number(value.value);
    if (Object.hasOwn(arrays, type)) return arrays[type].from(value.value.map(visit));
    if (type === 'ArrayBuffer') return Uint8Array.from(value.value).buffer;
    if (type === 'DataView') return new DataView(Uint8Array.from(value.value).buffer);
    if (type === 'Date') return new Date(value.value);
    if (type === 'Map') return new Map(value.value.map(([k, v]) => [visit(k), visit(v)]));
    if (type === 'Set') return new Set(value.value.map(visit));
    if (type === 'Object') return Object.fromEntries(value.value.map(([k, v]) => [k, visit(v)]));
    throw new Error('Unsupported stored value version');
  };
  return visit(JSON.parse(encoded));
}
