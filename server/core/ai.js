import { normalizeAiConfig, openChatResponse } from '../../shared/ai-protocol.js';
import { allowedAiBaseUrls } from '../../shared/ai-providers.js';

export async function handleAiRequest(request, env) {
  // Only operator-configured destinations are reachable through the web proxy.
  const bases = allowedAiBaseUrls(env.AI_ALLOWED_BASE_URLS);
  const allowed = bases.map(endpoint => normalizeAiConfig({ endpoint, model: 'validation' }).endpoint);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !String(env.AI_ALLOWED_WEB_ORIGINS || '').split(',').map(x => x.trim()).includes(origin)) return Response.json({ error: 'AI origin is not allowed' }, { status: 403 });
  const headers = { 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}) };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  let timeout;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing AI request');
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 1_100_000) throw new Error('AI request is too large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const { config, payload } = JSON.parse(new TextDecoder().decode(bytes));
    const endpoint = normalizeAiConfig(config).endpoint;
    if (!allowed.includes(endpoint)) return Response.json({
      error: `AI service address is not allowed by this server: ${endpoint}. Ask the server operator to enable this address, or select an enabled service.`,
      code: 'ai_service_not_allowed', endpoint, allowedEndpoints: allowed,
    }, { status: 403, headers });
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 120_000);
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const upstream = await openChatResponse(config, payload, { signal });
    const source = upstream.body.getReader();
    const stream = new ReadableStream({
      async pull(target) {
        try {
          const { value, done } = await source.read();
          if (done) { clearTimeout(timeout); target.close(); } else target.enqueue(value);
        } catch (error) { clearTimeout(timeout); target.error(error); }
      },
      async cancel() { clearTimeout(timeout); controller.abort(); await source.cancel(); },
    });
    return new Response(stream, { headers: { ...headers, 'Content-Type': upstream.headers.get('content-type') || 'application/json' } });
  } catch (error) {
    clearTimeout(timeout);
    return Response.json({ error: error.message }, { status: 400, headers });
  }
}
