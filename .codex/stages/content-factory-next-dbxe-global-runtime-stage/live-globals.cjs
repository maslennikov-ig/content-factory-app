'use strict';
// Read-only serving global/caller inventory. Never print process environments.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const proxyKeys = ['PM2_PROXY', 'PM2_PUBLIC_KEY', 'PM2_SECRET_KEY',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
const pidOneEnv = Object.fromEntries(fs.readFileSync('/proc/1/environ', 'utf8')
  .split('\0').filter(Boolean).map(s => { const n = s.indexOf('='); return [s.slice(0, n), s.slice(n + 1)]; }));
const r = spawnSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 15000,
  maxBuffer: 8 * 1024 * 1024 });
if (r.status !== 0) throw new Error('Native PM2 process-list query failed');
const processes = JSON.parse(r.stdout.slice(r.stdout.indexOf('[{'))).map(p => ({
  name: p.name, pid: p.pid, status: p.pm2_env.status, watch: !!p.pm2_env.watch,
  pmx: p.pm2_env.pmx, vizion: p.pm2_env.vizion, automation: p.pm2_env.automation,
  script: p.pm2_env.pm_exec_path, execMode: p.pm2_env.exec_mode,
}));
const versions = {};
for (const [name, file] of Object.entries({ npm: '/usr/local/lib/node_modules/npm/package.json',
  pnpm: '/usr/local/lib/node_modules/pnpm/package.json', corepack: '/usr/local/lib/node_modules/corepack/package.json',
  pm2: '/usr/local/lib/node_modules/pm2/package.json',
  jsYaml: '/usr/local/lib/node_modules/pm2/node_modules/js-yaml/package.json' })) {
  versions[name] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).version : null;
}
const schemaEngine = '/app/node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x';
const value = { capturedAt: new Date().toISOString(), node: process.version, versions, processes,
  supervisorEnvironmentPresence: Object.fromEntries(proxyKeys.map(k => [k, !!pidOneEnv[k]])),
  pm2Modules: fs.existsSync('/root/.pm2/modules') ? fs.readdirSync('/root/.pm2/modules') : [],
  schemaEngineSha256: fs.existsSync(schemaEngine) ? crypto.createHash('sha256').update(fs.readFileSync(schemaEngine)).digest('hex') : null };
console.log(JSON.stringify(value));
