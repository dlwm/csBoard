import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { featureFlag } from '../config/build/features.js';
import { allowedAiBaseUrls } from '../shared/ai-providers.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function selectAccount(file, configuredId = '') {
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!data.loggedIn || !Array.isArray(data.accounts)) throw new Error('Cloudflare authentication did not return accounts');
  const accounts = data.accounts.filter(account => /^[a-f0-9]{32}$/i.test(account.id));
  if (configuredId) {
    if (!accounts.some(account => account.id === configuredId)) throw new Error('Configured Cloudflare account is not available to this login');
    return configuredId;
  }
  if (accounts.length === 1) return accounts[0].id;
  if (!accounts.length) throw new Error('No Cloudflare account is available to this login');
  if (!process.stdin.isTTY) throw new Error('Multiple Cloudflare accounts: set CLOUDFLARE_ACCOUNT_ID to select one');
  accounts.forEach((account, index) => console.error(`${index + 1}. ${JSON.stringify(account.name)}`));
  const prompt = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = (await prompt.question('Choose the deployment account number: ')).trim();
    const index = Number(answer) - 1;
    if (!/^\d+$/.test(answer) || !Number.isInteger(index) || !accounts[index]) throw new Error('Invalid account selection');
    return accounts[index].id;
  } finally { prompt.close(); }
}

export async function deploymentUrl(file, workerName, preferred = '') {
  const entries = (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const deployment = entries.findLast(entry => entry.type === 'deploy' && entry.worker_name === workerName);
  // An aborted deploy can exit successfully without publishing a version.
  if (!deployment?.version_id) throw new Error(`No completed deployment recorded for ${workerName}`);
  const candidates = (deployment.targets || []).filter(target => typeof target === 'string').flatMap(target => {
    try {
      const hostname = target.replace(/ \(custom domain\)$/, '');
      const url = new URL(hostname.includes('://') ? hostname : `https://${hostname}`);
      return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && !url.hostname.includes('*') ? [url.origin] : [];
    } catch { return []; }
  });
  if (preferred) {
    const url = new URL(preferred);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Worker public URL must be an HTTPS origin');
    return url.origin;
  }
  const url = candidates.find(value => new URL(value).hostname.endsWith('.workers.dev')) || candidates[0];
  if (!url) throw new Error(`No public URL returned for ${workerName}; configure its public URL or custom domain`);
  return url;
}

export function allowedOrigins(...values) {
  const origins = [...new Set(values.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('AI allowed origins must be exact HTTP(S) origins');
    return url.origin;
  }))];
  return origins.join(',');
}

export function runCommand(command, args, { cwd, env, capture = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; if (!capture) process.stdout.write(data); });
    child.stderr.on('data', data => { stderr += data; if (!capture) process.stderr.write(data); });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

export async function verifyDeployment(urls) {
  const retry = async (label, check) => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try { await check(); console.log(`Verified ${label}`); return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Published, but verification failed: ${label}. Check DNS, certificates and Worker logs; keep the backend and its storage.`);
  };
  await retry('backend /api/health', async () => {
    const response = await fetch(`${urls.backend}/api/health`, { signal: AbortSignal.timeout(7000) });
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.parser !== 'demoinfocs-go') throw new Error('Backend health check failed');
  });
  await retry('frontend HTML and JavaScript asset', async () => {
    const response = await fetch(urls.frontend, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error('Frontend did not respond');
    const html = await response.text();
    const script = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
    if (!script) throw new Error('Frontend script is missing');
    const asset = new URL(script, urls.frontend);
    if (asset.origin !== urls.frontend || !/^\/assets\/.+\.js$/.test(asset.pathname)) throw new Error('Unexpected frontend script URL');
    const result = await fetch(asset, { method: 'HEAD', signal: AbortSignal.timeout(7000) });
    if (!result.ok || !/javascript/i.test(result.headers.get('content-type') || '')) throw new Error('Frontend script did not load');
  });
}

export async function deploy({ root = projectRoot, environment = process.env, args = process.argv.slice(2), run = runCommand, verify = verifyDeployment } = {}) {
  if (args.includes('--help')) { console.log('make deploy [ARGS=--dry-run | ARGS=--no-login]'); return; }
  if (args.some(arg => !['--dry-run', '--no-login'].includes(arg))) throw new Error('Unknown deployment argument; use --help');
  const envFile = path.resolve(root, environment.CF_DEPLOY_CONFIG || 'config/cloudflare/deploy.env');
  let local;
  try { local = parseEnv(await fs.readFile(envFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.copyFile(path.join(root, 'config/cloudflare/deploy.env.example'), envFile, fs.constants.COPYFILE_EXCL);
    await fs.chmod(envFile, 0o600);
    local = parseEnv(await fs.readFile(envFile, 'utf8'));
    console.log('Created private deployment settings from the example.');
  }
  const env = { ...local, ...environment };
  const aiEnabled = featureFlag(env.CF_AI_ENABLED, false, 'CF_AI_ENABLED');
  env.CF_AI_ENABLED = env.CSBOARD_AI_ENABLED = String(aiEnabled);
  console.log(`AI deployment: ${aiEnabled ? 'enabled' : 'excluded'}`);
  const dryRun = args.includes('--dry-run') || env.CF_DEPLOY_DRY_RUN === 'true';
  env.OSS_BASE_URL ||= env.VITE_OSS_BASE_URL;
  // Reuse existing public resource settings without importing unrelated Vite variables.
  if (!env.OSS_BASE_URL) {
    for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
      try { env.OSS_BASE_URL = parseEnv(await fs.readFile(path.join(root, file), 'utf8')).VITE_OSS_BASE_URL; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (env.OSS_BASE_URL) break;
    }
  }
  if (!env.OSS_BASE_URL && process.stdin.isTTY) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stderr });
    try { env.OSS_BASE_URL = (await prompt.question('Public map resource base URL (parent of /maps): ')).trim(); }
    finally { prompt.close(); }
  }
  if (!env.OSS_BASE_URL) throw new Error('Set OSS_BASE_URL or an existing VITE_OSS_BASE_URL for map resources');
  const oss = new URL(env.OSS_BASE_URL);
  if (!['https:', 'http:'].includes(oss.protocol) || oss.username || oss.password || oss.search || oss.hash) throw new Error('Map resource base must be a public HTTP(S) URL');
  env.OSS_BASE_URL = oss.href.replace(/\/$/, '');
  const names = { backend: env.CF_BACKEND_WORKER_NAME || 'csboard-backend', frontend: env.CF_FRONTEND_WORKER_NAME || 'csboard-frontend' };
  for (const name of Object.values(names)) if (!/^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/.test(name)) throw new Error('Invalid Worker name');
  if (names.backend === names.frontend) throw new Error('Frontend and backend Worker names must differ');
  const domains = { backend: env.CF_BACKEND_CUSTOM_DOMAIN || '', frontend: env.CF_FRONTEND_CUSTOM_DOMAIN || '' };
  for (const [kind, domain] of Object.entries(domains)) {
    if (domain && (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain))) throw new Error(`${kind} custom domain must be a hostname, without a protocol or path`);
  }
  if (domains.backend && domains.backend.toLowerCase() === domains.frontend.toLowerCase()) throw new Error('Frontend and backend custom domains must differ');
  let backendUrl = domains.backend ? `https://${domains.backend.toLowerCase()}` : env.BACKEND_PUBLIC_URL || '';
  backendUrl = backendUrl ? allowedOrigins(backendUrl) : '';
  if (backendUrl && (backendUrl.includes(',') || !backendUrl.startsWith('https://'))) throw new Error('Backend public URL must be a single HTTPS origin');
  let origins = aiEnabled ? allowedOrigins(env.AI_ALLOWED_WEB_ORIGINS || '', domains.frontend ? `https://${domains.frontend.toLowerCase()}` : '') : '';
  const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
  const options = { cwd: root, env };
  const execute = async (command, commandArgs, overrides = {}) => {
    const result = await run(command, commandArgs, { ...options, ...overrides });
    if (result.status !== 0) throw new Error('Deployment command failed; no automatic retry or storage cleanup was performed');
    return result;
  };
  const metadataDir = path.join(root, '.wrangler', 'deployment');
  await fs.mkdir(metadataDir, { recursive: true });
  const directory = await fs.mkdtemp(path.join(metadataDir, 'run-'));
  try {
    // Build the parser before asking for authorization or changing remote Workers.
    await execute(process.execPath, [path.join(root, 'scripts/build-go-parser.js')]);
    if (!dryRun) {
      const identity = async () => {
        const result = await run(process.execPath, [wrangler, 'whoami', '--json'], { ...options, capture: true });
        let user;
        try { user = JSON.parse(result.stdout); } catch { throw new Error('Cannot check Cloudflare login; run make wrangler ARGS=whoami to diagnose the connection'); }
        if (typeof user.loggedIn !== 'boolean') throw new Error('Invalid Cloudflare identity response');
        return { result, user };
      };
      let auth = await identity();
      if (!auth.user.loggedIn) {
        const ci = env.CI && !['false', '0'].includes(env.CI);
        if (ci || args.includes('--no-login') || env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_KEY || !process.stdin.isTTY) throw new Error('Cloudflare login required; use an interactive deployment or valid CI credentials');
        console.log('Opening Cloudflare OAuth; approve in the browser. Credentials stay in Wrangler.');
        await execute(process.execPath, [wrangler, 'login']);
        auth = await identity();
      }
      if (auth.result.status !== 0 || !auth.user.loggedIn) throw new Error('Cloudflare authorization was not completed');
      const accountFile = path.join(directory, 'account.json');
      await fs.writeFile(accountFile, JSON.stringify(auth.user), { mode: 0o600 });
      env.CLOUDFLARE_ACCOUNT_ID = await selectAccount(accountFile, env.CLOUDFLARE_ACCOUNT_ID || '');
    }
    const publish = async (kind, currentOrigins = origins) => {
      const output = path.join(directory, `${kind}-${Date.now()}.ndjson`);
      const commandArgs = [wrangler, 'deploy', '--config', path.join(root, `config/cloudflare/wrangler.${kind}.jsonc`), '--name', names[kind]];
      // --domain is Wrangler's Custom Domain binding: Cloudflare manages DNS and certificates.
      if (domains[kind]) commandArgs.push('--domain', domains[kind]);
      if (kind === 'backend') {
        commandArgs.push('--var', `MAP_BASE_URL:${env.OSS_BASE_URL}`, '--define', `__CSBOARD_AI_ENABLED__:${aiEnabled}`);
        if (aiEnabled) commandArgs.push('--var', `AI_ALLOWED_BASE_URLS:${allowedAiBaseUrls(env.AI_ALLOWED_BASE_URLS).join(',')}`, '--var', `AI_ALLOWED_WEB_ORIGINS:${currentOrigins}`);
      }
      if (dryRun) commandArgs.push('--dry-run', '--outdir', path.join(root, 'build/workers', kind));
      console.log(`${dryRun ? 'Building' : 'Deploying'} ${names[kind]}...`);
      await execute(process.execPath, commandArgs, { env: { ...env, WRANGLER_OUTPUT_FILE_PATH: output } });
      return dryRun ? '' : deploymentUrl(output, names[kind], kind === 'backend' ? backendUrl : domains.frontend ? `https://${domains.frontend.toLowerCase()}` : '');
    };
    backendUrl = await publish('backend') || backendUrl || 'https://csboard-backend.example.invalid';
    env.VITE_OSS_BASE_URL = env.OSS_BASE_URL;
    env.VITE_BACKEND_BASE_URL = backendUrl;
    const frontendUrl = await publish('frontend');
    if (dryRun) { console.log('Dry-run complete; no Workers uploaded.'); return; }
    const finalOrigins = aiEnabled ? allowedOrigins(origins, frontendUrl) : '';
    if (finalOrigins !== origins) { origins = finalOrigins; await publish('backend'); }
    const urls = { frontend: frontendUrl, backend: backendUrl };
    await verify(urls);
    await fs.writeFile(path.join(metadataDir, 'result.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), workers: names, urls, features: { ai: aiEnabled } }, null, 2) + '\n', { mode: 0o600 });
    console.log(`Deployment verified.\nFrontend: ${frontendUrl}\nBackend: ${backendUrl}`);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
