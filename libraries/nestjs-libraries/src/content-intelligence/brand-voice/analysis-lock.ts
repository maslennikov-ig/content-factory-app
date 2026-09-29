/**
 * One paid analysis at a time per avatar (`content-factory-next-kcxz.39`,
 * review W3-18 F5; hardened by review W4-39-40 F3–F5).
 *
 * The resume rule (`analysis-resume.ts`) reads `samples` until the run saves
 * its arithmetic, which is a few seconds after the start. In that gap a
 * second start — the chat and the screen at once, two tabs, an MCP client —
 * saw nothing stored and paid for a whole second run. The claim is taken in
 * `VoiceService.analysisStream` itself, so every door that runs an analysis
 * (the screen's stream, `POST /analysis`, the chat and MCP capability, the
 * free recount) shares it; the second start is refused with
 * `VOICE_ANALYSIS_RUNNING` before its corpus is read or a model is asked.
 *
 * The rule, as decided for the owner:
 *
 * - **Owned.** The claim is `SET key <token> EX ttl NX` on the shared
 *   `ioRedis`; release and renewal compare the token first (one Lua script
 *   each), so a run that outlived its claim can never delete or extend the
 *   claim of the run that came after it (F3).
 * - **Short and renewed.** The claim lives `VOICE_ANALYSIS_LOCK_TTL_SECONDS`
 *   (two minutes) and the running analysis renews it every
 *   `VOICE_ANALYSIS_LOCK_RENEW_MS` while it runs. A process that dies — a
 *   deploy restart, an out-of-memory kill — frees the avatar within two
 *   minutes instead of the resume window's twenty. A refused start never
 *   touches the claim (F4).
 * - **Bounded.** A store that does not answer within
 *   `VOICE_ANALYSIS_LOCK_WAIT_MS` (Redis down: the client queues commands
 *   forever) refuses the start as `VOICE_ANALYSIS_FAILED` rather than
 *   hanging; nothing is read or paid for (F5).
 *
 * Not imported from the chat's run claims (`chat/conductor/agent-run-claims.ts`,
 * the counter pattern): this folder is loaded without the chat library (the
 * voice suites and the scenario world load it alone), and the voice section
 * must not depend on the chat that sits on top of it.
 */
import { randomUUID } from 'node:crypto';

/** Injection token; `database.module.ts` provides the shared `ioRedis` behind it. */
export const VOICE_ANALYSIS_LOCK_STORE = 'VOICE_ANALYSIS_LOCK_STORE';

export const VOICE_ANALYSIS_LOCK_TTL_SECONDS = 120;
/** A third of the lifetime: two renewals may be lost before the claim lapses. */
export const VOICE_ANALYSIS_LOCK_RENEW_MS = 40_000;
export const VOICE_ANALYSIS_LOCK_WAIT_MS = 5_000;

/** An owned claim: take, extend and give back only what this token holds. */
export type VoiceAnalysisLockStore = {
  claim(key: string, token: string, ttlSeconds: number): Promise<boolean>;
  renew(key: string, token: string, ttlSeconds: number): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
};

/** The same contract in one process (tests, a process without Redis). */
export const inProcessAnalysisLockStore = (): VoiceAnalysisLockStore => {
  const held = new Map<string, { token: string; until: number }>();
  const live = (key: string) => {
    const entry = held.get(key);
    if (entry && entry.until <= Date.now()) held.delete(key);
    return held.get(key);
  };
  return {
    claim: async (key, token, ttlSeconds) => {
      if (live(key)) return false;
      held.set(key, { token, until: Date.now() + ttlSeconds * 1000 });
      return true;
    },
    renew: async (key, token, ttlSeconds) => {
      const entry = live(key);
      if (!entry || entry.token !== token) return false;
      entry.until = Date.now() + ttlSeconds * 1000;
      return true;
    },
    release: async (key, token) => {
      if (live(key)?.token === token) held.delete(key);
    },
  };
};

/** The slice of an `ioredis` client the claim uses. */
type RedisLike = {
  set(...args: any[]): Promise<unknown>;
  eval?: (...args: any[]) => Promise<unknown>;
};

const RENEW_IF_OWNED =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";
const DELETE_IF_OWNED =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * The claim over a Redis client. The process-local stand-in (`MockRedis`,
 * no `REDIS_URL`) has neither `NX` nor scripts, so it gets the in-process
 * store — the same thing it stands in for, one process.
 */
export const redisAnalysisLockStore = (client: RedisLike): VoiceAnalysisLockStore => {
  if (typeof client.eval !== 'function') return inProcessAnalysisLockStore();
  const run = client.eval.bind(client);
  return {
    claim: async (key, token, ttlSeconds) =>
      (await client.set(key, token, 'EX', ttlSeconds, 'NX')) === 'OK',
    renew: async (key, token, ttlSeconds) =>
      Number(await run(RENEW_IF_OWNED, 1, key, token, String(ttlSeconds))) === 1,
    release: async (key, token) => {
      await run(DELETE_IF_OWNED, 1, key, token);
    },
  };
};

/**
 * Per organisation and avatar. `null` is a space that has no avatar yet: its
 * one corpus is the one being analysed.
 */
export const voiceAnalysisLockKey = (
  organizationId: string,
  avatarId: string | null
) => `voice-analysis-running:${organizationId}:${avatarId ?? 'space'}`;

export class VoiceAnalysisLockUnavailable extends Error {
  constructor() {
    super('The analysis lock store did not answer.');
    this.name = 'VoiceAnalysisLockUnavailable';
  }
}

const withinWait = async <T>(work: Promise<T>, waitMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new VoiceAnalysisLockUnavailable()), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Claims the analysis of one avatar. Resolves to the release function when
 * this start is the one that runs (the claim is renewed until it is
 * released), `null` when another run holds it. Rejects with
 * `VoiceAnalysisLockUnavailable` when the store does not answer in time.
 */
export const claimVoiceAnalysis = async (
  store: VoiceAnalysisLockStore,
  organizationId: string,
  avatarId: string | null,
  options: { waitMs?: number; renewMs?: number; ttlSeconds?: number } = {}
): Promise<(() => Promise<void>) | null> => {
  const key = voiceAnalysisLockKey(organizationId, avatarId);
  const token = randomUUID();
  const ttl = options.ttlSeconds ?? VOICE_ANALYSIS_LOCK_TTL_SECONDS;
  let claimed: boolean;
  try {
    claimed = await withinWait(
      store.claim(key, token, ttl),
      options.waitMs ?? VOICE_ANALYSIS_LOCK_WAIT_MS
    );
  } catch (error) {
    if (error instanceof VoiceAnalysisLockUnavailable) throw error;
    throw new VoiceAnalysisLockUnavailable();
  }
  if (!claimed) return null;
  const heartbeat = setInterval(() => {
    void store.renew(key, token, ttl).catch(() => undefined);
  }, options.renewMs ?? VOICE_ANALYSIS_LOCK_RENEW_MS);
  heartbeat.unref?.();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    clearInterval(heartbeat);
    // A release that does not answer is bounded too; the lifetime ends it.
    await withinWait(store.release(key, token), options.waitMs ?? VOICE_ANALYSIS_LOCK_WAIT_MS).catch(
      () => undefined
    );
  };
};
