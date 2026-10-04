import { deserializeBroadcastArchive, serializeBroadcastArchive } from '../broadcast/archive.js';
export async function runSerialization(method, args) {
  if (method === 'json.encode') return JSON.stringify(args.value, null, args.pretty ? 2 : undefined);
  if (method === 'json.decode') return JSON.parse(args.text ?? await args.file.text());
  if (method === 'broadcast.encode') return new TextEncoder().encode(serializeBroadcastArchive(args.value));
  if (method === 'broadcast.decode') return deserializeBroadcastArchive(new TextDecoder().decode(args.bytes));
  throw new Error('Unknown serialization operation');
}
