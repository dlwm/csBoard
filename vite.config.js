import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const versionFile = path.join(projectRoot, '..local/maps');
const buildVersion = String(process.env.VITE_BUILD_VERSION || (fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8') : '')).trim();

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
  },
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
