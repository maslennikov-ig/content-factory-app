'use strict';

// Controlled native CLI fixture. No database, provider, secret or network input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-dbxe34-tools-'));
const env = { ...process.env, PM2_HOME: path.join(workspace, 'pm2'),
  PM2_KILL_SIGNAL: 'SIGINT', CHECKPOINT_DISABLE: '1' };
let runtime;
let output = '';
const result = { boundary: 'native global supervisor/CLI and offline Prisma; synthetic processes only',
  node: process.version, result: 'FAIL' };

function run(command, args, opts = {}) {
  return spawnSync(command, args, { env, encoding: 'utf8', timeout: 30000,
    maxBuffer: 8 * 1024 * 1024, ...opts });
}
function jlist() {
  const r = run('pm2', ['jlist']);
  assert.equal(r.status, 0, 'native pm2 jlist');
  const start = r.stdout.indexOf('[{');
  assert.notEqual(start, -1, 'PM2 returns JSON process list');
  return JSON.parse(r.stdout.slice(start).trim());
}
async function until(predicate, label) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(200);
  }
  throw new Error(`timed out: ${label}`);
}
async function main() {
  const removed = ['npm', 'npx', 'pnpm', 'pnpx', 'corepack', 'yarn', 'yarnpkg'];
  for (const command of removed) {
    assert.notEqual(run('/bin/sh', ['-c', `command -v ${command}`]).status, 0, `${command} absent`);
  }
  for (const name of ['npm', 'pnpm', 'corepack']) {
    assert.equal(fs.existsSync(`/usr/local/lib/node_modules/${name}`), false, `${name} graph absent`);
  }
  const pm2 = require('/usr/local/lib/node_modules/pm2/package.json');
  const yaml = require('/usr/local/lib/node_modules/pm2/node_modules/js-yaml');
  assert.equal(pm2.version, '7.0.3');
  assert.equal(pm2.dependencies['js-yaml'], '4.3.2');
  assert.equal(require('/usr/local/lib/node_modules/pm2/node_modules/js-yaml/package.json').version, '4.3.2');
  assert.deepEqual(yaml.load('apps:\n  - name: safe-native-cli\n    instances: 1\n'),
    { apps: [{ name: 'safe-native-cli', instances: 1 }] });
  result.tools = { pm2: pm2.version, jsYaml: '4.3.2', removed };

  const production = require('/app/var/docker/ecosystem.config.js');
  assert.deepEqual(production.apps.map(a => a.name), ['backend', 'orchestrator', 'frontend']);
  const worker = path.join(workspace, 'worker.cjs');
  fs.writeFileSync(worker, `const fs = require('node:fs');
const file = process.env.CF_PROBE_STOP_FILE;
setInterval(() => {}, 1000);
process.on('SIGINT', () => { fs.appendFileSync(file, process.env.CF_PROBE_ROLE + '\\n'); process.exit(0); });
`);
  const stopped = path.join(workspace, 'stopped.txt');
  const apps = production.apps.map(a => {
    assert.equal(a.exec_mode, 'fork');
    for (const flag of ['pmx', 'vizion', 'automation']) assert.equal(a[flag], false);
    assert.equal(!!a.watch, false);
    return { ...a, cwd: workspace, script: worker, args: [],
      env: { ...a.env, CF_PROBE_ROLE: a.name, CF_PROBE_STOP_FILE: stopped } };
  });
  const ecosystem = path.join(workspace, 'ecosystem.config.cjs');
  fs.writeFileSync(ecosystem, `module.exports = ${JSON.stringify({ apps })};\n`);
  runtime = spawn('pm2-runtime', ['--raw', ecosystem], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [runtime.stdout, runtime.stderr]) stream.on('data', data => {
    if (output.length < 200000) output += data.toString();
  });
  await until(() => {
    try { const a = jlist(); return a.length === 3 && a.every(p => p.pm2_env.status === 'online'); }
    catch { return false; }
  }, 'three online native roles');
  const initial = jlist();
  const firstWorker = initial.find(p => p.name === 'orchestrator');
  assert(firstWorker.pid > 1);
  process.kill(firstWorker.pid, 'SIGKILL');
  await until(() => {
    const p = jlist().find(p => p.name === 'orchestrator');
    return p && p.pid !== firstWorker.pid && p.pm2_env.status === 'online' && p.pm2_env.restart_time >= 1;
  }, 'automatic worker restart');
  assert.equal(run('pm2', ['restart', 'frontend']).status, 0, 'operator restart');
  await until(() => jlist().every(p => p.pm2_env.status === 'online'), 'operator restart online');
  result.supervisor = { roles: initial.map(p => p.name), startup: true,
    jlist: true, automaticRestart: true, operatorRestart: true };
  runtime.kill('SIGTERM');
  await until(() => runtime.exitCode !== null, 'PM2 graceful shutdown');
  assert.equal(runtime.exitCode, 0);
  const stopRoles = fs.readFileSync(stopped, 'utf8').trim().split('\n');
  for (const name of ['backend', 'orchestrator', 'frontend']) assert(stopRoles.includes(name));
  result.supervisor.gracefulShutdown = true;

  // Print real Prisma6.5 bootstrap SQL through the direct installed Node CLI.
  // --from-empty does not connect to a database or apply anything.
  const prisma = '/app/node_modules/prisma/build/index.js';
  assert.equal(require('/app/node_modules/prisma/package.json').version, '6.5.0');
  const diff = run(process.execPath, [prisma, 'migrate', 'diff', '--from-empty',
    '--to-schema-datamodel', '/app/libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    '--script', '--exit-code'], { cwd: '/app' });
  assert.equal(diff.status, 2, 'real nonempty bootstrap diff');
  assert.match(diff.stdout, /CREATE TABLE "Post"/);
  const sql = path.join(workspace, 'bootstrap.sql');
  fs.writeFileSync(sql, diff.stdout);
  const guarded = run(process.execPath, ['/app/scripts/operations/validate-prisma-migration-sql.cjs',
    '--mode', 'bootstrap', '--diff', sql, '--selected', sql]);
  assert.equal(guarded.status, 0, 'unchanged guard accepts actual bootstrap output');
  const empty = run(process.execPath, [prisma, 'migrate', 'diff',
    '--from-schema-datamodel', '/app/libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    '--to-schema-datamodel', '/app/libraries/nestjs-libraries/src/database/prisma/schema.prisma',
    '--script', '--exit-code'], { cwd: '/app' });
  assert.equal(empty.status, 0, 'real schema-equal diff');
  result.prisma = { version: '6.5.0', directCli: true, bootstrapExit: diff.status,
    bootstrapSqlSha256: crypto.createHash('sha256').update(diff.stdout).digest('hex'),
    actualBootstrapGuard: true, equalSchemaExit: empty.status, schemaApplied: false };
  result.result = 'PASS';
}
main().catch(error => {
  result.failure = error.message;
  process.exitCode = 1;
}).finally(() => {
  if (runtime && runtime.exitCode === null) runtime.kill('SIGKILL');
  fs.rmSync(workspace, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(result) + '\n');
});
