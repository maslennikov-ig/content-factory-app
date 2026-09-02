require('reflect-metadata');

const assert = require('node:assert/strict');
const test = require('node:test');
const { validate } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-lh5s`: the door was already cut on the reading side —
 * `sourceAllowed`/`evidenceFresh` in `content-context.builder.ts` accept a
 * `SEARCH_PROVIDER_RESULT` snapshot with no `ContentSource` behind it — but
 * nothing ever produced one. This suite proves the producer this task adds
 * (`ContentSourceRegistryRepository.createSearchProviderEvidence` /
 * `ContentSourceRegistryService.acceptSearchResult`) writes exactly the shape
 * the reading side already accepts: organization, a frozen excerpt and a
 * retrieval date, no `ContentSource`, no sync.
 */

const errors = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts'
);
const networkPolicy = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/network-policy.ts',
  { './errors': errors }
);
const searchEvidenceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/search-evidence.ts',
  { './errors': errors, './network-policy': networkPolicy }
);
const { normalizeSearchResultAcceptance, SEARCH_PROVIDER_RESULT_FRESHNESS_MS } =
  searchEvidenceModule;

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    './errors': errors,
    './search-evidence': searchEvidenceModule,
    './source-fetch.gateway': {
      DEFAULT_SOURCE_FETCH_BUDGETS: {
        dnsTimeoutMs: 2_000,
        totalTimeoutMs: 20_000,
        redirects: 5,
      },
    },
  }
);
const { ContentSourceRegistryRepository } = repositoryModule;

const accessPolicyModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-access-policy.ts',
  { './errors': errors }
);
const freshnessModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-freshness.ts'
);
const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.service.ts',
  {
    './errors': errors,
    './network-policy': networkPolicy,
    './source-fetch.gateway': {},
    './source-parser': { parseSourcePayload: () => undefined },
    './source-access-policy': accessPolicyModule,
    './source-freshness': freshnessModule,
    './source-registry.repository': repositoryModule,
    './search-evidence': searchEvidenceModule,
  }
);
const { ContentSourceRegistryService } = serviceModule;

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts'
);
const { AcceptSearchResultEvidenceDto } = dtoModule;

const permissionEnums = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
);
const permissionDecorators = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.ability.ts',
  { './permission.exception.class': permissionEnums }
);
const controllerModule = loadTypeScriptModule(
  'apps/backend/src/api/routes/content-source.controller.ts',
  {
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
      serviceModule,
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-source.dto':
      dtoModule,
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability':
      permissionDecorators,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      permissionEnums,
  }
);
const { ContentSourceController } = controllerModule;

// --- Section A: pure normalization -----------------------------------------

test('accepting a search result freezes a bounded excerpt, canonicalizes the URL and sets a year-long freshness window', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  const payload = normalizeSearchResultAcceptance({
    organizationId: 'org-a',
    url: 'https://EXAMPLE.com:443/article?utm=x#section',
    title: '  Example headline  ',
    excerpt: `  ${'a'.repeat(9_000)}  `,
    publishedAt: '2026-08-01T00:00:00.000Z',
    provider: 'tavily',
    now,
  });

  assert.equal(payload.organizationId, 'org-a');
  assert.equal(payload.finalCanonicalUrl, 'https://example.com/article?utm=x');
  assert.equal(payload.requestedCanonicalUrl, payload.finalCanonicalUrl);
  assert.equal(payload.normalizedTitle, 'Example headline');
  assert.equal(payload.excerpt.length, 8_000);
  assert.equal(payload.retrievalProvider, 'search-result-tavily-v1');
  assert.equal(payload.publishedAt.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(payload.observedAt.getTime(), now.getTime());
  assert.equal(
    payload.freshUntil.getTime(),
    now.getTime() + SEARCH_PROVIDER_RESULT_FRESHNESS_MS
  );
  assert.match(payload.contentHash, /^[a-f0-9]{64}$/);
});

test('an empty excerpt cannot become evidence', () => {
  assert.throws(
    () =>
      normalizeSearchResultAcceptance({
        organizationId: 'org-a',
        url: 'https://example.com/',
        excerpt: '   ',
        provider: 'tavily',
        now: new Date(),
      }),
    (error) => error.code === 'PARSE_FAILED' && error.status === 422
  );
});

test('a non-HTTPS or credentialed URL is refused the same way any registry URL is', () => {
  assert.throws(
    () =>
      normalizeSearchResultAcceptance({
        organizationId: 'org-a',
        url: 'http://example.com/',
        excerpt: 'Some text',
        provider: 'tavily',
        now: new Date(),
      }),
    (error) => error.code === 'UNSUPPORTED_PROTOCOL'
  );
  assert.throws(
    () =>
      normalizeSearchResultAcceptance({
        organizationId: 'org-a',
        url: 'https://user:pass@example.com/',
        excerpt: 'Some text',
        provider: 'tavily',
        now: new Date(),
      }),
    (error) => error.code === 'URL_CREDENTIALS'
  );
});

// --- Section B: repository writes no ContentSource, evidence via relation --

test('the producer writes a sourceless SEARCH_PROVIDER_RESULT snapshot with evidence attached by relation, not by column', async () => {
  let createArgs;
  const database = {
    sourceSnapshot: {
      create: async (args) => {
        createArgs = args;
        const evidenceInput = args.data.evidence.create[0];
        return {
          id: 'snapshot-search-1',
          organizationId: args.data.organizationId,
          sequence: args.data.sequence,
          kind: args.data.kind,
          sourceId: null,
          observedAt: args.data.observedAt,
          publishedAt: args.data.publishedAt,
          finalCanonicalUrl: args.data.finalCanonicalUrl,
          normalizedTitle: args.data.normalizedTitle,
          retrievalProvider: args.data.retrievalProvider,
          evidence: [
            {
              id: 'evidence-search-1',
              // Reading the id back out through the relation (not a plain
              // `organizationId` column) is the assertion that matters here:
              // this is the exact defect class `content-factory-next-r14b`
              // fixed in `7bf12bcc` for the manual/sync producers.
              organizationId: evidenceInput.organization.connect.id,
              excerpt: evidenceInput.excerpt,
              observedAt: evidenceInput.observedAt,
              freshUntil: evidenceInput.freshUntil,
              freshnessStatus: evidenceInput.freshnessStatus,
            },
          ],
        };
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: database },
    { model: {} }
  );

  const now = new Date('2026-08-20T10:00:00.000Z');
  const payload = normalizeSearchResultAcceptance({
    organizationId: 'org-a',
    url: 'https://example.com/found',
    title: 'Found article',
    excerpt: 'The article said exactly this.',
    provider: 'openrouter',
    now,
  });
  const created = await repository.createSearchProviderEvidence(payload);

  assert.equal(createArgs.data.kind, 'SEARCH_PROVIDER_RESULT');
  assert.equal('sourceId' in createArgs.data, false);
  assert.equal('syncRunId' in createArgs.data, false);
  assert.equal(
    createArgs.data.evidence.create[0].organization.connect.id,
    'org-a'
  );
  assert.equal('organizationId' in createArgs.data.evidence.create[0], false);
  assert.equal(created.evidence[0].organizationId, 'org-a');
  assert.equal(created.evidence[0].excerpt, 'The article said exactly this.');
  assert.equal(created.evidence[0].freshnessStatus, 'FRESH');
  // `content-factory-next-tyrk`: «найдено поиском» is the one ground the
  // product found by itself — unlike the manual/sync producers, it must NOT
  // arrive already accepted. It needs the explicit «Подтвердить» gesture
  // (`ContentFactRepository.confirmEvidence`).
  const searchAssessment =
    createArgs.data.evidence.create[0].assessment.create;
  assert.equal(searchAssessment.status, 'PROPOSED');
  assert.equal(searchAssessment.trustTier, 'UNRATED');
  assert.equal(searchAssessment.organization.connect.id, 'org-a');
  assert.equal('organizationId' in searchAssessment, false);
});

// --- Section C: service wiring ----------------------------------------------

test('the service resolves the retrieval date server-side and never trusts a client-supplied one', async () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  let repositoryPayload;
  const repository = {
    createSearchProviderEvidence: async (payload) => {
      repositoryPayload = payload;
      return {
        id: 'snapshot-1',
        finalCanonicalUrl: payload.finalCanonicalUrl,
        normalizedTitle: payload.normalizedTitle,
        publishedAt: payload.publishedAt,
        evidence: [
          {
            id: 'evidence-1',
            excerpt: payload.excerpt,
            observedAt: payload.observedAt,
            freshUntil: payload.freshUntil,
          },
        ],
      };
    },
  };
  const service = new ContentSourceRegistryService(
    repository,
    {},
    {},
    {},
    () => now
  );

  const result = await service.acceptSearchResult('org-a', {
    url: 'https://example.com/found',
    title: 'Found article',
    excerpt: 'The article said exactly this.',
    provider: 'tavily',
  });

  assert.equal(repositoryPayload.organizationId, 'org-a');
  assert.equal(repositoryPayload.observedAt.getTime(), now.getTime());
  assert.deepEqual(result, {
    evidenceId: 'evidence-1',
    sourceSnapshotId: 'snapshot-1',
    url: 'https://example.com/found',
    title: 'Found article',
    excerpt: 'The article said exactly this.',
    provider: 'tavily',
    publishedAt: null,
    retrievedAt: now.toISOString(),
    freshUntil: new Date(
      now.getTime() + SEARCH_PROVIDER_RESULT_FRESHNESS_MS
    ).toISOString(),
  });
});

// --- Section D: DTO and route wiring ---------------------------------------

test('the accept-evidence DTO requires an excerpt and a known provider', async () => {
  const missingExcerpt = Object.assign(new AcceptSearchResultEvidenceDto(), {
    url: 'https://example.com/',
    excerpt: '',
    provider: 'tavily',
  });
  const unknownProvider = Object.assign(new AcceptSearchResultEvidenceDto(), {
    url: 'https://example.com/',
    excerpt: 'Some text',
    provider: 'bing',
  });
  const valid = Object.assign(new AcceptSearchResultEvidenceDto(), {
    url: 'https://example.com/',
    excerpt: 'Some text',
    provider: 'mixed',
  });

  assert.equal((await validate(missingExcerpt)).length > 0, true);
  assert.equal((await validate(unknownProvider)).length > 0, true);
  assert.deepEqual(await validate(valid), []);
});

test('the route is an everyday AI-gated write, not an admin source-registry action', async () => {
  const calls = [];
  const controller = new ContentSourceController({
    acceptSearchResult: async (...args) => {
      calls.push(args);
      return { evidenceId: 'evidence-1' };
    },
  });

  await controller.acceptSearchResult({ id: 'org-request' }, {
    url: 'https://example.com/',
    excerpt: 'Some text',
    provider: 'tavily',
  });
  assert.deepEqual(calls, [
    ['org-request', { url: 'https://example.com/', excerpt: 'Some text', provider: 'tavily' }],
  ]);

  assert.equal(
    Reflect.getMetadata('path', ContentSourceController),
    '/content-intelligence/sources'
  );
  assert.equal(
    Reflect.getMetadata('path', ContentSourceController.prototype.acceptSearchResult),
    '/search-evidence'
  );
  assert.deepEqual(
    Reflect.getMetadata(
      permissionDecorators.CHECK_POLICIES_KEY,
      ContentSourceController.prototype.acceptSearchResult
    ),
    [[permissionEnums.AuthorizationActions.Create, permissionEnums.Sections.AI]]
  );
});

// --- Section E: the load-bearing guard --------------------------------------
//
// Ties the producer's real output shape to the reading side that already
// existed (`content-context.builder.ts`'s `sourceAllowed`/`evidenceFresh`).
// This is the assertion the task exists to make true: an accepted search
// result carries organization, excerpt and retrieval date, and the context
// builder actually selects it as evidence.

const contextSources = {
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
  './content-context.types':
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.types.ts',
  './content-context.errors':
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
};
const { ContentContextBuilderV1 } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts',
  {
    './content-context.repository': {
      ContentContextRepository: class ContentContextRepository {},
    },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
      { BrandProfileContextService: class BrandProfileContextService {} },
  },
  { sources: contextSources }
);

class MemoryContextRepository {
  constructor(standaloneEvidence) {
    this.standaloneEvidence = standaloneEvidence;
    this.sequence = 0;
  }
  async findCandidates(organizationId) {
    return {
      facts: [],
      evidence: this.standaloneEvidence.filter(
        (item) => item.organizationId === organizationId
      ),
    };
  }
  async createSnapshot(organizationId, snapshot, items) {
    return structuredClone({
      ...snapshot,
      id: `context-${++this.sequence}`,
      organizationId,
      items,
    });
  }
}

const neutralProfile = {
  schemaVersion: 'brand-profile-context/v1',
  selection: 'active',
  applied: { mode: 'neutral_fallback', reason: 'no_active_profile' },
  warnings: [],
};

/** Runs the producer's real code (normalize -> repository write) and turns
 * its output into the join shape `ContentContextRepository.findCandidates`
 * would hand the builder — the same shape section B proved the repository
 * writes, carried one step further into the reading side. */
async function acceptAndJoin(now) {
  const database = {
    sourceSnapshot: {
      create: async (args) => {
        const evidenceInput = args.data.evidence.create[0];
        return {
          id: 'snapshot-guard-1',
          kind: args.data.kind,
          normalizedTitle: args.data.normalizedTitle,
          finalCanonicalUrl: args.data.finalCanonicalUrl,
          publishedAt: args.data.publishedAt,
          evidence: [
            {
              id: 'evidence-guard-1',
              organizationId: evidenceInput.organization.connect.id,
              excerpt: evidenceInput.excerpt,
              observedAt: evidenceInput.observedAt,
              freshUntil: evidenceInput.freshUntil,
              freshnessStatus: evidenceInput.freshnessStatus,
            },
          ],
        };
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: database },
    { model: {} }
  );
  const payload = normalizeSearchResultAcceptance({
    organizationId: 'org-a',
    url: 'https://example.com/found',
    title: 'Found article',
    excerpt: 'On the day it was read, the page said exactly this.',
    provider: 'tavily',
    now,
  });
  const created = await repository.createSearchProviderEvidence(payload);
  const snap = created;
  const ev = created.evidence[0];
  return {
    id: ev.id,
    organizationId: ev.organizationId,
    sourceSnapshotId: snap.id,
    excerpt: ev.excerpt,
    excerptHash: null,
    exposure: 'PUBLIC',
    tombstone: null,
    observedAt: ev.observedAt,
    freshUntil: ev.freshUntil,
    freshnessStatus: ev.freshnessStatus,
    explicit: true,
    // A human still assesses trust separately (`assessEvidence`, gated
    // `Sections.ADMIN`) — this fixture represents that step already having
    // happened, the same as every other evidence kind requires before it can
    // be selected.
    assessment: { status: 'ACCEPTED', trustTier: 'UNRATED', trustPolicyVersion: 1 },
    snapshot: {
      id: snap.id,
      organizationId: ev.organizationId,
      kind: snap.kind,
      normalizedTitle: snap.normalizedTitle,
      finalCanonicalUrl: snap.finalCanonicalUrl,
      publishedAt: snap.publishedAt,
      observedAt: ev.observedAt,
      freshUntil: null,
      purgedAt: null,
      source: undefined,
    },
  };
}

test('an accepted search result is selected as real, checkable evidence by the context builder', async () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  const candidate = await acceptAndJoin(now);
  const builder = new ContentContextBuilderV1(
    new MemoryContextRepository([candidate]),
    { resolve: async () => neutralProfile },
    () => now
  );

  const context = await builder.build('org-a', {
    consumer: 'EDITOR',
    purpose: 'DRAFT_ASSIST',
    query: 'what the article said',
    language: 'en',
    freshnessMode: 'PREFER_FRESH',
    asOf: now.toISOString(),
    brandProfileSelection: { mode: 'active' },
  });

  assert.equal(context.status, 'READY');
  assert.equal(context.generationPolicy, 'ALLOW_GROUNDED');
  assert.equal(context.evidence.length, 1);
  assert.equal(
    context.evidence[0].excerpt,
    'On the day it was read, the page said exactly this.'
  );
  assert.equal(context.evidence[0].url, 'https://example.com/found');
  assert.equal(
    context.evidence[0].retrievedAt,
    now.toISOString()
  );
  assert.deepEqual(context.rejected, []);
});
