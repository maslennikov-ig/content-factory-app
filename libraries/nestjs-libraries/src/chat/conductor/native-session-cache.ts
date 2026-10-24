import type { AgentController, Session } from '@mastra/core/agent-controller';

const IDLE_TIMEOUT_MS = 30_000;
const MAX_IDLE_SESSIONS = 8;

type Address = { resourceId: string; scope: string };
type Entry = Address & {
  session: Session<any>;
  controller: Pick<AgentController<any>, 'deleteSession'>;
  touched: number;
  deleting: boolean;
  unsubscribe: () => void;
  timer?: ReturnType<typeof setTimeout>;
};
const keyFor = ({ resourceId, scope }: Address) => JSON.stringify([resourceId, scope]);

/** Bound rebuildable native Session display mirrors; durable data stays in Mastra. */
export class NativeSessionCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pins = new Map<string, number>();
  private pruning = Promise.resolve();
  private closed = false;

  constructor(private readonly options: {
    hasActiveTask: (address: Address) => boolean;
    onError: (error: unknown) => void;
    idleTimeoutMs?: number;
    maxIdleSessions?: number;
  }) {}

  /** Pin materialization/binding until the caller has a usable native Session. */
  pin(address: Address): () => void {
    const key = keyFor(address);
    this.pins.set(key, (this.pins.get(key) ?? 0) + 1);
    const entry = this.entries.get(key);
    if (entry) this.touch(entry);
    return () => {
      const remaining = (this.pins.get(key) ?? 1) - 1;
      if (remaining) this.pins.set(key, remaining);
      else this.pins.delete(key);
      if (!this.closed) void this.prune();
    };
  }

  async remember(address: Address, session: Session<any>, controller: Entry['controller']) {
    if (this.closed) return;
    const key = keyFor(address);
    let entry = this.entries.get(key);
    if (entry?.session !== session) {
      if (entry) this.forget(entry);
      entry = { ...address, session, controller, touched: Date.now(), deleting: false, unsubscribe: () => undefined };
      this.entries.set(key, entry);
      const current = entry;
      current.unsubscribe = session.subscribe((event) => {
        if (event.type === 'agent_start' || event.type === 'agent_end') this.touch(current);
      });
    }
    this.touch(entry);
    await this.prune();
  }

  get size() { return this.entries.size; }

  async close() {
    this.closed = true;
    for (const entry of this.entries.values()) this.forget(entry);
    this.pins.clear();
    await this.pruning;
  }

  private settled(entry: Entry) {
    return !entry.session.run.isRunning() && !entry.session.run.getRunId() &&
      !entry.session.displayState.get().isRunning &&
      !entry.session.approval.isArmed({ threadId: entry.scope }) &&
      !entry.session.suspensions.hasPending() && !this.options.hasActiveTask(entry);
  }

  private touch(entry: Entry) {
    if (this.closed || entry.deleting || this.entries.get(keyFor(entry)) !== entry) return;
    entry.touched = Date.now();
    this.schedule(entry);
  }

  private schedule(entry: Entry, retry = false) {
    if (entry.timer) clearTimeout(entry.timer);
    const timeout = this.options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    const canExpire = !this.pins.has(keyFor(entry)) && this.settled(entry);
    const delay = retry || !canExpire ? timeout : Math.max(1, timeout - (Date.now() - entry.touched));
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.prune().then(() => {
        if (!this.closed && !entry.deleting && !entry.timer && this.entries.get(keyFor(entry)) === entry) this.schedule(entry);
      });
    }, delay);
    entry.timer.unref?.();
  }

  private forget(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.unsubscribe();
    if (this.entries.get(keyFor(entry)) === entry) this.entries.delete(keyFor(entry));
  }

  private prune() {
    this.pruning = this.pruning.then(async () => {
      if (this.closed) return;
      const idle = [...this.entries.values()].filter((entry) => !entry.deleting && this.settled(entry))
        .sort((left, right) => left.touched - right.touched);
      let excess = idle.length - (this.options.maxIdleSessions ?? MAX_IDLE_SESSIONS);
      for (const entry of idle) {
        if (this.closed) return;
        if (this.entries.get(keyFor(entry)) !== entry || this.pins.has(keyFor(entry)) || !this.settled(entry)) continue;
        const expired = Date.now() - entry.touched >= (this.options.idleTimeoutMs ?? IDLE_TIMEOUT_MS);
        if (!expired && excess <= 0) continue;
        entry.deleting = true;
        try {
          // Public SDK teardown drops only runtime state, never persisted
          // threads, messages, permission metadata, snapshots or receipts.
          await entry.controller.deleteSession({ resourceId: entry.resourceId, scope: entry.scope });
          this.forget(entry);
          excess--;
        } catch (error) {
          entry.deleting = false;
          this.schedule(entry, true);
          this.options.onError(error);
        }
      }
    }).catch((error) => this.options.onError(error));
    return this.pruning;
  }
}
