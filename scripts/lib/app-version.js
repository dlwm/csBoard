import fs from 'node:fs';
import path from 'node:path';

// package.json is authoritative; all platform versions are derived copies.
export function syncAppVersion(root, { check = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)) {
    throw new Error('Application version must be numeric major.minor.patch');
  }
  const parts = pkg.version.split('.').map(Number);
  const buildNumber = parts[0] * 1_000_000 + parts[1] * 1000 + parts[2];
  if (parts.some(part => part >= 1000) || buildNumber < 1 || buildNumber > 2_100_000_000) {
    throw new Error('Application version cannot be represented as a mobile build number');
  }
  const changes = [];
  const lockPath = path.join(root, 'package-lock.json');
  const lockText = fs.readFileSync(lockPath, 'utf8');
  const lock = JSON.parse(lockText);
  if (!lock.packages?.['']) throw new Error('Lockfile is missing the root package');
  if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
    lock.version = lock.packages[''].version = pkg.version;
    changes.push({ file: lockPath, text: JSON.stringify(lock, null, 2) + '\n' });
  }
  const targets = [
    ['native/android/app/build.gradle', [
      [/\bversionName "[^"]+"/g, `versionName "${pkg.version}"`, 1],
      [/\bversionCode \d+/g, `versionCode ${buildNumber}`, 1],
    ]],
    ['native/ios/App/App.xcodeproj/project.pbxproj', [
      [/\bMARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${pkg.version};`, 2],
      [/\bCURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`, 2],
    ]],
  ];
  for (const [relative, replacements] of targets) {
    const file = path.join(root, relative);
    const original = fs.readFileSync(file, 'utf8');
    let text = original;
    for (const [pattern, replacement, count] of replacements) {
      if ([...text.matchAll(pattern)].length !== count) throw new Error(`Unexpected version fields in ${relative}`);
      text = text.replace(pattern, replacement);
    }
    if (text !== original) changes.push({ file, text });
  }
  // Validate every file before modifying any of them.
  if (check && changes.length) {
    throw new Error(`Version copies differ from package.json (${pkg.version}): ${changes.map(item => path.relative(root, item.file)).join(', ')}. Run npm run version to synchronize.`);
  }
  for (const { file, text } of changes) fs.writeFileSync(file, text);
  return { version: pkg.version, buildNumber };
}
