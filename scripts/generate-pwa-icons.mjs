/**
 * PWA Icon Generator Script
 *
 * Generates PNG icons from an SVG source for PWA manifest.
 *
 * Prerequisites: npm install sharp --save-dev
 * Usage: node scripts/generate-pwa-icons.mjs
 *
 * If you don't have `sharp` installed, you can manually create icons using:
 * - https://realfavicongenerator.net
 * - https://www.pwabuilder.com/imageGenerator
 *
 * Place the generated icons in public/icons/ directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// Simple SVG icon template (blue rounded rect with white "S")
function generateSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#2563eb"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, sans-serif" font-size="${size * 0.5}" font-weight="bold">S</text>
</svg>`;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    // Fallback: generate SVG files as PNG-compatible placeholders
    console.log('sharp not found. Generating SVG placeholders as .png references...');
    console.log('Install sharp for proper PNG generation: npm install sharp --save-dev\n');

    for (const size of ICON_SIZES) {
      const svg = generateSvg(size);
      const svgFilename = `icon-${size}x${size}.svg`;
      fs.writeFileSync(path.join(OUTPUT_DIR, svgFilename), svg);
      console.log(`  Created: ${svgFilename}`);
    }

    console.log('\nTip: Use https://www.pwabuilder.com/imageGenerator to generate proper PNGs.');
    return;
  }

  for (const size of ICON_SIZES) {
    const svg = Buffer.from(generateSvg(size));
    const filename = `icon-${size}x${size}.png`;
    await sharp(svg).resize(size, size).png().toFile(path.join(OUTPUT_DIR, filename));
    console.log(`  Created: ${filename}`);
  }

  console.log('\nAll PWA icons generated successfully!');
}

main().catch(console.error);
