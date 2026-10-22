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
    // Writing doors are the editor's since 05.09.2026 (content-factory-next-fn33.90).
    assert.match(controllerSource, /Sections\.EDITOR/);
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
        // `content-factory-next-odb8.1`: `listFacts` derives the witness
        // screen's topic filter from the radar's own `claimKey` split
        // rather than a second parser — real source, not a stub, so the
        // split stays the one the radar actually runs.
        '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.radar':
          'libraries/nestjs-libraries/src/content-intelligence/brief/content-brief.radar.ts',
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
      freshUntil: '2099-08-21T10:00:00.000Z',
    });
    await service.linkEvidence('org-a', 'user-a', 'fact-1', {
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
    });

    assert.equal(calls[0][1], 'org-a');
    assert.equal(calls[0][2], 'user-a');
    // «Ваше слово» (`content-factory-next-tyrk`, owner decision 02.09.2026):
    // a fact typed here has no evidence yet by construction, so it is
    // verified on the person's own say-so at the moment they created it.
    assert.equal(created.status, 'VERIFIED');
    assert.ok(created.verifiedAt instanceof Date);
    assert.equal(created.valueText, 'EUR');
    assert.match(created.valueHash, /^[a-f0-9]{64}$/);
    assert.match(created.dedupeKey, /^[a-f0-9]{64}$/);
    assert.equal(calls[1][0], 'linkEvidence');
    assert.deepEqual(calls[1].slice(1, 5), [
      'org-a',
      'user-a',
      'fact-1',
      { evidenceId: 'evidence-1', stance: 'SUPPORTS' },
    ]);
    // `linkEvidence` now carries its own `now` for the accepted-assessment
    // path (`ContentFactRepository.confirmEvidence`'s sibling write).
    assert.ok(calls[1][5] instanceof Date);
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

  test('explicit supporting quotes survive offset 800 and snapshot readback under the unchanged total budget', async () => {
    const late = 'The shared calendar launched on 17 October.';
    const first = evidence('selected', { excerpt: `${'Source preamble. '.repeat(100)}${late}` });
    const other = evidence('other', { excerpt: 'Other support. '.repeat(120) });
    const ranked = evidence('ranked', { excerpt: 'Ranked page. '.repeat(150) });
    const repository = new MemoryRepository([], [first, other, ranked]);
    const builder = makeBuilder(repository);
    const built = await builder.build('org-a', request({ userMaterialEvidenceIds: ['selected', 'other'] }));
    assert.ok(built.evidence.find(item => item.evidenceId === 'selected').excerpt.includes(late));
    assert.equal(built.evidence.find(item => item.evidenceId === 'ranked').excerpt.length, 800);
    assert.equal(built.evidence.length, 3);
    assert.ok(built.renderedCharacterCount <= 12_000);
    const read = await builder.get('org-a', built.contentContextSnapshotId);
    assert.deepEqual(read.evidence, built.evidence);
    const legacy = repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`);
    legacy.selectionAlgorithmVersion = 1;
    const old = await builder.get('org-a', built.contentContextSnapshotId);
    assert.equal(old.evidence.find(item => item.evidenceId === 'selected').excerpt.length, 800);
  });

  function pieceProofFixture() {
    const quotes = Array.from({ length: 7 }, (_, index) => ({
      evidenceId: `piece-${index % 4}`,
      sourceUrl: `https://example.com/piece-${index % 4}`,
      quote: `Release ${index} preserves its dated qualification and source meaning.`,
      statement: `Selected claim ${index}`,
    }));
    const pages = Array.from({ length: 9 }, (_, index) => {
      const support = quotes.filter(item => item.evidenceId === `piece-${index}`)
        .map(item => item.quote).join('\n\n');
      return evidence(`piece-${index}`, { excerpt:
        `${'Unrelated page navigation. '.repeat(70)}\n\n${support}\n\n${'Background. '.repeat(70)}\n\nReleaseAnchor${index} changed this week.\n\n${'Footer. '.repeat(200)}` });
    });
    return { quotes, pages, input: request({
      userMaterialEvidenceIds: pages.map(item => item.id),
      pieceEvidence: {
        version: 'piece-evidence/v1',
        core: pages.map((_, index) => `ReleaseAnchor${index}`).join(' '),
        quotes: [...quotes, ...pages.map(item => ({
          evidenceId: item.id, sourceUrl: `https://example.com/${item.id}`,
          quote: item.excerpt, statement: item.excerpt,
        }))],
      },
    }) };
  }

  test('piece proof packing keeps all seven late semantic quotes and nine sources beside a 7k voice, including after reload', async () => {
    const { pages, quotes, input } = pieceProofFixture();
    const profile = { ...neutralProfile, effectiveVoice: { examples: ['v'.repeat(7_000)] } };
    const repository = new MemoryRepository([], pages);
    const builder = makeBuilder(repository, profile);
    const built = await builder.build('org-a', input);
    const { materialSupport } = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
    assert.equal(built.evidence.length, 9);
    for (const quote of quotes) assert.ok(materialSupport(quote, built), quote.statement);
    assert.ok(built.evidence.some(item => item.excerpt.includes('ReleaseAnchor8')));
    assert.ok(built.evidence.every(item => item.literalSpans?.length));
    assert.ok(JSON.stringify(profile.effectiveVoice).length + built.evidence.reduce((n, item) => n + item.excerpt.length, 0) <= 64_000);
    assert.equal(repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`).selectionAlgorithmVersion, 3);
    const reread = await builder.get('org-a', built.contentContextSnapshotId);
    assert.deepEqual(reread.evidence, built.evidence);
    for (const quote of quotes) assert.ok(materialSupport(quote, reread));
    assert.deepEqual(pages, repository.standaloneEvidence, 'raw evidence remains unchanged');
  });

  test('piece proof preflight rejects forged quotes, wrong URLs and foreign evidence before any snapshot is saved', async () => {
    for (const mismatch of [
      { quote: 'A fabricated date and opposite outcome.' },
      { sourceUrl: 'https://other.example/wrong-source' },
      { evidenceId: 'foreign-evidence' },
    ]) {
      const { pages, input } = pieceProofFixture();
      input.pieceEvidence.quotes[0] = { ...input.pieceEvidence.quotes[0], ...mismatch };
      const repository = new MemoryRepository([], pages);
      await assert.rejects(makeBuilder(repository).build('org-a', input), error =>
        error.code === 'CONTENT_EVIDENCE_REQUIRED' && error.missingRequirements?.length > 0);
      assert.equal(repository.snapshots.size, 0);
    }
  });

  function completeCorpusFixture(count) {
    const quotes = Array.from({ length: count }, (_, index) => ({
      evidenceId: `complete-${String(index).padStart(2, '0')}`,
      sourceUrl: `https://example.com/complete-${String(index).padStart(2, '0')}`,
      quote: `Essential proof ${index} preserves the selected claim.`,
      statement: `Selected claim ${index}`,
    }));
    const pages = quotes.map((quote, index) => evidence(quote.evidenceId, { excerpt:
      (`PageAnchor${index}\u0000\n`.padEnd(2_000, 'x') + quote.quote).padEnd(4_800, 'y')
        .concat(`\nRemote qualification ${index}: only eligible managed accounts in the stated region.\n`).padEnd(5_100, 'z'),
    }));
    const profile = { ...neutralProfile, effectiveVoice: { examples: ['v'.repeat(7_000)] } };
    return { pages, quotes, profile, input: request({
      userMaterialEvidenceIds: pages.map(page => page.id),
      pieceEvidence: { version: 'piece-evidence/v1', core: 'PageAnchor0 selected changes', quotes },
    }) };
  }

  test('an entire selected corpus fitting the piece budget retains every full source and distant qualifier after reload', async () => {
    const { pages, quotes, profile, input } = completeCorpusFixture(11);
    const repository = new MemoryRepository([], pages);
    const builder = makeBuilder(repository, profile);
    const built = await builder.build('org-a', input);
    const stored = repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`);
    assert.equal(built.evidence.length, pages.length);
    for (const page of pages) {
      const rendered = built.evidence.find(item => item.evidenceId === page.id);
      const sanitized = page.excerpt.replace(/\u0000/g, '');
      assert.ok(rendered.excerpt === sanitized, `${page.id} should retain the entire source, including its distant qualifier`);
      assert.deepEqual(rendered.literalSpans, [sanitized]);
      assert.deepEqual(stored.items.find(item => item.evidenceId === page.id).evidenceProjection.spans,
        [{ start: 0, end: page.excerpt.length }]);
    }
    assert.equal(stored.maxRenderedCharacters, 64_000);
    assert.ok(built.renderedCharacterCount <= 64_000);
    assert.deepEqual((await builder.get('org-a', built.contentContextSnapshotId)).evidence, built.evidence);
    const { materialSupport } = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
    for (const quote of quotes) assert.ok(materialSupport(quote, built));
    assert.deepEqual(repository.standaloneEvidence, pages, 'whole source projections must leave raw evidence unchanged');
  });

  test('an oversized selected corpus keeps bounded fair windows and every mandatory quote instead of full pages', async () => {
    const { pages, quotes, profile, input } = completeCorpusFixture(16);
    assert.ok(JSON.stringify(profile.effectiveVoice).length + pages.reduce((n, page) => n + page.excerpt.length, 0) > 64_000);
    const repository = new MemoryRepository([], pages);
    const built = await makeBuilder(repository, profile).build('org-a', input);
    const { materialSupport } = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
    assert.equal(built.evidence.length, 16);
    for (const quote of quotes) assert.ok(materialSupport(quote, built));
    for (const item of built.evidence) {
      assert.ok(item.excerpt.length <= 2_600, 'the existing 2400-character background and essential spans remain bounded');
      assert.ok(item.excerpt.length < pages.find(page => page.id === item.evidenceId).excerpt.length);
    }
    assert.ok(built.renderedCharacterCount <= 64_000);
    assert.deepEqual((await makeBuilder(repository, profile).get('org-a', built.contentContextSnapshotId)).evidence, built.evidence);
  });

  test('long semantic quotes remain mandatory when the stored registry excerpt is exactly that quote', async () => {
    const { materialSupport } = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
    for (const length of [1025, 1600, 2000]) {
      const quote = 'A documented release preserves this important qualification. '.repeat(40).slice(0, length);
      const hint = { evidenceId: 'semantic-quote', sourceUrl: 'https://example.com/semantic-quote', quote, statement: 'A short semantic paraphrase.' };
      const repository = new MemoryRepository([], [evidence('semantic-quote', { excerpt: quote })]);
      const built = await makeBuilder(repository).build('org-a', request({
        userMaterialEvidenceIds: [hint.evidenceId],
        pieceEvidence: { version: 'piece-evidence/v1', core: hint.statement, quotes: [hint] },
      }));
      assert.ok(materialSupport(hint, built), `the complete ${length}-character semantic quote is required`);
    }
  });

  test('a complete selected page whose statement is the page is compacted into relevant literal background', async () => {
    const raw = `${'Navigation. '.repeat(710)}SourceFactAnchor changed this week. ${'Footer. '.repeat(80)}`;
    assert.ok(raw.length > 8_000, 'the page must exceed the existing per-source limit to require compaction');
    const page = evidence('whole-page', { excerpt: raw });
    const repository = new MemoryRepository([], [page]);
    const built = await makeBuilder(repository).build('org-a', request({
      userMaterialEvidenceIds: [page.id], pieceEvidence: { version: 'piece-evidence/v1', core: 'SourceFactAnchor',
        quotes: [{ evidenceId: page.id, sourceUrl: 'https://example.com/whole-page', quote: raw, statement: raw }] },
    }));
    assert.ok(built.evidence[0].excerpt.includes('SourceFactAnchor'));
    assert.ok(built.evidence[0].excerpt.length < raw.length);
    assert.equal(page.excerpt, raw);
  });

  test('a short source fitting its fair allocation is retained whole instead of cropped to an 800-character window', async () => {
    const raw = `A release heading. ${'Background context. '.repeat(70)}Final qualification remains available.`;
    const page = evidence('short-complete', { excerpt: raw });
    const built = await makeBuilder(new MemoryRepository([], [page])).build('org-a', request({
      userMaterialEvidenceIds: [page.id], pieceEvidence: { version: 'piece-evidence/v1', core: 'release qualification',
        quotes: [{ evidenceId: page.id, sourceUrl: 'https://example.com/short-complete', quote: raw, statement: raw }] },
    }));
    assert.ok(raw.length > 1024 && raw.length < 2400);
    assert.equal(built.evidence[0].excerpt, raw);
  });

  test('larger fair source windows retain separated dated headings with their associated release details', async () => {
    const first = '## 14 October\nAuroraBoard adds shared notes.';
    const second = '## 16 October\nLumenDeck adds presentation slides.';
    const raw = `${'Navigation. '.repeat(30)}${first}\n${'Unrelated context. '.repeat(60)}${second}\n${'Footer. '.repeat(1_100)}`;
    assert.ok(raw.length > 8_000, 'the page must require a bounded background window');
    const page = evidence('dated-releases', { excerpt: raw });
    const repository = new MemoryRepository([], [page]);
    const built = await makeBuilder(repository).build('org-a', request({
      userMaterialEvidenceIds: [page.id], pieceEvidence: { version: 'piece-evidence/v1', core: 'AuroraBoard and LumenDeck changes',
        quotes: [{ evidenceId: page.id, sourceUrl: 'https://example.com/dated-releases', quote: raw, statement: raw }] },
    }));
    assert.ok(built.evidence[0].literalSpans.some(span => span.includes(first) && span.includes(second)));
    assert.ok(built.evidence[0].excerpt.length <= 2400);
    assert.deepEqual((await makeBuilder(repository).get('org-a', built.contentContextSnapshotId)).evidence, built.evidence);
  });

  test('a tampered stored piece projection fails closed on offsets or raw evidence digest', async () => {
    for (const tamper of ['digest', 'bounds', 'valid-bounds']) {
      const { pages, input } = pieceProofFixture();
      const repository = new MemoryRepository([], pages);
      const builder = makeBuilder(repository);
      const built = await builder.build('org-a', input);
      const stored = repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`);
      const selected = stored.items.find(item => item.evidenceId);
      if (tamper === 'digest') selected.evidence.excerpt += 'tampered';
      else if (tamper === 'valid-bounds') selected.evidenceProjection.spans[0].start += 1;
      else selected.evidenceProjection.spans[0].end = selected.evidence.excerpt.length + 1;
      await assert.rejects(builder.get('org-a', built.contentContextSnapshotId), error =>
        error.code === 'CONTENT_CONTEXT_INVALIDATED');
    }
  });

  test('the Prisma repository persists projections and renders identical proof from the original full registry pages', async () => {
    const { pages, quotes, input } = pieceProofFixture();
    let header, savedItems = [];
    const client = {
      contentFact: { findMany: async () => [] },
      sourceEvidence: { findMany: async () => structuredClone(pages) },
      contentContextItem: { createMany: async ({ data }) => { savedItems = structuredClone(data); } },
      contentContextSnapshot: {
        create: async ({ data }) => { header = { ...structuredClone(data), id: 'stored-piece-proof' }; return header; },
        findFirst: async () => header ? { ...header, items: savedItems.map(item => ({
          ...item, evidence: structuredClone(pages.find(page => page.id === item.evidenceId)),
        })) } : null,
      },
    };
    const repository = new ContentContextRepository({ model: client }, { model: { $transaction: async work => work(client) } });
    const builder = makeBuilder(repository, { ...neutralProfile, effectiveVoice: { examples: ['v'.repeat(7_000)] } });
    const built = await builder.build('org-a', input);
    assert.equal(savedItems.length, 9);
    assert.ok(savedItems.every(item => item.evidenceProjection?.sourceHash));
    const reread = await builder.get('org-a', built.contentContextSnapshotId);
    assert.deepEqual(reread.evidence, built.evidence);
    const { materialSupport } = loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
    for (const quote of quotes) assert.ok(materialSupport(quote, reread));
  });

  test('essential proof exceeding the caller budget refuses with a concrete deficit before snapshot creation', async () => {
    const { pages, input } = pieceProofFixture();
    const repository = new MemoryRepository([], pages);
    const builder = makeBuilder(repository, { ...neutralProfile, effectiveVoice: { examples: ['v'.repeat(63_900)] } });
    await assert.rejects(builder.build('org-a', input), error => error.code === 'CONTENT_EVIDENCE_REQUIRED' &&
      error.missingRequirements?.[0].includes('Essential source proof needs'));
    assert.equal(repository.snapshots.size, 0);
  });

  test('draft finalization revalidates every projected source, including one outside the chosen citations', async () => {
    const { pages, input } = pieceProofFixture();
    const repository = new MemoryRepository([], pages);
    const builder = makeBuilder(repository);
    const built = await builder.build('org-a', input);
    const stored = repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`);
    const { validateContentContextForDraft } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts');
    const client = { contentContextSnapshot: { findFirst: async () => structuredClone(stored) } };
    const save = () => validateContentContextForDraft(client, { organizationId: 'org-a',
      contentContextSnapshotId: stored.id, usedCitationIds: ['E1'], now });
    assert.equal((await save()).usedCitationIds[0], 'E1');
    stored.items.find(item => item.citationId === 'E2').evidence.excerpt += ' changed during generation';
    await assert.rejects(save(), error => error.code === 'CONTENT_CONTEXT_INVALIDATED');
  });

  test('v3 draft finalization accepts actual E9 and E16, rejects E17 and F9, and keeps the legacy citation limit', async () => {
    const { pages, input } = pieceProofFixture();
    for (let index = 9; index < 16; index += 1) pages.push(evidence(`piece-${index}`));
    input.userMaterialEvidenceIds = pages.map(page => page.id);
    const repository = new MemoryRepository([], pages);
    const built = await makeBuilder(repository).build('org-a', input);
    const stored = repository.snapshots.get(`org-a:${built.contentContextSnapshotId}`);
    const { validateContentContextForDraft } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts');
    const client = { contentContextSnapshot: { findFirst: async () => structuredClone(stored) } };
    const save = usedCitationIds => validateContentContextForDraft(client, { organizationId: 'org-a',
      contentContextSnapshotId: stored.id, usedCitationIds, now });
    assert.deepEqual((await save(['E9', 'E16'])).usedCitationIds, ['E16', 'E9']);
    for (const citation of ['E17', 'F9']) await assert.rejects(save([citation]), error =>
      error.code === 'CONTENT_CONTEXT_CITATIONS_INVALID' && error.message === 'Citation identifiers are invalid');
    stored.items = stored.items.filter(item => item.citationId !== 'E12');
    await assert.rejects(save(['E12']), error => error.code === 'CONTENT_CONTEXT_CITATIONS_INVALID' &&
      error.message === 'Citation does not belong to the resolved context');
    stored.selectionAlgorithmVersion = 2;
    await assert.rejects(save(['E9']), error => error.code === 'CONTENT_CONTEXT_CITATIONS_INVALID' &&
      error.message === 'Citation identifiers are invalid');
  });

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

  /* -------------------------------------------------------------------------
   * «Ваше слово» (`content-factory-next-tyrk`): a fact with no accepted
   * evidence is not the same failure as a fact nobody has looked at yet.
   * Nothing in the product could ever accept an evidence link before this
   * task, so the builder always produced `UNAVAILABLE` — these guard the fix.
   * ---------------------------------------------------------------------- */

  test('a VERIFIED fact with no evidence at all is admitted as own word, with no citation', async () => {
    const ownWord = fact('own-word', {
      freshUntil: null,
      evidenceLinks: [],
    });
    const builder = makeBuilder(new MemoryRepository([ownWord]));
    const context = await builder.build('org-a', request());

    assert.equal(context.status, 'READY');
    assert.equal(context.rejected.length, 0);
    assert.equal(context.facts.length, 1);
    assert.equal(context.facts[0].factId, 'own-word');
    assert.deepEqual(context.facts[0].evidenceCitationIds, []);
    assert.equal(context.evidence.length, 0);
  });

  test('a VERIFIED fact whose only evidence link is still PROPOSED is admitted as own word too', async () => {
    const pending = fact('own-word-pending', {
      freshUntil: null,
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'PROPOSED',
          evidence: evidence('e-pending'),
        },
      ],
    });
    const builder = makeBuilder(new MemoryRepository([pending]));
    const context = await builder.build('org-a', request());

    assert.equal(context.status, 'READY');
    assert.equal(context.facts.length, 1);
    assert.deepEqual(context.facts[0].evidenceCitationIds, []);
    // The proposed evidence does not ride in as a citation on its own
    // account — it has not been accepted, only cited.
    assert.equal(context.evidence.length, 0);
  });

  test('a fact with an accepted link whose evidence was removed keeps its rejection reason, not own word', async () => {
    const removedEvidence = evidence('e-removed');
    removedEvidence.tombstone = 'SOURCE_REMOVED';
    const withRemovedEvidence = fact('removed-support', {
      evidenceLinks: [
        {
          stance: 'SUPPORTS',
          reviewStatus: 'ACCEPTED',
          evidence: removedEvidence,
        },
      ],
    });
    const builder = makeBuilder(new MemoryRepository([withRemovedEvidence]));
    const context = await builder.build('org-a', request());

    assert.equal(context.facts.length, 0);
    assert.deepEqual(context.rejected, [
      { itemId: 'removed-support', reason: 'DELETED' },
    ]);
  });

  test('evaluateFact keeps an own-word fact VERIFIED instead of demoting it to UNVERIFIED', async () => {
    const at = new Date('2026-08-20T12:00:00.000Z');
    const stored = {
      id: 'own-word-eval',
      organizationId: 'org-a',
      status: 'VERIFIED',
      freshUntil: null,
      verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      evidenceLinks: [],
    };
    const client = {
      contentFact: {
        findFirst: async () => structuredClone(stored),
        updateMany: async ({ data }) => {
          Object.assign(stored, data);
          return { count: 1 };
        },
      },
      contentFactEvidence: {
        updateMany: async () => ({ count: 1 }),
      },
    };
    const repository = new ContentFactRepository(
      { model: client },
      { model: { $transaction: async (work) => work(client) } }
    );

    // The fact this evaluation actually runs for has no evidence at all —
    // `reviewEvidenceLink` is only the trigger here, standing in for
    // whatever unrelated review caused `evaluateFact` to re-run on it.
    const result = await repository.reviewEvidenceLink(
      'org-a',
      'reviewer-a',
      'own-word-eval',
      'evidence-unrelated',
      'ACCEPTED',
      at
    );

    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.freshUntil, null);
    assert.equal(result.verifiedAt.getTime(), at.getTime());
  });

  test('confirmEvidence accepts a proposed search-result assessment, accepts its link, and re-verifies the fact', async () => {
    const at = new Date('2026-08-20T13:00:00.000Z');
    let assessmentUpsertArgs = null;
    let linkUpdateArgs = null;
    const factRecord = {
      id: 'fact-search',
      organizationId: 'org-a',
      status: 'UNVERIFIED',
      freshUntil: null,
      evidenceLinks: [
        {
          reviewStatus: 'PROPOSED',
          stance: 'SUPPORTS',
          evidence: {
            id: 'evidence-search-1',
            tombstone: null,
            freshUntil: future,
            freshnessStatus: 'FRESH',
            assessment: { status: 'PROPOSED', trustTier: 'UNRATED' },
            snapshot: { purgedAt: null, kind: 'SEARCH_PROVIDER_RESULT', source: null },
          },
        },
      ],
    };

    const client = {
      contentFact: {
        findFirst: async () => structuredClone(factRecord),
        updateMany: async ({ data }) => {
          Object.assign(factRecord, data);
          return { count: 1 };
        },
      },
      sourceEvidence: {
        findFirst: async () => ({ id: 'evidence-search-1' }),
      },
      contentFactEvidence: {
        findFirst: async () => ({
          organizationId: 'org-a',
          factId: 'fact-search',
          evidenceId: 'evidence-search-1',
          reviewStatus: 'PROPOSED',
        }),
        updateMany: async (args) => {
          linkUpdateArgs = args;
          factRecord.evidenceLinks[0].reviewStatus = args.data.reviewStatus;
          return { count: 1 };
        },
      },
      contentEvidenceAssessment: {
        upsert: async (args) => {
          assessmentUpsertArgs = args;
          factRecord.evidenceLinks[0].evidence.assessment = {
            status: 'ACCEPTED',
            trustTier: 'UNRATED',
          };
          return { ...args.update, status: 'ACCEPTED' };
        },
      },
    };
    const repository = new ContentFactRepository(
      { model: client },
      { model: { $transaction: async (work) => work(client) } }
    );

    const result = await repository.confirmEvidence(
      'org-a',
      'user-a',
      'fact-search',
      'evidence-search-1',
      at
    );

    assert.equal(assessmentUpsertArgs.update.status, 'ACCEPTED');
    assert.equal(linkUpdateArgs.data.reviewStatus, 'ACCEPTED');
    assert.equal(result.status, 'VERIFIED');
    assert.equal(result.freshUntil.getTime(), future.getTime());
  });

  /* -------------------------------------------------------------------------
   * Own word still ages (review addendum to `content-factory-next-tyrk`).
   * The own-word branch returned before any freshness check at all, so a
   * `CURRENT` fact past its own stated `freshUntil` — "we have 12 employees
   * right now", the date long gone — would have been admitted unchanged.
   * ---------------------------------------------------------------------- */

  test('own word still ages: a CURRENT fact past its own freshUntil is rejected as STALE', async () => {
    const staleOwnWord = fact('own-word-stale', {
      temporalKind: 'CURRENT',
      freshUntil: past,
      evidenceLinks: [],
    });
    const builder = makeBuilder(new MemoryRepository([staleOwnWord]));
    const context = await builder.build('org-a', request());

    assert.equal(context.facts.length, 0);
    assert.deepEqual(context.rejected, [
      { itemId: 'own-word-stale', reason: 'STALE' },
    ]);
  });

  test('own word within its own freshUntil is still admitted', async () => {
    const freshOwnWord = fact('own-word-fresh', {
      temporalKind: 'CURRENT',
      freshUntil: future,
      evidenceLinks: [],
    });
    const builder = makeBuilder(new MemoryRepository([freshOwnWord]));
    const context = await builder.build('org-a', request());

    assert.equal(context.facts.length, 1);
    assert.equal(context.facts[0].factId, 'own-word-fresh');
    assert.deepEqual(context.facts[0].evidenceCitationIds, []);
  });

  /* -------------------------------------------------------------------------
   * КОПИРОВАТЬ И ПОПРАВИТЬ gets the same rule as an ordinary fact
   * (`content-factory-next-tyrk`, §9.5 addendum): the real
   * `ContentFactRepository.copyFact` transaction, fed through the real
   * builder, proves the copy is never left less verified than its evidence
   * already justifies.
   * ---------------------------------------------------------------------- */

  function makeCopyFactClient(oldFactOverrides = {}) {
    const oldFact = {
      id: 'copy-source',
      organizationId: 'org-a',
      claimKey: 'claim-copy',
      statement: 'Old statement',
      language: 'en',
      temporalKind: 'TIMELESS',
      effectiveFrom: null,
      effectiveTo: null,
      freshUntil: null,
      status: 'VERIFIED',
      ...oldFactOverrides,
    };
    let newFact = null;
    const links = [];
    const evidenceStore = new Map();

    const client = {
      contentFact: {
        findFirst: async ({ where, include }) => {
          if (where.id === oldFact.id) return { ...oldFact };
          if (newFact && where.id === newFact.id) {
            return include
              ? {
                  ...newFact,
                  evidenceLinks: links.filter(
                    (link) => link.factId === newFact.id
                  ),
                }
              : { ...newFact };
          }
          return null;
        },
        upsert: async ({ create }) => {
          if (newFact) return { ...newFact };
          newFact = { id: 'copy-new', ...create };
          return { ...newFact };
        },
        updateMany: async ({ where, data }) => {
          if (where.id === oldFact.id) Object.assign(oldFact, data);
          if (newFact && where.id === newFact.id) Object.assign(newFact, data);
          return { count: 1 };
        },
      },
      sourceEvidence: {
        findFirst: async ({ where }) => evidenceStore.get(where.id) || null,
      },
      contentFactEvidence: {
        findFirst: async () => null,
        create: async ({ data }) => {
          const link = { ...data, evidence: evidenceStore.get(data.evidenceId) };
          links.push(link);
          return link;
        },
      },
    };
    return { client, oldFact, evidenceStore, getNewFact: () => newFact };
  }

  function makeCopyFactRepository(client) {
    return new ContentFactRepository(
      { model: client },
      { model: { $transaction: async (work) => work(client) } }
    );
  }

  test('a copy created with no evidence is admitted by the builder as own word', async () => {
    const { client } = makeCopyFactClient();
    const repository = makeCopyFactRepository(client);

    const { fact: copied } = await repository.copyFact(
      'org-a',
      'user-a',
      'copy-source',
      {
        statement: 'New statement',
        valueText: 'New statement',
        valueHash: 'hash-copy-1',
        dedupeKey: 'dedupe-copy-1',
      },
      now
    );

    assert.equal(copied.status, 'VERIFIED');

    const context = await makeBuilder(new MemoryRepository([copied])).build(
      'org-a',
      request()
    );

    assert.equal(context.facts.length, 1);
    assert.equal(context.facts[0].factId, copied.id);
    assert.deepEqual(context.facts[0].evidenceCitationIds, []);
    assert.equal(context.evidence.length, 0);
  });

  test('a copy linked to still-proposed evidence is admitted by the builder as own word, citation pending', async () => {
    const { client, evidenceStore } = makeCopyFactClient();
    evidenceStore.set('evidence-proposed', {
      id: 'evidence-proposed',
      assessment: { status: 'PROPOSED', trustTier: 'UNRATED' },
    });
    const repository = makeCopyFactRepository(client);

    const { fact: copied } = await repository.copyFact(
      'org-a',
      'user-a',
      'copy-source',
      {
        statement: 'New statement',
        valueText: 'New statement',
        valueHash: 'hash-copy-2',
        dedupeKey: 'dedupe-copy-2',
        evidenceId: 'evidence-proposed',
        stance: 'SUPPORTS',
      },
      now
    );

    assert.equal(copied.status, 'VERIFIED');
    assert.equal(copied.evidenceLinks[0].reviewStatus, 'PROPOSED');

    const context = await makeBuilder(new MemoryRepository([copied])).build(
      'org-a',
      request()
    );

    assert.equal(context.facts.length, 1);
    assert.deepEqual(context.facts[0].evidenceCitationIds, []);
    // Cited but not accepted: the proposed evidence does not ride in as a
    // citation on its own account either.
    assert.equal(context.evidence.length, 0);
  });

  test('a copy linked to already-accepted evidence is admitted by the builder VERIFIED, with a citation', async () => {
    const { client, evidenceStore } = makeCopyFactClient();
    const acceptedEvidence = evidence('copy-accepted-evidence');
    evidenceStore.set(acceptedEvidence.id, acceptedEvidence);
    const repository = makeCopyFactRepository(client);

    const { fact: copied } = await repository.copyFact(
      'org-a',
      'user-a',
      'copy-source',
      {
        statement: 'New statement',
        valueText: 'New statement',
        valueHash: 'hash-copy-3',
        dedupeKey: 'dedupe-copy-3',
        evidenceId: acceptedEvidence.id,
        stance: 'SUPPORTS',
      },
      now
    );

    assert.equal(copied.status, 'VERIFIED');
    assert.equal(copied.evidenceLinks[0].reviewStatus, 'ACCEPTED');

    const context = await makeBuilder(new MemoryRepository([copied])).build(
      'org-a',
      request()
    );

    assert.equal(context.facts.length, 1);
    assert.equal(context.facts[0].evidenceCitationIds.length, 1);
    assert.equal(context.evidence.length, 1);
  });

  /* -------------------------------------------------------------------------
   * «Взято из поиска» (`content-factory-next-ec48.1`, решение владельца
   * 05.09.2026).
   *
   * До этого дня строитель отбрасывал всё без принятой оценки как
   * UNVERIFIED, и платная проверка 05.09 показала, что из пяти постов ни один
   * не опирался на материал: находка доходила до витрины и дальше не шла.
   * Владелец разрешил её брать — с пометкой «взято из поиска», а не «не
   * проверено», и «ограничивать я бы никак не стал».
   * ---------------------------------------------------------------------- */

  function searchEvidence(id, overrides = {}) {
    const base = evidence(id);
    return {
      ...base,
      assessment: { status: 'PROPOSED', trustTier: 'UNRATED', trustPolicyVersion: 1 },
      ...overrides,
      snapshot: {
        ...base.snapshot,
        kind: 'SEARCH_PROVIDER_RESULT',
        source: null,
        ...(overrides.snapshot || {}),
      },
    };
  }

  test('a fresh search result enters the context marked SEARCH and reads back the same way', async () => {
    const repository = new MemoryRepository([], [searchEvidence('found')]);
    const builder = makeBuilder(repository);

    const built = await builder.build(
      'org-a',
      request({ userMaterialEvidenceIds: ['found'] })
    );

    assert.equal(built.evidence.length, 1);
    assert.equal(built.evidence[0].evidenceId, 'found');
    assert.equal(built.evidence[0].provenance, 'SEARCH');
    assert.equal(built.status, 'READY');
    assert.equal(built.generationPolicy, 'ALLOW_GROUNDED');
    // Причина включения переживает снимок: по ней и только по ней обратное
    // чтение отвечает, откуда взялась цитата.
    const stored = repository.snapshots.get(
      `org-a:${built.contentContextSnapshotId}`
    );
    assert.equal(
      stored.items.find((item) => item.evidenceId).inclusionReason,
      'SEARCH_UNCONFIRMED'
    );

    const read = await builder.get('org-a', built.contentContextSnapshotId);
    assert.equal(read.evidence[0].provenance, 'SEARCH');
  });

  test('an accepted evidence stays CONFIRMED and sorts before a search result', async () => {
    // Идентификаторы выбраны так, чтобы прежний порядок «по id» поставил
    // находку первой: проверяется именно происхождение, а не алфавит.
    const repository = new MemoryRepository(
      [],
      [searchEvidence('a-found'), evidence('z-accepted')]
    );
    const builder = makeBuilder(repository);

    const built = await builder.build(
      'org-a',
      request({ userMaterialEvidenceIds: ['a-found', 'z-accepted'] })
    );

    assert.deepEqual(
      built.evidence.map((item) => [item.evidenceId, item.provenance]),
      [
        ['z-accepted', 'CONFIRMED'],
        ['a-found', 'SEARCH'],
      ]
    );
  });

  test('REQUIRE_CURRENT is satisfied by a fresh search result alone', async () => {
    const built = await makeBuilder(
      new MemoryRepository([], [searchEvidence('found')])
    ).build(
      'org-a',
      request({
        freshnessMode: 'REQUIRE_CURRENT',
        userMaterialEvidenceIds: ['found'],
      })
    );

    assert.equal(built.status, 'READY');
    assert.equal(built.generationPolicy, 'ALLOW_GROUNDED');
    assert.equal(built.errorCode, null);
  });

  test('a stale search result is still refused, and so are blocked and rejected ones', async () => {
    const built = await makeBuilder(
      new MemoryRepository(
        [],
        [
          searchEvidence('stale', { freshUntil: past, freshnessStatus: 'STALE' }),
          searchEvidence('blocked', {
            assessment: {
              status: 'PROPOSED',
              trustTier: 'BLOCKED',
              trustPolicyVersion: 1,
            },
          }),
          searchEvidence('refused', {
            assessment: {
              status: 'REJECTED',
              trustTier: 'UNRATED',
              trustPolicyVersion: 1,
            },
          }),
        ]
      )
    ).build('org-a', request());

    assert.equal(built.evidence.length, 0);
    assert.deepEqual(built.rejected, [
      { itemId: 'blocked', reason: 'UNVERIFIED' },
      { itemId: 'refused', reason: 'UNVERIFIED' },
      { itemId: 'stale', reason: 'STALE' },
    ]);
  });

  test('a fetched source excerpt without an accepted assessment stays refused', async () => {
    const built = await makeBuilder(
      new MemoryRepository(
        [],
        [
          evidence('fetched', {
            assessment: {
              status: 'PROPOSED',
              trustTier: 'UNRATED',
              trustPolicyVersion: 1,
            },
          }),
        ]
      )
    ).build('org-a', request());

    assert.equal(built.evidence.length, 0);
    assert.deepEqual(built.rejected, [
      { itemId: 'fetched', reason: 'UNVERIFIED' },
    ]);
  });
}
