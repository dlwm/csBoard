import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('./', import.meta.url)), publicDir: false, build: { outDir: fileURLToPath(new URL('../../../build/viewer-example/', import.meta.url)), emptyOutDir: true } });
