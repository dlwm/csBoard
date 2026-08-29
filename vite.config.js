import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'strip-maps-public-assets',
      closeBundle() {
        fs.rmSync(path.join(projectRoot, 'dist', 'maps'), { recursive: true, force: true });
      },
    },
  ],
});
