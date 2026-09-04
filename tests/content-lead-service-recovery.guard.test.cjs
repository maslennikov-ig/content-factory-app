require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Two related gaps in `ContentLeadService`, both exercised against the real
 * service class with fake repository/gateway/Temporal collaborators — the
 * same pattern `content-lead-dismissal-guard.test.cjs` uses for the
 * repository one level down.
 *
 * **Recovery (content-factory-next-odb8.3, item 3).** `startPeriodicCheck`
 * only ever ran once, inside `createSubscription`. If Temporal was
 * unreachable at that exact moment, the subscription row exists but its
 * periodic workflow never does, and nothing — no route, no later call —
 * ever tried again. `ContentLeadRepository.setState` sat there unused as
 * evidence nothing wired a recovery path up. The fix: the existing manual
 * "Проверить сейчас" path (`POST …/subscriptions/:id/check`) now also
 * ensures the periodic workflow exists, via the same
 * `workflowIdConflictPolicy: 'USE_EXISTING'` idiom `newsletter-delivery-
 * retry.service.v1.ts` already uses elsewhere in this repository — cheap to
 * call repeatedly because Temporal treats a start against an already-running
 * workflow id as a no-op. It only runs when explicitly asked
 * (`{ ensurePeriodicCheck: true }`), so the periodic workflow's own tick —
 * which calls this same method with no options — does not pay for an extra
 * Temporal round trip every interval.
 *
 * **State (item 4).** `checkSubscription` never read `subscription.state`
 * at all, and forced `state: 'ACTIVE'` into every successful
 * `recordCheckResult` regardless of what the row actually was. The schema
 * comment on `ContentLeadSubscription.state` in schema.prisma is explicit
 * that ACTIVE and ERRORED are not "on" and "off" — «A row stays ACTIVE
 * through an ordinary failed check — the check retries on its own schedule —
 * so ERRORED means the last attempt itself failed, not that the subscription
 * stopped trying.» A gate that skipped ERRORED rows too would make the
 * *first* transient failure permanent: nothing else in this repository ever
 * moves a live row back to ACTIVE (`setState` was dead code, and no new
 * route is in scope here), so the fix only skips a row that is neither
 * ACTIVE nor ERRORED — today that is only PAUSED, reachable if a future
 * caller ever sets it. A successful check still records `state: 'ACTIVE'`,
 * which doubles as the only recovery path an ERRORED row has.
 */

function makeRepository(subscriptionRow) {
  const recordCheckResultCalls = [];
  const upsertLeadsCalls = [];
  return {
    recordCheckResultCalls,
    upsertLeadsCalls,
    async getSubscription() {
      return subscriptionRow;
    },
    async createSubscription(organizationId, actorUserId, input) {
      return { id: subscriptionRow.id, ...input };
    },
    async recordCheckResult(organizationId, id, data) {
      recordCheckResultCalls.push(data);
    },
    async upsertLeads(organizationId, id, items) {
      upsertLeadsCalls.push(items);
      return { created: items.length };
    },
    async listLeads() {
      return [];
    },
  };
}

function makeGateway({ items = [] } = {}) {
  return {
    capabilityEnabled: true,
    check: jest.fn(async () => ({ disabled: false, items })),
  };
}

function makeTemporal(startImpl) {
  const start = jest.fn(startImpl);
  return {
    start,
    temporal: { client: { getRawClient: () => ({ workflow: { start } }) } },
  };
}

const { ContentLeadService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        warn() {}
        log() {}
        error() {}
      },
      Optional: () => () => {},
    },
    'nestjs-temporal-core': { TemporalService: class {} },
    './content-lead.repository': { ContentLeadRepository: class {} },
    './lead-feed.gateway': { LeadFeedGateway: class {} },
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/network-policy':
      { canonicalizeSourceUrl: (url) => url },
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/errors':
      {
        SourceRegistryError: class SourceRegistryError extends Error {
          constructor(code, message, status) {
            super(message);
            this.code = code;
            this.status = status;
          }
        },
      },
  },
  {
    sources: {
      './errors':
        'libraries/nestjs-libraries/src/content-intelligence/leads/errors.ts',
      './lead-reason':
        'libraries/nestjs-libraries/src/content-intelligence/leads/lead-reason.ts',
      '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute':
        'libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts',
    },
  }
);

const ACTIVE_ROW = {
  id: 'sub-1',
  state: 'ACTIVE',
  checkIntervalMinutes: 1440,
  canonicalUrl: 'https://example.com/feed',
  kind: 'RSS',
  displayName: 'Feed',
};

describe('item 3 — the manual check path recovers a periodic workflow that never got started', () => {
  test('createSubscription failing to start the periodic workflow does not stop the subscription from being created', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = makeGateway();
    const { start, temporal } = makeTemporal(async () => {
      throw new Error('temporal unavailable');
    });
    const service = new ContentLeadService(
      repository,
      gateway,
      temporal,
      () => new Date('2026-09-02T00:00:00.000Z')
    );

    const created = await service.createSubscription('org-a', 'user-a', {
      kind: 'RSS',
      displayName: 'Feed',
      canonicalUrl: 'https://example.com/feed',
    });

    expect(created.id).toBe('sub-1');
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('a later manual check with ensurePeriodicCheck starts the workflow that create could not, idempotently (USE_EXISTING)', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = makeGateway();
    const { start, temporal } = makeTemporal(async () => ({
      workflowId: 'content-lead-check-sub-1',
    }));
    const service = new ContentLeadService(
      repository,
      gateway,
      temporal,
      () => new Date('2026-09-02T00:00:00.000Z')
    );

    await service.checkSubscription('org-a', 'sub-1', {
      ensurePeriodicCheck: true,
    });

    expect(start).toHaveBeenCalledTimes(1);
    const [workflowName, options] = start.mock.calls[0];
    expect(workflowName).toBe('contentLeadCheckWorkflow');
    expect(options.workflowId).toBe('content-lead-check-sub-1');
    expect(options.workflowIdConflictPolicy).toBe('USE_EXISTING');
    expect(options.args).toEqual([
      {
        organizationId: 'org-a',
        subscriptionId: 'sub-1',
        checkIntervalMinutes: 1440,
      },
    ]);
  });

  test('a plain check (no options) — the shape the periodic workflow\'s own tick uses — does not re-ensure the workflow every interval', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = makeGateway();
    const { start, temporal } = makeTemporal(async () => ({}));
    const service = new ContentLeadService(
      repository,
      gateway,
      temporal,
      () => new Date('2026-09-02T00:00:00.000Z')
    );

    await service.checkSubscription('org-a', 'sub-1');

    expect(start).not.toHaveBeenCalled();
  });
});

describe('item 4 — subscription.state gates whether a check runs', () => {
  test('a PAUSED subscription is skipped: no feed fetch, no lead created', async () => {
    const row = { ...ACTIVE_ROW, state: 'PAUSED' };
    const repository = makeRepository(row);
    const gateway = makeGateway({
      items: [
        {
          externalId: 'x',
          title: 'Should never be seen',
          excerpt: null,
          sourceUrl: 'https://example.com/x',
          publishedAt: null,
        },
      ],
    });
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: false, reason: 'NOT_ACTIVE', created: 0 });
    expect(gateway.check).not.toHaveBeenCalled();
    expect(repository.upsertLeadsCalls).toHaveLength(0);
  });

  test('an ACTIVE subscription is checked normally', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = makeGateway({ items: [] });
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: true, created: 0 });
    expect(gateway.check).toHaveBeenCalledTimes(1);
    expect(repository.recordCheckResultCalls[0]).toMatchObject({ state: 'ACTIVE' });
  });

  test('an ERRORED subscription keeps being checked — schema.prisma documents ERRORED as "last attempt failed", not "stopped trying"; a success recovers it back to ACTIVE', async () => {
    const row = { ...ACTIVE_ROW, state: 'ERRORED' };
    const repository = makeRepository(row);
    const gateway = makeGateway({ items: [] });
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: true, created: 0 });
    expect(gateway.check).toHaveBeenCalledTimes(1);
    expect(repository.recordCheckResultCalls[0]).toMatchObject({ state: 'ACTIVE' });
  });
});

/**
 * content-factory-next-fn33.52. A refused check is not a look at the feed.
 *
 * With feed checking switched off, `checkSubscription` still wrote
 * `lastCheckedAt: now`, and the subscription row on «Откуда идеи» then read
 * «заглядывали <дата>» — a date for a read that never happened. The row has
 * to keep saying «ещё не заглядывали» until something actually opens the
 * feed. The refusal itself is still worth remembering, so `lastErrorCode:
 * 'CHECK_DISABLED'` is still written; only the last-read date is left alone.
 *
 * A *failed* check is the other side of the same rule: there the feed was
 * opened and the attempt is real, so it keeps stamping the date.
 */
describe('content-factory-next-fn33.52 — a refused check does not stamp a last-read date', () => {
  test('feed checking off for this server: the refusal is recorded, the last-read date is untouched', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = makeGateway();
    gateway.capabilityEnabled = false;
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: false, reason: 'CHECK_DISABLED', created: 0 });
    expect(gateway.check).not.toHaveBeenCalled();
    expect(repository.recordCheckResultCalls).toHaveLength(1);
    expect(repository.recordCheckResultCalls[0]).toEqual({
      state: 'ACTIVE',
      lastErrorCode: 'CHECK_DISABLED',
    });
  });

  test('the gateway refuses this one feed (result.disabled): same rule, no last-read date', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = {
      capabilityEnabled: true,
      check: jest.fn(async () => ({ disabled: true, items: [] })),
    };
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: false, reason: 'CHECK_DISABLED', created: 0 });
    expect(repository.recordCheckResultCalls[0]).not.toHaveProperty('lastCheckedAt');
  });

  test('a failed check did open the feed, so it still stamps the date', async () => {
    const repository = makeRepository(ACTIVE_ROW);
    const gateway = {
      capabilityEnabled: true,
      check: jest.fn(async () => {
        throw new Error('network down');
      }),
    };
    const service = new ContentLeadService(repository, gateway, undefined, () => new Date());

    const result = await service.checkSubscription('org-a', 'sub-1');

    expect(result).toEqual({ checked: false, reason: 'CHECK_FAILED', created: 0 });
    expect(repository.recordCheckResultCalls[0]).toHaveProperty('lastCheckedAt');
  });
});
