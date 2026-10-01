import { loadEnv } from 'vite';

export function featureFlag(value, fallback, name) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export function buildFeatures(root, mode = 'production', environment = process.env) {
  const settings = { ...loadEnv(mode, root, 'CSBOARD_'), ...environment };
  return { ai: featureFlag(settings.CSBOARD_AI_ENABLED, true, 'CSBOARD_AI_ENABLED') };
}
