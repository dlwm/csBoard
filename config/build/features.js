import { loadEnv } from 'vite';

export function featureFlag(value, fallback, name) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export function buildFeatures(root, mode = 'production', environment = process.env) {
  const settings = { ...loadEnv(mode, root, 'CSBOARD_'), ...environment };
  const parser = settings.CSBOARD_PARSER_ENGINE || 'auto';
  if (!['auto', 'wasm', 'native'].includes(parser)) throw new Error('CSBOARD_PARSER_ENGINE must be auto, wasm or native');
  return { ai: featureFlag(settings.CSBOARD_AI_ENABLED, mode !== 'mobile', 'CSBOARD_AI_ENABLED'), parser };
}
