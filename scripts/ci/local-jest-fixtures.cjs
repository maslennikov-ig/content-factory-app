'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const host = '127.0.0.1';
const database = 'cf-dev-db';
const user = 'cf-dev';
const password = 'cf-dev-pwd';
const label = 'com.content-factory.release-jest';
const services = {
  postgres: {
    image: 'postgres:17-alpine',
    port: 5432,
    options: ['--env', `POSTGRES_DB=${database}`, '--env', `POSTGRES_USER=${user}`, '--env', `POSTGRES_PASSWORD=${password}`],
    probe: id => ['exec', '--env', `PGPASSWORD=${password}`, id, 'psql', '-XAt', '-h', host, '-U', user, '-d', database, '-c', 'SELECT 1'],
    response: '1',
  },
  redis: { image: 'redis:7.2-alpine', port: 6379, options: [], probe: id => ['exec', id, 'redis-cli', 'ping'], response: 'PONG' },
};

function dockerCommand(args, { timeout = 15_000, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    // The coordinator waits for an in-flight Docker mutation before cleaning
    // up. Terminal signals must not kill the CLI between create and return.
    const child = spawn('docker', args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    child.stderr.setEncoding('utf8').on('data', data => { stderr += data; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.once('error', error => {
      clearTimeout(timer);
      reject(new Error(`Local Docker command failed: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && !timedOut) resolve(stdout.trim());
      else reject(new Error(`Docker ${args[0]} ${timedOut ? 'timed out' : `failed (${signal || code})`}: ${stderr.trim()}`));
    });
  });
}

async function localDocker() {
  const endpoint = (!process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST) ||
    await dockerCommand(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
  assert(/^(unix|npipe):\/\//.test(endpoint), 'Release Jest requires a local Docker socket');
  // Pin subsequent calls to the verified endpoint, even if the selected
  // Docker context changes while the suite is running.
  const env = { ...process.env, DOCKER_HOST: endpoint };
  delete env.DOCKER_CONTEXT;
  const docker = (args, timeout) => dockerCommand(args, { env, timeout });
  const images = Object.values(services).map(service => service.image);
  try {
    await docker(['image', 'inspect', '--format', '{{.Id}}', ...images]);
  } catch (error) {
    throw new Error(`Release Jest requires local Docker images ${images.join(' and ')}: ${error.message}`);
  }
  return docker;
}

function localFixtures(docker, signal) {
  const owner = randomUUID();
  const owned = () => docker(['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter', `label=${label}=${owner}`]);

  async function startService(index, name, service) {
    signal.throwIfAborted();
    const id = await docker(['run', '--detach', '--pull=never', '--name', `cf-release-jest-${owner}-${index}-${name}`,
      '--label', `${label}=${owner}`, '--publish', `${host}::${service.port}`, ...service.options, service.image]);
    assert.match(id, /^[0-9a-f]{64}$/, `Invalid ${name} container ID for shard ${index}`);
    signal.throwIfAborted();
    const address = await docker(['port', id, `${service.port}/tcp`]);
    const port = Number(address.match(/^127\.0\.0\.1:([1-9]\d{0,4})$/)?.[1]);
    assert(port > 0 && port <= 65535, `Invalid loopback ${name} port for shard ${index}`);
    const deadline = Date.now() + 60_000;
    do {
      signal.throwIfAborted();
      const ready = await docker(service.probe(id), 3_000).catch(() => null);
      if (ready === service.response) return { id, port };
      await delay(250, undefined, { signal });
    } while (Date.now() < deadline);
    throw new Error(`Shard ${index} ${name} did not become ready (container ${id})`);
  }

  async function start(index) {
    // Settle both starts before releasing ownership, even after a partial failure.
    const settled = await Promise.allSettled(Object.entries(services).map(async ([name, service]) =>
      [name, await startService(index, name, service)]));
    const failure = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    return Object.fromEntries(settled.map(result => result.value));
  }

  async function cleanup() {
    const ids = (await owned()).split('\n').filter(Boolean);
    if (ids.length) {
      assert(ids.every(id => /^[0-9a-f]{64}$/.test(id)), 'Invalid owned Docker container IDs');
      await docker(['container', 'rm', '--force', '--volumes', ...ids]);
    }
    assert.equal(await owned(), '', 'Release Jest Docker fixtures remain');
  }

  return { start, cleanup };
}

function fixtureEnvironment({ postgres, redis }, env) {
  const pgUrl = `postgresql://${user}:${password}@${host}:${postgres.port}/${database}`;
  const redisUrl = `redis://${host}:${redis.port}`;
  return {
    ...env,
    // Match the hosted Jest environment. Native probes use the test URLs
    // explicitly while ordinary code must never inherit app storage.
    DATABASE_URL: '', MASTRA_DATABASE_URL: '', REDIS_URL: '',
    CF_TEST_PG_URL: pgUrl,
    CF_TEST_REDIS_URL: redisUrl,
    CF_SERIES_TEST_DATABASE_URL: env.CF_SERIES_TEST_DATABASE_URL ? pgUrl : '',
    CF_DISCOVERY_TEST_REDIS_URL: env.CF_DISCOVERY_TEST_REDIS_URL ? redisUrl : '',
    CF_REGISTRATION_TEST_REDIS_URL: env.CF_REGISTRATION_TEST_REDIS_URL ? redisUrl : '',
  };
}

function assertCompatibleFixtureEnvironment(env) {
  // These opt-in suites require pre-provisioned named databases or a fixed
  // endpoint. Refuse the combination rather than contacting them or silently
  // turning off tests the caller requested.
  const incompatible = [
    'CF_ACCESS_DATABASE_URL', 'CF_AUTOMATION_DATABASE_URL', 'CF_BACKFILL_DATABASE_URL',
    'CF_CREDITS_DATABASE_URL', 'CF_EXTENSION_DATABASE_URL', 'CF_MEDIA_DATABASE_URL',
    'CF_PREVIEW_REVIEW_TEST_DATABASE_URL', 'CF_PUBLISH_DATABASE_URL',
    'CF_VIDEO_DATABASE_URL', 'CF_VIDEO_PERSONAL_DATABASE_URL',
  ].filter(key => env[key]);
  if (env.CF_SOURCE_ARTIFACT_DATABASE_URL && env.CF_SOURCE_ARTIFACT_DISPOSABLE === '1') {
    incompatible.push('CF_SOURCE_ARTIFACT_DATABASE_URL');
  }
  assert(incompatible.length === 0, `Release Jest cannot isolate configured opt-in fixtures: ${incompatible.join(', ')}`);
}

module.exports = { localDocker, localFixtures, fixtureEnvironment, assertCompatibleFixtureEnvironment };
