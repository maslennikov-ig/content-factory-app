require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-75xn.7`. The second kind of subscription — a topic
 * rather than an address — and the three promises its gateway makes.
 *
 * **Off means silent.** `LEAD_TOPIC_CHECK_ENABLED` is its own switch, not
 * `LEAD_FEED_CHECK_ENABLED`: one operator turning on outbound traffic for
 * feeds must not silently start sending a workspace's topics to a paid search
 * engine. With it off, `check` must reach nothing at all — not «reach and
 * discard», which would still be a request leaving the server.
 *
 * **The window is asked for.** Thirty days is what makes a lead a lead rather
 * than an encyclopedia entry, and it is asked of the engine
 * (`task: 'discovery'`, `windowDays`), not filtered out afterwards — though a
 * row that arrives dated outside it anyway is dropped here, because the
 * sentence `lead-reason.ts` prints names that window out loud.
 *
 * **Identity survives a repeat.** `ContentLeadRepository.upsertLeads`
 * remembers a decline by `(organizationId, subscriptionId, externalId)`. A
 * search engine does not promise byte-identical URLs between calls, so the
 * identity is the canonicalised address — the same normalisation the source
 * registry and the feed gateway already use. Without it the next check would
 * bring back a page a person had already declined, as a brand new lead.
 *
 * The real gateway runs against a stub research service: no key, no engine,
 * no network. `web.research.service` is mocked rather than loaded because
 * only the constructor parameter's type comes from it.
 */

const WINDOW_DAYS = 30;

const { LeadTopicGateway } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-topic.gateway.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => {},
    },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
    },
    // The window the product watches, kept where the search clients keep it.
    // Mocked to the same number rather than loaded: `ai.clients.ts` builds
    // model and engine clients, and this test asks nothing of them.
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      DISCOVERY_WINDOW_DAYS: WINDOW_DAYS,
    },
    // Only a type import in the gateway; the result contract it names is
    // exercised here by shape.
    './lead-feed.gateway': {},
  }
);

const NOW = new Date('2026-09-13T12:00:00.000Z');
const daysAgo = (days) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const researchStub = (result) => {
  const calls = [];
  return {
    calls,
    research: jest.fn(async (organizationId, subject, options) => {
      calls.push({ organizationId, subject, options });
      return (
        result ?? { summary: '', facts: [], sources: [], provider: 'tavily' }
      );
    }),
  };
};

const gatewayWith = (research, options = {}) =>
  new LeadTopicGateway(research, { now: () => NOW, ...options });

describe('the switch an operator holds', () => {
  test('with topic checking off the gateway answers «disabled» and asks nothing', async () => {
    const research = researchStub();

    const result = await gatewayWith(research, { enabled: false }).check(
      'org-a',
      'регулирование ИИ в Европе'
    );

    expect(result).toEqual({ disabled: true });
    // The whole point: not one outbound request, not even one that is
    // thrown away afterwards.
    expect(research.research).not.toHaveBeenCalled();
  });

  test('the switch is read from LEAD_TOPIC_CHECK_ENABLED and not from the feed one', async () => {
    const previous = {
      topic: process.env.LEAD_TOPIC_CHECK_ENABLED,
      feed: process.env.LEAD_FEED_CHECK_ENABLED,
    };
    try {
      process.env.LEAD_FEED_CHECK_ENABLED = 'true';
      delete process.env.LEAD_TOPIC_CHECK_ENABLED;
      expect(new LeadTopicGateway(researchStub()).capabilityEnabled).toBe(false);

      process.env.LEAD_TOPIC_CHECK_ENABLED = 'true';
      expect(new LeadTopicGateway(researchStub()).capabilityEnabled).toBe(true);
    } finally {
      if (previous.topic === undefined) delete process.env.LEAD_TOPIC_CHECK_ENABLED;
      else process.env.LEAD_TOPIC_CHECK_ENABLED = previous.topic;
      if (previous.feed === undefined) delete process.env.LEAD_FEED_CHECK_ENABLED;
      else process.env.LEAD_FEED_CHECK_ENABLED = previous.feed;
    }
  });

  test('an empty topic asks nothing either, and is not an error', async () => {
    const research = researchStub();

    const result = await gatewayWith(research, { enabled: true }).check(
      'org-a',
      '   '
    );

    expect(result).toEqual({ disabled: false, items: [] });
    expect(research.research).not.toHaveBeenCalled();
  });
});

describe('the question the gateway asks', () => {
  test('it is a discovery search with the thirty-day window', async () => {
    const research = researchStub();

    await gatewayWith(research, { enabled: true }).check(
      'org-a',
      'регулирование ИИ в Европе'
    );

    expect(research.calls).toHaveLength(1);
    expect(research.calls[0].organizationId).toBe('org-a');
    expect(research.calls[0].subject).toBe('регулирование ИИ в Европе');
    expect(research.calls[0].options).toEqual({
      task: 'discovery',
      windowDays: WINDOW_DAYS,
    });
    // No level: a level is a paid, quota-counted choice a person makes on the
    // research panel, and a subscription's own tick is not that.
    expect(research.calls[0].options.level).toBeUndefined();
  });

  test('a page dated outside the window is dropped; an undated one is kept', async () => {
    const research = researchStub({
      summary: '',
      facts: [],
      sources: [
        {
          url: 'https://fresh.example/one',
          title: 'Свежее',
          publishedAt: daysAgo(3),
          provider: 'tavily',
        },
        {
          url: 'https://stale.example/two',
          title: 'Трёхлетней давности',
          publishedAt: daysAgo(1000),
          provider: 'tavily',
        },
        {
          url: 'https://undated.example/three',
          title: 'Без даты',
          publishedAt: null,
          provider: 'tavily',
        },
      ],
      provider: 'tavily',
    });

    const result = await gatewayWith(research, { enabled: true }).check(
      'org-a',
      'тема'
    );

    expect(result.items.map((item) => item.title)).toEqual([
      'Свежее',
      'Без даты',
    ]);
  });

  test('the first fact of a page becomes the fragment shown under its title', async () => {
    const research = researchStub({
      summary: '',
      facts: [
        { text: 'Регулятор назвал срок.', sourceUrl: 'https://news.example/a' },
        { text: 'Второй факт той же страницы.', sourceUrl: 'https://news.example/a' },
      ],
      sources: [
        {
          url: 'https://news.example/a',
          title: 'Срок назван',
          publishedAt: daysAgo(1),
          provider: 'exa',
        },
      ],
      provider: 'exa',
    });

    const result = await gatewayWith(research, { enabled: true }).check(
      'org-a',
      'тема'
    );

    expect(result.items[0].excerpt).toBe('Регулятор назвал срок.');
  });
});

describe('identity across a repeated check', () => {
  const sourcesShapedAs = (url) => ({
    summary: '',
    facts: [],
    sources: [
      { url, title: 'Одна и та же страница', publishedAt: daysAgo(2), provider: 'tavily' },
    ],
    provider: 'tavily',
  });

  test('the same page in two spellings keeps one identity', async () => {
    const first = await gatewayWith(
      researchStub(sourcesShapedAs('https://News.Example/a?utm_source=x#top')),
      { enabled: true }
    ).check('org-a', 'тема');
    const second = await gatewayWith(
      researchStub(sourcesShapedAs('https://news.example/a?utm_source=x')),
      { enabled: true }
    ).check('org-a', 'тема');

    expect(first.items[0].externalId).toBe(second.items[0].externalId);
    // And it is the canonical address, not a hash of whatever arrived: the
    // repository stores it, and an opaque identity would make a stored lead
    // impossible to trace back to its page.
    expect(first.items[0].externalId).toBe('https://news.example/a?utm_source=x');
  });

  test('one pass never yields the same identity twice', async () => {
    const research = researchStub({
      summary: '',
      facts: [],
      sources: [
        { url: 'https://news.example/a', title: 'Раз', publishedAt: null, provider: 'tavily' },
        { url: 'https://news.example/a#again', title: 'Два', publishedAt: null, provider: 'tavily' },
      ],
      provider: 'tavily',
    });

    const result = await gatewayWith(research, { enabled: true }).check(
      'org-a',
      'тема'
    );

    expect(result.items).toHaveLength(1);
  });

  test('a row the canonicaliser refuses is still a lead, with a stable identity', async () => {
    // `canonicalizeSourceUrl` accepts plain HTTPS only, and an engine may
    // answer with something else. Dropping the row would hide a page a
    // person can read; a content hash keeps it and keeps it identifiable.
    const plain = 'http://insecure.example/a';
    const first = await gatewayWith(researchStub(sourcesShapedAs(plain)), {
      enabled: true,
    }).check('org-a', 'тема');
    const second = await gatewayWith(researchStub(sourcesShapedAs(plain)), {
      enabled: true,
    }).check('org-a', 'тема');

    expect(first.items).toHaveLength(1);
    expect(first.items[0].sourceUrl).toBe(plain);
    expect(first.items[0].externalId).toBe(second.items[0].externalId);
    expect(first.items[0].externalId).toMatch(/^[0-9a-f]{64}$/u);
  });
});
