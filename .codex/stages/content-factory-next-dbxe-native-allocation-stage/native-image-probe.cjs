'use strict';

// Header-only counterexamples: no large image data or writes through the
// oversized C++ pointer. Execute only in the owned no-network image fixture.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const sharp = createRequire('/app/package.json')('sharp');
const { fromBuffer } = createRequire('/app/package.json')('file-type');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(original, width, height) {
  const bytes = Buffer.from(original);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

function tiffDimensions(width, height, big = false) {
  const entryBytes = big ? 20 : 12;
  const offset = big ? 16 : 8;
  const fields = [
    [256, width], [257, height], [258, 8], [259, 1], [262, 1],
    [273, offset + (big ? 8 : 2) + 9 * entryBytes + (big ? 8 : 4)],
    [277, 1], [278, height], [279, 1],
  ];
  const bytes = Buffer.alloc(Number(fields[5][1]) + 1);
  bytes.write('II');
  bytes.writeUInt16LE(big ? 43 : 42, 2);
  if (big) {
    bytes.writeUInt16LE(8, 4);
    bytes.writeBigUInt64LE(BigInt(offset), 8);
    bytes.writeBigUInt64LE(BigInt(fields.length), offset);
  } else {
    bytes.writeUInt32LE(offset, 4);
    bytes.writeUInt16LE(fields.length, offset);
  }
  for (const [index, [tag, value]] of fields.entries()) {
    const at = offset + (big ? 8 : 2) + index * entryBytes;
    bytes.writeUInt16LE(tag, at);
    const short = [258, 259, 262, 277].includes(tag);
    bytes.writeUInt16LE(short ? 3 : big ? 16 : 4, at + 2);
    if (big) {
      bytes.writeBigUInt64LE(1n, at + 4);
      bytes.writeBigUInt64LE(BigInt(value), at + 12);
    } else {
      bytes.writeUInt32LE(1, at + 4);
      bytes.writeUInt32LE(value, at + 8);
    }
  }
  return bytes;
}

function replaceIcc(jpeg, profile) {
  // One legal APP2 marker; its byte length, not a claimed ICC field, bounds
  // the actual native copy. Preserve every other marker and the JPEG data.
  const payload = Buffer.concat([Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), profile]);
  assert.ok(payload.length <= 65533);
  const marker = Buffer.alloc(4);
  marker.writeUInt16BE(0xffe2, 0);
  marker.writeUInt16BE(payload.length + 2, 2);
  let start = 2;
  const parts = [jpeg.subarray(0, 2), marker, payload];
  while (start < jpeg.length - 4 && jpeg[start] === 0xff) {
    const code = jpeg[start + 1];
    if (code === 0xda || code === 0xd9) break;
    const size = jpeg.readUInt16BE(start + 2) + 2;
    if (!(code === 0xe2 && jpeg.subarray(start + 4, start + 16).toString('latin1') === 'ICC_PROFILE\0')) {
      parts.push(jpeg.subarray(start, start + size));
    }
    start += size;
  }
  parts.push(jpeg.subarray(start));
  return Buffer.concat(parts);
}

function patchTiff(original, value) {
  const bytes = Buffer.from(original);
  const le = bytes.subarray(0, 2).toString() === 'II';
  const u16 = (at) => le ? bytes.readUInt16LE(at) : bytes.readUInt16BE(at);
  const u32 = (at) => le ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
  const write16 = (n, at) => le ? bytes.writeUInt16LE(n, at) : bytes.writeUInt16BE(n, at);
  const write32 = (n, at) => le ? bytes.writeUInt32LE(n, at) : bytes.writeUInt32BE(n, at);
  const offset = u32(4);
  let patched = 0;
  for (let i = 0; i < u16(offset); i++) {
    const at = offset + 2 + i * 12;
    if ([256, 257].includes(u16(at))) {
      write16(4, at + 2);
      write32(1, at + 4);
      write32(value, at + 8);
      patched++;
    }
  }
  assert.equal(patched, 2);
  return bytes;
}

async function main() {
  assert.equal(sharp.versions.sharp, '0.35.5');
  assert.equal(sharp.versions.vips, '8.18.7');
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: 'white' } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  const gif = await sharp(png).gif().toBuffer();
  const avif = await sharp(png).avif().toBuffer();
  const tiff = await sharp(png).tiff().toBuffer();
  const avifHuge = Buffer.from(avif);
  const ispe = avifHuge.indexOf('ispe');
  assert.ok(ispe > 0);
  avifHuge.writeUInt32BE(0xffffffff, ispe + 8);
  avifHuge.writeUInt32BE(0xffffffff, ispe + 12);
  const gifHuge = Buffer.from(gif);
  gifHuge.writeUInt16LE(65535, 6);
  gifHuge.writeUInt16LE(65535, 8);
  const gifFrameHuge = Buffer.from(gifHuge);
  const frame = gifFrameHuge.lastIndexOf(0x2c);
  assert.ok(frame > 0);
  assert.equal(gifFrameHuge.readUInt16LE(frame + 5), 32);
  assert.equal(gifFrameHuge.readUInt16LE(frame + 7), 24);
  gifFrameHuge.writeUInt16LE(65535, frame + 5);
  gifFrameHuge.writeUInt16LE(65535, frame + 7);
  const jpegHuge = Buffer.from(jpeg);
  let sof = -1;
  for (let at = 2; at < jpegHuge.length - 9; at++) {
    if (jpegHuge[at] === 0xff && [0xc0, 0xc1, 0xc2].includes(jpegHuge[at + 1])) { sof = at; break; }
  }
  assert.ok(sof > 0);
  jpegHuge.writeUInt16BE(65535, sof + 5);
  jpegHuge.writeUInt16BE(65535, sof + 7);
  const cases = [
    ['png-signed31-dimensions', pngDimensions(png, 0x7fffffff, 0x7fffffff)],
    ['png-unsigned32-dimensions', pngDimensions(png, 0xffffffff, 0xffffffff)],
    ['png-default-pixel-boundary', pngDimensions(png, 16384, 16384)],
    ['jpeg-unsigned16-dimensions', jpegHuge],
    ['gif-unsigned16-canvas', gifHuge],
    ['gif-unsigned16-frame', gifFrameHuge],
    ['tiff-unsigned32-dimensions', patchTiff(tiff, 0xffffffff)],
    ['bigtiff-unsigned64-dimensions', tiffDimensions(0xffffffffffffffffn, 0xffffffffffffffffn, true)],
    ['avif-unsigned32-dimensions', avifHuge],
  ];
  const vendorPath = '/vendor/tests/data/apple_gainmap_new.jpg';
  const vendor = readFileSync(vendorPath);
  const hugeIcc = Buffer.alloc(65519);
  hugeIcc.writeUInt32BE(0xffffffff, 0);
  hugeIcc.write('acsp', 36);
  hugeIcc.writeUInt32BE(0xffffffff, 128);
  cases.push(
    ['ultrahdr-vendor-control', vendor],
    ['ultrahdr-icc-short-profile', replaceIcc(vendor, Buffer.alloc(131))],
    ['ultrahdr-icc-maximum-marker-claimed-size-tags-u32', replaceIcc(vendor, hugeIcc)],
  );
  const result = {
    sharp: sharp.versions.sharp, vips: sharp.versions.vips,
    versions: sharp.versions,
    formats: Object.fromEntries(Object.entries(sharp.format).map(([k, v]) => [k, { inputBuffer: v.input.buffer, outputBuffer: v.output.buffer }])),
    cases: [], writesBeyondAllocation: 0,
    vendorControl: { source: 'google/libultrahdr2.0.2/tests/data/apple_gainmap_new.jpg', bytes: vendor.length, sha256: createHash('sha256').update(vendor).digest('hex') },
    boundary: 'Selected hostile-header samples on exact serving native libraries; source proof, not samples alone, determines general reachability',
  };
  for (const [name, bytes] of cases) {
    const detected = await fromBuffer(bytes);
    const checks = [];
    for (const mode of ['metadata', 'conversion']) {
      const pipeline = sharp(bytes);
      try {
        const output = await (mode === 'metadata' ? pipeline.metadata() : pipeline.resize({ width: 16 }).jpeg().toBuffer());
        checks.push({ mode, rejected: false, output: Buffer.isBuffer(output) ? { bytes: output.length } : { width: output.width, height: output.height } });
      } catch (error) {
        checks.push({ mode, rejected: true, error: error.message.slice(0, 700) });
      }
    }
    result.cases.push({ name, bytes: bytes.length, detected: detected?.mime || null, checks });
  }
  const converted = await sharp(png).resize({ width: 16 }).jpeg().toBuffer();
  assert.equal((await sharp(converted).metadata()).width, 16);
  result.normalConversion = 'PASS';
  const nextSharp = createRequire('/app/node_modules/next/package.json')('sharp');
  assert.equal(nextSharp.versions.sharp, sharp.versions.sharp);
  result.nextSharpSameInstance = nextSharp === sharp;
  const tiffControl = await sharp(tiff).metadata();
  assert.equal(tiffControl.width, 32);
  result.tiffControl = 'PASS';
  const bigtiffControl = await sharp(tiffDimensions(1, 1, true)).metadata();
  assert.equal(bigtiffControl.width, 1);
  result.bigtiffControl = 'PASS';
  console.log(JSON.stringify(result));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
