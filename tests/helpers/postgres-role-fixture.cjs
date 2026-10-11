const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const producer = 'postgres-role-isolation.execution.test.cjs';
const ownerLabel = 'ru.content-factory.test-owner';
const producerLabel = 'ru.content-factory.test-producer';
const docker = (...args) =>
  spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });

/** The supplied ID and per-run label are both required; names alone are unsafe. */
function cleanupOwnedContainer(id, owner, run = docker) {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9-]{36}$/.test(owner)) {
    throw new Error('Exact fixture container ID and owner UUID required');
  }
  const inspected = run('inspect', id);
  if (inspected.status !== 0) {
    // Only absence is a safe no-op. Daemon/permission failure must stay visible.
    if (/No such (object|container)/i.test(inspected.stderr || '')) return;
    throw new Error('Fixture inspection failed');
  }
  const [container] = JSON.parse(inspected.stdout);
  const labels = container.Config?.Labels || {};
  if (
    container.Id !== id ||
    labels[ownerLabel] !== owner ||
    labels[producerLabel] !== producer ||
    container.Config.Image !== 'postgres:17-alpine' ||
    container.Mounts.some(
      (mount) =>
        mount.Type !== 'volume' ||
        mount.Destination !== '/var/lib/postgresql/data'
    )
  ) {
    throw new Error('Fixture ownership or mounts mismatch; preserved');
  }
  const result = run('rm', '--force', '--volumes', id);
  if (result.status !== 0)
    throw new Error('Fixture container/volume cleanup failed');
}

function createRoleFixtureDocker(names, options = {}) {
  const owner = randomUUID();
  const owned = new Set();
  const run = options.run || docker;
  const invoke = (...args) => {
    if (args[0] !== 'run') return run(...args);
    const nameIndex = args.indexOf('--name');
    if (nameIndex < 0 || !names.includes(args[nameIndex + 1])) {
      throw new Error('Fixture may only start declared owned names');
    }
    const result = run(
      'run',
      '--label',
      `${ownerLabel}=${owner}`,
      '--label',
      `${producerLabel}=${producer}`,
      ...args.slice(1)
    );
    if (result.status === 0) {
      const id = result.stdout.trim();
      if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error('Docker did not return an exact fixture ID');
      owned.add(id);
    }
    return result;
  };
  const cleanup = () => {
    for (const id of owned) {
      cleanupOwnedContainer(id, owner, run);
      owned.delete(id);
    }
  };
  if (options.signals !== false) {
    const interrupted = (code) => {
      try {
        cleanup();
      } finally {
        process.exit(code);
      }
    };
    process.once('SIGINT', () => interrupted(130));
    process.once('SIGTERM', () => interrupted(143));
    process.once('exit', cleanup);
  }
  return { docker: invoke, cleanup, owner };
}

module.exports = {
  createRoleFixtureDocker,
  cleanupOwnedContainer,
  ownerLabel,
  producerLabel,
  producer,
};
if (require.main === module) {
  try {
    const [id, owner, ...extra] = process.argv.slice(2);
    if (extra.length)
      throw new Error('Expected exact fixture ID and owner UUID only');
    cleanupOwnedContainer(id, owner);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
