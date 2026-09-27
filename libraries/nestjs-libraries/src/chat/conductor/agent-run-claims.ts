/**
 * One answer at a time per suspended run (correctness review W1 F5).
 *
 * Two tabs, or a retry, may answer the same card at once. Both would find the
 * run pending, both would resume it — and Mastra lets a second resume with the
 * same `runId` through — so a confirm action could run twice and be billed
 * twice. The door therefore claims the run before it resumes it; the second
 * request finds the claim and is refused with `AGENT_RUN_NOT_PENDING` (409).
 *
 * The claim is a Redis counter (`INCR` + `EXPIRE`, the shared `ioRedis`, the
 * same pattern as the research quota), so it holds across backend instances;
 * the first `INCR` wins. It lives until the answer's stream ends, and at most
 * `AGENT_RUN_CLAIM_TTL_SECONDS`, so a crashed process cannot lock a card for
 * good. Without a store (tests, a process without Redis) it falls back to an
 * in-process map with the same contract.
 */

export const AGENT_RUN_CLAIM_STORE = 'AGENT_RUN_CLAIM_STORE';

/** Longer than any answer's stream, including a paid capability inside it. */
export const AGENT_RUN_CLAIM_TTL_SECONDS = 600;

export type AgentRunClaimStore = {
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  del(key: string): Promise<number>;
  /** `null` or `undefined` (the process-local Redis stand-in) when absent. */
  get(key: string): Promise<string | null | undefined>;
  /** A value with a lifetime (`SET key value EX seconds`). */
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
};

/** The same contract in one process. */
export const inProcessRunClaimStore = (): AgentRunClaimStore => {
  const counts = new Map<string, { value: number | string; until: number }>();
  const live = (key: string) => {
    const entry = counts.get(key);
    if (entry && entry.until <= Date.now()) counts.delete(key);
    return counts.get(key);
  };
  return {
    incr: async (key) => {
      const entry = live(key) ?? { value: 0, until: Number.POSITIVE_INFINITY };
      entry.value = Number(entry.value) + 1;
      counts.set(key, entry);
      return entry.value;
    },
    set: async (key, value, _mode, ttlSeconds) => {
      counts.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
      return 'OK';
    },
    expire: async (key, ttlSeconds) => {
      const entry = live(key);
      if (!entry) return 0;
      entry.until = Date.now() + ttlSeconds * 1000;
      return 1;
    },
    del: async (key) => (counts.delete(key) ? 1 : 0),
    get: async (key) => {
      const entry = live(key);
      return entry ? String(entry.value) : null;
    },
  };
};

export const agentRunClaimKey = (runId: string) => `agent-run-claim:${runId}`;

/**
 * Claims `runId`. Resolves to the release function when this request is the
 * one that answers, `null` when another request holds the run.
 */
export const claimAgentRun = async (
  store: AgentRunClaimStore,
  runId: string
): Promise<(() => Promise<void>) | null> => {
  const key = agentRunClaimKey(runId);
  const count = await store.incr(key);
  if (count !== 1) return null;
  await store.expire(key, AGENT_RUN_CLAIM_TTL_SECONDS);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await store.del(key).catch(() => undefined);
  };
};

/**
 * An answer is delivered once (`content-factory-next-kcxz.29`, D2).
 *
 * The claim above keeps two answers from running at the same time; it is
 * released when the stream ends. That is not enough when the stream is cut
 * after the capability already ran: Mastra may still hold the run as
 * suspended, the card is redrawn after a reload, and a second «Включить»
 * would switch the avatar on again (a new voice version each time). So a call
 * whose answer reached a stream is marked answered, by `runId` and
 * `toolCallId`, for longer than anyone keeps a tab open; the thread door stops
 * listing it and a repeat is refused as `AGENT_RUN_NOT_PENDING`. Per call, not
 * per run: a run that stops on a second card after the first answer keeps the
 * second one answerable.
 */
export const AGENT_CALL_ANSWERED_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * `card` narrows the mark to one question card of the call (`kcxz.14`): a
 * call may stop on a second card after the first answer — the consent to
 * write into an autopilot channel, then the adaptation interview. The first
 * card stays answered for good; the second, with another payload, is open.
 * The card is the id the answer named and the door verified against the card
 * that waited (`questionCardId`, review W2 F3, F7) — never a guess kept in
 * the process. Approvals are marked for the whole call.
 */
export const agentCallAnsweredKey = (runId: string, toolCallId: string, card?: string) =>
  `agent-call-answered:${runId}::${toolCallId}${card ? `::${card}` : ''}`;

export type AnsweredCall = { toolCallId: string; card?: string };

export const markAgentCallsAnswered = async (
  store: AgentRunClaimStore,
  runId: string,
  calls: readonly AnsweredCall[]
) => {
  for (const call of calls) {
    const key = agentCallAnsweredKey(runId, call.toolCallId, call.card);
    await store.incr(key);
    await store.expire(key, AGENT_CALL_ANSWERED_TTL_SECONDS);
  }
};

export const agentCallAnswered = async (
  store: AgentRunClaimStore,
  runId: string,
  toolCallId: string,
  card?: string
) =>
  (await store.get(agentCallAnsweredKey(runId, toolCallId))) != null ||
  (!!card && (await store.get(agentCallAnsweredKey(runId, toolCallId, card))) != null);


/**
 * What an approval card was first shown with (review W2 F4): the digest of
 * the post text and picture, or the number of posts, when the card was drawn
 * — live, or on the first reload. The first value stays: a card redrawn after
 * the text changed shows the new words, but «Да» stays bound to what was
 * shown first and the call is refused, so the model shows a fresh card.
 */
export const agentApprovalContentKey = (runId: string, toolCallId: string) =>
  `agent-approval-content:${runId}::${toolCallId}`;

export const rememberApprovalContent = async (
  store: AgentRunClaimStore,
  runId: string,
  toolCallId: string,
  digest: string
) => {
  const key = agentApprovalContentKey(runId, toolCallId);
  if ((await store.get(key)) != null) return;
  await store.set(key, digest, 'EX', AGENT_CALL_ANSWERED_TTL_SECONDS);
};

export const approvalContentShown = async (
  store: AgentRunClaimStore,
  runId: string,
  toolCallId: string
): Promise<string | null> => {
  const value = await store.get(agentApprovalContentKey(runId, toolCallId));
  return typeof value === 'string' && value ? value : null;
};
