'use strict';

// Root-owned release helper mounted into the exact candidate. No schema writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = '/app';
const out = '/out';
const engine = '/run/cf-schema-engine';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const expected = 'ALTER TABLE "Post" ADD COLUMN "publicationJournal" JSONB;';
const fail = reason => { console.log(JSON.stringify({ ok: false, reason, schemaApplied: false })); process.exit(1); };

try {
  const parsed = require(path.join(root, 'node_modules/dotenv')).parse(fs.readFileSync('/run/cf-preflight.env'));
  const url = new URL(parsed.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) fail('invalid_environment');
  const pkg = require(path.join(root, 'node_modules/prisma/package.json'));
  if (pkg.version !== '6.5.0') fail('wrong_prisma');
  const engineSha256 = hash(fs.readFileSync(engine));
  if (engineSha256 !== '431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2') fail('wrong_engine');
  const version = spawnSync(engine, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (version.status !== 0 || version.stdout.trim() !== 'schema-engine-cli 173f8d54f8d52e692c7e27e72a88314ec7aeff60') fail('wrong_engine_version');
  const schema = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
  const diff = spawnSync(path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'diff',
    '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--script', '--exit-code'], {
    cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, DATABASE_URL: parsed.DATABASE_URL, PRISMA_SCHEMA_ENGINE_BINARY: engine, CHECKPOINT_DISABLE: '1' },
  });
  if (diff.error || diff.signal || ![0, 2].includes(diff.status)) fail('diff_execution_failed');
  const statements = diff.stdout.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();
  if (diff.status === 0 && statements === '') {
    console.log(JSON.stringify({ ok: true, diffExitCode: 0, sqlLines: 0, schemaApplied: false, engineSha256 }));
    process.exit(0);
  }
  if (diff.status !== 2 || statements !== expected) fail('unexpected_schema_diff');
  const full = path.join(out, 'journal-full.sql'), selected = path.join(out, 'journal-selected.sql');
  fs.writeFileSync(full, diff.stdout, { mode: 0o600 });
  fs.writeFileSync(selected, expected + '\n', { mode: 0o600 });
  const guard = spawnSync(process.execPath, ['scripts/operations/validate-prisma-migration-sql.cjs',
    '--mode', 'update', '--diff', full, '--selected', selected, '--allow-table', 'Post'],
    { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (guard.status !== 0) fail('sql_guard_refused');
  console.log(JSON.stringify({ ok: true, diffExitCode: 2, sqlLines: 1, schemaApplied: false,
    onlyNullablePostJournal: true, sqlGuardExitCode: 0, selectedSha256: hash(expected + '\n'), engineSha256 }));
} catch { fail('preview_failed'); }
