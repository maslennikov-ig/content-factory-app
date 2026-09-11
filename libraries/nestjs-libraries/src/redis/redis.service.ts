import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
// Exported so a suite can check the stand-in itself rather than a copy of it:
// the research quota counts through these methods when no `REDIS_URL` is set.
export class MockRedis {
  private data: Map<string, any> = new Map();
  private expiries: Map<string, number> = new Map();

  async get(key: string) {
    if (this.expired(key)) return undefined;
    return this.data.get(key);
  }

  /**
   * Honours the `EX <seconds>` form because callers use it for security
   * lifetimes, not for housekeeping. The PKCE verifier behind Telegram login is
   * meant to die in five minutes; a mock that ignored the argument would keep
   * it valid for as long as the process lived and would quietly diverge from
   * how the same code behaves against a real Redis.
   */
  async set(key: string, value: any, mode?: string, ttlSeconds?: number) {
    this.data.set(key, value);
    if (mode?.toUpperCase() === 'EX' && typeof ttlSeconds === 'number') {
      this.expiries.set(key, Date.now() + ttlSeconds * 1000);
    } else {
      this.expiries.delete(key);
    }
    return 'OK';
  }

  private expired(key: string) {
    const expiresAt = this.expiries.get(key);
    if (expiresAt === undefined || expiresAt > Date.now()) return false;
    this.data.delete(key);
    this.expiries.delete(key);
    return true;
  }

  async del(key: string) {
    this.expiries.delete(key);
    this.data.delete(key);
    return 1;
  }

  /**
   * Counters, stored the way Redis stores them: a string that arithmetic is
   * done on. The research quota counts admissions here, so a process started
   * without `REDIS_URL` still counts rather than silently doing nothing.
   */
  async incr(key: string) {
    return this.addTo(key, 1);
  }

  async decr(key: string) {
    return this.addTo(key, -1);
  }

  private addTo(key: string, delta: number) {
    const current = this.expired(key) ? 0 : Number(this.data.get(key) ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + delta;
    this.data.set(key, String(next));
    return next;
  }

  /** Returns 1 when the key exists, 0 when it does not, like Redis. */
  async expire(key: string, ttlSeconds: number) {
    if (this.expired(key) || !this.data.has(key)) return 0;
    this.expiries.set(key, Date.now() + ttlSeconds * 1000);
    return 1;
  }

  /** -2 for a missing key, -1 for one without a lifetime, else seconds left. */
  async ttl(key: string) {
    if (this.expired(key) || !this.data.has(key)) return -2;
    const expiresAt = this.expiries.get(key);
    if (expiresAt === undefined) return -1;
    return Math.ceil((expiresAt - Date.now()) / 1000);
  }

  async getdel(key: string) {
    const expired = this.expired(key);
    const value = expired ? undefined : this.data.get(key);
    this.expiries.delete(key);
    this.data.delete(key);
    return value;
  }

  // Add other Redis methods as needed for your tests
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
export const ioRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
