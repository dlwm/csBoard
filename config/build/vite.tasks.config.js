import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

// Bundle shared domain dependencies from the two Node task entry points. The
// installer must not rely on a hand-maintained list of transitive source files.
export default defineConfig({
  root: projectRoot,
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'build/tasks',
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: { demo: 'electron/native-demo-task.js', data: 'electron/data-task.js' },
      output: { entryFileNames: '[name].js' },
    },
  },
});
