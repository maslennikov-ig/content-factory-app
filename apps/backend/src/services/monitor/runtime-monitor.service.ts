import { Injectable } from '@nestjs/common';
import type { Connection } from '@temporalio/client';
import { TemporalService } from 'nestjs-temporal-core';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  ioRedis,
  MockRedis,
} from '@contentfactory/nestjs-libraries/redis/redis.service';
import { socialIntegrationList } from '@contentfactory/nestjs-libraries/integrations/integration.manager';

const RESPONSE_BUDGET_MS = 2_000;
const CACHE_TTL_MS = 5_000;
const POLLER_RECENCY_MS = 120_000;

// Match worker queue names, including queues assigned to another worker host.
// EXCLUDE_QUEUE controls local placement, not whether a queue exists globally.
const KNOWN_QUEUES = new Set([
  'main',
  ...socialIntegrationList
    .filter((provider) => !provider.identifier.includes('-'))
    .map((provider) => provider.identifier.split('-')[0]),
]);

type ProbeState = {
  value: boolean;
  validUntil: number;
  running: boolean;
  pending?: Promise<boolean>;
};

const readMetadata = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

@Injectable()
export class RuntimeMonitorService {
  // Only database, redis, and the fixed known queue set can create entries.
  // Values contain no rows, poller identities, configuration or error payloads.
  private readonly probes = new Map<string, ProbeState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly temporal: TemporalService
  ) {}

  isKnownQueue(name: string): boolean {
    return KNOWN_QUEUES.has(name);
  }

  async isReady(): Promise<boolean> {
    const results = await Promise.all([
      this.probe('database', async () => {
        await this.prisma.organization.findFirst({ select: { id: true } });
        return true;
      }),
      this.probe('redis', async () => {
        if (ioRedis instanceof MockRedis || ioRedis.status !== 'ready') {
          return false;
        }
        return (await ioRedis.ping()) === 'PONG';
      }),
      this.isQueueReady('main'),
    ]);
    return results.every((ready) => ready);
  }

  isQueueReady(name: string): Promise<boolean> {
    if (!this.isKnownQueue(name)) return Promise.resolve(false);
    return this.probe(`queue:${name}`, (deadline) =>
      this.readQueue(name, deadline)
    );
  }

  private probe(
    key: string,
    read: (deadline: number) => Promise<boolean>
  ): Promise<boolean> {
    const now = Date.now();
    const previous = this.probes.get(key);
    if (previous?.pending) return previous.pending;
    // A response timeout does not cancel Prisma or Redis. Keep the admission
    // closed until the actual operation settles, even after the cache expires.
    if (previous?.running) return Promise.resolve(false);
    if (previous && now < previous.validUntil) {
      return Promise.resolve(previous.value);
    }

    const state: ProbeState = {
      value: false,
      validUntil: 0,
      running: true,
    };
    this.probes.set(key, state);
    const deadline = now + RESPONSE_BUDGET_MS;
    const actual = Promise.resolve().then(() => read(deadline));
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
        // A delayed event loop must not admit success after the response budget.
        finish(value && Date.now() <= deadline);
      };
      // Both branches are observed even if the HTTP response already timed out.
      void actual.then(
        (value) => settled(value === true),
        () => settled(false)
      );
    });
    state.pending = pending;
    void pending.then(() => {
      state.pending = undefined;
    });
    return pending;
  }

  private async readQueue(name: string, deadline: number): Promise<boolean> {
    const client = this.temporal.client.getRawClient();
    const namespace = client?.options.namespace;
    if (!client || typeof namespace !== 'string' || !namespace) return false;
    const connection = client.connection as Connection;
    const taskTypes = name === 'main' ? [1, 2] : [2];

    return connection.withDeadline(deadline, async () => {
      // Wait for every started read to settle. One early rejection must not
      // release admission while another metadata RPC remains unfinished.
      const [health, description, queues] = await Promise.all([
        readMetadata(() => connection.healthService.check({ service: '' })),
        readMetadata(() =>
          connection.workflowService.describeNamespace({ namespace })
        ),
        Promise.all(
          taskTypes.map((taskQueueType) =>
            readMetadata(() =>
              connection.workflowService.describeTaskQueue({
                namespace,
                taskQueue: { name },
                taskQueueType,
              })
            )
          )
        ),
      ]);
      const status: unknown = health?.status;
      return (
        (status === 1 || status === 'SERVING') &&
        description?.namespaceInfo?.name === namespace &&
        queues.every((queue) => this.hasRecentPoller(queue))
      );
    });
  }

  private hasRecentPoller(response: unknown): boolean {
    if (!response || typeof response !== 'object') return false;
    const pollers = (response as { pollers?: unknown }).pollers;
    if (!Array.isArray(pollers)) return false;
    const now = Date.now();
    return pollers.some((poller) => {
      const timestamp = poller?.lastAccessTime;
      if (
        !timestamp ||
        typeof timestamp !== 'object' ||
        Array.isArray(timestamp) ||
        timestamp.seconds == null
      ) {
        return false;
      }
      // Protobuf seconds can be a number, a decimal string or a Long.
      // Reject coercible arrays and non-decimal strings instead of guessing.
      let rawSeconds = timestamp.seconds;
      if (typeof rawSeconds === 'object' && !Array.isArray(rawSeconds)) {
        rawSeconds = rawSeconds.toString();
      }
      if (
        typeof rawSeconds !== 'number' &&
        (typeof rawSeconds !== 'string' || !/^\d+$/.test(rawSeconds))
      ) {
        return false;
      }
      const seconds = Number(rawSeconds);
      const nanos = timestamp.nanos == null ? 0 : timestamp.nanos;
      if (
        !Number.isSafeInteger(seconds) ||
        seconds < 0 ||
        typeof nanos !== 'number' ||
        !Number.isInteger(nanos) ||
        nanos < 0 ||
        nanos >= 1_000_000_000
      ) {
        return false;
      }
      const age = now - (seconds * 1_000 + nanos / 1_000_000);
      return age >= 0 && age <= POLLER_RECENCY_MS;
    });
  }
}
