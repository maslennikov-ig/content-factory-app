const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const stage = path.join(root, '.codex/stages/content-factory-next-dbxe-completion-stage/toolset');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-compiled-cli-'));
const valid = { REDIS_URL: 'redis://127.0.0.1:9', DATABASE_URL: 'postgresql://fixture@127.0.0.1:9/fixture',
  JWT_SECRET: 'offline-only-fixture', MAIN_URL: 'https://offline.invalid', FRONTEND_URL: 'https://offline.invalid',
  NEXT_PUBLIC_BACKEND_URL: 'https://offline.invalid/api', BACKEND_INTERNAL_URL: 'http://127.0.0.1:9', STORAGE_PROVIDER: 'local' };
const rows = [];
try {
  const observer = path.join(temporary, 'observer.cjs');
  fs.writeFileSync(observer, `const fs = require('node:fs');
let calls = 0;
for (const [object, key] of [[require('node:net').Socket.prototype, 'connect'], [require('node:tls'), 'connect'], [require('node:dgram').Socket.prototype, 'connect'], [require('node:dgram').Socket.prototype, 'send'], [require('node:dns'), 'lookup']]) {
  const original = object[key]; object[key] = function (...args) { calls++; return original.apply(this, args); };
}
process.on('exit', () => fs.writeFileSync(process.env.CF_SOCKET_REPORT, JSON.stringify({calls, operationalModules: Object.keys(require.cache).filter(file => /[\\\\/]prisma[\\\\/]|[\\\\/]temporal[\\\\/]|[\\\\/]redis[\\\\/]|[\\\\/]integrations[\\\\/]|[\\\\/]apps[\\\\/]commands[\\\\/]src[\\\\/]command\\.module\\.js$/.test(file))})));
`);
  for (const [name, args, environment, expected] of [
    ['help', ['--help'], {}, 0], ['version', ['--version'], {}, 0],
    ['parse-error', ['config:check', '--unknown-option'], {}, 1], ['config-help', ['config:check', '--help'], {}, 0],
    ['operational-help', ['adaptations:rerender-bold', '--help'], {}, 0],
    ['invalid-legacy', ['config:check'], {}, 0], ['invalid-strict', ['config:check', '--strict'], {}, 1],
    ['valid-strict', ['config:check', '--strict'], valid, 0],
    ['valid-strict-leading-option', ['--strict', 'config:check'], valid, 0],
  ]) {
    const reportPath = path.join(temporary, `${name}.json`);
    const result = spawnSync(process.execPath, ['--require', observer, path.join(root, 'apps/commands/dist/apps/commands/src/main.js'), ...args], {
      cwd: temporary, timeout: 15000, encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: temporary, CF_SOCKET_REPORT: reportPath, ...environment },
    });
    assert.equal(result.status, expected, `${name}: ${result.stderr}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.calls, 0, name); assert.deepEqual(report.operationalModules, [], name);
    rows.push({ name, exitCode: result.status, socketOrDnsCalls: report.calls, operationalModulesLoaded: 0 });
  }
  fs.writeFileSync(path.join(stage, 'compiled-cli.actual.json'), JSON.stringify({ node: process.version, compiledArtifact: 'apps/commands/dist/apps/commands/src/main.js', observer: 'delegates originals; no Prisma or connection stub', cases: rows }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, cases: rows.length, socketOrDnsCalls: 0 }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
