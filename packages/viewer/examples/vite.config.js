import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const location = path => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: location('./'), publicDir: false,
  resolve: { alias: [
    { find: '@csboard/viewer/format', replacement: location('../src/formats/index.js') },
    { find: '@csboard/viewer', replacement: location('../src/index.js') },
  ] },
  build: {
    outDir: location('../../../build/viewer-example/'), emptyOutDir: true,
    rolldownOptions: { input: { main: location('index.html'), minimal: location('minimal/index.html') } },
  },
});
