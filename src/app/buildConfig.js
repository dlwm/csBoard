// Vite supplies build settings; direct Node imports use the application defaults.
// Keep the feature flag reference explicit so Vite can remove disabled AI code.
export const AI_ENABLED = typeof import.meta.env === 'undefined' ? true : import.meta.env.CSBOARD_AI_ENABLED;
export const PARSER_ENGINE = typeof import.meta.env === 'undefined' ? 'auto' : import.meta.env.CSBOARD_PARSER_ENGINE;
export const OSS_BASE = String(import.meta.env?.VITE_OSS_BASE_URL || '').replace(/\/$/, '');
export const BACKEND_BASE = String(import.meta.env?.VITE_BACKEND_BASE_URL || '').replace(/\/$/, '');
export const AI_CHAT_URL = `${BACKEND_BASE}/api/ai/chat`;
