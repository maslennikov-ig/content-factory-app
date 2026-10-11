'use strict';

// Own one named disposable PostgreSQL container and volume; preserve everything
// present before the run. This does not call a real media provider.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const phase = process.env.CF_DBXE_PROOF_PHASE || 'fixed';
if (!/^[a-z0-9-]{1,24}$/.test(phase)) throw new Error('Invalid evidence phase');
if (process.version !== 'v22.23.2') throw new Error('Use Node 22.23.2');
const name = 'cf-dbxe-completion-backend-proof-20261011';
const volume = `${name}-data`;
const label = 'com.contentfactory.dbxe-proof';
const owner = 'backend-20261011';
const evidence = (file) => path.join(__dirname, `${phase}-${file}`);

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0 && !options.allowFailure)
    throw new Error(`${binary} ${args[0]} failed: ${result.stderr}`);
  return result;
}
function inventory() {
  return {
    containers: command('docker', ['ps', '-a', '--format', '{{json .}}'])
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .map((row) => ({ id: row.ID, name: row.Names, image: row.Image })),
    volumes: command('docker', ['volume', 'ls', '--format', '{{.Name}}'])
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .sort(),
  };
}
function json(file, value) {
  fs.writeFileSync(evidence(file), `${JSON.stringify(value, null, 2)}\n`);
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const before = inventory();
json('inventory-before.json', before);
if (
  before.containers.some((row) => row.name === name) ||
  before.volumes.includes(volume)
)
  throw new Error('Owned proof name already exists; refusing reuse');
command('docker', ['image', 'inspect', 'postgres:17-alpine']);
if (command('pnpm', ['--version']).stdout.trim() !== '10.6.1')
  throw new Error('Use pnpm 10.6.1');
let createdVolume = false,
  containerId,
  failure;
try {
  command('docker', [
    'volume',
    'create',
    '--label',
    `${label}=${owner}`,
    volume,
  ]);
  createdVolume = true;
  containerId = command('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `${label}=${owner}`,
    '-e',
    'POSTGRES_PASSWORD=synthetic-proof-only',
    '-e',
    'POSTGRES_USER=synthetic',
    '-e',
    'POSTGRES_DB=cf_dbxe_completion_backend_test',
    '-p',
    '127.0.0.1::5432',
    '--mount',
    `type=volume,src=${volume},dst=/var/lib/postgresql/data`,
    'postgres:17-alpine',
  ]).stdout.trim();
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (
      command(
        'docker',
        [
          'exec',
          containerId,
          'pg_isready',
          '-U',
          'synthetic',
          '-d',
          'cf_dbxe_completion_backend_test',
        ],
        { allowFailure: true }
      ).status === 0
    ) {
      ready = true;
      break;
    }
    command('sleep', ['0.2']);
  }
  if (!ready) throw new Error('Owned PostgreSQL did not become ready');
  const address = command('docker', [
    'port',
    containerId,
    '5432/tcp',
  ]).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(address))
    throw new Error('Expected one loopback-only database port');
  const databaseUrl = `postgresql://synthetic:synthetic-proof-only@${address}/cf_dbxe_completion_backend_test?connection_limit=4`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    CF_CREDITS_DATABASE_URL: databaseUrl,
    CF_CREDITS_DATABASE_DISPOSABLE: '1',
  };
  json('database-boundary.json', {
    name,
    containerId,
    volume,
    address,
    database: 'cf_dbxe_completion_backend_test',
    schemaMutation: 'owned disposable only',
    provider: 'fake only',
    node: process.version,
    pnpm: '10.6.1',
    prisma: require('@prisma/client/package.json').version,
    sourceSha256: Object.fromEntries(
      [
        'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.service.ts',
        'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts',
        'tests/media-credits.postgres.test.cjs',
        'tests/helpers/media-credits.module.cjs',
      ].map((file) => [file, sha256(fs.readFileSync(path.join(root, file)))])
    ),
  });
  const schema = command(
    'pnpm',
    [
      'exec',
      'prisma',
      'db',
      'push',
      '--schema',
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
      '--skip-generate',
    ],
    { env, allowFailure: true }
  );
  fs.writeFileSync(
    evidence('schema.log'),
    (schema.stdout + schema.stderr).trimEnd() + '\n'
  );
  if (schema.status !== 0)
    throw new Error('Disposable schema setup failed; see schema.log');
  const tests = command(
    'pnpm',
    [
      'exec',
      'jest',
      '--runInBand',
      '--runTestsByPath',
      'tests/media-credits.postgres.test.cjs',
    ],
    { env, allowFailure: true }
  );
  fs.writeFileSync(
    evidence('postgres-tests.log'),
    (tests.stdout + tests.stderr).trimEnd() + '\n'
  );
  if (tests.status !== 0)
    throw new Error(
      'Disposable PostgreSQL tests failed; see postgres-tests.log'
    );
  console.log('Owned PostgreSQL media-credit proof passed');
} catch (error) {
  failure = error;
} finally {
  if (containerId) {
    const row = JSON.parse(
      command('docker', ['inspect', containerId]).stdout
    )[0];
    if (row.Config.Labels[label] !== owner)
      throw new Error('Container ownership label changed; refusing removal');
    command('docker', ['rm', '-f', containerId]);
  }
  if (createdVolume) {
    const row = JSON.parse(
      command('docker', ['volume', 'inspect', volume]).stdout
    )[0];
    if (row.Labels[label] !== owner)
      throw new Error('Volume ownership label changed; refusing removal');
    command('docker', ['volume', 'rm', volume]);
  }
  const after = inventory();
  json('inventory-after.json', after);
  const missingContainers = before.containers.filter(
    (row) => !after.containers.some((current) => current.id === row.id)
  );
  const missingVolumes = before.volumes.filter(
    (value) => !after.volumes.includes(value)
  );
  const cleanup = {
    ownedContainerAbsent: !after.containers.some((row) => row.name === name),
    ownedVolumeAbsent: !after.volumes.includes(volume),
    foreignContainersBefore: before.containers.length,
    foreignVolumesBefore: before.volumes.length,
    missingForeignContainers: missingContainers,
    missingForeignVolumes: missingVolumes,
    foreignContainerRecordsMatch: before.containers.every((row) =>
      after.containers.some(
        (current) => JSON.stringify(current) === JSON.stringify(row)
      )
    ),
    inventoryBeforeSha256: sha256(
      fs.readFileSync(evidence('inventory-before.json'))
    ),
    inventoryAfterSha256: sha256(
      fs.readFileSync(evidence('inventory-after.json'))
    ),
  };
  json('cleanup.json', cleanup);
  if (
    !cleanup.ownedContainerAbsent ||
    !cleanup.ownedVolumeAbsent ||
    !cleanup.foreignContainerRecordsMatch ||
    missingContainers.length ||
    missingVolumes.length
  ) {
    failure ||= new Error(
      'Resource cleanup/preservation proof failed; see cleanup.json'
    );
  }
  console.log(JSON.stringify(cleanup));
}
if (failure) {
  console.error(failure.message);
  process.exitCode = 1;
}
