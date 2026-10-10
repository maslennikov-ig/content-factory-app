import { Inject, Injectable } from '@nestjs/common';
import type { Connection } from '@temporalio/client';
import type { Worker } from '@temporalio/worker';
import {
  TemporalService,
  TEMPORAL_MODULE_OPTIONS,
  TemporalOptions,
} from 'nestjs-temporal-core';

const RESPONSE_BUDGET_MS = 2_000;
const CACHE_TTL_MS = 5_000;
const POLLER_RECENCY_MS = 120_000;
const MAX_CONCURRENT_READS = 4;

type QueueRequirement = { name: string; workflow: boolean };
type WorkerSnapshot = QueueRequirement & { worker: Worker; identity: string };
type ProbeState = {
  workers: WorkerSnapshot[];
  value: boolean;
  validUntil: number;
  running: boolean;
  pending?: Promise<boolean>;
};

function sameWorkers(a: WorkerSnapshot[], b: WorkerSnapshot[]): boolean {
  return a.length === b.length && a.every((entry, index) =>
    entry.worker === b[index].worker && entry.identity === b[index].identity
  );
}

// Poller timestamps use the same strict decoding as RuntimeMonitorService.
// A previous process's recent poller must not stand in for this native worker.
function hasRecentPoller(response: unknown, identity: string): boolean {
  if (!response || typeof response !== 'object') return false;
  const pollers = (response as { pollers?: unknown }).pollers;
  if (!Array.isArray(pollers)) return false;
  const now = Date.now();
  return pollers.some((poller) => {
    if (poller?.identity !== identity) return false;
    const timestamp = poller?.lastAccessTime;
    if (!timestamp || typeof timestamp !== 'object' ||
        Array.isArray(timestamp) || timestamp.seconds == null) return false;
    let rawSeconds = timestamp.seconds;
    if (typeof rawSeconds === 'object' && !Array.isArray(rawSeconds)) {
      rawSeconds = rawSeconds.toString();
    }
    if (typeof rawSeconds !== 'number' &&
        (typeof rawSeconds !== 'string' || !/^\d+$/.test(rawSeconds))) return false;
    const seconds = Number(rawSeconds);
    const nanos = timestamp.nanos == null ? 0 : timestamp.nanos;
    if (!Number.isSafeInteger(seconds) || seconds < 0 ||
        typeof nanos !== 'number' || !Number.isInteger(nanos) ||
        nanos < 0 || nanos >= 1_000_000_000) return false;
    const age = now - (seconds * 1_000 + nanos / 1_000_000);
    return age >= 0 && age <= POLLER_RECENCY_MS;
  });
}

@Injectable()
export class WorkerReadinessService {
  private readonly queues: QueueRequirement[];
  private probeState?: ProbeState;

  constructor(
    private readonly temporal: TemporalService,
    @Inject(TEMPORAL_MODULE_OPTIONS) options: TemporalOptions
  ) {
    // Consume the exact registered placement, including EXCLUDE_QUEUE, without
    // duplicating the provider list or changing a worker option.
    this.queues = (options.workers || []).map((definition) => ({
      name: definition.taskQueue,
      workflow: Boolean(definition.workflowsPath || definition.workflowBundle),
    }));
  }

  async isReady(): Promise<boolean> {
    try {
      const workers = this.readWorkers();
      if (!workers) return false;
      const ready = await this.probe(workers);
      const current = this.readWorkers();
      return ready && current !== null && sameWorkers(workers, current);
    } catch {
      // No worker identities, environment, credentials or SDK errors escape.
      return false;
    }
  }

  private readWorkers(): WorkerSnapshot[] | null {
    if (!this.queues.length) return null;
    const workers: WorkerSnapshot[] = [];
    for (const queue of this.queues) {
      const worker = this.temporal.getWorker(queue.name);
      if (!worker) return null;
      const status = worker.getStatus();
      const identity = worker.options.identity;
      if (status.runState !== 'RUNNING' ||
          status.activityPollerState !== 'POLLING' ||
          (queue.workflow && status.workflowPollerState !== 'POLLING') ||
          typeof identity !== 'string' || !identity) return null;
      // Outstanding polls and in-flight task counts can be zero on a healthy
      // idle/busy queue. Neither is a liveness requirement.
      workers.push({ ...queue, worker, identity });
    }
    return workers;
  }

  private probe(workers: WorkerSnapshot[]): Promise<boolean> {
    const previous = this.probeState;
    if (previous?.pending) {
      return previous.pending.then((value) =>
        value && sameWorkers(workers, previous.workers)
      );
    }
    // A response timeout cannot authorize another batch while a native RPC is
    // unfinished. All eventual results/rejections remain observed.
    if (previous?.running) return Promise.resolve(false);
    if (previous && sameWorkers(workers, previous.workers) &&
        Date.now() < previous.validUntil) return Promise.resolve(previous.value);

    const state: ProbeState = { workers, value: false, validUntil: 0, running: true };
    this.probeState = state;
    const deadline = Date.now() + RESPONSE_BUDGET_MS;
    const actual = Promise.resolve().then(() => this.readPollers(workers, deadline));
    let timedOut = false;
    const pending = new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        state.value = value;
        state.validUntil = Date.now() + CACHE_TTL_MS;
        resolve(value);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        finish(false);
      }, RESPONSE_BUDGET_MS);
      timer.unref();
      const settled = (value: boolean) => {
        state.running = false;
        if (timedOut) return;
        clearTimeout(timer);
        finish(value && Date.now() <= deadline);
      };
      void actual.then((value) => settled(value === true), () => settled(false));
    });
    state.pending = pending;
    void pending.then(() => { state.pending = undefined; });
    return pending;
  }

  private async readPollers(workers: WorkerSnapshot[], deadline: number): Promise<boolean> {
    const client = this.temporal.client.getRawClient();
    const namespace = client?.options.namespace;
    if (!client || typeof namespace !== 'string' || !namespace ||
        workers.some(({ worker }) => worker.options.namespace !== namespace)) return false;
    const connection = client.connection as Connection;
    const requests = workers.flatMap((worker) =>
      (worker.workflow ? [1, 2] : [2]).map((taskQueueType) => ({ worker, taskQueueType }))
    );
    return connection.withDeadline(deadline, async () => {
      let next = 0;
      let healthy = true;
      const readLane = async () => {
        while (next < requests.length) {
          if (Date.now() >= deadline) { healthy = false; return; }
          const { worker, taskQueueType } = requests[next++];
          try {
            const response = await connection.workflowService.describeTaskQueue({
              namespace,
              taskQueue: { name: worker.name },
              taskQueueType,
            });
            if (!hasRecentPoller(response, worker.identity)) healthy = false;
          } catch {
            healthy = false;
          }
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(MAX_CONCURRENT_READS, requests.length) }, readLane
      ));
      return healthy && next === requests.length;
    });
  }
}
