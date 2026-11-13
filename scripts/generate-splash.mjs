// Generates iOS PWA launch images (apple-touch-startup-image): the BeatDrop icon centred
// on the app background, so a home-screen launch shows the icon instead of a blank screen.
// Run: node scripts/generate-splash.mjs   (output: public/splash/*.png + lib/splashScreens.json)
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BACKGROUND = '#030704';
const ICON_PT = 150; // must match #beatdrop-boot-splash img size in app/globals.css

// [css width, css height, device pixel ratio] — portrait.
const DEVICES = [
  [440, 956, 3], [430, 932, 3], [428, 926, 3], [420, 912, 3], [414, 896, 3], [414, 896, 2],
  [414, 736, 3], [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [375, 667, 2],
  [320, 568, 2], [768, 1024, 2], [810, 1080, 2], [820, 1180, 2], [834, 1194, 2], [1024, 1366, 2],
];

const svg = await readFile('public/icons/beatdrop-icon.svg');
await mkdir('public/splash', { recursive: true });
const entries = [];

for (const [w, h, dpr] of DEVICES) {
  const width = w * dpr;
  const height = h * dpr;
  const iconPx = ICON_PT * dpr;
  const icon = await sharp(svg, { density: Math.max(72, 72 * (iconPx / 512)) }).resize(iconPx, iconPx).png().toBuffer();
  const file = `splash-${width}x${height}.png`;
  await sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite([{ input: icon, left: Math.round((width - iconPx) / 2), top: Math.round((height - iconPx) / 2) }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(`public/splash/${file}`);
  entries.push({
    url: `/splash/${file}`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
  });
}

await writeFile('lib/splashScreens.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Wrote ${entries.length} launch images`);
