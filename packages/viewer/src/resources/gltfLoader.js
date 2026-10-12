import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeMapModel } from '../three/disposeMapModel.js';
import { ViewerError } from '../core/controller.js';

// URL selection belongs to the injected resolver. Fetch is cancellable; the
// Three.js parse itself is not preemptible. Late scenes are still disposed.
// 宿主决定 URL；下载可取消，GLTF 解析不可抢占，过期场景仍释放。
export function createGltfResourceLoader({ resolve, fetch: fetcher = globalThis.fetch, createLoader = () => new GLTFLoader(), maxBytes = 512 * 1024 ** 2 } = {}) {
  if (typeof resolve !== 'function' || typeof fetcher !== 'function' || !Number.isFinite(maxBytes) || maxBytes <= 0) throw new TypeError('GLTF loader requires a resolver, fetch and positive maxBytes');
  return Object.freeze({ async load(key, { signal, onProgress = () => {} } = {}) {
    const resolved = await resolve(key);
    if (!Array.isArray(resolved) || resolved.some(url => typeof url !== 'string' || !url)) throw new ViewerError('invalid_resource', 'Resource resolver must return URL strings');
    const urls = [...new Set(resolved)];
    let lastError;
    for (const url of urls) {
      signal?.throwIfAborted();
      let gltf;
      try {
        const response = await fetcher(url, { signal });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Model request returned HTTP ${response.status}`); }
        const total = Number(response.headers.get('content-length')) || 0;
        if (total > maxBytes) { await response.body?.cancel(); throw new ViewerError('resource_budget', 'Model exceeds download budget'); }
        let bytes;
        if (response.body?.getReader) {
          const reader = response.body.getReader(), chunks = []; let loaded = 0;
          try {
            for (;;) { const next = await reader.read(); if (next.done) break; signal?.throwIfAborted(); loaded += next.value.byteLength; if (loaded > maxBytes) throw new ViewerError('resource_budget', 'Model exceeds download budget'); chunks.push(next.value); onProgress({ loaded, total: total >= loaded ? total : 0 }); }
            bytes = new Uint8Array(loaded); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
        } else { bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > maxBytes) throw new ViewerError('resource_budget', 'Model exceeds download budget'); }
        signal?.throwIfAborted();
        // Self-contained GLB only: nested loader requests cannot inherit our
        // AbortSignal or budget. Reject external references before parsing.
        // 仅支持自包含 GLB，避免子资源请求绕过取消与预算。
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw new ViewerError('invalid_glb', 'Expected a self-contained GLB v2');
        const jsonEnd = 20 + view.getUint32(12, true);
        if (jsonEnd > bytes.length) throw new ViewerError('invalid_glb', 'GLB JSON bounds are invalid');
        const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, jsonEnd)));
        if ([...(json.buffers || []), ...(json.images || [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw new ViewerError('external_resource', 'GLB external buffers/textures require a separate host resource driver');
        onProgress({ loaded: bytes.byteLength, total: bytes.byteLength, phase: 'parsing' });
        gltf = await createLoader().parseAsync(bytes.buffer, '');
        signal?.throwIfAborted();
        let released = false;
        return { value: gltf, dispose() { if (released) return; released = true; gltf.scene.removeFromParent(); disposeMapModel(gltf.scene); } };
      } catch (error) { if (gltf?.scene) disposeMapModel(gltf.scene); if (signal?.aborted) throw error; lastError = error; }
    }
    throw lastError || new ViewerError('missing_resource', `No resource source for ${key}`);
  } });
}
