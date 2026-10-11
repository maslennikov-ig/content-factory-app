'use strict';
// Pipe to `docker exec -i cf-next-app node`; read-only, selected fields only.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = createRequire('/app/package.json');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sharp = root('sharp');
const nextSharp = createRequire(root.resolve('next/package.json'))('sharp');
const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
const roleOverrides = processes.map((item) => {
  const entries = new Map(fs.readFileSync(`/proc/${item.pid}/environ`, 'utf8').split('\0').map((entry) => {
    const at = entry.indexOf('=');
    return [entry.slice(0, at), entry.slice(at + 1)];
  }));
  return {
    role: item.name,
    preloadConfigured: !!entries.get('LD_PRELOAD'),
    libraryPathConfigured: !!entries.get('LD_LIBRARY_PATH'),
    vipsModulePathConfigured: !!entries.get('VIPS_PATH'),
  };
});
console.log(JSON.stringify({
  node: process.versions.node,
  sharp: sharp.versions.sharp,
  vips: sharp.versions.vips,
  addonHash: hash('/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node'),
  libvipsHash: hash('/app/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7'),
  systemLibstdcppHash: hash('/usr/lib/x86_64-linux-gnu/libstdc++.so.6'),
  nextSharpSameInstance: nextSharp === sharp,
  preloadConfigured: !!process.env.LD_PRELOAD,
  libraryPathConfigured: !!process.env.LD_LIBRARY_PATH,
  vipsModulePathConfigured: !!process.env.VIPS_PATH,
  roleOverrides,
  sourceManifest: root('/app/var/source/source.json'),
}));
