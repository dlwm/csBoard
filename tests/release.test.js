import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { releaseMetadata } from '../scripts/release-metadata.js';
import { collectReleaseAssets, publishDraft } from '../scripts/publish-release.js';

const version = '1.16.0', tag = `v${version}`, commit = 'a'.repeat(40);
const pkg = { version }, lock = { version, packages: { '': { version } } };
const changelog = '# Changes\n\n## [1.16.0] - 2026-09-28\n\n- New feature\n\n## [1.15.0] - 2026-01-01\n\n- Old feature\n';
test('release metadata requires matching versions and extracts only the tagged release notes', () => {
  assert.deepEqual(releaseMetadata(tag, pkg, lock, changelog), { tag, version, notes: '- New feature' });
  for (const invalid of ['main', 'v1.16.0-beta', 'v1.16.0\ncommit=bad']) assert.throws(() => releaseMetadata(invalid, pkg, lock, changelog));
  assert.throws(() => releaseMetadata(tag, { version: '1.15.0' }, lock, changelog));
  assert.throws(() => releaseMetadata(tag, pkg, { ...lock, version: '1.15.0' }, changelog));
  assert.throws(() => releaseMetadata(tag, pkg, { ...lock, packages: {} }, changelog));
  assert.throws(() => releaseMetadata(tag, pkg, lock, '## [1.15.0] - date\n- Old'));
});
async function installers(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboard-release-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const names = [`CSBoard-${version}-mac-arm64.dmg`, `CSBoard-${version}-win-x64.exe`];
  for (const name of names) await fs.writeFile(path.join(directory, name), `installer ${name}`);
  return { directory, names };
}
test('release requires both nonempty desktop installers and generates checksums from actual bytes', async t => {
  const { directory, names } = await installers(t);
  assert.deepEqual(await collectReleaseAssets(directory, version), [...names, 'SHA256SUMS.txt']);
  const sums = await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
  for (const name of names) assert.ok(sums.includes(`${createHash('sha256').update(`installer ${name}`).digest('hex')}  ${name}\n`));
  await fs.writeFile(path.join(directory, 'extra.dmg'), 'unexpected');
  await assert.rejects(collectReleaseAssets(directory, version));
  await fs.rm(path.join(directory, 'extra.dmg'));
  await fs.writeFile(path.join(directory, names[0]), '');
  await assert.rejects(collectReleaseAssets(directory, version));
  await fs.rm(path.join(directory, names[0]));
  await assert.rejects(collectReleaseAssets(directory, version));
});
function github({ existing, tagCommit = commit, annotated = false, status = 200 } = {}) {
  const calls = [];
  const release = { id: 7, tag_name: tag, draft: true, target_commitish: commit, upload_url: 'https://uploads.github.com/repos/owner/repo/releases/7/assets{?name,label}', html_url: 'https://github.com/owner/repo/releases/7' };
  const fetchImpl = async (url, options) => {
    const u = new URL(url), { method, body } = options;
    calls.push({ url: u, method, body });
    let data;
    if (u.pathname.includes('/git/ref/')) data = { object: annotated ? { type: 'tag', sha: 'b'.repeat(40) } : { type: 'commit', sha: tagCommit } };
    else if (u.pathname.includes('/git/tags/')) data = { object: { type: 'commit', sha: tagCommit } };
    else if (method === 'GET' && u.pathname.endsWith('/releases')) data = existing ? [{ ...release, ...existing }] : [];
    else if (method === 'GET' && u.pathname.endsWith('/assets')) data = existing ? [{ id: 9, name: 'SHA256SUMS.txt' }] : [];
    else if (method === 'POST' || method === 'PATCH' || method === 'DELETE') data = release;
    else throw new Error(`Unexpected request: ${method} ${url}`);
    return { ok: status < 400, status: method === 'DELETE' ? 204 : status, json: async () => data };
  };
  return { calls, fetchImpl, release };
}
test('publishing creates only a draft at the verified commit and uploads the installer bytes', async t => {
  const { directory } = await installers(t);
  const assets = await collectReleaseAssets(directory, version);
  const api = github({ annotated: true });
  assert.equal(await publishDraft({ repository: 'owner/repo', token: 'test-token', tag, commit, notes: '- Changes', directory, assets, fetchImpl: api.fetchImpl }), api.release.html_url);
  const write = api.calls.find(c => c.method === 'POST' && c.url.hostname === 'api.github.com');
  const payload = JSON.parse(write.body);
  assert.equal(payload.draft, true);
  assert.equal(payload.target_commitish, commit);
  assert.equal(payload.tag_name, tag);
  const uploads = api.calls.filter(c => c.url.hostname === 'uploads.github.com');
  assert.deepEqual(uploads.map(c => c.url.searchParams.get('name')), assets);
  for (const upload of uploads) assert.deepEqual(upload.body, await fs.readFile(path.join(directory, upload.url.searchParams.get('name'))));
});
test('reruns replace matching draft assets; published releases, changed tags and API failures cannot be overwritten', async t => {
  const { directory } = await installers(t);
  const assets = await collectReleaseAssets(directory, version);
  const args = { repository: 'owner/repo', token: 'test-token', tag, commit, notes: '- Changes', directory, assets };
  const retry = github({ existing: {} });
  await publishDraft({ ...args, fetchImpl: retry.fetchImpl });
  assert.equal(retry.calls.filter(c => c.method === 'PATCH').length, 1);
  assert.equal(retry.calls.filter(c => c.method === 'DELETE').length, 1);
  for (const config of [{ existing: { draft: false } }, { existing: { target_commitish: 'c'.repeat(40) } }, { tagCommit: 'd'.repeat(40) }, { status: 403 }]) {
    const api = github(config);
    await assert.rejects(publishDraft({ ...args, fetchImpl: api.fetchImpl }));
    assert.ok(api.calls.every(c => c.method === 'GET'));
  }
});
