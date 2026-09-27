import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseMetadata(tag, pkg, lock, changelog) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Expected an existing vMAJOR.MINOR.PATCH tag');
  const version = tag.slice(1);
  if (pkg.version !== version || lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('Tag and package/lockfile versions differ');
  const section = changelog.split(/^## /m).find(part => part.startsWith(`[${version}] - `));
  if (!section || !section.includes('\n- ')) throw new Error(`Missing release notes for ${version}`);
  return { tag, version, notes: section.slice(section.indexOf('\n') + 1).trim() };
}

export async function readReleaseMetadata(tag) {
  const [pkg, lock, changelog] = await Promise.all(['package.json', 'package-lock.json', 'CHANGELOG.md'].map(file => fs.readFile(file, 'utf8')));
  return releaseMetadata(tag, JSON.parse(pkg), JSON.parse(lock), changelog);
}

async function main() {
  const metadata = await readReleaseMetadata(process.env.RELEASE_TAG || '');
  const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const commit = git(['rev-parse', `refs/tags/${metadata.tag}^{commit}`]);
  if (commit !== git(['rev-parse', 'HEAD'])) throw new Error('Checkout does not match the release tag');
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `tag=${metadata.tag}\nversion=${metadata.version}\ncommit=${commit}\n`);
  console.log(`${metadata.tag} → ${commit}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
