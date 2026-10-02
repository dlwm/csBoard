import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildFeatures } from './features.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const versionFile = path.join(projectRoot, '.build-version');
const packageVersion = process.env.npm_package_version ? `v${process.env.npm_package_version.replace(/^v/, '')}` : '';
// npm builds use package.json, while Make/Docker may explicitly provide a Git-derived version.
const buildVersion = String(process.env.VITE_BUILD_VERSION || packageVersion || (fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8') : '')).trim();

export default defineConfig(({ mode }) => {
  const features = buildFeatures(projectRoot, mode);
  const disabledAi = path.join(projectRoot, 'src/platform/disabledAi.js');
  const outputDirectory = mode === 'desktop' ? 'build/renderer' : mode === 'mobile' ? 'build/mobile/web' : 'dist';
  return {
    root: projectRoot,
    build: { outDir: outputDirectory },
    base: './',
    resolve: {
      alias: features.ai ? [] : [
        { find: /^.*\/ai\/AiPanel\.jsx$/, replacement: disabledAi },
        { find: /^.*\/ai\/transport\.js$/, replacement: disabledAi },
        { find: /^(?:.*\/)?boardObservation\.js$/, replacement: disabledAi },
      ],
    },
    define: {
      'import.meta.env.CSBOARD_AI_ENABLED': JSON.stringify(features.ai),
      'import.meta.env.CSBOARD_PARSER_ENGINE': JSON.stringify(features.parser),
      'import.meta.env.CSBOARD_APP_SHELL': JSON.stringify(mode === 'mobile' ? 'capacitor' : 'auto'),
      'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(buildVersion),
    },
    plugins: [
      react(),
      {
        name: 'finalize-public-assets',
        closeBundle() {
          fs.writeFileSync(path.join(projectRoot, outputDirectory, 'features.json'), JSON.stringify(features) + '\n');
          fs.rmSync(path.join(projectRoot, outputDirectory, 'maps'), { recursive: true, force: true });
          // Keep the GPL terms reachable from every web and desktop build rather
          // than relying on repository-only documentation.
          for (const file of ['LICENSE', 'docs/THIRD_PARTY_NOTICES.md']) {
            fs.copyFileSync(path.join(projectRoot, file), path.join(projectRoot, outputDirectory, path.basename(file)));
          }
        },
      },
    ],
  };
});
