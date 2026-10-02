import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyMobileNotices } from './lib/mobile-notices.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action, platform, ...extra] = process.argv.slice(2);
if (!['prepare', 'open', 'build'].includes(action) || !['android', 'ios'].includes(platform) || extra.length) {
  console.error('npm run mobile -- prepare|open|build android|ios');
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
      run('go', ['tool', 'gomobile', 'bind', '-target=ios,iossimulator', '-o', framework, '.'], mobileModule);
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
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const parts = pkg.version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0 || part >= 1000)) throw new Error('Mobile builds require a numeric major.minor.patch version');
    const buildNumber = parts[0] * 1_000_000 + parts[1] * 1000 + parts[2];
    if (platform === 'android') {
      const gradle = path.join(root, 'native/android/app/build.gradle');
      fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replace(/versionName "[^"]+"/, `versionName "${pkg.version}"`).replace(/versionCode \d+/, `versionCode ${buildNumber}`));
    } else {
      const project = path.join(root, 'native/ios/App/App.xcodeproj/project.pbxproj');
      fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${pkg.version};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`));
    }
    if (action === 'build') {
      if (platform === 'android') {
        if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', 'gradlew.bat', 'assembleDebug'], path.join(root, 'native/android'));
        else run('./gradlew', ['assembleDebug'], path.join(root, 'native/android'));
        console.log('APK: native/android/app/build/outputs/apk/debug/app-debug.apk (development signature)');
      } else {
        run('xcodebuild', ['-project', 'native/ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', path.join(output, 'ios'), 'CODE_SIGNING_ALLOWED=NO', 'build']);
        console.log('Built for iOS Simulator. Device installation requires selecting a signing team in Xcode.');
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
