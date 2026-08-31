import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
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
