'use strict';

// Runs inside the candidate image. Child output is deliberately private: Prisma
// errors can contain the datasource, and SQL is never written to host storage.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const PRISMA_VERSION = '6.5.0';
const ENGINE_VERSION = '173f8d54f8d52e692c7e27e72a88314ec7aeff60';
const ENGINE_SHA256 = '431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2';

function preflight({ appRoot = '/app', envFile = '/run/cf-preflight.env',
  enginePath = '/run/cf-schema-engine', engineSha256 = ENGINE_SHA256 } = {}) {
  let phase = 'environment';
  const failure = (reason) => ({ ok: false, reason, schemaApplied: false });
  try {
    const dotenv = require(path.join(appRoot, 'node_modules/dotenv'));
    const parsed = dotenv.parse(fs.readFileSync(envFile));
    const url = new URL(parsed.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
      return failure('invalid_environment');
    }

    phase = 'package';
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'node_modules/prisma/package.json')));
    const engines = JSON.parse(fs.readFileSync(path.join(appRoot, 'node_modules/@prisma/engines/package.json')));
    if (pkg.version !== PRISMA_VERSION || engines.version !== PRISMA_VERSION ||
      engines.dependencies?.['@prisma/engines-version'] !== `${PRISMA_VERSION}-73.${ENGINE_VERSION}`) {
      return failure('incompatible_prisma_package');
    }

    phase = 'engine';
    fs.accessSync(enginePath, fs.constants.R_OK | fs.constants.X_OK);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex');
    if (hash !== engineSha256) return failure('engine_checksum_mismatch');
    const version = spawnSync(enginePath, ['--version'], { encoding: 'utf8', timeout: 10000 });
    if (version.status !== 0 || version.stdout.trim() !== `schema-engine-cli ${ENGINE_VERSION}`) {
      return failure('incompatible_schema_engine');
    }

    phase = 'diff';
    const schema = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
    const result = spawnSync(path.join(appRoot, 'node_modules/.bin/prisma'), [
      'migrate', 'diff', '--from-schema-datasource', schema,
      '--to-schema-datamodel', schema, '--script', '--exit-code',
    ], {
      cwd: appRoot, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: parsed.DATABASE_URL,
        PRISMA_SCHEMA_ENGINE_BINARY: enginePath, CHECKPOINT_DISABLE: '1' },
    });
    if (result.error || result.signal || result.status === null) return failure('diff_execution_failed');
    if (result.status !== 0) return { ...failure('diff_failed'), diffExitCode: result.status };
    // Only blank lines and SQL line comments count as an empty migration.
    // Invalid/unknown output fails closed even when a child exits zero.
    const sqlLines = result.stdout.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('--'));
    if (sqlLines.length) return failure('nonempty_schema_diff');
    return { ok: true, diffExitCode: 0, sqlLines: 0, schemaApplied: false,
      prismaVersion: PRISMA_VERSION, engineVersion: ENGINE_VERSION, engineSha256: hash };
  } catch {
    return failure({ environment: 'invalid_environment', package: 'incompatible_prisma_package',
      engine: 'missing_schema_engine', diff: 'diff_execution_failed' }[phase]);
  }
}

if (require.main === module) {
  const result = preflight();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
module.exports = { preflight, ENGINE_SHA256, ENGINE_VERSION };
