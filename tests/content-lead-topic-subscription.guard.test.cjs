require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-75xn.7`, from the door inward: a subscription to a
 * topic, and the three things it must not break.
 *
 * **One topic per workspace.** The only thing that has ever meant «one
 * subscription per thing watched» is the unique index `(organizationId, kind,
 * canonicalUrl)`. A topic has no address, so the service derives
 * `topic://<normalised topic>` and stores it there — which is what keeps the
 * index honest for the new kind instead of adding a second index only one
 * kind would use. «ИИ в медицине» and «  ИИ   В   Медицине » are the same
 * watch and the second one is refused.
 *
 * **A repeat brings nothing new.** The check runs again on its own schedule;
 * a page already seen must not become a second lead. That rests on
 * `upsertLeads` inserting with `skipDuplicates` on `(organizationId,
 * subscriptionId, externalId)` — exercised here through the real repository
 * against a fake client that behaves like the real index.
 *
 * **A decline stays declined.** The rule `content-lead-dismissal-guard.
 * test.cjs` pins for feeds, now driven end to end for a topic: dismiss a
 * lead, check again, and it is still DISMISSED rather than back in the queue.
 *
 * The service, the repository, the gateway, the reason and the topic key are
 * all the real modules. Only the search engine is a stub — nothing here makes
 * an outbound request, and the flag-off case proves it makes none even in
 * principle.
 */

const WINDOW_DAYS = 30;

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

const researchMock = {
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    // The gateway borrows the research service's page-chrome cleaning for the
    // fragment under a title (`content-factory-next-75xn.23`). Stubbed to the
    // same shape: this suite is about the door and the repository, and loading
    // the search stack to prove a string is trimmed would be a second reason
    // for this file to break.
    cleanExcerpt: (value) => ({ text: String(value || '').trim(), hasProseLine: true }),
  },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway':
    {
      SourceFetchGateway: class {},
    },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    DISCOVERY_WINDOW_DAYS: WINDOW_DAYS,
  },
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
    ...researchMock,
    ...prismaMock,
  }
);

const { ContentLeadRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.repository.ts',
  { '@nestjs/common': nestCommon, ...prismaMock }
);

const { LeadTopicGateway } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-topic.gateway.ts',
  { '@nestjs/common': nestCommon, ...researchMock, './lead-feed.gateway': {} }
);

const { topicSubscriptionKey } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-topic-key.ts'
);

const NOW = new Date('2026-09-13T12:00:00.000Z');
const ORG = 'org-a';

/**
 * A fake Prisma client that enforces the two unique indexes this feature
 * rests on, and nothing else. `P2002` is what the real client throws, and the
 * repository's refusal is built on reading exactly that code.
 */
function makeClient() {
  const subscriptions = [];
  const leads = [];
  let nextLeadId = 1;

  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'in' in value) {
        return value.in.includes(row[key]);
      }
      if (value === null) return row[key] === null || row[key] === undefined;
      return row[key] === value;
    });

  return {
    subscriptions,
    leads,
    contentLeadSubscription: {
      create: async ({ data }) => {
        const clash = subscriptions.some(
          (row) =>
            row.organizationId === data.organizationId &&
            row.kind === data.kind &&
            row.canonicalUrl === data.canonicalUrl
        );
        if (clash) {
          const error = new Error('Unique constraint failed');
          error.code = 'P2002';
          throw error;
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
        return row;
      },
      count: async () => subscriptions.filter((row) => !row.deletedAt).length,
      findMany: async ({ where }) =>
        subscriptions
          .filter((row) => matches(row, where))
          .map((row) => ({ ...row, linkedAutoPost: null })),
      findFirst: async ({ where }) =>
        subscriptions.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const found = subscriptions.filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
    },
    contentLead: {
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const item of data) {
          const clash = leads.some(
            (row) =>
              row.organizationId === item.organizationId &&
              row.subscriptionId === item.subscriptionId &&
              row.externalId === item.externalId
          );
          if (clash && skipDuplicates) continue;
          leads.push({ id: `lead-${nextLeadId++}`, status: 'NEW', ...item });
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }) => leads.filter((row) => matches(row, where)),
      groupBy: async () => [],
      findFirst: async ({ where }) =>
        leads.find((row) => matches(row, where)) ?? null,
      updateMany: async ({ where, data }) => {
        const found = leads.filter((row) => matches(row, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
    },
    autoPost: {
      findMany: async () => [],
      findFirst: async () => null,
    },
  };
}

/**
 * Since `content-factory-next-75xn.23` a row has to survive the junk rules to
 * become a lead: it needs a date inside the window, text a person can read,
 * and a word in common with the topic. These fixtures are rows that do — the
 * refusals themselves live in `lead-junk.test.cjs` and
 * `lead-topic-gateway.guard.test.cjs`.
 */
const TOPIC_PROSE =
  'Клиника внедрила модель для разбора медицинских снимков и отчиталась о ' +
  'сокращении сроков постановки диагноза почти вдвое, сообщает издание.';

const sourceRow = (url, title, daysOld = 1) => ({
  url,
  title,
  publishedAt: new Date(
    NOW.getTime() - daysOld * 24 * 60 * 60 * 1000
  ).toISOString(),
  provider: 'tavily',
});

function stand({ enabled = true, sources = [] } = {}) {
  const client = makeClient();
  const repository = new ContentLeadRepository(
    { model: client },
    { model: { $transaction: async (work) => work(client) } }
  );
  const research = {
    research: jest.fn(async () => {
      const rows = answers.shift() ?? sources;
      return {
        summary: '',
        // The fragment under a title is the row's first fact, which is where
        // the service and the gateway both read it from.
        facts: rows.map((row) => ({ text: TOPIC_PROSE, sourceUrl: row.url })),
        sources: rows,
        provider: 'tavily',
      };
    }),
  };
  const answers = [];
  const topics = new LeadTopicGateway(research, null, {
    enabled,
    now: () => NOW,
  });
  const feed = {
    capabilityEnabled: true,
    check: jest.fn(async () => ({ disabled: false, items: [] })),
  };
  const service = new ContentLeadService(
    repository,
    feed,
    undefined,
    () => NOW,
    topics
  );
  return { client, repository, research, service, feed, answers };
}

const createTopic = (service, query, displayName = query) =>
  service.createSubscription(ORG, 'user-a', {
    kind: 'TOPIC',
    displayName,
    query,
  });

/**
 * Отказ по квоте — решение продукта, а не поломка ленты.
 *
 * Проверка темы проходит через ту же платную операцию, что и ручной ресерч, и
 * на инстансе с включёнными ключами может упереться в месячный предел. Строка
 * «проверка не удалась» отправила бы человека искать сломанный источник.
 */
describe('a refusal is not a failure', () => {
  test('a quota answer reaches the list under its own name', async () => {
    const { service, client, research } = stand();
    const created = await createTopic(service, 'ии в медицине');
    research.research.mockRejectedValueOnce(
      Object.assign(new Error('spent'), {
        code: 'RESEARCH_QUOTA_EXHAUSTED',
        status: 429,
      })
    );

    const result = await service.checkSubscription(ORG, created.id, {
      manual: true,
    });

    expect(result).toMatchObject({ checked: false, reason: 'RESEARCH_QUOTA_EXHAUSTED' });
    expect(client.subscriptions[0].lastErrorCode).toBe('RESEARCH_QUOTA_EXHAUSTED');
  });

  test('a workspace with search switched off learns that, not «проверка не удалась»', async () => {
    // content-factory-next-75xn.20 (F1). Five topics in a fresh workspace all
    // went to ERRORED with the generic code, and the one thing a person needed
    // to know — that web research is a switch nobody had flipped — was the one
    // thing the row did not say.
    const { service, client, research } = stand();
    const created = await createTopic(service, 'ии в медицине');
    research.research.mockRejectedValueOnce(
      Object.assign(new Error('Web search is not configured for this organization.'), {
        code: 'CONTENT_SEARCH_NOT_CONFIGURED',
        status: 409,
      })
    );

    const result = await service.checkSubscription(ORG, created.id, {
      manual: true,
    });

    expect(result).toMatchObject({
      checked: false,
      reason: 'CONTENT_SEARCH_NOT_CONFIGURED',
    });
    expect(client.subscriptions[0].lastErrorCode).toBe('CONTENT_SEARCH_NOT_CONFIGURED');
  });

  test('anything else keeps the generic code, so no internal message escapes', async () => {
    const { service, client, research } = stand();
    const created = await createTopic(service, 'ии в медицине');
    research.research.mockRejectedValueOnce(
      Object.assign(new Error('connection string is postgres://user:secret@host'), {
        code: 'P1013',
      })
    );

    const result = await service.checkSubscription(ORG, created.id, {
      manual: true,
    });

    expect(result).toMatchObject({ checked: false, reason: 'CHECK_FAILED' });
    expect(client.subscriptions[0].lastErrorCode).toBe('CHECK_FAILED');
  });
});

describe('the synthetic key that keeps «one topic per workspace» true', () => {
  test('a topic row stores topic://<slug> as its address and the wording in query', async () => {
    const { service, client } = stand();

    const created = await createTopic(service, '  ИИ   в   Медицине  ');

    expect(created.canonicalUrl).toBe('topic://ии в медицине');
    expect(created.canonicalUrl).toBe(topicSubscriptionKey('ИИ в медицине'));
    // The wording is kept as typed, only trimmed: the key is derived from the
    // topic and never rewrites it back.
    expect(client.subscriptions[0].query).toBe('ИИ   в   Медицине');
    expect(created.query).toBe('ИИ   в   Медицине');
  });

  test('the same topic in another case or spacing is refused by the index', async () => {
    const { service, client } = stand();
    await createTopic(service, 'ИИ в медицине');

    const error = await createTopic(service, '  ии В МЕДИЦИНЕ ').catch(
      (thrown) => thrown
    );

    expect(error.code).toBe('SUBSCRIPTION_CONFLICT');
    expect(error.status).toBe(409);
    // And the refusal is about a topic, not about an address the person never
    // typed.
    expect(error.message).toMatch(/topic/i);
    expect(client.subscriptions).toHaveLength(1);
  });

  test('a different topic is a different subscription', async () => {
    const { service, client } = stand();
    await createTopic(service, 'ИИ в медицине');

    await createTopic(service, 'ИИ в образовании');

    expect(client.subscriptions).toHaveLength(2);
  });

  test('a feed keeps its own key, so a topic can never collide with an address', async () => {
    const { service, client } = stand();

    await createTopic(service, 'ИИ в медицине');
    await service.createSubscription(ORG, 'user-a', {
      kind: 'RSS',
      displayName: 'Лента',
      canonicalUrl: 'https://example.com/feed',
    });

    expect(client.subscriptions.map((row) => row.canonicalUrl)).toEqual([
      'topic://ии в медицине',
      'https://example.com/feed',
    ]);
  });

  test('an empty topic is refused before anything is written', async () => {
    const { service, client } = stand();

    const error = await createTopic(service, '   ', 'Тема').catch(
      (thrown) => thrown
    );

    expect(error.code).toBe('INVALID_TOPIC');
    expect(error.status).toBe(422);
    expect(client.subscriptions).toHaveLength(0);
  });
});

describe('a topic check, and the same topic checked again', () => {
  const twoPages = [
    sourceRow('https://news.example/one', 'Первая страница'),
    sourceRow('https://news.example/two', 'Вторая страница'),
  ];

  test('the first check creates a lead per page', async () => {
    const { service, client } = stand({ sources: twoPages });
    const created = await createTopic(service, 'ИИ в медицине');

    const result = await service.checkSubscription(ORG, created.id);

    expect(result).toEqual({ checked: true, created: 2 });
    expect(client.leads).toHaveLength(2);
    // The reason names the window, and is written without a model call in
    // both product languages.
    expect(client.leads[0].reasonRu).toContain('30');
    expect(client.leads[0].reasonEn).toContain('30');
    expect(/[а-яё]/i.test(client.leads[0].reasonRu)).toBe(true);
  });

  test('the same pages on a second check create nothing', async () => {
    const { service, client } = stand({ sources: twoPages });
    const created = await createTopic(service, 'ИИ в медицине');
    await service.checkSubscription(ORG, created.id);

    const again = await service.checkSubscription(ORG, created.id);

    expect(again).toEqual({ checked: true, created: 0 });
    expect(client.leads).toHaveLength(2);
  });

  test('the same pages in different spellings still create nothing', async () => {
    const { service, client, answers } = stand({ sources: twoPages });
    const created = await createTopic(service, 'ИИ в медицине');
    await service.checkSubscription(ORG, created.id);
    // What a search engine may легально answer with next time: the same two
    // pages, differently written.
    answers.push([
      sourceRow('https://News.Example/one#intro', 'Первая страница'),
      sourceRow('https://news.example/two', 'Вторая страница, переименованная'),
    ]);

    const again = await service.checkSubscription(ORG, created.id);

    expect(again.created).toBe(0);
    expect(client.leads).toHaveLength(2);
  });

  test('a genuinely new page on the second check is a new lead', async () => {
    const { service, client, answers } = stand({ sources: twoPages });
    const created = await createTopic(service, 'ИИ в медицине');
    await service.checkSubscription(ORG, created.id);
    answers.push([...twoPages, sourceRow('https://news.example/three', 'Третья')]);

    const again = await service.checkSubscription(ORG, created.id);

    expect(again.created).toBe(1);
    expect(client.leads).toHaveLength(3);
  });

  test('a declined lead is not brought back by the next check', async () => {
    const { service, client } = stand({ sources: twoPages });
    const created = await createTopic(service, 'ИИ в медицине');
    await service.checkSubscription(ORG, created.id);
    const [first] = client.leads;
    await service.dismissLead(ORG, first.id, 'user-a');
    expect(client.leads[0].status).toBe('DISMISSED');

    const again = await service.checkSubscription(ORG, created.id);

    expect(again.created).toBe(0);
    expect(client.leads).toHaveLength(2);
    // Still declined, still carrying who declined it, and not back in the
    // queue a person reads.
    expect(client.leads[0].status).toBe('DISMISSED');
    expect(client.leads[0].dismissedByUserId).toBe('user-a');
    const queue = await service.listLeads(ORG, { status: 'NEW' });
    expect(queue.leads.map((lead) => lead.id)).not.toContain(first.id);
  });
});

describe('the topic switch, seen from the service', () => {
  test('with topic checking off the check is refused and the engine is never asked', async () => {
    const { service, research, client } = stand({ enabled: false });
    const created = await createTopic(service, 'ИИ в медицине');

    const result = await service.checkSubscription(ORG, created.id);

    expect(result).toEqual({
      checked: false,
      reason: 'CHECK_DISABLED',
      created: 0,
    });
    expect(research.research).not.toHaveBeenCalled();
    expect(client.leads).toHaveLength(0);
    // The refusal is remembered, and the last-read date is left honest: the
    // check never opened anything (`content-factory-next-fn33.52`).
    expect(client.subscriptions[0].lastErrorCode).toBe('CHECK_DISABLED');
    expect(client.subscriptions[0].lastCheckedAt).toBe(null);
  });

  test('a feed row is still checked on a server where only topics are off', async () => {
    const { service, feed, client } = stand({ enabled: false });
    await service.createSubscription(ORG, 'user-a', {
      kind: 'RSS',
      displayName: 'Лента',
      canonicalUrl: 'https://example.com/feed',
    });

    const result = await service.checkSubscription(ORG, client.subscriptions[0].id);

    expect(result.checked).toBe(true);
    expect(feed.check).toHaveBeenCalledTimes(1);
  });

  test('the screen is told about both switches separately', async () => {
    const { service } = stand({ enabled: false });

    const listed = await service.listSubscriptions(ORG);

    expect(listed.capabilities).toEqual({ feedCheck: true, topicCheck: false });
  });
});
