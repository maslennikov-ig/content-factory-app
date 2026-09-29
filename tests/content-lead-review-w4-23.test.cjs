require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Review W4-23 (kcxz.23 «Идеи из чата»), the service side, against the real
 * `ContentLeadService` over the real `ContentLeadRepository` and a fake
 * Prisma client that keeps the schema's unique index
 * `(organizationId, kind, canonicalUrl)` over archived rows too.
 *
 * - F3: subscribing again to what was unsubscribed revives the archived row —
 *   the same id, live, `ACTIVE`, the new name and schedule, its periodic
 *   check started — instead of `SUBSCRIPTION_CONFLICT`; the leads it brought
 *   keep their statuses. A live duplicate is still a conflict.
 * - F4: a topic check answered from the research cache says so.
 * - F9: a subscription is known to its workspace while archived, never to
 *   another workspace.
 * - F11: a manual check that restarts the periodic workflow holds the
 *   workflow's first check for one interval (`startDelay`); creating a
 *   subscription does not.
 */

const nestCommon = {
  Injectable: () => (target) => target,
  Logger: class {
    warn() {}
    log() {}
    error() {}
    debug() {}
  },
  Optional: () => () => {},
};
const prismaMock = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const { ContentLeadService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.service.ts',
  {
    '@nestjs/common': nestCommon,
    'nestjs-temporal-core': { TemporalService: class {} },
    './lead-topic.gateway': { LeadTopicGateway: class {} },
    './lead-feed.gateway': { LeadFeedGateway: class {} },
    ...prismaMock,
  }
);
const { ContentLeadRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.repository.ts',
  { '@nestjs/common': nestCommon, ...prismaMock }
);

const NOW = new Date('2026-09-28T12:00:00.000Z');
const ORG = 'org-a';

function makeClient() {
  const subscriptions = [];
  const leads = [];
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => {
      const have = row[key] ?? null;
      if (value === null) return have === null;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('not' in value && value.not === null) return have !== null;
        if (Array.isArray(value.in)) return value.in.includes(have);
        throw new Error(`unexpected filter ${key}`);
      }
      return have === value;
    });
  return {
    subscriptions,
    leads,
    contentLeadSubscription: {
      create: async ({ data }) => {
        if (
          subscriptions.some(
            (row) =>
              row.organizationId === data.organizationId &&
              row.kind === data.kind &&
              row.canonicalUrl === data.canonicalUrl
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row = {
          id: `sub-${subscriptions.length + 1}`,
          state: 'ACTIVE',
          lastCheckedAt: null,
          lastErrorCode: null,
          deletedAt: null,
          query: null,
          ...data,
        };
        subscriptions.push(row);
        return { ...row };
      },
      count: async ({ where }) => subscriptions.filter((row) => matches(row, where)).length,
      findMany: async ({ where }) =>
        subscriptions.filter((row) => matches(row, where)).map((row) => ({ ...row, linkedAutoPost: null })),
      findFirst: async ({ where }) => {
        const row = subscriptions.find((one) => matches(one, where));
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }) => {
        const found = subscriptions.filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
    },
    contentLead: {
      findMany: async ({ where }) => leads.filter((row) => matches(row, where)),
      groupBy: async () => [],
      createMany: async () => ({ count: 0 }),
      findFirst: async ({ where }) => leads.find((row) => matches(row, where)) ?? null,
      updateMany: async () => ({ count: 0 }),
    },
    autoPost: { findMany: async () => [], findFirst: async () => null },
  };
}

function stand({ topics } = {}) {
  const client = makeClient();
  const start = jest.fn(async () => ({}));
  const terminateWorkflow = jest.fn(async () => {});
  const temporal = {
    client: { getRawClient: () => ({ workflow: { start } }) },
    terminateWorkflow,
  };
  const feed = {
    capabilityEnabled: true,
    check: jest.fn(async () => ({ disabled: false, items: [] })),
  };
  const service = new ContentLeadService(
    new ContentLeadRepository({ model: client }, {}),
    feed,
    temporal,
    () => NOW,
    topics
  );
  return { client, service, start, terminateWorkflow, feed };
}

const addFeed = (service, displayName, extra = {}) =>
  service.createSubscription(ORG, 'user-a', {
    kind: 'RSS',
    displayName,
    canonicalUrl: 'https://example.com/feed.xml',
    ...extra,
  });

describe('F3 — subscribing again to an archived feed or topic', () => {
  test('revives the same row: live, ACTIVE, the new name and schedule, its check started', async () => {
    const { client, service, start } = stand();
    const first = await addFeed(service, 'Old name');
    client.subscriptions[0].state = 'ERRORED';
    client.subscriptions[0].lastErrorCode = 'CHECK_FAILED';
    client.leads.push(
      { id: 'lead-1', organizationId: ORG, subscriptionId: first.id, status: 'DISMISSED' },
      { id: 'lead-2', organizationId: ORG, subscriptionId: first.id, status: 'ACCEPTED' }
    );
    await service.archiveSubscription(ORG, first.id);
    expect(client.subscriptions[0].deletedAt).not.toBeNull();
    start.mockClear();

    const again = await addFeed(service, 'New name', { checkIntervalMinutes: 360 });

    expect(again.id).toBe(first.id);
    expect(client.subscriptions).toHaveLength(1);
    expect(client.subscriptions[0]).toMatchObject({
      deletedAt: null,
      state: 'ACTIVE',
      lastErrorCode: null,
      displayName: 'New name',
      checkIntervalMinutes: 360,
    });
    // Its periodic check starts again, at once, as for a new subscription.
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1]).toMatchObject({
      workflowId: `content-lead-check-${first.id}`,
      args: [{ organizationId: ORG, subscriptionId: first.id, checkIntervalMinutes: 360 }],
    });
    expect(start.mock.calls[0][1].startDelay).toBeUndefined();
    // The dismissal memory is the row's: its leads keep their statuses.
    expect(client.leads.map((lead) => lead.status)).toEqual(['DISMISSED', 'ACCEPTED']);
    // And it is listed again.
    const { subscriptions } = await service.listSubscriptions(ORG);
    expect(subscriptions.map((row) => row.id)).toEqual([first.id]);
  });

  test('a topic is revived by its key, with the topic as typed now', async () => {
    const topics = { capabilityEnabled: true, checkWindowDays: 30, check: jest.fn() };
    const { client, service } = stand({ topics });
    const first = await service.createSubscription(ORG, 'user-a', {
      kind: 'TOPIC',
      displayName: 'ИИ',
      query: 'ИИ в медицине',
    });
    await service.archiveSubscription(ORG, first.id);

    const again = await service.createSubscription(ORG, 'user-a', {
      kind: 'TOPIC',
      displayName: 'ИИ снова',
      query: 'ИИ  в медицине',
    });

    expect(again.id).toBe(first.id);
    expect(client.subscriptions[0]).toMatchObject({
      deletedAt: null,
      state: 'ACTIVE',
      displayName: 'ИИ снова',
      query: 'ИИ  в медицине',
    });
  });

  test('a live duplicate is still a conflict', async () => {
    const { service } = stand();
    await addFeed(service, 'Feed');

    const error = await addFeed(service, 'Feed again').catch((thrown) => thrown);

    expect(error.code).toBe('SUBSCRIPTION_CONFLICT');
  });
});

describe('F4 — a topic answered from the research cache', () => {
  test('says so, so the chat does not count it as spent', async () => {
    const topics = {
      capabilityEnabled: true,
      checkWindowDays: 30,
      check: jest.fn(async () => ({ disabled: false, items: [], fromCache: true })),
    };
    const { service } = stand({ topics });
    const row = await service.createSubscription(ORG, 'user-a', {
      kind: 'TOPIC',
      displayName: 'ИИ',
      query: 'ИИ в медицине',
    });

    expect(await service.checkSubscription(ORG, row.id)).toEqual({ checked: true, created: 0, fromCache: true });
  });
});

describe('F9 — whether a subscription is the workspace’s', () => {
  test('an archived one still is; another workspace’s and an unknown id are not', async () => {
    const { client, service } = stand();
    const row = await addFeed(service, 'Feed');
    await service.archiveSubscription(ORG, row.id);
    client.subscriptions.push({ id: 'sub-foreign', organizationId: 'org-b', deletedAt: null });

    expect(await service.subscriptionKnown(ORG, row.id)).toBe(true);
    expect(await service.subscriptionKnown(ORG, 'sub-foreign')).toBe(false);
    expect(await service.subscriptionKnown(ORG, 'sub-nope')).toBe(false);
  });
});

describe('F11 — a manual check that restarts the periodic workflow', () => {
  test('holds the workflow’s first check for one interval, so the two never both search', async () => {
    const { service, start, feed } = stand();
    const row = await addFeed(service, 'Feed');
    start.mockClear();

    await service.checkSubscription(ORG, row.id, { ensurePeriodicCheck: true, manual: true });

    expect(feed.check).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1]).toMatchObject({
      workflowIdConflictPolicy: 'USE_EXISTING',
      startDelay: 1440 * 60_000,
    });
  });
});
