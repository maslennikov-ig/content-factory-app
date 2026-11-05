import { createHash } from 'node:crypto';
import type { DiscoveryCache, DiscoveryCacheLease, DiscoveryResult } from './discovery.types';

export interface DiscoveryRedisClient {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

const MAX_TTL_MS = 6 * 60 * 60_000;
const READ = `
local generation = redis.call('GET', KEYS[1]) or '0'
local value = redis.call('GET', KEYS[2])
return {generation, value or ''}
`;
const WRITE = `
if (redis.call('GET', KEYS[1]) or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
redis.call('SADD', KEYS[3], KEYS[2])
redis.call('PEXPIRE', KEYS[3], ARGV[4])
return 1
`;
const INVALIDATE = `
local entries = redis.call('SMEMBERS', KEYS[2])
for _, key in ipairs(entries) do redis.call('DEL', key) end
redis.call('DEL', KEYS[2])
redis.call('INCR', KEYS[1])
return 1
`;

/** Uses the existing Redis connection. No import-time socket or second persistence stack. */
export class RedisDiscoveryCache implements DiscoveryCache {
  constructor(private readonly redis: DiscoveryRedisClient) {}

  async generation(organizationId: string): Promise<string> {
    const keys = this.keys(organizationId);
    return String(await this.redis.eval("return redis.call('GET', KEYS[1]) or '0'", 1, keys.generation));
  }

  private keys(organizationId: string, contextKey = '') {
    if (!organizationId.trim()) throw new Error('DISCOVERY_ORGANIZATION_REQUIRED');
    // Hash tag keeps the atomic operation in one Redis Cluster slot.
    const tenant = createHash('sha256').update(organizationId).digest('hex');
    const base = `social-discovery:v1:{${tenant}}`;
    return { generation: `${base}:generation`, index: `${base}:entries`,
      entry: `${base}:${createHash('sha256').update(contextKey).digest('hex')}` };
  }

  async read(organizationId: string, contextKey: string): Promise<DiscoveryCacheLease> {
    const keys = this.keys(organizationId, contextKey);
    const response = await this.redis.eval(READ, 2, keys.generation, keys.entry);
    if (!Array.isArray(response) || response.length !== 2) throw new Error('DISCOVERY_CACHE_INVALID_RESPONSE');
    let result: DiscoveryResult | null = null;
    if (response[1]) {
      try {
        const candidate = JSON.parse(String(response[1]));
        if (candidate.version === 1 && candidate.contextKey === contextKey &&
            Array.isArray(candidate.candidates) && Array.isArray(candidate.gaps)) result = candidate;
      } catch { /* Malformed/old cached values are misses. */ }
    }
    return { generation: String(response[0]), result };
  }

  async write(organizationId: string, contextKey: string, generation: string,
    result: DiscoveryResult, ttlMs: number): Promise<boolean> {
    const keys = this.keys(organizationId, contextKey);
    if (!Number.isFinite(ttlMs) || ttlMs < 1) return false;
    const ttl = Math.min(MAX_TTL_MS, Math.floor(ttlMs));
    const response = await this.redis.eval(WRITE, 3, keys.generation, keys.entry, keys.index,
      generation, JSON.stringify(result), ttl, MAX_TTL_MS + 60_000);
    return Number(response) === 1;
  }

  /** Source deletion/revocation deliberately invalidates all tenant research. */
  async invalidateOrganization(organizationId: string): Promise<void> {
    const keys = this.keys(organizationId);
    await this.redis.eval(INVALIDATE, 2, keys.generation, keys.index);
  }
}
