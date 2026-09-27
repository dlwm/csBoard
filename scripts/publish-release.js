import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readReleaseMetadata } from './release-metadata.js';

export async function collectReleaseAssets(directory, version) {
  const expected = [`CSBoard-${version}-mac-arm64.dmg`, `CSBoard-${version}-mac-x64.dmg`, `CSBoard-${version}-win-x64.exe`];
  const actual = (await fs.readdir(directory)).filter(name => name !== 'SHA256SUMS.txt').sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error('Expected exactly the three versioned installers');
  const checksums = [];
  for (const name of expected) {
    const file = path.join(directory, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid installer: ${name}`);
    checksums.push(`${createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`);
  return [...expected, 'SHA256SUMS.txt'];
}

export async function publishDraft({ repository, token, tag, commit, notes, directory, assets, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(commit) || !token) throw new Error('Missing release repository, commit or token');
  const base = `https://api.github.com/repos/${repository}`;
  async function api(url, method = 'GET', body, binary = false) {
    const response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' } : {}) }, body: body ? binary ? body : JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(`GitHub ${method} failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }
  // Recheck the remote tag before writing; a tag may have moved while jobs built.
  let object = (await api(`${base}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let depth = 0; object.type === 'tag' && depth < 16; depth++) object = (await api(`${base}/git/tags/${object.sha}`)).object;
  if (object.type !== 'commit' || object.sha !== commit) throw new Error('Remote tag no longer matches the built commit');
  let release;
  for (let page = 1; ; page++) {
    const releases = await api(`${base}/releases?per_page=100&page=${page}`);
    release = releases.find(item => item.tag_name === tag);
    if (release || releases.length < 100) break;
  }
  if (release && (!release.draft || release.target_commitish !== commit)) throw new Error('Refusing to overwrite a published release or a draft for another commit');
  const payload = { tag_name: tag, target_commitish: commit, name: `CSBoard ${tag.slice(1)}`, body: `${notes}\n\nInstallers are unsigned; validate installation before publishing. SHA-256 checksums are attached.`, draft: true, make_latest: 'false' };
  release = await api(`${base}/releases${release ? `/${release.id}` : ''}`, release ? 'PATCH' : 'POST', payload);
  const upload = new URL(release.upload_url.split('{')[0]);
  if (upload.origin !== 'https://uploads.github.com') throw new Error('Unexpected GitHub upload endpoint');
  const previous = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  for (const name of assets) {
    const old = previous.find(asset => asset.name === name);
    if (old) await api(`${base}/releases/assets/${old.id}`, 'DELETE');
    upload.searchParams.set('name', name);
    await api(upload.href, 'POST', await fs.readFile(path.join(directory, name)), true);
  }
  return release.html_url;
}
async function main() {
  const metadata = await readReleaseMetadata(process.env.RELEASE_TAG || '');
  const directory = path.resolve('build/release');
  const assets = await collectReleaseAssets(directory, metadata.version);
  const url = await publishDraft({ ...metadata, commit: process.env.RELEASE_COMMIT || '', repository: process.env.GITHUB_REPOSITORY || '', token: process.env.GITHUB_TOKEN, directory, assets });
  console.log(`Draft release: ${url}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
