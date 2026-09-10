'use strict';

const { loadWithMocks, REPO } = require('./helpers/load-ts-with-mocks.cjs');

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
      Logger: class {
        log() {}
        warn() {}
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

  test('counts failed reservations and records cache hits and misses', () => {
    const quota = new webResearch.ResearchQuotaService();
    const first = quota.reserve('org-a', 'quick', new Date('2026-09-01T00:00:00Z'));
    expect(first).toMatchObject({ used: 1, limit: 20 });
    expect(quota.read('org-a', 'quick', new Date('2026-09-01T00:00:00Z'))).toMatchObject({
      used: 1,
      remaining: 19,
    });
    const cache = new webResearch.ResearchQueryCache(2);
    expect(cache.get('missing', new Date('2026-09-01T00:00:00Z'))).toBeUndefined();
    cache.set('present', { ok: true });
    expect(cache.get('present', new Date('2026-09-01T00:01:00Z'))).toEqual({ ok: true });
    expect(cache.journal()).toEqual([
      { key: 'missing', hit: false, at: '2026-09-01T00:00:00.000Z' },
      { key: 'present', hit: true, at: '2026-09-01T00:01:00.000Z' },
    ]);
  });
});
