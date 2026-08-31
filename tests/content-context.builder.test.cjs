require('reflect-metadata');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = globalThis.test || require('node:test');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const builderPath = path.resolve(
  __dirname,
  '../libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts'
);
const factServicePath = path.resolve(
  __dirname,
  '../libraries/nestjs-libraries/src/content-intelligence/context/content-fact.service.ts'
);
const controllerPath = path.resolve(
  __dirname,
  '../apps/backend/src/api/routes/content-context.controller.ts'
);

test('ContentContextBuilderV1 production boundary exists', () => {
  assert.equal(
    fs.existsSync(builderPath),
    true,
    'ContentContextBuilderV1 must be implemented in the shared content-intelligence domain'
  );
});

test('authenticated context/fact controller production boundary exists', () => {
  assert.equal(
    fs.existsSync(controllerPath),
    true,
    'ContentContextController must expose the tenant-owned HTTP boundary'
  );
});

if (fs.existsSync(controllerPath)) {
  test('HTTP boundary keeps organization server-owned and applies AI/admin policies', () => {
    const controllerSource = fs.readFileSync(controllerPath, 'utf8');
    const dtoSource = fs.readFileSync(
      path.resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/dtos/content-intelligence/content-context.dto.ts'
      ),
      'utf8'
    );

    assert.match(controllerSource, /@Get\('\/contexts\/:id'\)/);
    assert.match(controllerSource, /@Post\('\/contexts'\)/);
    assert.match(controllerSource, /Sections\.AI/);
    assert.match(controllerSource, /Sections\.ADMIN/);
    assert.doesNotMatch(dtoSource, /organizationId/);
  });
}

test('tenant-scoped ContentFactService production boundary exists', () => {
  assert.equal(
    fs.existsSync(factServicePath),
    true,
    'ContentFactService must own deterministic fact/evidence commands'
  );
});

if (fs.existsSync(factServicePath)) {
  const { ContentFactService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/context/content-fact.service.ts',
    {
      './content-fact.repository': {
        ContentFactRepository: class ContentFactRepository {},
      },
    },
    {
      sources: {
        './content-context.errors':
          'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
      },
      resolve(request) {
        if (
          /(openai|ai\.usage|undici|axios|node-fetch|web\.research)/i.test(
            request
          )
        ) {
          throw new Error(
            `fact command imported forbidden dependency: ${request}`
          );
        }
        return undefined;
      },
    }
  );

  test('fact and evidence commands derive hashes and tenant from server arguments', async () => {
    const calls = [];
    const repository = {
      createFact: async (...args) => {
        calls.push(['createFact', ...args]);
        return args[2];
      },
      linkEvidence: async (...args) => {
        calls.push(['linkEvidence', ...args]);
        return { id: 'link-1', reviewStatus: 'PROPOSED' };
      },
    };
    const service = new ContentFactService(repository);

    const created = await service.createFact('org-a', 'user-a', {
      claimKey: 'product:cf|pricing.currency',
      statement: 'The currency is EUR.',
      language: 'en',
      valueText: ' EUR  ',
      temporalKind: 'CURRENT',
      freshUntil: '2026-08-21T10:00:00.000Z',
    });
    await service.linkEvidence('org-a', 'user-a', 'fact-1', {
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
    });

    assert.equal(calls[0][1], 'org-a');
    assert.equal(calls[0][2], 'user-a');
    assert.equal(created.status, 'UNVERIFIED');
    assert.equal(created.valueText, 'EUR');
    assert.match(created.valueHash, /^[a-f0-9]{64}$/);
    assert.match(created.dedupeKey, /^[a-f0-9]{64}$/);
    assert.deepEqual(calls[1], [
      'linkEvidence',
      'org-a',
      'user-a',
      'fact-1',
      { evidenceId: 'evidence-1', stance: 'SUPPORTS' },
    ]);
  });
}

if (fs.existsSync(builderPath)) {
  const sources = {
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
        {
          BrandProfileContextService: class BrandProfileContextService {},
        },
    },
    {
      sources,
      resolve(request) {
        if (
          /(openai|ai\.usage|undici|axios|node-fetch|web\.research)/i.test(
            request
          )
        ) {
          throw new Error(
            `deterministic context imported forbidden dependency: ${request}`
          );
        }
        return undefined;
      },
    }
  );
  const { ContentContextRepository } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class PrismaRepository {},
        PrismaTransaction: class PrismaTransaction {},
      },
    },
    { sources }
  );
  const { ContentFactRepository } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/context/content-fact.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class PrismaRepository {},
        PrismaTransaction: class PrismaTransaction {},
      },
    },
    { sources }
  );

  const now = new Date('2026-08-20T10:00:00.000Z');
  const future = new Date('2026-08-21T10:00:00.000Z');
  const past = new Date('2026-08-19T10:00:00.000Z');

  function evidence(id, overrides = {}) {
    return {
      id,
      organizationId: 'org-a',
      sourceSnapshotId: `snapshot-${id}`,
      excerpt: `Evidence excerpt ${id}`,
      excerptHash: `hash-${id}`,
      exposure: 'PUBLIC',
      tombstone: null,
      observedAt: now,
      freshUntil: future,
      freshnessStatus: 'FRESH',
      assessment: {
        status: 'ACCEPTED',
        trustTier: 'OFFICIAL',
        trustPolicyVersion: 1,
      },
      snapshot: {
        id: `snapshot-${id}`,
        organizationId: 'org-a',
        normalizedTitle: `Title ${id}`,
        finalCanonicalUrl: `https://example.com/${id}?secret=hidden`,
        publishedAt: now,
        observedAt: now,
        freshUntil: future,
        purgedAt: null,
        source: {
          id: `source-${id}`,
          organizationId: 'org-a',
          currentSnapshotId: `snapshot-${id}`,
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          freshUntil: future,
          archivedAt: null,
          purgedAt: null,
        },
      },
      ...overrides,
    };
  }

  function fact(id, overrides = {}) {
    const support = evidence(`e-${id}`);
    return {
      id,
      organizationId: 'org-a',
      claimKey: `claim-${id}`,
      statement: `Verified fact ${id}`,
      temporalKind: 'CURRENT',
      status: 'VERIFIED',
      verifiedAt: now,
      freshUntil: future,
      explicit: false,
      lexicalScore: 1,
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: support,
        },
      ],
      ...overrides,
    };
  }

  class MemoryRepository {
    constructor(facts = [], standaloneEvidence = []) {
      this.facts = facts;
      this.standaloneEvidence = standaloneEvidence;
      this.snapshots = new Map();
      this.sequence = 0;
      this.calls = [];
    }

    async findCandidates(organizationId, request) {
      this.calls.push({ method: 'findCandidates', organizationId, request });
      return {
        facts: this.facts.filter(
          (item) => item.organizationId === organizationId
        ),
        evidence: this.standaloneEvidence.filter(
          (item) => item.organizationId === organizationId
        ),
      };
    }

    async createSnapshot(organizationId, snapshot, items) {
      const id = `context-${++this.sequence}`;
      const stored = structuredClone({
        ...snapshot,
        id,
        organizationId,
        items,
      });
      this.snapshots.set(`${organizationId}:${id}`, stored);
      return stored;
    }

    async getSnapshot(organizationId, id) {
      return structuredClone(
        this.snapshots.get(`${organizationId}:${id}`) || null
      );
    }
  }

  const neutralProfile = {
    schemaVersion: 'brand-profile-context/v1',
    selection: 'active',
    applied: { mode: 'neutral_fallback', reason: 'no_active_profile' },
    warnings: [],
  };

  function makeBuilder(repository, profile = neutralProfile) {
    return new ContentContextBuilderV1(
      repository,
      { resolve: async () => profile },
      () => now
    );
  }

  test('repository treats an explicit foreign id as not-found and filters every lookup by tenant', async () => {
    const whereClauses = [];
    const client = {
      contentFact: {
        findMany: async ({ where }) => {
          whereClauses.push(where);
          return [];
        },
      },
      contentSource: { findMany: async () => [] },
      sourceEvidence: { findMany: async () => [] },
    };
    const repository = new ContentContextRepository(
      { model: client },
      { model: {} }
    );

    await assert.rejects(
      repository.findCandidates('org-a', {
        ...request(),
        factIds: ['fact-from-org-b'],
      }),
      (error) =>
        error.code === 'CONTENT_CONTEXT_NOT_FOUND' && error.status === 404
    );
    assert.equal(
      whereClauses.every((where) => where.organizationId === 'org-a'),
      true
    );
  });

  test('a member proposal cannot downgrade an already reviewed evidence link', async () => {
    const accepted = {
      id: 'link-1',
      organizationId: 'org-a',
      factId: 'fact-1',
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
      reviewStatus: 'ACCEPTED',
    };
    let writes = 0;
    const client = {
      contentFact: { findFirst: async () => ({ id: 'fact-1' }) },
      sourceEvidence: { findFirst: async () => ({ id: 'evidence-1' }) },
      contentFactEvidence: {
        findFirst: async () => accepted,
        upsert: async () => {
          writes += 1;
          return { ...accepted, reviewStatus: 'PROPOSED' };
        },
      },
    };
    const repository = new ContentFactRepository(
      { model: client },
      { model: { $transaction: async (work) => work(client) } }
    );

    const result = await repository.linkEvidence(
      'org-a',
      'member-a',
      'fact-1',
      { evidenceId: 'evidence-1', stance: 'SUPPORTS' }
    );

    assert.equal(result.reviewStatus, 'ACCEPTED');
    assert.equal(writes, 0);
  });

  function request(overrides = {}) {
    return {
      consumer: 'GENERATOR',
      purpose: 'DRAFT_CREATE',
      query: 'verified product fact',
      language: 'en',
      freshnessMode: 'PREFER_FRESH',
      asOf: now.toISOString(),
      brandProfileSelection: { mode: 'active' },
      ...overrides,
    };
  }

  test('build is deterministic, tenant-scoped and bounded to 8 facts, 8 evidence and 12k chars', async () => {
    const corpus = Array.from({ length: 12 }, (_, index) =>
      fact(String(index + 1).padStart(2, '0'), {
        explicit: index === 4,
        lexicalScore: index % 3,
        statement: `Fact ${index} ${'x'.repeat(900)}`,
        evidenceLinks: [
          {
            stance: 'SUPPORTS',
            reviewStatus: 'ACCEPTED',
            evidence: evidence(`e-${index}`, {
              excerpt: `Excerpt ${index} ${'y'.repeat(1000)}`,
            }),
          },
        ],
      })
    );
    corpus.push(fact('foreign', { organizationId: 'org-b' }));
    const repository = new MemoryRepository(corpus);
    const builder = makeBuilder(repository);

    const first = await builder.build('org-a', request());
    const second = await builder.build('org-a', request());

    assert.equal(first.facts.length <= 8, true);
    assert.equal(first.evidence.length <= 8, true);
    assert.equal(JSON.stringify(first.facts).includes('foreign'), false);
    assert.equal(
      first.evidence.every((item) => item.excerpt.length <= 800),
      true
    );
    assert.equal(first.renderedCharacterCount <= 12_000, true);
    assert.deepEqual(
      first.facts.map(({ citationId, factId, evidenceCitationIds }) => ({
        citationId,
        factId,
        evidenceCitationIds,
      })),
      second.facts.map(({ citationId, factId, evidenceCitationIds }) => ({
        citationId,
        factId,
        evidenceCitationIds,
      }))
    );
    assert.notEqual(
      first.contentContextSnapshotId,
      second.contentContextSnapshotId
    );
    assert.deepEqual(
      await builder.get('org-a', first.contentContextSnapshotId),
      first
    );
    await assert.rejects(
      builder.get('org-b', first.contentContextSnapshotId),
      (error) =>
        error.code === 'CONTENT_CONTEXT_NOT_FOUND' && error.status === 404
    );
  });

  test('REQUIRE_CURRENT fails closed before the supplied model admission callback', async () => {
    const stale = fact('stale', {
      freshUntil: past,
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: evidence('stale-evidence', { freshUntil: past }),
        },
      ],
    });
    const builder = makeBuilder(new MemoryRepository([stale]));
    const context = await builder.build(
      'org-a',
      request({ freshnessMode: 'REQUIRE_CURRENT' })
    );
    let modelAdmissions = 0;

    assert.equal(context.status, 'BLOCKED_STALE');
    assert.equal(context.generationPolicy, 'EVIDENCE_REQUIRED');
    assert.equal(context.errorCode, 'CONTENT_EVIDENCE_REQUIRED');
    await assert.rejects(
      builder.withModelAdmission(context, async () => {
        modelAdmissions += 1;
      }),
      (error) =>
        error.code === 'CONTENT_EVIDENCE_REQUIRED' && error.status === 409
    );
    assert.equal(modelAdmissions, 0);
  });

  test('latest source validation receipt is the freshness authority for reused immutable evidence', async () => {
    const refreshedEvidence = evidence('refreshed');
    refreshedEvidence.freshUntil = past;
    refreshedEvidence.freshnessStatus = 'STALE';
    refreshedEvidence.snapshot.freshUntil = past;
    refreshedEvidence.snapshot.source.freshUntil = future;
    const refreshedFact = fact('refreshed-fact', {
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: refreshedEvidence,
        },
      ],
    });
    const staleReceiptEvidence = evidence('stale-receipt');
    staleReceiptEvidence.snapshot.source.freshUntil = past;
    const staleReceiptFact = fact('stale-receipt-fact', {
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: staleReceiptEvidence,
        },
      ],
    });

    const refreshed = await makeBuilder(
      new MemoryRepository([refreshedFact])
    ).build('org-a', request({ freshnessMode: 'REQUIRE_CURRENT' }));
    const stale = await makeBuilder(
      new MemoryRepository([staleReceiptFact])
    ).build('org-a', request({ freshnessMode: 'REQUIRE_CURRENT' }));

    assert.equal(refreshed.status, 'READY');
    assert.equal(refreshed.facts[0].factId, 'refreshed-fact');
    assert.equal(stale.status, 'BLOCKED_STALE');
    assert.equal(stale.errorCode, 'CONTENT_EVIDENCE_REQUIRED');
  });

  test('registered evidence without a matching current snapshot fails closed', async () => {
    const missingPointer = evidence('missing-pointer');
    missingPointer.snapshot.source.currentSnapshotId = null;
    const context = await makeBuilder(
      new MemoryRepository([
        fact('missing-pointer-fact', {
          evidenceLinks: [
            {
              stance: 'SUPPORTS',
              reviewStatus: 'ACCEPTED',
              evidence: missingPointer,
            },
          ],
        }),
      ])
    ).build('org-a', request({ freshnessMode: 'REQUIRE_CURRENT' }));

    assert.equal(context.status, 'UNAVAILABLE');
    assert.equal(context.errorCode, 'CONTENT_EVIDENCE_REQUIRED');
  });

  test('shuffled evidence links produce the same citations and selection hash', async () => {
    const firstEvidence = evidence('stable-a');
    const secondEvidence = evidence('stable-b');
    const makeFact = (links) =>
      fact('stable-fact', {
        evidenceLinks: links.map((item) => ({
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: item,
        })),
      });
    const first = await makeBuilder(
      new MemoryRepository([makeFact([secondEvidence, firstEvidence])])
    ).build('org-a', request());
    const second = await makeBuilder(
      new MemoryRepository([makeFact([firstEvidence, secondEvidence])])
    ).build('org-a', request());

    assert.deepEqual(first.facts, second.facts);
    assert.deepEqual(first.evidence, second.evidence);
    assert.equal(first.selectionHash, second.selectionHash);
  });

  test('review and assessment never revive terminal facts', async () => {
    for (const terminalStatus of ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED']) {
      let factUpdates = 0;
      const terminalFact = {
        ...fact(`terminal-${terminalStatus}`),
        status: terminalStatus,
      };
      const client = {
        contentFactEvidence: {
          updateMany: async () => ({ count: 1 }),
          findMany: async () => [{ factId: terminalFact.id }],
        },
        contentEvidenceAssessment: {
          upsert: async ({ create }) => create,
        },
        sourceEvidence: {
          findFirst: async () => ({
            id: terminalFact.evidenceLinks[0].evidence.id,
          }),
        },
        contentFact: {
          findFirst: async () => structuredClone(terminalFact),
          updateMany: async () => {
            factUpdates += 1;
            return { count: 1 };
          },
        },
      };
      const repository = new ContentFactRepository(
        { model: client },
        { model: { $transaction: async (work) => work(client) } }
      );

      const reviewed = await repository.reviewEvidenceLink(
        'org-a',
        'reviewer-a',
        terminalFact.id,
        terminalFact.evidenceLinks[0].evidence.id,
        'ACCEPTED',
        now
      );
      await repository.assessEvidence(
        'org-a',
        'reviewer-a',
        terminalFact.evidenceLinks[0].evidence.id,
        { trustTier: 'OFFICIAL', status: 'ACCEPTED' },
        now
      );

      assert.equal(reviewed.status, terminalStatus);
      assert.equal(factUpdates, 0, `${terminalStatus} must remain terminal`);
    }
  });

  test('accepted contradiction blocks a whole claim group without choosing by trust tier', async () => {
    const contradicted = fact('conflict', {
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: evidence('support', {
            assessment: {
              status: 'ACCEPTED',
              trustTier: 'OWNER_VERIFIED',
              trustPolicyVersion: 1,
            },
          }),
        },
        {
          stance: 'CONTRADICTS',
          reviewStatus: 'ACCEPTED',
          evidence: evidence('contradiction'),
        },
      ],
    });
    const builder = makeBuilder(new MemoryRepository([contradicted]));

    const context = await builder.build(
      'org-a',
      request({ freshnessMode: 'REQUIRE_CURRENT' })
    );

    assert.equal(context.status, 'BLOCKED_CONFLICT');
    assert.equal(context.facts.length, 0);
    assert.equal(
      JSON.stringify(context.rejected),
      JSON.stringify([{ itemId: 'conflict', reason: 'CONFLICTED' }])
    );
  });

  test('historical round-trip redacts URL and excerpt after source removal', async () => {
    const item = fact('removed-after-build');
    const repository = new MemoryRepository([item]);
    const builder = makeBuilder(repository);
    const built = await builder.build('org-a', request());
    const stored = repository.snapshots.get(
      `org-a:${built.contentContextSnapshotId}`
    );
    stored.items.find((entry) => entry.evidenceId).evidence.tombstone =
      'SOURCE_REMOVED';
    stored.items.find(
      (entry) => entry.evidenceId
    ).evidence.snapshot.source.archivedAt = now;

    const rendered = await builder.get('org-a', built.contentContextSnapshotId);

    assert.equal(rendered.evidence[0].title, 'SOURCE_REMOVED');
    assert.equal(rendered.evidence[0].excerpt, 'SOURCE_REMOVED');
    assert.equal(rendered.evidence[0].url, null);
  });

  test('context GET renders frozen fact payload and citation links after live fact mutation', async () => {
    const repository = new MemoryRepository([fact('frozen')]);
    const builder = makeBuilder(repository);
    const built = await builder.build('org-a', request());
    const original = built.facts[0];
    const stored = repository.snapshots.get(
      `org-a:${built.contentContextSnapshotId}`
    );
    const liveFactItem = stored.items.find(
      (entry) => entry.factId === 'frozen'
    );
    liveFactItem.fact.statement = 'Mutated after build';
    liveFactItem.fact.temporalKind = 'TIMELESS';
    liveFactItem.fact.verifiedAt = new Date('2030-01-01T00:00:00.000Z');
    liveFactItem.fact.freshUntil = new Date('2030-01-02T00:00:00.000Z');
    liveFactItem.fact.evidenceLinks = [];

    const rendered = await builder.get('org-a', built.contentContextSnapshotId);

    assert.equal(rendered.facts[0].statement, original.statement);
    assert.equal(rendered.facts[0].temporalKind, original.temporalKind);
    assert.equal(rendered.facts[0].verifiedAt, original.verifiedAt);
    assert.equal(rendered.facts[0].freshUntil, original.freshUntil);
    assert.equal(
      JSON.stringify(rendered.facts[0].evidenceCitationIds),
      JSON.stringify(original.evidenceCitationIds)
    );
  });
}
