'use strict';

const { loadWithMocks, REPO } = require('./helpers/load-ts-with-mocks.cjs');
const { createFakeRedis } = require('./helpers/fake-redis.cjs');

/** Every Logger.warn the loaded modules emit, so a fallback can be proven. */
const warnings = [];

const redisService = loadWithMocks(
  'libraries/nestjs-libraries/src/redis/redis.service.ts'
);

const egress = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/research/competitive-intelligence-egress.ts'
);
const fetchPolicy = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/research/constrained-static-fetch.ts'
);
const encyclopedic = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/research/encyclopedic-reference.ts'
);

const webResearch = loadWithMocks(
  'libraries/nestjs-libraries/src/openai/web.research.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => {},
      Inject: () => () => {},
      Logger: class {
        log() {}
        warn(message) {
          warnings.push(message);
        }
        debug() {}
      },
    },
    '@langchain/core/prompts': {
      ChatPromptTemplate: { fromTemplate: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      WEB_SEARCH_MAX_RESULT_CHARS: 32_000,
      WEB_SEARCH_PRIMARY_TIMEOUT_MS: 12_000,
      WEB_SEARCH_FALLBACK_TIMEOUT_MS: 8_000,
      getChatModel: async () => ({}),
      getWebSearchClient: async () => ({ invoke: async () => ({ results: [] }) }),
    },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      SearchProvider: {},
      requireActiveAiConfig: async () => ({
        provider: 'openrouter',
        apiKey: 'model-key',
        search: { enabled: false, provider: 'tavily', apiKey: '', depth: 'advanced' },
      }),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/content.language': {
      contentLanguageNames: { ru: 'Russian', en: 'English' },
    },
  }
);

const baseEgress = () => ({
  organizationId: 'org-a',
  providerId: 'exa',
  approvedProviderIds: ['exa'],
  budget: {
    maxSearchQueries: 4,
    maxAcceptedSources: 8,
    maxResponseBytes: 10_000,
    maxWallClockMs: 60_000,
    maxModelTokens: 1_000,
    maxProviderCostMicros: 500_000,
    maxConcurrency: 2,
  },
  spend: {
    searchQueries: 0,
    acceptedSources: 0,
    responseBytes: 0,
    wallClockMs: 0,
    modelTokens: 0,
    providerCostMicros: 0,
    inFlight: 0,
  },
});

describe('research phase one policy', () => {
  test('allows an approved request within every budget', () => {
    expect(egress.decideResearchEgress(baseEgress())).toEqual({
      allowed: true,
      policyVersion: egress.RESEARCH_EGRESS_POLICY_VERSION,
    });
  });

  test.each([
    ['globalKillSwitch', 'global_kill_switch'],
    ['tenantKillSwitches', 'tenant_kill_switch'],
    ['providerKillSwitches', 'provider_kill_switch'],
  ])('fails closed for %s', (field, code) => {
    const input = baseEgress();
    input[field] = field === 'globalKillSwitch' ? true : ['org-a', 'exa'];
    expect(egress.decideResearchEgress(input)).toMatchObject({ allowed: false, code });
  });

  test('rejects an unapproved source role and exhausted search budget', () => {
    expect(
      egress.decideResearchEgress({ ...baseEgress(), sourceRoleAllowed: false })
    ).toMatchObject({ allowed: false, code: 'source_role_not_allowed' });
    expect(
      egress.decideResearchEgress({
        ...baseEgress(),
        spend: { ...baseEgress().spend, searchQueries: 4 },
      })
    ).toMatchObject({ allowed: false, code: 'budget_search_queries' });
  });

  test('compiles only public and template vocabulary', () => {
    expect(
      egress.compileResearchQuery({
        publicTerms: ['OpenAI 2026'],
        templateTerms: ['pricing', 'reviews'],
        proposedTerms: ['OpenAI', 'pricing', '2026'],
      })
    ).toMatchObject({ compiled: true, query: 'OpenAI pricing 2026' });
    expect(
      egress.compileResearchQuery({
        publicTerms: ['OpenAI'],
        templateTerms: ['pricing'],
        proposedTerms: ['OpenAI private customer list'],
      })
    ).toMatchObject({ compiled: false, code: 'query_contains_tenant_data' });
  });

  test('rejects empty and overlong query plans', () => {
    expect(
      egress.compileResearchQuery({ publicTerms: [], templateTerms: [], proposedTerms: [] })
    ).toMatchObject({ compiled: false, code: 'query_empty' });
    expect(
      egress.compileResearchQuery({
        publicTerms: ['public'],
        templateTerms: [],
        proposedTerms: Array.from({ length: 60 }, () => 'public'),
      })
    ).toMatchObject({ compiled: false, code: 'query_too_long' });
  });

  test('allows only public HTTPS host names before the network boundary', async () => {
    expect(fetchPolicy.validateResearchFetchUrl('https://example.com/article').allowed).toBe(true);
    expect(fetchPolicy.validateResearchFetchUrl('http://example.com/article')).toMatchObject({
      allowed: false,
      code: 'scheme_not_https',
    });
    expect(fetchPolicy.validateResearchFetchUrl('https://169.254.169.254/latest')).toMatchObject({
      allowed: false,
      code: 'ip_literal_target',
    });

    const calls = [];
    await expect(
      fetchPolicy.constrainedResearchFetch({
        url: 'https://example.com/article',
        fetcher: async (url, init) => {
          calls.push({ url, init });
          return 'page';
        },
      })
    ).resolves.toBe('page');
    await expect(
      fetchPolicy.constrainedResearchFetch({
        url: 'https://localhost/article',
        fetcher: async () => 'must not run',
      })
    ).rejects.toThrow('RESEARCH_FETCH_HOSTNAME_NOT_PUBLIC_SUFFIX');
    expect(calls).toEqual([{ url: 'https://example.com/article', init: { method: 'GET' } }]);
  });

  test('resolves every network hop and rejects private answers before fetch', async () => {
    const calls = [];
    await expect(
      fetchPolicy.constrainedResearchFetch({
        url: 'https://example.com/article',
        resolver: async () => [{ address: '10.0.0.8', family: 4 }],
        fetcher: async (...args) => {
          calls.push(args);
          return { status: 200 };
        },
      })
    ).rejects.toThrow('RESEARCH_FETCH_DNS_UNSAFE');
    expect(calls).toEqual([]);
  });

  test('revalidates redirects and rejects unsafe targets and loops', async () => {
    const addresses = {
      'example.com': [{ address: '93.184.216.34', family: 4 }],
      'other.example.com': [{ address: '93.184.216.35', family: 4 }],
    };
    const resolver = async (hostname) => addresses[hostname] || [];
    let calls = [];
    await expect(
      fetchPolicy.constrainedResearchFetch({
        url: 'https://example.com/article',
        resolver,
        fetcher: async (url) => {
          calls.push(url);
          return {
            status: 302,
            headers: { get: () => 'http://other.example.com/private' },
          };
        },
      })
    ).rejects.toThrow('RESEARCH_FETCH_SCHEME_NOT_HTTPS');
    expect(calls).toEqual(['https://example.com/article']);

    calls = [];
    await expect(
      fetchPolicy.constrainedResearchFetch({
        url: 'https://example.com/article',
        resolver,
        fetcher: async (url) => {
          calls.push(url);
          return {
            status: 302,
            headers: { get: () => 'https://example.com/article' },
          };
        },
      })
    ).rejects.toThrow('RESEARCH_FETCH_REDIRECT_UNSAFE');
    expect(calls).toEqual(['https://example.com/article']);
  });

  test('keeps Wikipedia and Wikidata as keyless recorded-response lanes', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes('wikipedia.org')) {
        return {
          ok: true,
          async json() {
            return { pages: [{ key: 'Ada_Lovelace', title: 'Ada Lovelace', description: 'mathematician' }] };
          },
        };
      }
      return {
        ok: true,
        async json() {
          return { search: [{ id: 'Q7259', label: 'Ada Lovelace', description: 'mathematician' }] };
        },
      };
    };

    const wikipedia = await encyclopedic.lookupEncyclopedicReferences({
      entityName: 'Ada Lovelace',
      locales: ['en'],
      fetchImpl,
    });
    const wikidata = await encyclopedic.lookupWikidataReferences({
      entityName: 'Ada Lovelace',
      locale: 'en',
      fetchImpl,
    });
    expect(wikipedia.results[0]).toMatchObject({
      provider: 'wikipedia',
      url: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
      nonCitableSnippet: 'mathematician',
    });
    expect(wikidata.results[0]).toMatchObject({
      provider: 'wikidata',
      url: 'https://www.wikidata.org/wiki/Q7259',
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('/w/rest.php/v1/search/page?q=Ada%20Lovelace');
    expect(calls[1]).toContain('action=wbsearchentities');
  });

  test('reads a citable extract through the REST summary door', async () => {
    const calls = [];
    const extract = await encyclopedic.fetchEncyclopedicExtract({
      articleUrl: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), headers: init.headers });
        return {
          ok: true,
          async json() {
            return {
              type: 'standard',
              title: 'Ada Lovelace',
              extract: `${'Ada Lovelace was an English mathematician. '.repeat(100)}`,
              content_urls: {
                desktop: { page: 'https://en.wikipedia.org/wiki/Ada_Lovelace' },
              },
            };
          },
        };
      },
    });

    expect(calls[0].url).toBe(
      'https://en.wikipedia.org/api/rest_v1/page/summary/Ada_Lovelace'
    );
    expect(calls[0].headers['User-Agent']).toBe('content-factory-research/1.0');
    expect(extract).toMatchObject({
      provider: 'wikipedia',
      url: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
      title: 'Ada Lovelace',
    });
    expect(extract.extract).toHaveLength(
      encyclopedic.ENCYCLOPEDIC_EXTRACT_MAX_CHARS
    );
  });

  test('an extract that cannot be cited is no extract at all', async () => {
    const answer = (body) => async () => ({ ok: true, async json() { return body; } });
    await expect(
      encyclopedic.fetchEncyclopedicExtract({
        articleUrl: 'https://en.wikipedia.org/wiki/Mercury',
        fetchImpl: answer({ type: 'disambiguation', extract: 'Mercury may refer to' }),
      })
    ).resolves.toBeNull();
    await expect(
      encyclopedic.fetchEncyclopedicExtract({
        articleUrl: 'https://en.wikipedia.org/wiki/Empty',
        fetchImpl: answer({ type: 'standard', extract: '   ' }),
      })
    ).resolves.toBeNull();
    await expect(
      encyclopedic.fetchEncyclopedicExtract({
        articleUrl: 'https://example.com/wiki/Ada_Lovelace',
        fetchImpl: async () => {
          throw new Error('must not run');
        },
      })
    ).resolves.toBeNull();
    await expect(
      encyclopedic.fetchEncyclopedicExtract({
        articleUrl: 'https://en.wikipedia.org/wiki/Ada_Lovelace',
        fetchImpl: async () => ({ ok: false, status: 404 }),
      })
    ).resolves.toBeNull();
  });

  test('counts failed reservations and records cache hits and misses', async () => {
    const redis = createFakeRedis();
    const quota = new webResearch.ResearchQuotaService(redis);
    const first = await quota.reserve('org-a', 'quick', new Date('2026-09-01T00:00:00Z'));
    expect(first).toMatchObject({ used: 1, limit: 20 });
    expect(await quota.read('org-a', 'quick', new Date('2026-09-01T00:00:00Z'))).toMatchObject({
      used: 1,
      remaining: 19,
    });
    expect([...redis.values.keys()]).toEqual(['research:quota:org-a:quick:2026-09']);
    expect(redis.ttls.get('research:quota:org-a:quick:2026-09')).toBe(40 * 24 * 60 * 60);
    const cache = new webResearch.ResearchQueryCache(2);
    expect(cache.get('missing', new Date('2026-09-01T00:00:00Z'))).toBeUndefined();
    cache.set('present', { ok: true });
    expect(cache.get('present', new Date('2026-09-01T00:01:00Z'))).toEqual({ ok: true });
    expect(cache.journal()).toEqual([
      { key: 'missing', hit: false, at: '2026-09-01T00:00:00.000Z' },
      { key: 'present', hit: true, at: '2026-09-01T00:01:00.000Z' },
    ]);
  });

  test('two quota instances sharing one Redis share the monthly counter', async () => {
    const redis = createFakeRedis();
    const first = new webResearch.ResearchQuotaService(redis);
    const second = new webResearch.ResearchQuotaService(redis);
    const march = new Date('2026-03-10T12:00:00Z');

    expect(await first.reserve('org-b', 'deep', march)).toMatchObject({ used: 1, limit: 3 });
    expect(await second.reserve('org-b', 'deep', march)).toMatchObject({ used: 2, limit: 3 });
    // A restart is the same thing as a second instance here: the count is read
    // back from Redis rather than from whatever the process remembers.
    expect(await second.read('org-b', 'deep', march)).toMatchObject({
      used: 2,
      limit: 3,
      remaining: 1,
    });
    expect(redis.values.get('research:quota:org-b:deep:2026-03')).toBe('2');
  });

  test('holds the limit at exactly the configured number and releases the refused slot', async () => {
    const redis = createFakeRedis();
    const quota = new webResearch.ResearchQuotaService(redis);
    const key = 'research:quota:org-c:deep:2026-03';
    const march = new Date('2026-03-10T12:00:00Z');

    for (let index = 1; index <= webResearch.RESEARCH_MONTHLY_QUOTAS.deep; index += 1) {
      expect(await quota.reserve('org-c', 'deep', march)).toMatchObject({ used: index });
    }
    await expect(quota.reserve('org-c', 'deep', march)).rejects.toMatchObject({
      status: 429,
      code: 'RESEARCH_QUOTA_EXHAUSTED',
    });
    // The refused call must not leave the counter above the limit, or the
    // month would keep refusing after a single overshoot.
    expect(redis.values.get(key)).toBe(String(webResearch.RESEARCH_MONTHLY_QUOTAS.deep));
    // The next month is a different key, so the allowance returns on its own.
    expect(
      await quota.reserve('org-c', 'deep', new Date('2026-04-01T00:00:00Z'))
    ).toMatchObject({ used: 1 });
  });

  test('falls back to in-process counting with a warning when Redis is down', async () => {
    warnings.length = 0;
    const redis = createFakeRedis({ failWith: new Error('ECONNREFUSED') });
    const quota = new webResearch.ResearchQuotaService(redis);
    const march = new Date('2026-03-10T12:00:00Z');

    expect(await quota.reserve('org-d', 'deep', march)).toMatchObject({ used: 1, limit: 3 });
    expect(await quota.reserve('org-d', 'deep', march)).toMatchObject({ used: 2, limit: 3 });
    expect(await quota.reserve('org-d', 'deep', march)).toMatchObject({ used: 3, limit: 3 });
    await expect(quota.reserve('org-d', 'deep', march)).rejects.toMatchObject({ status: 429 });
    expect(await quota.read('org-d', 'deep', march)).toMatchObject({ used: 3, remaining: 0 });
    expect(warnings).toHaveLength(5);
    expect(warnings[0]).toContain('ECONNREFUSED');
  });

  test('the Redis stand-in counts, so a process without REDIS_URL still works', async () => {
    const mock = new redisService.MockRedis();
    expect(await mock.incr('counter')).toBe(1);
    expect(await mock.incr('counter')).toBe(2);
    expect(await mock.decr('counter')).toBe(1);
    expect(await mock.get('counter')).toBe('1');
    expect(await mock.ttl('counter')).toBe(-1);
    expect(await mock.expire('counter', 60)).toBe(1);
    expect(await mock.ttl('counter')).toBeLessThanOrEqual(60);
    expect(await mock.expire('absent', 60)).toBe(0);
    expect(await mock.ttl('absent')).toBe(-2);
  });
});
