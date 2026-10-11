const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const localUrl = 'postgresql://cf-dev:synthetic-password@localhost:5433/cf-dev-db';
const productionUrl = 'postgresql://runtime:synthetic-secret-do-not-print@production.invalid:5432/product';
const schemaDir = 'libraries/nestjs-libraries/src/database/prisma';
const legacyStarts = [
  ['.', 'pm2-run'], ['.', 'pm2'],
  ['apps/backend', 'pm2'], ['apps/frontend', 'pm2'],
  ['apps/orchestrator', 'pm2'],
];
let workspace;
let callsFile;

function quote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function calls() {
  return fs.existsSync(callsFile)
    ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
}

function run(script, args = [], { packageDir = '.', env = { DATABASE_URL: localUrl } } = {}) {
  const definition = JSON.parse(fs.readFileSync(path.join(root, packageDir, 'package.json'))).scripts[script];
  return spawnSync('/bin/sh', ['-c', `${definition} ${args.map(quote).join(' ')}`], {
    cwd: path.join(workspace, packageDir),
    env: {
      PATH: `${path.join(workspace, 'fake-bin')}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      TEST_CALLS: callsFile,
      ...env,
    },
    encoding: 'utf8',
    timeout: 10000,
  });
}

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-local-command-proof-'));
  callsFile = path.join(workspace, 'calls.jsonl');
  for (const directory of ['scripts/development', schemaDir, 'prisma', 'fake-bin', ...legacyStarts.map(([d]) => d)]) {
    fs.mkdirSync(path.join(workspace, directory), { recursive: true });
  }
  for (const file of ['scripts/development/local-commands.cjs', `${schemaDir}/schema.prisma`]) {
    if (fs.existsSync(path.join(root, file))) fs.copyFileSync(path.join(root, file), path.join(workspace, file));
  }
  const fake = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({
  command: path.basename(process.argv[1]), args: process.argv.slice(2),
  databaseUrl: process.env.DATABASE_URL, cwd: process.cwd(),
}) + '\\n');
process.exit(Number(process.env.TEST_EXIT || 0));
`;
  for (const executable of ['pnpm', 'pnpx', 'pm2', 'prisma', 'nginx']) {
    fs.writeFileSync(path.join(workspace, 'fake-bin', executable), fake, { mode: 0o700 });
  }
});

afterEach(() => fs.rmSync(workspace, { recursive: true, force: true }));

describe('legacy local command safety (fake subprocesses only)', () => {
  test.each(legacyStarts)('%s %s rejects a production URL before any child', (packageDir, script) => {
    const result = run(script, [], { packageDir, env: { DATABASE_URL: productionUrl } });
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(result.stdout + result.stderr).not.toContain('synthetic-secret-do-not-print');
    expect(result.stdout + result.stderr).not.toContain(productionUrl);
  });

  test.each(legacyStarts)('%s %s starts locally without PM2 or schema commands', (packageDir, script) => {
    const result = run(script, [], { packageDir });
    expect(result.status).toBe(0);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].command).toBe('pnpm');
    expect(calls()[0].args).toContain('start');
    expect(calls()[0].args).not.toContain('pm2');
    expect(calls()[0].args).not.toContain('prisma-db-push');
    expect(calls()[0].cwd).toBe(workspace);
    if (packageDir !== '.') expect(calls()[0].args).toContain(`./${packageDir}`);
  });

  test('Dockerfile.dev startup reaches the guard before nginx, PM2 or a schema command', () => {
    const line = fs.readFileSync(path.join(root, 'Dockerfile.dev'), 'utf8').split('\n').find(l => l.startsWith('CMD '));
    const argv = JSON.parse(line.slice(4));
    // Execute its package-script target directly. No Docker daemon or image is used.
    expect(argv).toEqual(['node', 'scripts/development/local-commands.cjs', 'start']);
    const result = spawnSync(process.execPath, argv.slice(1), {
      cwd: workspace, env: { PATH: path.join(workspace, 'fake-bin'), TEST_CALLS: callsFile, DATABASE_URL: productionUrl }, encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  test.each(['prisma-db-push', 'prisma-reset'])('%s does not mutate by default', script => {
    const result = run(script);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('--confirm-local cf-dev-db');
    expect(calls()).toEqual([]);
  });

  test.each(['prisma-db-push', 'prisma-reset', 'pm2-run'])('%s dry-run creates no subprocess', script => {
    const result = run(script, ['--dry-run']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DRY RUN');
    expect(result.stdout).toContain('cf-dev-db');
    expect(result.stdout).not.toContain('synthetic-password');
    expect(calls()).toEqual([]);
  });

  test('explicit local setup uses installed Prisma without implicit data loss', () => {
    const result = run('prisma-db-push', ['--apply', '--confirm-local', 'cf-dev-db']);
    expect(result.status).toBe(0);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].args).toEqual(['exec', 'prisma', 'db', 'push', '--schema', path.join(workspace, schemaDir, 'schema.prisma')]);
    expect(calls()[0].databaseUrl).toBe(localUrl);
  });

  test('explicit local reset is one confirmed command', () => {
    const result = run('prisma-reset', ['--', '--apply', '--confirm-local', 'cf-dev-db']);
    expect(result.status).toBe(0);
    expect(calls()).toHaveLength(1);
    expect(calls()[0].args).toEqual(['exec', 'prisma', 'db', 'push', '--schema', path.join(workspace, schemaDir, 'schema.prisma'), '--force-reset', '--accept-data-loss']);
    expect(calls()[0].databaseUrl).toBe(localUrl);
  });

  test.each([
    productionUrl,
    'postgresql://cf-dev:pwd@localhost:5432/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost:5433/product',
    'postgresql://runtime:pwd@localhost:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost.example:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@cf-dev-postgres:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@127.1:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost:5433/cf-dev-db?host=production.invalid',
    'postgresql://cf-dev:pwd@localhost:5433/cf-dev-db?schema=private',
    'postgresql://cf-dev:pwd@localhost:5433/cf-dev-db?schema=public&host=production.invalid',
    'postgresql://cf-dev:pwd@localhost:5433/cf%2Ddev%2Ddb',
    'postgresql://cf-dev:$PASSWORD@localhost:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost:5433/cf-dev-db#ignored',
    'postgresql://cf-dev:pwd@localhost,production.invalid:5433/cf-dev-db',
    'postgresql://cf-dev:pwd@localhost:5433/cf-dev-db\n',
    'mysql://cf-dev:pwd@localhost:5433/cf-dev-db',
    'not-a-url',
    '',
  ])('rejects unsafe/ambiguous target %s even with reset intent', databaseUrl => {
    const result = run('prisma-reset', ['--apply', '--confirm-local', 'cf-dev-db'], { env: { DATABASE_URL: databaseUrl } });
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  test.each(['127.0.0.1', '[::1]'])('accepts the explicit loopback alias %s in dry-run', host => {
    const result = run('prisma-reset', ['--dry-run'], { env: { DATABASE_URL: localUrl.replace('localhost', host) } });
    expect(result.status).toBe(0);
    expect(calls()).toEqual([]);
  });

  test('accepts the existing public-schema option', () => {
    expect(run('prisma-db-push', ['--dry-run'], { env: { DATABASE_URL: localUrl + '?schema=public' } }).status).toBe(0);
    expect(calls()).toEqual([]);
  });

  test('missing target never reaches a child', () => {
    expect(run('pm2-run', [], { env: {} }).status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  test('loads quoted local configuration from the checkout without changing the caller environment', () => {
    fs.writeFileSync(path.join(workspace, '.env'), `DATABASE_URL="${localUrl}"\nJWT_SECRET=synthetic-only\n`);
    expect(run('prisma-db-push', ['--apply', '--confirm-local', 'cf-dev-db'], { env: {} }).status).toBe(0);
    expect(calls()[0].databaseUrl).toBe(localUrl);
  });

  test.each(['.env', `${schemaDir}/.env`, 'prisma/.env'])('conflicting %s target rejects before any child', file => {
    fs.writeFileSync(path.join(workspace, file), `DATABASE_URL="${productionUrl}"\n`);
    const result = run('prisma-reset', ['--apply', '--confirm-local', 'cf-dev-db']);
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(result.stdout + result.stderr).not.toContain('synthetic-secret-do-not-print');
  });

  test.each(['environment', 'file'])('production NODE_ENV in %s rejects before any child', source => {
    if (source === 'file') fs.writeFileSync(path.join(workspace, '.env'), 'NODE_ENV=production\n');
    const env = { DATABASE_URL: localUrl, ...(source === 'environment' ? { NODE_ENV: 'production' } : {}) };
    expect(run('pm2-run', [], { env }).status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  test('a separate production Mastra URL cannot enter local startup', () => {
    const result = run('pm2-run', [], { env: { DATABASE_URL: localUrl, MASTRA_DATABASE_URL: productionUrl } });
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
  });

  test.each([
    ['--apply'], ['--confirm-local', 'cf-dev-db'],
    ['--apply', '--confirm-local', 'product'],
    ['--apply', '--confirm-local', 'cf-dev-db', '--schema', '/untrusted/schema.prisma'],
    ['--apply', '--confirm-local', 'cf-dev-db', '--url', productionUrl],
    ['--dry-run', '--apply', '--confirm-local', 'cf-dev-db'],
    ['--accept-data-loss'], ['--force-reset'], ['--apply', '--apply'],
  ].map(args => [args]))('rejects incomplete/conflicting/override arguments %j', args => {
    const result = run('prisma-reset', args);
    expect(result.status).not.toBe(0);
    expect(calls()).toEqual([]);
    expect(result.stdout + result.stderr).not.toContain('synthetic-secret-do-not-print');
  });

  test.each(['pm2-run', 'prisma-db-push', 'prisma-reset'])('%s propagates a child failure', script => {
    const args = script === 'pm2-run' ? [] : ['--apply', '--confirm-local', 'cf-dev-db'];
    const result = run(script, args, { env: { DATABASE_URL: localUrl, TEST_EXIT: '13' } });
    expect(result.status).toBe(13);
    expect(calls()).toHaveLength(1);
  });
});
