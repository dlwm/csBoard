import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const versionFile = path.join(projectRoot, '.build-version');
const packageVersion = process.env.npm_package_version ? `v${process.env.npm_package_version.replace(/^v/, '')}` : '';
// npm builds use package.json, while Make/Docker may explicitly provide a Git-derived version.
const buildVersion = String(process.env.VITE_BUILD_VERSION || packageVersion || (fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8') : '')).trim();

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
  },
  plugins: [
    react(),
    {
      name: 'finalize-public-assets',
      closeBundle() {
        fs.rmSync(path.join(projectRoot, 'dist', 'maps'), { recursive: true, force: true });
        // Keep the GPL terms reachable from every web and desktop build rather
        // than relying on repository-only documentation.
        for (const file of ['LICENSE', 'LICENSE_SCOPE.md', 'THIRD_PARTY_NOTICES.md']) {
          fs.copyFileSync(path.join(projectRoot, file), path.join(projectRoot, 'dist', file));
        }
      },
    },
  ],
});
