import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyMobileNotices } from './lib/mobile-notices.js';
import { syncAppVersion } from './lib/app-version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action, platform, ...extra] = process.argv.slice(2);
const simulator = extra.includes('--simulator');
const allowedFlags = platform === 'ios' && action !== 'open' ? ['--device', '--simulator'] : [];
if (!['prepare', 'open', 'build'].includes(action) || !['android', 'ios'].includes(platform)
  || extra.some(flag => !allowedFlags.includes(flag)) || new Set(extra).size !== extra.length
  || extra.includes('--device') && simulator) {
  console.error('make mobile-prepare|mobile-open|mobile-build PLATFORM=android|ios [ARGS=--device|--simulator]');
  process.exit(1);
}
const env = { ...process.env, GOTOOLCHAIN: 'auto', CGO_ENABLED: '1' };
const mobileModule = path.join(root, 'native/mobile');
const output = path.join(root, 'build/mobile');
const cap = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
function run(command, args, cwd = root, overrides = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...overrides }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
try {
  const pkg = syncAppVersion(root);
  if (action === 'open') {
    run(process.execPath, [cap, 'open', platform]);
  } else {
    if (platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS preparation requires macOS and Xcode');
    if (platform === 'android') {
      const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
      if (!sdk) throw new Error('Set ANDROID_HOME to your Android SDK directory');
      const java = spawnSync('java', ['-version'], { env, encoding: 'utf8' });
      if (java.error || java.status !== 0) throw new Error('Android preparation requires JDK 21; configure JAVA_HOME and PATH');
      if (!fs.existsSync(path.join(sdk, 'platforms/android-36'))) throw new Error('Install Android SDK platform 36 with Android Studio');
      const ndks = path.join(sdk, 'ndk');
      if (!env.ANDROID_NDK_HOME && (!fs.existsSync(ndks) || !fs.readdirSync(ndks).length)) throw new Error('Install an Android NDK with Android Studio');
    }
    // Frontend preparation also validates and prepares the pinned parser fork.
    run(process.execPath, [path.join(root, 'scripts/build-frontend.js'), '--mobile']);
    run(process.execPath, [path.join(root, 'scripts/build-mobile-assets.js')]);
    fs.mkdirSync(path.join(output, 'native'), { recursive: true });
    run('go', ['tool', 'gomobile', 'init'], mobileModule);
    if (platform === 'ios') {
      const framework = path.join(output, 'native/CSBoardNative.xcframework');
      run('go', ['tool', 'gomobile', 'bind', `-target=${simulator ? 'iossimulator' : 'ios/arm64'}`, '-o', framework, '.'], mobileModule);
      fs.mkdirSync(path.join(root, 'native/ios/Frameworks'), { recursive: true });
      fs.rmSync(path.join(root, 'native/ios/Frameworks/CSBoardNative.xcframework'), { recursive: true, force: true });
      fs.cpSync(framework, path.join(root, 'native/ios/Frameworks/CSBoardNative.xcframework'), { recursive: true, force: true });
    } else {
      const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
      if (!sdk) throw new Error('Set ANDROID_HOME to the Android SDK directory (SDK 36, NDK and JDK 21 are required)');
      const library = path.join(output, 'native/csboard-native.aar');
      run('go', ['tool', 'gomobile', 'bind', '-target=android/arm64,android/amd64', '-androidapi=24', '-javapkg=com.csboard.nativecore', '-o', library, '.'], mobileModule);
      fs.mkdirSync(path.join(root, 'native/android/app/libs'), { recursive: true });
      fs.copyFileSync(library, path.join(root, 'native/android/app/libs/csboard-native.aar'));
    }
    copyMobileNotices(root, env);
    run(process.execPath, [cap, 'sync', platform]);
    if (action === 'build') {
      const artifacts = path.join(output, 'artifacts');
      fs.mkdirSync(artifacts, { recursive: true });
      if (platform === 'android') {
        if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleDebug'], path.join(root, 'native/android'));
        else run('./gradlew', ['assembleDebug'], path.join(root, 'native/android'));
        const apk = path.join(artifacts, `CSBoard-${pkg.version}-android-development.apk`);
        fs.copyFileSync(path.join(root, 'native/android/app/build/outputs/apk/debug/app-debug.apk'), apk);
        console.log(`APK: ${apk} (development signature)`);
      } else {
        const derivedData = path.join(output, simulator ? 'ios-simulator' : 'ios-device');
        const sdk = simulator ? 'iphonesimulator' : 'iphoneos';
        run('xcodebuild', ['-project', 'native/ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-sdk', sdk, '-destination', simulator ? 'generic/platform=iOS Simulator' : 'generic/platform=iOS', '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO', 'build']);
        const app = path.join(derivedData, 'Build/Products', `Debug-${sdk}`, 'App.app');
        if (!fs.existsSync(path.join(app, 'public/index.html'))) throw new Error('iOS package is missing its frontend entry point');
        const archive = path.join(artifacts, `CSBoard-${pkg.version}-ios-${simulator ? 'simulator' : 'arm64-unsigned'}.zip`);
        run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
        console.log(`iOS bundle: ${archive}${simulator ? ' (simulator)' : ' (unsigned device build; signing required before installation)'}`);
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
