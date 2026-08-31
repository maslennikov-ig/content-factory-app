/**
 * Two suites with different jobs.
 *
 * The first reads deploy/error-collector/compose.yaml as text and checks it
 * against tests/glitchtip-documented-settings.json — a recorded snapshot of what
 * GlitchTip's own install page and compose sample say. That is the part with
 * evidence behind it: a setting name that GlitchTip does not read is a setting
 * that silently does nothing, and comparing the compose file to the compose file
 * would never notice. It needs no `docker` binary, so it runs everywhere.
 *
 * The second asks `docker compose config` to resolve the file, which is the only
 * way to prove the file is a valid compose file and that the placeholders in
 * env.example interpolate. It is skipped where `docker` is absent instead of
 * failing there, because a missing binary is not a broken deployment.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const composeFile = path.join(root, 'deploy/error-collector/compose.yaml');
const envFile = path.join(root, 'deploy/error-collector/env.example');
const productionComposeFile = path.join(
  root,
  'deploy/production/docker-compose.yaml'
);
const runbookFile = path.join(root, 'docs/operations/error-collection.md');

const read = (file) => fs.readFileSync(file, 'utf8');
const documented = JSON.parse(
  read(path.join(__dirname, 'glitchtip-documented-settings.json'))
);

/** The lines of one top-level service, without the service key itself. */
function serviceLines(source, service) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `  ${service}:`);
  expect(start).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {0,2}\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The `environment:` mapping of one service, values left uninterpolated. */
function environmentOf(source, service) {
  const lines = serviceLines(source, service);
  const start = lines.findIndex((line) => line === '    environment:');
  if (start === -1) return {};
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {4}\S/.test(line));
  const body = end === -1 ? rest : rest.slice(0, end);

  const environment = {};
  for (const line of body) {
    const match = line.match(/^ {6}([A-Z][A-Z0-9_]*): ?(.*)$/);
    if (match) environment[match[1]] = match[2].replace(/^'(.*)'$/, '$1');
  }
  return environment;
}

const scalarOf = (source, service, key) => {
  const line = serviceLines(source, service).find((candidate) =>
    candidate.startsWith(`    ${key}:`)
  );
  return line ? line.slice(`    ${key}:`.length).trim() : undefined;
};

const megabytes = (value) => {
  const match = /^(\d+)m$/.exec(value ?? '');
  return match ? Number(match[1]) : undefined;
};

describe('the collector stack uses settings GlitchTip actually documents', () => {
  const source = read(composeFile);
  const collector = environmentOf(source, 'glitchtip');

  test('the recorded snapshot names its sources and the image it was taken for', () => {
    expect(documented.sources.length).toBeGreaterThan(0);
    expect(documented.recorded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(documented.recorded_for_image).toBe(
      scalarOf(source, 'glitchtip', 'image')
    );
  });

  test('every setting the collector is given is one GlitchTip reads', () => {
    const known = new Set(documented.settings);
    const unknown = Object.keys(collector).filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
    expect(Object.keys(collector).length).toBeGreaterThan(0);
  });

  test('retention is set through the documented names and overrides their defaults', () => {
    const retention = Object.fromEntries(
      Object.entries(collector).filter(([name]) =>
        Object.prototype.hasOwnProperty.call(
          documented.retention_settings,
          name
        )
      )
    );

    expect(retention).toEqual({
      GLITCHTIP_RETENTION_DAYS: '30',
      GLITCHTIP_EVENT_RETENTION_DAYS: '30',
      GLITCHTIP_EVENT_HOT_DAYS: '30',
      GLITCHTIP_FILE_RETENTION_DAYS: '30',
    });
    // Worth setting only because the documented general default is longer.
    expect(documented.retention_settings.GLITCHTIP_RETENTION_DAYS).toBe('90');
  });

  test('cold storage stays off through its documented switch', () => {
    expect(collector[documented.cold_storage_is_opt_in_via]).toBe('False');
    const invented = Object.keys(collector).filter((name) =>
      name.startsWith('GLITCHTIP_COLD_STORAGE')
    );
    expect(invented).toEqual([]);
  });

  test('Valkey is left out the way the documentation allows', () => {
    expect(documented.valkey_is_optional).toBe(true);
    expect(source).not.toContain('valkey/valkey');
    expect(collector.VALKEY_URL).toBe('');
  });

  test('memory ceilings clear the documented recommendation', () => {
    expect(megabytes(scalarOf(source, 'glitchtip', 'mem_limit'))).toBe(
      documented.all_in_one_recommended_memory_mb
    );
    expect(
      megabytes(scalarOf(source, 'postgres', 'mem_limit'))
    ).toBeGreaterThanOrEqual(documented.all_in_one_minimum_memory_mb);
  });

  test('PostgreSQL clears the documented minimum version', () => {
    const image = scalarOf(source, 'postgres', 'image');
    expect(Number(image.split(':')[1])).toBeGreaterThanOrEqual(
      documented.minimum_postgres_major
    );
    // Since 18 the image keeps PGDATA under /var/lib/postgresql/<major>, and
    // the volume it declares is the parent. Mounting the old data path would
    // lose the database on restart.
    expect(source).toContain('postgres-data:/var/lib/postgresql\n');
  });

  test('deploy values stay placeholders on a reserved domain', () => {
    const env = read(envFile);
    expect(env).toContain('replace-with-generated-secret');
    expect(env).toContain('replace-with-collector-domain.invalid');
    expect(env).not.toContain('factory.aidevteam.ru');
    expect(env).not.toMatch(/dsn\s*=\s*https?:\/\//i);
  });

  test('the product stack does not know the collector exists', () => {
    expect(read(productionComposeFile)).not.toMatch(
      /glitchtip|error-collector/i
    );
  });

  test('the runbook documents validation, isolation, retention, the host budget, and the authorization boundary', () => {
    const runbook = read(runbookFile);

    expect(runbook).toContain('GlitchTip 6.2.6');
    expect(runbook).toContain('30 дней');
    expect(runbook).toContain('отдельн');
    expect(runbook).toContain('config --quiet');
    expect(runbook).toContain('не запускает контейнеры');
    expect(runbook).toContain('отдельного разрешения');
    expect(runbook).not.toContain('prisma db push');
    // The ceilings in this file are not the only ones on whatever host is
    // chosen, and the runbook has to say so before anyone deploys.
    expect(runbook).toContain('Память хоста');
    expect(runbook).toContain('512 МиБ');
    expect(runbook).toContain('384 МиБ');
  });
});

const dockerAvailable =
  spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status ===
  0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

if (!dockerAvailable) {
  console.warn(
    'error-collector: skipping the `docker compose config` suite, no docker binary here.'
  );
}

describeWithDocker(
  'the collector stack resolves as a real compose file',
  () => {
    const composeConfig = () => {
      const result = spawnSync(
        'docker',
        [
          'compose',
          '--env-file',
          envFile,
          '--file',
          composeFile,
          'config',
          '--format',
          'json',
        ],
        { cwd: root, encoding: 'utf8' }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      return JSON.parse(result.stdout);
    };

    test('ships a valid, separately deployable GlitchTip stack', () => {
      const config = composeConfig();
      expect(Object.keys(config.services).sort()).toEqual([
        'glitchtip',
        'postgres',
      ]);
      expect(config.services.glitchtip.image).toBe('glitchtip/glitchtip:6.2.6');
      expect(config.services.postgres.image).toBe('postgres:18');
      expect(config.services.glitchtip.environment.SERVER_ROLE).toBe(
        'all_in_one'
      );
      expect(config.services).not.toHaveProperty('valkey');
      expect(config.services.glitchtip.restart).toBe('unless-stopped');
      expect(config.services.postgres.restart).toBe('unless-stopped');
    });

    test('keeps its PostgreSQL private, durable, and independent from product services', () => {
      const config = composeConfig();
      const database = config.services.postgres;

      expect(database.ports).toBeUndefined();
      expect(database.volumes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target: '/var/lib/postgresql',
            type: 'volume',
          }),
        ])
      );
      expect(config.services.glitchtip.depends_on.postgres.condition).toBe(
        'service_healthy'
      );
      expect(config.services.glitchtip.environment.DATABASE_URL).toContain(
        '@postgres:5432/'
      );
    });

    test('binds only the collector, and only to loopback', () => {
      const collectorPort = composeConfig().services.glitchtip.ports[0];
      expect(collectorPort.host_ip).toBe('127.0.0.1');
      expect(collectorPort.target).toBe(8000);
    });
  }
);
