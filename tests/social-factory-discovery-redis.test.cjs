const { randomUUID } = require('node:crypto');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { RedisDiscoveryCache } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/social-factory/discovery/redis-discovery-cache.ts');
const Redis = require('ioredis');
const describeRedis = process.env.CF_DISCOVERY_TEST_REDIS_URL ? describe : describe.skip;

// An explicit isolated local Redis is required; never FLUSHDB or use application account configuration.
describeRedis('discovery cache against real Redis Lua execution', () => {
  let redis;
  let cache;
  let org;
  let other;
  const result = (key) => ({ version: 1, contextKey: key, candidates: [], gaps: [] });
  beforeAll(async () => {
    redis = new Redis(process.env.CF_DISCOVERY_TEST_REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redis.connect();
    cache = new RedisDiscoveryCache(redis);
  });
  beforeEach(() => { org = `discovery-test-${randomUUID()}`; other = `discovery-test-${randomUUID()}`; });
  afterEach(async () => { await cache.invalidateOrganization(org); await cache.invalidateOrganization(other); });
  afterAll(async () => { await redis.quit(); });

  test('shared Redis persists between service instances and isolates tenants', async () => {
    const lease = await cache.read(org, 'brief-a');
    expect(await cache.write(org, 'brief-a', lease.generation, result('brief-a'), 60000)).toBe(true);
    const second = new RedisDiscoveryCache(redis);
    expect((await second.read(org, 'brief-a')).result).toMatchObject({ contextKey: 'brief-a' });
    expect((await second.read(other, 'brief-a')).result).toBeNull();
    expect((await second.read(org, 'brief-b')).result).toBeNull();
  });

  test('source invalidation removes all cached channel results and rejects concurrent stale writes', async () => {
    const lease = await cache.read(org, 'brief-a');
    await cache.write(org, 'brief-a', lease.generation, result('brief-a'), 60000);
    await cache.write(org, 'brief-b', lease.generation, result('brief-b'), 60000);
    await cache.write(other, 'brief-a', '0', result('brief-a'), 60000);
    await cache.invalidateOrganization(org);
    expect((await cache.read(org, 'brief-a')).result).toBeNull();
    expect((await cache.read(org, 'brief-b')).result).toBeNull();
    expect(await cache.write(org, 'brief-a', lease.generation, result('brief-a'), 60000)).toBe(false);
    expect((await cache.read(other, 'brief-a')).result).not.toBeNull();
    const fresh = await cache.read(org, 'brief-a');
    expect(await cache.write(org, 'brief-a', fresh.generation, result('brief-a'), 60000)).toBe(true);
  });

  test('expiration uses Redis TTL and excludes nonpositive/nonfinite retention', async () => {
    expect(await cache.write(org, 'invalid', '0', result('invalid'), NaN)).toBe(false);
    expect(await cache.write(org, 'invalid', '0', result('invalid'), 0)).toBe(false);
    await cache.write(org, 'brief-a', '0', result('brief-a'), 20);
    await new Promise(resolve => setTimeout(resolve, 40));
    expect((await cache.read(org, 'brief-a')).result).toBeNull();
  });
});
