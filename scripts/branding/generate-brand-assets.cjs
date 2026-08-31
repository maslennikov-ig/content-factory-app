#!/usr/bin/env node
'use strict';

/**
 * Renders the static Content Factory brand assets from the same geometry the
 * React `CfMark` uses, so the favicon, PWA icons and social image can never
 * drift from the in-app mark.
 *
 * Usage: node scripts/branding/generate-brand-assets.cjs
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const publicDirectory = path.join(repositoryRoot, 'apps/frontend/public');
const fontDirectories = [
  path.join(repositoryRoot, 'apps/frontend/src/styles/fonts/geologica'),
  path.join(repositoryRoot, 'apps/frontend/src/styles/fonts/jetbrains-mono'),
];

/**
 * The renderer inside sharp resolves fonts through fontconfig and ignores an
 * `@font-face` embedded in the SVG. Point fontconfig at the vendored font
 * directory before sharp loads, so the social image is set in the product's own
 * typeface on any machine, with no system font install.
 */
function useVendoredFonts() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-brand-fonts-'));
  const config = path.join(scratch, 'fonts.conf');
  fs.writeFileSync(
    config,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
${fontDirectories.map((directory) => `  <dir>${directory}</dir>`).join('\n')}
  <cachedir>${path.join(scratch, 'cache')}</cachedir>
</fontconfig>
`
  );
  fs.mkdirSync(path.join(scratch, 'cache'), { recursive: true });
  process.env.FONTCONFIG_FILE = config;
  return scratch;
}

const scratchDirectory = useVendoredFonts();
const sharp = require('sharp');

/**
 * Icon files carry fixed colours because no theme is available inside them.
 * The values come from the dark theme, which is the primary one (ADR-0008).
 */
const CANVAS = '#14150F';
const INK = '#ECEBDF';
const INK_MUTED = '#A6A794';
const SIGNATURE = '#C8922A';
const ACCENT = '#7FB03A';

/**
 * The `Cf` symbol as stroked outlines rather than SVG `<text>`.
 *
 * `icon.svg` is rendered by the browser, where the vendored monospaced face is
 * not guaranteed to be loaded — a `<text>` label would silently fall back to a
 * system font. Outlines make the file independent of any font at all, which is
 * the rule `docs/design/desert-lab/mark.md` sets for `public/`.
 *
 * Drawn on the same 32-unit grid as the in-app card: `C` as an open ring, `f`
 * as a hooked stem with a crossbar, both on the monospaced rhythm.
 */
const symbolOutline = (stroke = INK) => `
  <path d="M15.1 13.3A4.7 4.7 0 1 0 15.1 21.5" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="M21.3 22.4V14.5A2.7 2.7 0 0 1 24.6 11.9" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  <path d="M19.2 16.8H23.6" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
`;

/** The element card: `signature` border on `canvas`, symbol in `ink`. */
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Content Factory">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="${CANVAS}" stroke="${SIGNATURE}" stroke-width="2"/>
${symbolOutline()}
</svg>
`;

/**
 * The social image is rasterised here, so its card can use real type: the
 * figures are baked into a PNG and never depend on a font at view time. That
 * lets it show all three figures the way the in-app card does at this size.
 */
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const openGraphSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${CANVAS}"/>
  <rect x="0" y="0" width="1200" height="8" fill="${ACCENT}"/>
  <g transform="translate(96 217)">
    <rect x="2" y="2" width="192" height="192" rx="30" fill="none" stroke="${SIGNATURE}" stroke-width="4"/>
    <text x="20" y="42" font-family="${MONO}" font-size="21" font-weight="600" fill="${SIGNATURE}">98</text>
    <text x="98" y="118" font-family="${MONO}" font-size="84" font-weight="600" letter-spacing="-1.7" fill="${INK}" text-anchor="middle" dominant-baseline="central">Cf</text>
    <text x="20" y="176" font-family="${MONO}" font-size="18" font-weight="500" fill="${INK_MUTED}">251</text>
  </g>
  <text x="336" y="299" font-family="Geologica, system-ui, Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="-1.4" fill="${INK}">Content Factory</text>
  <text x="336" y="353" font-family="Geologica, system-ui, Arial, sans-serif" font-size="30" font-weight="400" fill="${INK_MUTED}">Planning, drafting, review and publishing in one workspace</text>
</svg>
`;

/** ICO container around a single PNG frame (supported since Windows Vista). */
function pngToIco(pngBuffer, dimension) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(dimension >= 256 ? 0 : dimension, 0);
  entry.writeUInt8(dimension >= 256 ? 0 : dimension, 1);
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

async function main() {
  fs.mkdirSync(publicDirectory, { recursive: true });

  fs.writeFileSync(path.join(publicDirectory, 'icon.svg'), markSvg);

  const png = (size) =>
    sharp(Buffer.from(markSvg)).resize(size, size).png().toBuffer();

  for (const size of [32, 192, 512]) {
    fs.writeFileSync(
      path.join(publicDirectory, `icon-${size}.png`),
      await png(size)
    );
  }

  fs.writeFileSync(path.join(publicDirectory, 'apple-icon.png'), await png(180));
  fs.writeFileSync(
    path.join(publicDirectory, 'favicon.ico'),
    pngToIco(await png(32), 32)
  );
  fs.writeFileSync(
    path.join(publicDirectory, 'opengraph-image.png'),
    await sharp(Buffer.from(openGraphSvg)).png().toBuffer()
  );

  fs.rmSync(scratchDirectory, { recursive: true, force: true });
  process.stdout.write(
    'Content Factory brand assets written to apps/frontend/public\n'
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
