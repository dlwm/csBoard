// Chat Completions compatibility is confined to transport; tools stay local.
export function normalizeAiConfig(input = {}) {
  const endpoint = new URL(String(input.endpoint || 'https://api.openai.com/v1').trim());
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Invalid AI service URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) throw new Error('AI service requires HTTPS (localhost may use HTTP)');
  let url = endpoint.href.replace(/\/$/, '');
  if (!url.endsWith('/chat/completions')) url += '/chat/completions';
  const model = String(input.model || '').trim();
  if (!model || model.length > 200) throw new Error('Please configure an AI model');
  const apiKey = String(input.apiKey || '').trim();
  if (apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new Error('Invalid API key');
  if (input.imageInput != null && typeof input.imageInput !== 'boolean') throw new Error('Invalid image input setting');
  return { endpoint: url, model, apiKey, imageInput: input.imageInput === true };
}

function providerErrorDetails(value, apiKey = '') {
  const error = value?.error;
  const message = typeof error === 'string' ? error : error?.message ?? value?.message;
  const parts = [typeof message === 'string' ? message : '', ...['param', 'code'].map(key => typeof error?.[key] === 'string' ? `${key}: ${error[key]}` : '')].filter(Boolean);
  let text = parts.join(' · ');
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').replace(/\bsk-[\w-]+/g, '[redacted]').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1000);
}

async function readProviderError(response, apiKey, signal) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let body = ''; let bytes = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 16_384) return '';
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return providerErrorDetails(JSON.parse(body), apiKey);
  } catch {
    signal?.throwIfAborted();
    return '';
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function openChatResponse(config, payload, { signal, fetchImpl = fetch } = {}) {
  const settings = normalizeAiConfig(config);
  if (!Array.isArray(payload.messages) || payload.messages.length > 160 || !Array.isArray(payload.tools) || payload.tools.length > 40) throw new Error('Invalid AI conversation');
  for (const message of payload.messages) {
    if (!Array.isArray(message.content)) continue;
    if (message.role !== 'user' || message.content.length > 8) throw new Error('Invalid multimodal message');
    for (const part of message.content) {
      if (!part || typeof part !== 'object') throw new Error('Invalid multimodal content');
      if (part.type === 'text' && typeof part.text === 'string') continue;
      if (part.type !== 'image_url' || !settings.imageInput || typeof part.image_url?.url !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(part.image_url.url) || part.image_url.url.length > 170_000) throw new Error('Image input is disabled or the board screenshot is invalid');
    }
  }
  const body = JSON.stringify({ model: settings.model, messages: payload.messages, ...(payload.tools.length ? { tools: payload.tools } : {}), stream: true });
  if (body.length > 1_000_000) throw new Error('AI context is too large; start a new conversation');
  const response = await fetchImpl(settings.endpoint, {
    method: 'POST', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) }, body,
  });
  if (!response.ok) {
    const details = await readProviderError(response, settings.apiKey, signal);
    throw new Error(`AI service returned HTTP ${response.status}${details ? `: ${details}` : ''}`);
  }
  return response;
}

// SSE envelopes can be much larger than the actual message, especially when
// reasoning arrives one token at a time. Bound transport and decoded fields
// independently; never truncate reasoning or executable tool arguments.
const RESPONSE_LIMITS = Object.freeze({
  streamBytes: 32_000_000,
  jsonBytes: 4_000_000,
  eventCharacters: 2_000_000,
  totalCharacters: 512_000,
  content: 128_000,
  reasoning_content: 384_000,
  arguments: 128_000,
  id: 512,
  name: 256,
});

function createResponseAccumulator(onDelta) {
  let content = ''; let reasoning = ''; let hasReasoning = false; let characters = 0;
  const calls = new Map();
  const append = (previous, fragment, field) => {
    if (fragment == null) return previous;
    if (typeof fragment !== 'string') throw new Error(`Unsupported AI response field: ${field}`);
    if (previous.length + fragment.length > RESPONSE_LIMITS[field]) {
      const label = { content: 'reply text', reasoning_content: 'reasoning', arguments: 'tool arguments', id: 'tool ID', name: 'tool name' }[field];
      throw new Error(`AI ${label} exceeds the response limit; request a smaller task or shorter response`);
    }
    characters += fragment.length;
    if (characters > RESPONSE_LIMITS.totalCharacters) throw new Error('AI message content exceeds the response limit; split the task into smaller steps');
    return previous + fragment;
  };
  return {
    consume(delta, streamed) {
      if (delta.reasoning_content != null) {
        reasoning = append(reasoning, delta.reasoning_content, 'reasoning_content'); hasReasoning = true;
      }
      if (delta.content != null) {
        content = append(content, delta.content, 'content');
        if (delta.content) onDelta(delta.content);
      }
      if (delta.tool_calls != null && !Array.isArray(delta.tool_calls)) throw new Error('Unsupported AI tool calls');
      for (const [ordinal, part] of (delta.tool_calls || []).entries()) {
        const index = streamed ? part?.index : ordinal;
        if (!Number.isInteger(index) || index < 0 || index > 23) throw new Error('Too many or invalid AI tool calls');
        if (!part || typeof part !== 'object' || (part.type != null && part.type !== 'function') || (part.function != null && (typeof part.function !== 'object' || Array.isArray(part.function)))) throw new Error('Unsupported AI tool call');
        const call = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        call.id = append(call.id, part.id, 'id');
        call.function.name = append(call.function.name, part.function?.name, 'name');
        call.function.arguments = append(call.function.arguments, part.function?.arguments, 'arguments');
        calls.set(index, call);
      }
    },
    message() {
      const tool_calls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
      if (tool_calls.some(call => !call.id || !call.function.name)) throw new Error('Incomplete AI tool call');
      return { role: 'assistant', content: content || null, ...(hasReasoning ? { reasoning_content: reasoning } : {}), ...(tool_calls.length ? { tool_calls } : {}) };
    },
  };
}

export async function readChatResponse(response, { signal, onDelta = () => {} } = {}) {
  const accumulator = createResponseAccumulator(onDelta);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = ''; let bytes = 0;
    try {
      while (true) {
        signal?.throwIfAborted();
        const { value, done } = await reader.read(); if (done) break;
        bytes += value.length;
        if (bytes > RESPONSE_LIMITS.jsonBytes) throw new Error('AI service JSON response exceeds the transport limit; request a smaller response');
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const result = JSON.parse(body);
    if (result.error) { const details = providerErrorDetails(result); throw new Error(`AI service failed during generation${details ? `: ${details}` : ''}`); }
    const message = result.choices?.[0]?.message;
    if (!message) throw new Error('AI service returned no message');
    if (result.choices[0].finish_reason === 'length') throw new Error('AI response was truncated; reduce the request');
    accumulator.consume(message, false);
    return accumulator.message();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = ''; let bytes = 0; let finished = false;
  const consume = (event) => {
    if (event.length > RESPONSE_LIMITS.eventCharacters) throw new Error('AI stream event exceeds the transport limit; check the service streaming format');
    const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { finished = true; return; }
    const value = JSON.parse(data);
    if (value.error) { const details = providerErrorDetails(value); throw new Error(`AI service failed during generation${details ? `: ${details}` : ''}`); }
    const choice = value.choices?.[0];
    if (choice?.finish_reason === 'length') throw new Error('AI response was truncated; reduce the request');
    if (choice?.delta) accumulator.consume(choice.delta, true);
  };
  try {
    while (!finished) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > RESPONSE_LIMITS.streamBytes) throw new Error('AI stream exceeds the transport limit; request a smaller task or check the service streaming format');
      pending = (pending + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let end;
      while (!finished && (end = pending.indexOf('\n\n')) >= 0) { consume(pending.slice(0, end)); pending = pending.slice(end + 2); }
      if (!finished && pending.length > RESPONSE_LIMITS.eventCharacters) throw new Error('AI stream event exceeds the transport limit; check the service streaming format');
    }
    if (!finished) throw new Error('AI connection ended before completion');
    return accumulator.message();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
