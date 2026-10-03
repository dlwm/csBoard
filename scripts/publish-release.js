import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readReleaseMetadata } from './release-metadata.js';

export async function collectReleaseAssets(directory, version, kind = 'desktop') {
  if (!['desktop', 'mobile'].includes(kind)) throw new Error('Unknown release asset kind');
  const expected = kind === 'mobile'
    ? [`CSBoard-${version}-android-development.apk`, `CSBoard-${version}-ios-arm64-unsigned.zip`]
    : [`CSBoard-${version}-mac-arm64.dmg`, `CSBoard-${version}-mac-x64.dmg`, `CSBoard-${version}-win-x64.exe`];
  const checksumName = kind === 'mobile' ? 'SHA256SUMS-mobile.txt' : 'SHA256SUMS.txt';
  const actual = (await fs.readdir(directory)).filter(name => name !== checksumName).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(kind === 'mobile' ? 'Expected exactly the Android APK and unsigned iOS device bundle' : 'Expected exactly the three versioned installers');
  const checksums = [];
  for (const name of expected) {
    const file = path.join(directory, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid installer: ${name}`);
    checksums.push(`${createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(directory, checksumName), `${checksums.join('\n')}\n`);
  return [...expected, checksumName];
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
  if (release && !release.draft) {
    throw new Error(`Release ${tag} is already published (${release.html_url}). Automatic uploads only modify drafts; wait for desktop and mobile uploads before publishing a new release.`);
  }
  // GitHub may retain a branch name in target_commitish. For an existing tag
  // that field does not select the release commit; the verified tag above does.
  // Keep explicit SHA provenance so moving a tag cannot mix builds in a draft.
  const recordedCommit = release?.body?.match(/<!-- csboard-release-commit: ([a-f0-9]{40}) -->/)?.[1];
  const targetCommit = /^[a-f0-9]{40}$/i.test(release?.target_commitish || '') ? release.target_commitish.toLowerCase() : null;
  if ((recordedCommit && recordedCommit !== commit) || (targetCommit && targetCommit !== commit)) {
    throw new Error(`Draft ${tag} belongs to another commit: draft=${recordedCommit || targetCommit}, build=${commit} (${release.html_url}). Use a new version tag, or remove the obsolete unpublished draft before rebuilding; do not mix assets from different commits.`);
  }
  const payload = { tag_name: tag, target_commitish: commit, name: `CSBoard ${tag.slice(1)}`, body: `${notes}\n\nmacOS apps are ad-hoc signed, without Apple notarization; Gatekeeper may require manual approval or removal of the app quarantine attribute. Windows installers are unsigned. Android APKs use a development signature. iOS ZIPs contain unsigned arm64 app bundles, not installable IPAs; signing is required before installation. SHA-256 checksums are attached separately for desktop and mobile assets.\n\n<!-- csboard-release-commit: ${commit} -->`, draft: true, make_latest: 'false' };
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
  const assets = await collectReleaseAssets(directory, metadata.version, process.env.RELEASE_ASSET_KIND || 'desktop');
  const url = await publishDraft({ ...metadata, commit: process.env.RELEASE_COMMIT || '', repository: process.env.GITHUB_REPOSITORY || '', token: process.env.GITHUB_TOKEN, directory, assets });
  console.log(`Draft release: ${url}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
