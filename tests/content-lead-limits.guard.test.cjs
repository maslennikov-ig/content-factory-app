require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-ni7x`. Two things «Откуда идеи» had no ceiling on.
 *
 * **How many.** The unique index is `(organizationId, kind, canonicalUrl)`,
 * so it stops the same address twice and nothing else: a workspace could
 * hold any number of *different* addresses, and every one of them is a
 * perpetual Temporal workflow that keeps ticking. The limit is a count per
 * organisation, refused with its own code so the screen can print the
 * server's own sentence rather than a generic failure.
 *
 * **How often.** `POST /subscriptions/:id/check` makes an outbound request
 * on demand. Held by `LEAD_FEED_CHECK_ENABLED` today, which is off by
 * default — that is a switch, not a rate. A manual check inside a minute of
 * the last one is refused with `CHECK_TOO_SOON`; the periodic workflow's own
 * tick, which calls the same method without `manual`, is never throttled,
 * because its rate is already the interval the row was created with.
 *
 * Both refusals are exercised on both sides of the boundary — refused
 * inside, allowed outside — against the real service class.
 */

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
      '@contentfactory/nestjs-libraries/locale/backend-strings':
        'libraries/nestjs-libraries/src/locale/backend-strings.ts',
    },
  }
);

const { MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION, MANUAL_CHECK_MIN_INTERVAL_MS } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/leads/lead-limits.ts'
  );

const NOW = new Date('2026-09-05T12:00:00.000Z');

function makeRepository({ count = 0, subscription = null } = {}) {
  const created = [];
  return {
    created,
    async countSubscriptions() {
      return count;
    },
    async createSubscription(organizationId, actorUserId, input) {
      created.push(input);
      return { id: 'sub-new', ...input };
    },
    async getSubscription() {
      return subscription;
    },
    async getAutoPost() {
      return { id: 'auto-1' };
    },
    async recordCheckResult() {},
    async upsertLeads(organizationId, id, items) {
      return { created: items.length };
    },
    async listLeads() {
      return [];
    },
  };
}

const gateway = () => ({
  capabilityEnabled: true,
  check: jest.fn(async () => ({ disabled: false, items: [] })),
});

const service = (repository, feed = gateway()) =>
  new ContentLeadService(repository, feed, undefined, () => NOW);

const CREATE_INPUT = {
  kind: 'RSS',
  displayName: 'Feed',
  canonicalUrl: 'https://example.com/feed',
};

const rowCheckedAt = (lastCheckedAt) => ({
  id: 'sub-1',
  state: 'ACTIVE',
  checkIntervalMinutes: 1440,
  canonicalUrl: 'https://example.com/feed',
  kind: 'RSS',
  displayName: 'Feed',
  lastCheckedAt,
});

describe('how many subscriptions one organisation may hold', () => {
  test('the limit is twenty', () => {
    expect(MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION).toBe(20);
  });

  test('one below the limit still creates', async () => {
    const repository = makeRepository({
      count: MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION - 1,
    });

    await service(repository).createSubscription('org-a', 'user-a', CREATE_INPUT);

    expect(repository.created).toHaveLength(1);
  });

  test('at the limit the create is refused with SUBSCRIPTION_LIMIT, and nothing is written', async () => {
    const repository = makeRepository({
      count: MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION,
    });

    const error = await service(repository)
      .createSubscription('org-a', 'user-a', CREATE_INPUT)
      .catch((thrown) => thrown);

    expect(error.code).toBe('SUBSCRIPTION_LIMIT');
    expect(error.status).toBe(409);
    expect(repository.created).toHaveLength(0);
  });

  test('the refusal is written in the language of the person who asked', async () => {
    const repository = makeRepository({
      count: MAX_LEAD_SUBSCRIPTIONS_PER_ORGANIZATION,
    });

    const russian = await service(repository)
      .createSubscription('org-a', 'user-a', CREATE_INPUT, 'ru')
      .catch((thrown) => thrown);
    const english = await service(repository)
      .createSubscription('org-a', 'user-a', CREATE_INPUT, 'en')
      .catch((thrown) => thrown);

    expect(russian.message).toContain('20');
    expect(english.message).toContain('20');
    expect(russian.message).not.toBe(english.message);
    expect(/[а-яё]/i.test(russian.message)).toBe(true);
  });
});

describe('how often a manual check may run', () => {
  test('the window is a minute', () => {
    expect(MANUAL_CHECK_MIN_INTERVAL_MS).toBe(60_000);
  });

  test('a manual check inside the window is refused with CHECK_TOO_SOON and never opens the feed', async () => {
    const feed = gateway();
    const repository = makeRepository({
      subscription: rowCheckedAt(new Date(NOW.getTime() - 30_000)),
    });

    const error = await service(repository, feed)
      .checkSubscription('org-a', 'sub-1', { manual: true })
      .catch((thrown) => thrown);

    expect(error.code).toBe('CHECK_TOO_SOON');
    expect(error.status).toBe(429);
    expect(feed.check).not.toHaveBeenCalled();
  });

  test('a manual check just outside the window runs', async () => {
    const feed = gateway();
    const repository = makeRepository({
      subscription: rowCheckedAt(new Date(NOW.getTime() - 61_000)),
    });

    const result = await service(repository, feed).checkSubscription(
      'org-a',
      'sub-1',
      { manual: true }
    );

    expect(result.checked).toBe(true);
    expect(feed.check).toHaveBeenCalledTimes(1);
  });

  test('a subscription never checked before is not throttled', async () => {
    const feed = gateway();
    const repository = makeRepository({ subscription: rowCheckedAt(null) });

    const result = await service(repository, feed).checkSubscription(
      'org-a',
      'sub-1',
      { manual: true }
    );

    expect(result.checked).toBe(true);
  });

  test("the periodic workflow's own tick is never throttled", async () => {
    const feed = gateway();
    const repository = makeRepository({
      subscription: rowCheckedAt(new Date(NOW.getTime() - 1_000)),
    });

    const result = await service(repository, feed).checkSubscription(
      'org-a',
      'sub-1'
    );

    expect(result.checked).toBe(true);
    expect(feed.check).toHaveBeenCalledTimes(1);
  });

  test('the throttle refusal is written in the language of the person who asked', async () => {
    const repository = makeRepository({
      subscription: rowCheckedAt(new Date(NOW.getTime() - 30_000)),
    });

    const russian = await service(repository)
      .checkSubscription('org-a', 'sub-1', { manual: true, language: 'ru' })
      .catch((thrown) => thrown);
    const english = await service(repository)
      .checkSubscription('org-a', 'sub-1', { manual: true, language: 'en' })
      .catch((thrown) => thrown);

    expect(/[а-яё]/i.test(russian.message)).toBe(true);
    expect(russian.message).not.toBe(english.message);
    expect(english.message.trim()).not.toBe('');
  });
});
