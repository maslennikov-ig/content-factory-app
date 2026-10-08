'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { preflight, ENGINE_VERSION } = require('../scripts/release/schema-preflight.cjs');
const root = path.resolve(__dirname, '..');
const secret = 'postgresql://operator:private-password@db:5432/app';
let dir;
let options;
function write(name, contents, mode = 0o600) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, { mode });
  return full;
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-schema-test-'));
  fs.mkdirSync(path.join(dir, 'node_modules/dotenv'), { recursive: true });
  // Actual pinned dotenv parser, not a fixture parser of quote handling.
  fs.rmSync(path.join(dir, 'node_modules/dotenv'), { recursive: true });
  fs.symlinkSync(path.dirname(require.resolve('dotenv/package.json')), path.join(dir, 'node_modules/dotenv'));
  write('node_modules/prisma/package.json', JSON.stringify({ version: '6.5.0' }));
  write('node_modules/@prisma/engines/package.json', JSON.stringify({ version: '6.5.0',
    dependencies: { '@prisma/engines-version': `6.5.0-73.${ENGINE_VERSION}` } }));
  const enginePath = write('engine', `#!/bin/sh\nprintf 'schema-engine-cli ${ENGINE_VERSION}\\n'\n`, 0o700);
  const envFile = write('app.env', `DATABASE_URL="${secret}"\n`);
  write('node_modules/.bin/prisma', `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync('invocation.json', JSON.stringify({ args: process.argv.slice(2), url: process.env.DATABASE_URL }));
const result = JSON.parse(fs.readFileSync('child.json'));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr || '');
process.exit(result.status);
`, 0o700);
  write('child.json', JSON.stringify({ status: 0, stdout: '-- This is an empty migration.\n' }));
  options = { appRoot: dir, envFile, enginePath,
    engineSha256: crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex') };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('quoted dotenv is normalized only inside child env; empty successful diff passes without datasource argv', () => {
  const result = preflight(options);
  expect(result).toMatchObject({ ok: true, diffExitCode: 0, sqlLines: 0, schemaApplied: false });
  const invocation = JSON.parse(fs.readFileSync(path.join(dir, 'invocation.json')));
  expect(invocation.url).toBe(secret);
  expect(invocation.args).toEqual(['migrate', 'diff', '--from-schema-datasource',
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma', '--to-schema-datamodel',
    'libraries/nestjs-libraries/src/database/prisma/schema.prisma', '--script', '--exit-code']);
  expect(JSON.stringify(invocation.args)).not.toContain(secret);
  expect(JSON.stringify(result)).not.toContain(secret);
});

test.each(['DATABASE_URL="not-a-url"', 'DATABASE_URL="https://example.test/db"', 'OTHER=value'])('invalid env fails before engine or diff', (env) => {
  fs.writeFileSync(options.envFile, env);
  expect(preflight(options)).toMatchObject({ ok: false, reason: 'invalid_environment' });
  expect(fs.existsSync(path.join(dir, 'invocation.json'))).toBe(false);
});

test('missing schema engine is failure, never an empty diff', () => {
  fs.unlinkSync(options.enginePath);
  expect(preflight(options)).toMatchObject({ ok: false, reason: 'missing_schema_engine' });
  expect(fs.existsSync(path.join(dir, 'invocation.json'))).toBe(false);
});

test('engine checksum and matching package/version are required', () => {
  expect(preflight({ ...options, engineSha256: '0'.repeat(64) })).toMatchObject({ reason: 'engine_checksum_mismatch' });
  fs.writeFileSync(path.join(dir, 'node_modules/prisma/package.json'), '{"version":"6.6.0"}');
  expect(preflight(options)).toMatchObject({ reason: 'incompatible_prisma_package' });
});

test('even a checksummed executable must identify the compatible native engine', () => {
  fs.writeFileSync(options.enginePath, '#!/bin/sh\necho schema-engine-cli incompatible\n');
  options.engineSha256 = crypto.createHash('sha256').update(fs.readFileSync(options.enginePath)).digest('hex');
  expect(preflight(options)).toMatchObject({ ok: false, reason: 'incompatible_schema_engine' });
  expect(fs.existsSync(path.join(dir, 'invocation.json'))).toBe(false);
});

test.each([
  [1, '', 'diff_failed'],
  [2, 'ALTER TABLE "Post" ADD COLUMN "x" TEXT;\n', 'diff_failed'],
  [0, 'ALTER TABLE "Post" ADD COLUMN "x" TEXT;\n', 'nonempty_schema_diff'],
])('child exit %s and output are checked independently without leaking error contents', (status, stdout, reason) => {
  write('child.json', JSON.stringify({ status, stdout, stderr: `P1012 ${secret}` }));
  const result = preflight(options);
  expect(result).toMatchObject({ ok: false, reason, schemaApplied: false });
  expect(JSON.stringify(result)).not.toContain(secret);
});

test.each(['success', 'diff_failure', 'raw_failure', 'invalid_success', 'extra_success_output', 'extra_failure_output'])('wrapper removes only its temporary container and files after %s', (mode) => {
  const fail = ['diff_failure', 'raw_failure', 'extra_failure_output'].includes(mode);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(tmp);
  const cid = 'a'.repeat(64);
  write('unrelated-file', 'keep me');
  const safeResult = JSON.stringify(fail
    ? { ok: false, reason: 'diff_failed', schemaApplied: false, diffExitCode: 1 }
    : { ok: true, diffExitCode: 0, sqlLines: 0, schemaApplied: false, prismaVersion: '6.5.0', engineVersion: ENGINE_VERSION,
      engineSha256: require('../scripts/release/schema-preflight.cjs').ENGINE_SHA256 });
  write('bin/docker', `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CF_TEST_LOG, JSON.stringify(args) + '\\n');
if(args[0] === 'image' || args[0] === 'rm') process.exit(0);
fs.writeFileSync(args[args.indexOf('--cidfile') + 1], '${cid}');
process.stderr.write('${secret}');
process.stdout.write(${JSON.stringify((['raw_failure', 'invalid_success'].includes(mode) ? secret : safeResult) + (mode.startsWith('extra_') ? '\n' + secret : '') + '\n')});
process.exit(${fail ? 1 : 0});
`, 0o700);
  const log = path.join(dir, 'docker.log');
  const run = spawnSync('bash', [path.join(root, 'scripts/release/schema-preflight.sh'), 'candidate'], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmp,
      CF_SCHEMA_ENGINE_PATH: options.enginePath, CF_APP_ENV_PATH: options.envFile, CF_TEST_LOG: log },
  });
  expect(run.status).toBe(mode === 'success' ? 0 : 1);
  expect(run.stdout + run.stderr).not.toContain(secret);
  expect(fs.readdirSync(tmp)).toEqual([]);
  expect(fs.readFileSync(path.join(dir, 'unrelated-file'), 'utf8')).toBe('keep me');
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  expect(calls.at(-1)).toEqual(['rm', '-f', cid]);
  const dockerRun = calls.find((args) => args[0] === 'run');
  expect(dockerRun).toEqual(expect.arrayContaining(['--read-only', '--pull', 'never', '--entrypoint', 'node']));
  expect(dockerRun).not.toContain('--env-file');
  expect(JSON.stringify(dockerRun)).not.toContain(secret);
  expect(dockerRun.filter((arg) => arg.startsWith('type=bind'))).toHaveLength(3);
  expect(dockerRun.filter((arg) => arg.startsWith('type=bind')).every((arg) => arg.endsWith(',readonly'))).toBe(true);
});
