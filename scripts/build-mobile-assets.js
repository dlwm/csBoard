import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(root, 'src/assets/favicon.svg'));
const res = path.join(root, 'native/android/app/src/main/res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const directory = path.join(res, `mipmap-${density}`);
  await fs.mkdir(directory, { recursive: true });
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp(source, { density: 768 }).resize(Math.round(48 * scale)).flatten({ background: '#090d0d' }).png().toFile(path.join(directory, name));
  }
  const size = Math.round(108 * scale), inset = Math.round(24 * scale);
  const logo = await sharp(source, { density: 768 }).resize(size - inset * 2).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#090d0d' } }).composite([{ input: logo, left: inset, top: inset }]).png().toFile(path.join(directory, 'ic_launcher_foreground.png'));
}
const ios = path.join(root, 'native/ios/App/App/Assets.xcassets');
await sharp(source, { density: 1536 }).resize(1024).flatten({ background: '#090d0d' }).png().toFile(path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'));
for (const base of [res, path.join(ios, 'Splash.imageset')]) {
  for (const file of await fs.readdir(base, { recursive: true })) {
    if (!/splash.*\.png$/i.test(file)) continue;
    const target = path.join(base, file);
    const { width, height } = await sharp(target).metadata();
    const size = Math.round(Math.min(width, height) * 0.22);
    const logo = await sharp(source, { density: 768 }).resize(size).png().toBuffer();
    await sharp({ create: { width, height, channels: 3, background: '#090d0d' } }).composite([{ input: logo, gravity: 'centre' }]).png().toFile(target + '.tmp.png');
    await fs.rename(target + '.tmp.png', target);
  }
}
