import { randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ioRedis } from '../redis/redis.service';
import {
  createRegistrationClientTracker,
  type TransientClientRequest,
} from './transient-client-tracker';

const REGISTRATION_EFFECT_TTL_MS = 60_000;
const REGISTRATION_STORE_DEADLINE_MS = 1_000;
const REGISTRATION_CONNECTION_LIMIT = 16;
const REGISTRATION_KEY_PREFIX = 'cf:reg:{effect-v1}:';
const OPAQUE_TOKEN = /^[a-f0-9]{32}$/;
let activeRegistrationConnections = 0;

// Both rotating identities are aliases of one owner. Writing both also holds
// a delayed old-minute request that arrives after the new-minute acquisition.
// A key without that bounded lifetime is unsafe, not a free slot.
const ACQUIRE_REGISTRATION_EFFECT = `
local remaining = 0
for i = 1, #KEYS do
  local ttl = redis.call('PTTL', KEYS[i])
  if ttl == -1 or ttl > 60000 then return {-1, 0} end
  if ttl >= 0 then remaining = math.max(remaining, math.max(ttl, 1)) end
end
if remaining > 0 then return {0, remaining} end
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], ARGV[1], 'PX', 60000, 'NX')
end
return {1, 60000}
`;

const RELEASE_REGISTRATION_EFFECT = `
local removed = 0
for i = 1, #KEYS do
  if redis.call('GET', KEYS[i]) == ARGV[1] then
    removed = removed + redis.call('DEL', KEYS[i])
  end
end
return removed
`;

const FORM_REFUSALS = {
  email_plus_not_allowed: 'Email with plus sign is not allowed',
  email_already_exists: 'Email already exists',
  invite_email_mismatch: 'This invitation belongs to another email address',
} as const;

/** Only raised at explicit registration checks before account/mail effects. */
export class RegistrationFormRefusal extends Error {
  readonly status: number;

  constructor(readonly code: keyof typeof FORM_REFUSALS) {
    super(FORM_REFUSALS[code]);
    this.name = 'RegistrationFormRefusal';
    this.status = code === 'invite_email_mismatch' ? 403 : 400;
  }
}

export class RegistrationBudgetUnavailable extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'registration_budget_unavailable',
      message:
        'Registration is temporarily unavailable. Please try again later.',
    });
  }
}

export type RegistrationReservation = {
  readonly key: string;
  readonly previousKey: string;
  readonly owner: string;
};

type RegistrationAdmission =
  | { allowed: true; reservation: RegistrationReservation }
  | { allowed: false; retryAfterSeconds: number };

type RegistrationRedisSource = Pick<Redis, 'status' | 'duplicate'>;

/**
 * Existing shared Redis credentials/store, with bounded, no-replay operations.
 * The shared client can retry indefinitely; mutating its options would affect
 * unrelated work. Each short duplicate is disconnected on every exit, and a
 * process-wide cap bounds live connections even across limiter instances.
 */
export class RegistrationEffectLimiter {
  constructor(private readonly source: RegistrationRedisSource = ioRedis) {}

  private async evaluate(
    script: string,
    keys: string[],
    owner: string
  ): Promise<unknown> {
    if (
      this.source.status !== 'ready' ||
      typeof this.source.duplicate !== 'function' ||
      activeRegistrationConnections >= REGISTRATION_CONNECTION_LIMIT
    ) {
      throw new RegistrationBudgetUnavailable();
    }

    activeRegistrationConnections += 1;
    let client: Redis | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    try {
      client = this.source.duplicate({
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: 0,
        retryStrategy: null,
        reconnectOnError: null,
        enableAutoPipelining: false,
        connectTimeout: REGISTRATION_STORE_DEADLINE_MS,
        commandTimeout: REGISTRATION_STORE_DEADLINE_MS,
      });
      // Surface only the safe HTTP error below, never a Redis error containing
      // connection details or command arguments.
      client.on('error', () => {});
      const connection = client;
      const operation = async () => {
        await connection.connect();
        if (cancelled) throw new RegistrationBudgetUnavailable();
        return connection.eval(script, keys.length, ...keys, owner);
      };
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            cancelled = true;
            reject(new RegistrationBudgetUnavailable());
          }, REGISTRATION_STORE_DEADLINE_MS);
        }),
      ]);
    } catch {
      throw new RegistrationBudgetUnavailable();
    } finally {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try {
        client?.disconnect();
      } finally {
        activeRegistrationConnections -= 1;
      }
    }
  }

  async acquire(
    key: string,
    previousKey: string
  ): Promise<RegistrationAdmission> {
    if (!OPAQUE_TOKEN.test(key) || !OPAQUE_TOKEN.test(previousKey)) {
      throw new RegistrationBudgetUnavailable();
    }
    const owner = randomBytes(16).toString('hex');
    const redisKey = REGISTRATION_KEY_PREFIX + key;
    const previousRedisKey = REGISTRATION_KEY_PREFIX + previousKey;
    const reply = await this.evaluate(
      ACQUIRE_REGISTRATION_EFFECT,
      [redisKey, previousRedisKey],
      owner
    );
    if (Array.isArray(reply) && reply.length === 2) {
      if (reply[0] === 1 && reply[1] === REGISTRATION_EFFECT_TTL_MS) {
        return {
          allowed: true,
          reservation: { key: redisKey, previousKey: previousRedisKey, owner },
        };
      }
      if (
        reply[0] === 0 &&
        Number.isInteger(reply[1]) &&
        reply[1] > 0 &&
        reply[1] <= REGISTRATION_EFFECT_TTL_MS
      ) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(reply[1] / 1000),
        };
      }
    }
    throw new RegistrationBudgetUnavailable();
  }

  async release(reservation: RegistrationReservation): Promise<boolean> {
    try {
      if (
        ![reservation.key, reservation.previousKey].every(
          (key) =>
            key.startsWith(REGISTRATION_KEY_PREFIX) &&
            OPAQUE_TOKEN.test(key.slice(REGISTRATION_KEY_PREFIX.length))
        ) ||
        !OPAQUE_TOKEN.test(reservation.owner)
      ) {
        return false;
      }
      const removed = await this.evaluate(
        RELEASE_REGISTRATION_EFFECT,
        [reservation.key, reservation.previousKey],
        reservation.owner
      );
      return removed === 1 || removed === 2;
    } catch {
      // Failed release keeps the conservative hold; Redis still owns expiry.
      return false;
    }
  }
}

const registrationEffects = new RegistrationEffectLimiter();

export async function acquireRegistrationEffect(
  request: TransientClientRequest
) {
  try {
    const now = Date.now();
    return await registrationEffects.acquire(
      createRegistrationClientTracker(request, now, 'effect'),
      createRegistrationClientTracker(
        request,
        now - REGISTRATION_EFFECT_TTL_MS,
        'effect'
      )
    );
  } catch {
    throw new RegistrationBudgetUnavailable();
  }
}

export function releaseRegistrationEffect(
  reservation: RegistrationReservation
) {
  return registrationEffects.release(reservation);
}
