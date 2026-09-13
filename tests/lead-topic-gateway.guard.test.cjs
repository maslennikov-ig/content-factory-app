require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-75xn.7`. The second kind of subscription — a topic
 * rather than an address — and the promises its gateway makes.
 *
 * **Off means silent.** `LEAD_TOPIC_CHECK_ENABLED` is its own switch, not
 * `LEAD_FEED_CHECK_ENABLED`: one operator turning on outbound traffic for
 * feeds must not silently start sending a workspace's topics to a paid search
 * engine. With it off, `check` must reach nothing at all — not «reach and
 * discard», which would still be a request leaving the server.
 *
 * **The window is asked for.** Thirty days is what makes a lead a lead rather
 * than an encyclopedia entry, and it is asked of the engine
 * (`task: 'discovery'`, `windowDays`), not filtered out afterwards.
 *
 * **Identity survives a repeat.** `ContentLeadRepository.upsertLeads`
 * remembers a decline by `(organizationId, subscriptionId, externalId)`. A
 * search engine does not promise byte-identical URLs between calls, so the
 * identity is the canonicalised address — the same normalisation the source
 * registry and the feed gateway already use. Without it the next check would
 * bring back a page a person had already declined, as a brand new lead.
 *
 * Since the quality pass of 13.09.2026 (`content-factory-next-75xn.23`, F14)
 * there is a fourth: **a row without a date is not a lead.** Half of what the
 * owner was shown carried «свежее за 30 дней» over a page nobody had dated,
 * and the undated ones were where the evergreen explainers and the mirrors
 * lived. An undated row now gets one page read for the date the page states
 * about itself, and is dropped if that does not answer.
 *
 * The real gateway runs against a stub research service and a stub fetch
 * gateway: no key, no engine, no network.
 */

const WINDOW_DAYS = 30;

const { LeadTopicGateway } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-topic.gateway.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => {},
      Logger: class {
        debug() {}
        warn() {}
        log() {}
      },
    },
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      // The one helper the gateway borrows from the research service: page
      // chrome out of an excerpt. Stubbed to the same shape — a stand-in that
      // drops a known menu line, so a test can see it was actually applied
      // without loading the search stack.
      cleanExcerpt: (value) => ({
        text: String(value || '')
          .split('\n')
          .filter((line) => !/^(?:menu|opens a new window)/i.test(line.trim()))
          .join('\n')
          .trim(),
        hasProseLine: true,
      }),
    },
    // Only the constructor parameter's runtime token comes from here.
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway':
      {
        SourceFetchGateway: class {},
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

const TOPIC = 'комиссии Wildberries и Ozon';
const PROSE =
  'Комиссии маркетплейсов впервые превысили сорок процентов от стоимости товара, ' +
  'пишет издание со ссылкой на продавцов и данные площадок.';

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

/** A sweep the rules have no reason to refuse: dated, with text, on topic. */
const sweep = (sources, extra = {}) => ({
  summary: '',
  facts: sources.map((source) => ({
    text: source.excerpt ?? PROSE,
    sourceUrl: source.url,
  })),
  sources: sources.map(({ excerpt, ...source }) => ({
    title: 'Комиссии на маркетплейсах выросли',
    publishedAt: daysAgo(2),
    provider: 'tavily',
    ...source,
  })),
  provider: 'tavily',
  ...extra,
});

/** A fetch gateway that answers with the pages it was given, and counts. */
const pagesStub = (pages = {}, options = {}) => {
  const reads = [];
  return {
    reads,
    fetch: jest.fn(async (url, kind) => {
      reads.push({ url, kind });
      if (kind === 'ROBOTS') {
        return { body: Buffer.from(options.robots ?? ''), contentType: 'text/plain' };
      }
      if (options.slowHosts?.some((host) => url.includes(host))) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const page = pages[url];
      if (page === undefined) {
        const error = new Error(`nothing recorded for ${url}`);
        throw error;
      }
      return {
        body: Buffer.from(page.html ?? ''),
        contentType: page.contentType ?? 'text/html; charset=utf-8',
      };
    }),
  };
};

const gatewayWith = (research, options = {}, pages = null) =>
  new LeadTopicGateway(research, pages, {
    now: () => NOW,
    enabled: true,
    ...options,
  });

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

    const result = await gatewayWith(research).check('org-a', '   ');

    expect(result).toEqual({ disabled: false, items: [] });
    expect(research.research).not.toHaveBeenCalled();
  });
});

describe('the question the gateway asks', () => {
  test('it is a discovery search with the thirty-day window', async () => {
    const research = researchStub();

    await gatewayWith(research).check('org-a', 'регулирование ИИ в Европе');

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

  test('the first fact of a page becomes the fragment shown under its title, without its chrome', async () => {
    const research = researchStub(
      sweep([
        {
          url: 'https://news.example/a',
          excerpt: `Menu\nOpens a new window\n${PROSE}`,
        },
      ])
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items[0].excerpt).toBe(PROSE);
  });
});

describe('a date is required', () => {
  test('a dated page inside the window stays and one outside it goes', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://fresh.example/one' },
        { url: 'https://stale.example/two', publishedAt: daysAgo(1000) },
      ])
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual([
      'https://fresh.example/one',
    ]);
  });

  test('an undated row is dated from the page itself, and kept when that works', async () => {
    const research = researchStub(
      sweep([{ url: 'https://undated.example/three', publishedAt: null }])
    );
    const pages = pagesStub({
      'https://undated.example/three': {
        html: '<meta property="article:published_time" content="2026-09-08T09:00:00Z">',
      },
    });

    const result = await gatewayWith(research, {}, pages).check('org-a', TOPIC);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].publishedAt.toISOString()).toBe('2026-09-08T09:00:00.000Z');
    // Robots first, then the page: the same order the feed gateway reads in.
    expect(pages.reads.map((read) => read.kind)).toEqual(['ROBOTS', 'URL']);
  });

  test('a page that gives no date is dropped — «нет даты» is no longer «сойдёт»', async () => {
    const research = researchStub(
      sweep([{ url: 'https://undated.example/four', publishedAt: null }])
    );
    const pages = pagesStub({
      'https://undated.example/four': { html: '<html><body>Вечнозелёная страница</body></html>' },
    });

    const result = await gatewayWith(research, {}, pages).check('org-a', TOPIC);

    expect(result.items).toEqual([]);
  });

  test('a page read that fails, a robots refusal or a non-HTML answer all mean «no date»', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://broken.example/a', publishedAt: null },
        { url: 'https://refuses.example/b', publishedAt: null },
        { url: 'https://binary.example/c', publishedAt: null },
      ])
    );
    const pages = pagesStub(
      {
        'https://refuses.example/b': { html: '<meta name="date" content="2026-09-09">' },
        'https://binary.example/c': {
          html: '<meta name="date" content="2026-09-09">',
          contentType: 'application/pdf',
        },
      },
      { robots: 'User-agent: *\nDisallow: /' }
    );

    const result = await gatewayWith(research, {}, pages).check('org-a', TOPIC);

    expect(result.items).toEqual([]);
  });

  test('with no fetch gateway at all the sweep still answers, with its dated rows only', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://dated.example/a' },
        { url: 'https://undated.example/b', publishedAt: null },
      ])
    );

    const result = await gatewayWith(research, {}, null).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual(['https://dated.example/a']);
  });

  test('an engine date is corrected by the page, and kept when the page names none', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://dated.example/a', publishedAt: '2026-09-06T17:00:00.000Z' },
        { url: 'https://dated.example/b', publishedAt: '2026-09-01T17:00:00.000Z' },
      ])
    );
    const pages = pagesStub({
      'https://dated.example/a': { html: '<meta property="article:published_time" content="2026-09-04T09:30:00Z">' },
      'https://dated.example/b': { html: '<html><body>Страница без даты</body></html>' },
    });

    const result = await gatewayWith(research, { maximumPageReads: 8 }, pages).check('org-a', TOPIC);

    expect(result.items.map((item) => [item.sourceUrl, item.publishedAt?.toISOString()])).toEqual([
      ['https://dated.example/a', '2026-09-04T09:30:00.000Z'],
      ['https://dated.example/b', '2026-09-01T17:00:00.000Z'],
    ]);
  });

  test('undated rows are read first, and dated rows only inside the same cap', async () => {
    const rows = [
      ...Array.from({ length: 6 }, (unused, index) => ({ url: `https://undated.example/${index}`, publishedAt: null })),
      ...Array.from({ length: 6 }, (unused, index) => ({ url: `https://dated.example/${index}`, publishedAt: '2026-09-05T17:00:00.000Z' })),
    ];
    const pages = pagesStub(
      Object.fromEntries(rows.map((row) => [row.url, { html: '<meta name="date" content="2026-09-09">' }]))
    );

    await gatewayWith(researchStub(sweep(rows)), { maximumPageReads: 8 }, pages).check('org-a', TOPIC);

    const read = pages.reads.filter((read) => read.kind === 'URL').map((read) => read.url);
    expect(read).toHaveLength(8);
    expect(read.filter((url) => url.startsWith('https://undated.example/'))).toHaveLength(6);
  });

  test('at most eight pages are opened for one check', async () => {
    const rows = Array.from({ length: 12 }, (unused, index) => ({
      url: `https://undated.example/${index}`,
      publishedAt: null,
    }));
    const research = researchStub(sweep(rows));
    const pages = pagesStub(
      Object.fromEntries(
        rows.map((row) => [
          row.url,
          { html: '<meta name="date" content="2026-09-09">' },
        ])
      )
    );

    const result = await gatewayWith(research, { maximumPageReads: 8 }, pages).check(
      'org-a',
      TOPIC
    );

    expect(pages.reads.filter((read) => read.kind === 'URL')).toHaveLength(8);
    expect(result.items).toHaveLength(8);
  });

  test('one slow host cannot hold up the check', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://slow.example/a', publishedAt: null },
        { url: 'https://quick.example/b', publishedAt: null },
      ])
    );
    const pages = pagesStub(
      {
        'https://slow.example/a': { html: '<meta name="date" content="2026-09-09">' },
        'https://quick.example/b': { html: '<meta name="date" content="2026-09-09">' },
      },
      { slowHosts: ['slow.example'] }
    );

    const result = await gatewayWith(
      research,
      { pageReadDeadlineMs: 10 },
      pages
    ).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual([
      'https://quick.example/b',
    ]);
  });
});

describe('junk never reaches a person', () => {
  test('mirrors, PDFs, textless rows and rows off the topic are all refused', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://www.kommersant.ru/doc/8908235' },
        { url: 'https://www.facebook.com/kommersant.ru/posts/abc' },
        { url: 'https://journal.example/paper.pdf' },
        { url: 'https://short.example/a', excerpt: 'Коротко.' },
        {
          url: 'https://speeches.example/topics',
          title: '100 тем для убедительной речи',
          excerpt:
            'Подборка идей для выступления: от школьной формы до пользы утренних ' +
            'пробежек, с советами, как построить аргументацию и удержать внимание зала.',
        },
      ])
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual([
      'https://www.kommersant.ru/doc/8908235',
    ]);
  });

  test('a row the engine itself scores below a half is refused, and an unscored row is not', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://weak.example/a', score: 0.2 },
        { url: 'https://strong.example/b', score: 0.8 },
        { url: 'https://unscored.example/c' },
      ])
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual([
      'https://strong.example/b',
      'https://unscored.example/c',
    ]);
  });

  test('junk is refused before a page is ever opened for its date', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://www.facebook.com/kommersant.ru/posts/abc', publishedAt: null },
      ])
    );
    const pages = pagesStub({});

    await gatewayWith(research, {}, pages).check('org-a', TOPIC);

    expect(pages.reads).toEqual([]);
  });
});

describe('what the discovery judge decided', () => {
  test('a row judged irrelevant is dropped', async () => {
    const research = researchStub(
      sweep([{ url: 'https://news.example/a' }, { url: 'https://news.example/b' }], {
        discovery: [
          { url: 'https://news.example/b', relevant: false, reason: { ru: '', en: '' } },
        ],
      })
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items.map((item) => item.sourceUrl)).toEqual([
      'https://news.example/a',
    ]);
  });

  test('its sentence travels with the row, for `lead-reason.ts` to prefer', async () => {
    const reason = {
      ru: 'Комиссии площадок впервые перевалили за 40% от цены товара.',
      en: 'Marketplace fees passed 40% of the item price for the first time.',
    };
    const research = researchStub(
      sweep([{ url: 'https://news.example/a' }], {
        discovery: [{ url: 'https://news.example/a', relevant: true, reason }],
      })
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items[0].reason).toEqual(reason);
  });

  test('a row nobody judged keeps its place and carries no sentence', async () => {
    // No model key, a failed call, or a row the rules already refused: absent
    // is «not judged», never «irrelevant».
    const research = researchStub(sweep([{ url: 'https://news.example/a' }]));

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].reason).toBeNull();
  });
});

describe('identity across a repeated check', () => {
  const sourcesShapedAs = (url) => sweep([{ url }]);

  test('the same page in two spellings keeps one identity', async () => {
    const first = await gatewayWith(
      researchStub(sourcesShapedAs('https://News.Example/a?utm_source=x#top'))
    ).check('org-a', TOPIC);
    const second = await gatewayWith(
      researchStub(sourcesShapedAs('https://news.example/a?utm_source=x'))
    ).check('org-a', TOPIC);

    expect(first.items[0].externalId).toBe(second.items[0].externalId);
    // And it is the canonical address, not a hash of whatever arrived: the
    // repository stores it, and an opaque identity would make a stored lead
    // impossible to trace back to its page.
    expect(first.items[0].externalId).toBe('https://news.example/a?utm_source=x');
  });

  test('one pass never yields the same identity twice', async () => {
    const research = researchStub(
      sweep([
        { url: 'https://news.example/a' },
        { url: 'https://news.example/a#again' },
      ])
    );

    const result = await gatewayWith(research).check('org-a', TOPIC);

    expect(result.items).toHaveLength(1);
  });

  test('a row the canonicaliser refuses is still a lead, with a stable identity', async () => {
    // `canonicalizeSourceUrl` accepts plain HTTPS only, and an engine may
    // answer with something else. Dropping the row would hide a page a
    // person can read; a content hash keeps it and keeps it identifiable.
    const plain = 'http://insecure.example/a';
    const first = await gatewayWith(researchStub(sourcesShapedAs(plain))).check(
      'org-a',
      TOPIC
    );
    const second = await gatewayWith(researchStub(sourcesShapedAs(plain))).check(
      'org-a',
      TOPIC
    );

    expect(first.items).toHaveLength(1);
    expect(first.items[0].sourceUrl).toBe(plain);
    expect(first.items[0].externalId).toBe(second.items[0].externalId);
    expect(first.items[0].externalId).toMatch(/^[0-9a-f]{64}$/u);
  });
});
