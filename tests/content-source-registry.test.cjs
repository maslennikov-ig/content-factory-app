require('reflect-metadata');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (!fs.existsSync(filename))
    throw new Error(`Module under test is missing: ${relativePath}`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

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
const { ContentSourceRegistryRepository } = repositoryModule;

function source(overrides = {}) {
  return {
    id: 'source-a',
    organizationId: 'org-a',
    kind: 'URL',
    displayName: 'Example',
    canonicalKey: 'https://example.com/',
    canonicalUrl: 'https://example.com/',
    currentSnapshotId: null,
    desiredState: 'DRAFT',
    healthState: 'NEVER_SYNCED',
    rightsState: 'UNCONFIRMED',
    robotsState: 'UNKNOWN',
    configVersion: 1,
    archivedAt: null,
    ...overrides,
  };
}

test('create is tenant-scoped, deterministic and never performs network I/O', async () => {
  const calls = [];
  const existing = source();
  const repository = {
    createOrGet: async (...args) => {
      calls.push(args);
      return { source: existing, created: false };
    },
  };
  let fetches = 0;
  const service = new ContentSourceRegistryService(repository, {
    fetch: async () => {
      fetches += 1;
    },
  });

  const result = await service.createSource('org-a', 'admin-a', {
    kind: 'URL',
    displayName: 'Example',
    canonicalUrl: 'https://EXAMPLE.com:443/#x',
  });

  assert.equal(result.created, false);
  assert.equal(fetches, 0);
  assert.deepEqual(calls[0].slice(0, 3), [
    'org-a',
    'admin-a',
    {
      kind: 'URL',
      displayName: 'Example',
      canonicalKey: 'https://example.com/',
      canonicalUrl: 'https://example.com/',
    },
  ]);
});

test('read responses redact query-bearing locators and internal canonical dedupe keys', async () => {
  const service = new ContentSourceRegistryService(
    {
      getById: async () =>
        source({
          canonicalKey: 'https://example.com/feed?token=secret',
          canonicalUrl: 'https://example.com/feed?token=secret',
        }),
    },
    {}
  );
  const value = await service.getSource('org-a', 'source-a');
  assert.equal(value.canonicalUrl, 'https://example.com/feed');
  assert.equal('canonicalKey' in value, false);
  assert.equal(JSON.stringify(value).includes('secret'), false);
});

test('list returns the settled capability envelope and current snapshot summary', async () => {
  const service = new ContentSourceRegistryService(
    {
      listSources: async () => [
        source({
          healthState: 'FRESH',
          freshUntil: new Date('2026-08-20T09:00:00.000Z'),
          currentSnapshot: {
            observedAt: new Date('2026-08-20T10:00:00.000Z'),
            freshUntil: new Date('2026-08-20T11:00:00.000Z'),
            _count: { evidence: 3 },
          },
        }),
      ],
    },
    {},
    { directFetch: true, periodicSync: false },
    undefined,
    () => new Date('2026-08-20T10:00:00.000Z')
  );
  const result = await service.listSources('org-a');
  assert.deepEqual(result.capabilities, {
    directFetch: true,
    validate: true,
    sync: true,
  });
  assert.deepEqual(result.sources[0].currentSnapshot, {
    observedAt: new Date('2026-08-20T10:00:00.000Z'),
    freshUntil: new Date('2026-08-20T09:00:00.000Z'),
    evidenceCount: 3,
  });
  assert.equal(result.sources[0].healthState, 'STALE');
});

test('validate checks denylist before network, evaluates robots, and captures the first draft snapshot', async () => {
  const calls = [];
  const current = source({ rightsState: 'CONFIRMED' });
  const repository = {
    getById: async () => current,
    startSyncRun: async (...args) => {
      calls.push(['run', ...args]);
      return {
        id: 'validation-run',
        leaseId: 'validation-key',
        duplicate: false,
      };
    },
    completeSync: async (input) => {
      calls.push(['complete', input]);
      return { snapshotId: 'first-snapshot', reused: false };
    },
  };
  const gateway = {
    fetch: async (url, kind) => {
      calls.push(['fetch', kind, url]);
      if (kind === 'ROBOTS')
        return {
          status: 200,
          body: Buffer.from('User-agent: *\nAllow: /\n'),
          headers: {},
        };
      return {
        status: 200,
        requestedUrl: url,
        finalUrl: url,
        redirectChain: [url],
        contentType: 'text/html',
        charset: 'utf-8',
        compressedBytes: 10,
        decompressedBytes: 10,
        body: Buffer.from('<p>ok</p>'),
        headers: { cacheControl: 'max-age=0' },
      };
    },
  };
  const service = new ContentSourceRegistryService(
    repository,
    gateway,
    { directFetch: true },
    {
      parse: () => ({
        title: null,
        text: 'ok',
        parser: 'bounded-html',
        parserVersion: '1',
        evidence: [],
      }),
    },
    () => new Date('2026-08-20T10:00:00.000Z'),
    { deniedDomains: [] }
  );
  assert.deepEqual(
    await service.validateSource(
      'org-a',
      'source-a',
      'admin-a',
      'validation-key'
    ),
    {
      snapshotId: 'first-snapshot',
      reused: false,
    }
  );
  assert.deepEqual(
    calls.slice(0, 3).map((call) => call.slice(0, 2)),
    [
      ['fetch', 'ROBOTS'],
      ['run', 'org-a'],
      ['fetch', 'URL'],
    ]
  );
  assert.equal(calls.at(-1)[1].trigger, 'VALIDATE');
  assert.equal(
    calls.at(-1)[1].freshUntil.toISOString(),
    '2026-08-20T10:00:00.000Z'
  );

  let deniedFetches = 0;
  const denied = new ContentSourceRegistryService(
    repository,
    {
      fetch: async () => {
        deniedFetches += 1;
      },
    },
    { directFetch: true },
    undefined,
    undefined,
    { deniedDomains: ['example.com'] }
  );
  await assert.rejects(
    denied.validateSource('org-a', 'source-a', 'admin-a'),
    (error) => error.code === 'TERMS_DENIED'
  );
  assert.equal(deniedFetches, 0);
});

test('sync fails closed before the gateway unless capability, rights, state and robots gates pass', async () => {
  let gatewayCalls = 0;
  const repository = {
    getById: async () => source(),
  };
  const service = new ContentSourceRegistryService(repository, {
    fetch: async () => {
      gatewayCalls += 1;
    },
  });

  await assert.rejects(
    service.syncNow('org-a', 'source-a', 'admin-a', 'run-1'),
    (error) => error.code === 'POLICY_DISABLED'
  );
  assert.equal(gatewayCalls, 0);

  const enabled = new ContentSourceRegistryService(
    repository,
    {
      fetch: async () => {
        gatewayCalls += 1;
      },
    },
    { directFetch: true }
  );
  await assert.rejects(
    enabled.syncNow('org-a', 'source-a', 'admin-a', 'run-2'),
    (error) => error.code === 'RIGHTS_REQUIRED'
  );
  assert.equal(gatewayCalls, 0);
});

test('successful sync atomically writes immutable provenance and reuses same-hash snapshot', async () => {
  const persisted = [];
  const current = source({
    desiredState: 'ACTIVE',
    rightsState: 'CONFIRMED',
    robotsState: 'ALLOWED',
  });
  const repository = {
    getById: async (organizationId, id) => {
      assert.deepEqual([organizationId, id], ['org-a', 'source-a']);
      return current;
    },
    startSyncRun: async () => ({ id: 'run-db', duplicate: false }),
    completeSync: async (input) => {
      persisted.push(input);
      return { snapshotId: 'snapshot-existing', reused: true };
    },
  };
  const service = new ContentSourceRegistryService(
    repository,
    {
      fetch: async () => ({
        status: 200,
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        redirectChain: ['https://example.com/'],
        contentType: 'text/html',
        charset: 'utf-8',
        compressedBytes: 12,
        decompressedBytes: 12,
        body: Buffer.from('<p>Hello</p>'),
        headers: { etag: 'v1' },
      }),
    },
    { directFetch: true },
    {
      parse: () => ({
        title: 'Example',
        text: 'Hello',
        parser: 'bounded-html',
        parserVersion: '1',
        evidence: [{ excerpt: 'Hello', locator: { section: 0 } }],
      }),
    }
  );

  const result = await service.syncNow(
    'org-a',
    'source-a',
    'admin-a',
    'sync-key'
  );
  assert.deepEqual(result, { snapshotId: 'snapshot-existing', reused: true });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].organizationId, 'org-a');
  assert.equal(persisted[0].sourceId, 'source-a');
  assert.equal(persisted[0].runId, 'run-db');
  assert.equal(persisted[0].contentHash.length, 64);
  assert.equal(persisted[0].retrievalProvider, 'direct-fetch-v1');
  assert.deepEqual(persisted[0].evidence, [
    { excerpt: 'Hello', locator: { section: 0 } },
  ]);
});

test('draft material returns only tenant-scoped current evidence with a traceable deterministic contract', async () => {
  const repository = {
    getDraftMaterial: async (organizationId, sourceId) => {
      assert.deepEqual([organizationId, sourceId], ['org-a', 'source-a']);
      return {
        source: source({
          currentSnapshotId: 'snapshot-a',
          desiredState: 'ACTIVE',
          freshUntil: new Date('2026-08-21T10:00:00.000Z'),
        }),
        snapshot: {
          id: 'snapshot-a',
          retrievalProvider: 'direct-fetch-v1',
          observedAt: new Date('2026-08-20T10:00:00.000Z'),
        },
        evidence: [
          {
            id: 'evidence-a',
            excerpt: 'Bounded evidence',
            observedAt: new Date('2026-08-20T10:00:00.000Z'),
            freshUntil: new Date('2026-08-21T10:00:00.000Z'),
            freshnessStatus: 'FRESH',
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
    () => new Date('2026-08-20T12:00:00.000Z')
  );

  assert.deepEqual(await service.getDraftMaterial('org-a', 'source-a'), {
    sourceId: 'source-a',
    snapshotId: 'snapshot-a',
    evidence: [
      {
        evidenceId: 'evidence-a',
        excerpt: 'Bounded evidence',
        observedAt: '2026-08-20T10:00:00.000Z',
        freshUntil: '2026-08-21T10:00:00.000Z',
        freshnessStatus: 'FRESH',
        provenance: { kind: 'URL', retrievalProvider: 'direct-fetch-v1' },
      },
    ],
    trace: {
      contractVersion: 'source-draft-material/v1',
      builtAt: '2026-08-20T12:00:00.000Z',
    },
  });
});

test('manual source and immutable snapshot are created in one serializable transaction', async () => {
  const writes = [];
  const database = {
    contentSource: {
      findUnique: async () => null,
      create: async (input) => {
        writes.push(['create-source', input]);
        return source({ id: 'manual-source', kind: 'MANUAL' });
      },
      update: async (input) => {
        writes.push(['source', input]);
        return source({
          id: 'manual-source',
          kind: 'MANUAL',
          currentSnapshotId: 'manual-snapshot',
        });
      },
    },
    sourceSyncRun: {
      create: async (input) => {
        writes.push(['run', input]);
        return { id: 'manual-run' };
      },
    },
    sourceSnapshot: {
      create: async (input) => {
        writes.push(['snapshot', input]);
        return { id: 'manual-snapshot' };
      },
    },
  };
  const transaction = {
    model: {
      $transaction: async (callback, options) => {
        assert.deepEqual(options, { isolationLevel: 'Serializable' });
        return callback(database);
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    transaction
  );

  const result = await repository.createManualSource(
    'org-a',
    'admin-a',
    {
      kind: 'MANUAL',
      displayName: 'Manual knowledge',
      canonicalKey: `manual:${'a'.repeat(64)}`,
      canonicalUrl: null,
    },
    'Manual knowledge',
    'a'.repeat(64),
    new Date('2026-08-20T10:00:00.000Z')
  );
  assert.equal(result.created, true);
  assert.equal(result.source.currentSnapshotId, 'manual-snapshot');
  assert.deepEqual(
    writes.map(([kind]) => kind),
    ['create-source', 'run', 'snapshot', 'source']
  );
  assert.equal(writes[2][1].data.retrievalProvider, 'manual-v1');
  assert.equal(
    writes[2][1].data.evidence.create[0].excerpt,
    'Manual knowledge'
  );
  // `content-factory-next-tyrk`: «ваш материал» is confirmed the moment a
  // person adds it — the producer must write the assessment itself, not
  // leave it for a review step nothing in the interface ever reaches.
  const manualAssessment = writes[2][1].data.evidence.create[0].assessment.create;
  assert.equal(manualAssessment.status, 'ACCEPTED');
  assert.equal(manualAssessment.trustTier, 'OWNER_VERIFIED');
  assert.equal(manualAssessment.reviewedByUserId, 'admin-a');
  assert.equal(manualAssessment.organization.connect.id, 'org-a');
  assert.equal('organizationId' in manualAssessment, false);
});

test('304 without a tenant current snapshot fails atomically instead of creating incomplete provenance', async () => {
  const writes = [];
  const database = {
    contentSource: {
      findFirst: async () =>
        source({
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          currentSnapshot: null,
        }),
    },
    sourceSnapshot: {
      findFirst: async () => null,
      create: async (input) => {
        writes.push(input);
        return { id: 'should-not-exist' };
      },
    },
    sourceSyncRun: { findFirst: async () => ({ id: 'run-a' }) },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    {
      model: {
        $transaction: async (callback) => callback(database),
      },
    }
  );
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'lease-a',
      trigger: 'SYNC_NOW',
      configVersion: 1,
      status: 304,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: null,
      charset: null,
      compressedBytes: 0,
      decompressedBytes: 0,
      freshUntil: new Date('2026-08-21T10:00:00.000Z'),
      nextFetchNotBefore: new Date('2026-08-21T10:00:00.000Z'),
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.deepEqual(writes, []);
});

test('same-hash validation reuses immutable snapshot and commits source/run pointers together', async () => {
  const writes = [];
  const currentSnapshot = { id: 'snapshot-a', contentHash: 'b'.repeat(64) };
  const database = {
    contentSource: {
      findFirst: async () =>
        source({
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          currentSnapshotId: 'snapshot-a',
          currentSnapshot,
        }),
      updateMany: async (input) => {
        writes.push(['source', input]);
        return { count: 1 };
      },
    },
    sourceSnapshot: {
      findFirst: async () => ({ sequence: 1 }),
      create: async () => {
        throw new Error('immutable snapshot must not be replaced');
      },
      updateMany: async (input) => writes.push(['snapshot-update', input]),
    },
    sourceSyncRun: {
      findFirst: async () => ({ id: 'run-a' }),
      updateMany: async (input) => {
        writes.push(['run', input]);
        return { count: 1 };
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } }
  );
  const result = await repository.completeSync({
    organizationId: 'org-a',
    sourceId: 'source-a',
    runId: 'run-a',
    leaseId: 'lease-a',
    trigger: 'SYNC_NOW',
    configVersion: 1,
    status: 200,
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    redirectChain: ['https://example.com/'],
    contentType: 'text/html',
    charset: 'utf-8',
    compressedBytes: 10,
    decompressedBytes: 10,
    freshUntil: new Date('2026-08-21T10:00:00.000Z'),
    nextFetchNotBefore: new Date('2026-08-21T10:00:00.000Z'),
    contentHash: 'b'.repeat(64),
    parser: 'bounded-html',
    parserVersion: '1',
    normalizedTitle: 'Title',
    normalizedText: 'same',
    retrievalProvider: 'direct-fetch-v1',
    evidence: [],
    now: new Date('2026-08-20T10:00:00.000Z'),
  });
  assert.deepEqual(result, { snapshotId: 'snapshot-a', reused: true });
  assert.deepEqual(
    writes.map(([kind]) => kind),
    ['source', 'run']
  );
});

test('a synced source confirms its own evidence the same way a manual one does (content-factory-next-tyrk)', async () => {
  let snapshotCreateArgs;
  const database = {
    sourceSyncRun: {
      findFirst: async () => ({ id: 'run-a' }),
      updateMany: async () => ({ count: 1 }),
    },
    contentSource: {
      findFirst: async () =>
        source({
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          currentSnapshotId: 'snapshot-old',
          currentSnapshot: { id: 'snapshot-old', contentHash: 'a'.repeat(64) },
        }),
      updateMany: async () => ({ count: 1 }),
    },
    sourceSnapshot: {
      findFirst: async () => ({ sequence: 1 }),
      create: async (args) => {
        snapshotCreateArgs = args;
        return { id: 'snapshot-new' };
      },
      updateMany: async () => ({ count: 1 }),
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } }
  );

  const result = await repository.completeSync({
    organizationId: 'org-a',
    sourceId: 'source-a',
    runId: 'run-a',
    leaseId: 'lease-a',
    trigger: 'SYNC_NOW',
    configVersion: 1,
    status: 200,
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    redirectChain: ['https://example.com/'],
    contentType: 'text/html',
    charset: 'utf-8',
    compressedBytes: 10,
    decompressedBytes: 10,
    freshUntil: new Date('2026-08-21T10:00:00.000Z'),
    nextFetchNotBefore: new Date('2026-08-21T10:00:00.000Z'),
    contentHash: 'c'.repeat(64),
    parser: 'bounded-html',
    parserVersion: '1',
    normalizedTitle: 'Title',
    normalizedText: 'changed',
    retrievalProvider: 'direct-fetch-v1',
    evidence: [{ excerpt: 'Hello again', locator: { section: 0 } }],
    now: new Date('2026-08-20T10:00:00.000Z'),
  });

  assert.deepEqual(result, { snapshotId: 'snapshot-new', reused: false });
  const assessment =
    snapshotCreateArgs.data.evidence.create[0].assessment.create;
  assert.equal(assessment.status, 'ACCEPTED');
  assert.equal(assessment.trustTier, 'OWNER_VERIFIED');
  // No acting user reaches a sync job the way it reaches a manual add — the
  // producer must not guess one.
  assert.equal(assessment.reviewedByUserId, null);
  assert.equal(assessment.organization.connect.id, 'org-a');
  assert.equal('organizationId' in assessment, false);
});

test('transaction failure is propagated and cannot report a committed snapshot', async () => {
  const transaction = {
    model: {
      $transaction: async (callback) => {
        const shadowWrites = [];
        const database = {
          contentSource: {
            findFirst: async () =>
              source({
                desiredState: 'ACTIVE',
                rightsState: 'CONFIRMED',
                robotsState: 'ALLOWED',
                currentSnapshot: null,
              }),
            updateMany: async () => {
              throw new Error('database write failed');
            },
          },
          sourceSnapshot: {
            findFirst: async () => null,
            create: async () => {
              shadowWrites.push('snapshot');
              return { id: 'uncommitted-snapshot' };
            },
          },
          sourceSyncRun: { findFirst: async () => ({ id: 'run-a' }) },
        };
        try {
          return await callback(database);
        } finally {
          assert.deepEqual(shadowWrites, ['snapshot']);
        }
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    transaction
  );
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'lease-a',
      trigger: 'SYNC_NOW',
      configVersion: 1,
      status: 200,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: 'text/html',
      charset: 'utf-8',
      compressedBytes: 10,
      decompressedBytes: 10,
      freshUntil: new Date(),
      nextFetchNotBefore: new Date(),
      contentHash: 'c'.repeat(64),
      parser: 'bounded-html',
      parserVersion: '1',
      normalizedText: 'new',
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date(),
    }),
    /database write failed/
  );
});

test('a second sync key cannot create a concurrent active lease for the same tenant source', async () => {
  let creates = 0;
  const database = {
    sourceSyncRun: {
      findUnique: async () => null,
      findFirst: async () => ({ id: 'active-run', runKey: 'first-key' }),
      create: async () => {
        creates += 1;
        return { id: 'second-run' };
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    {
      model: {
        sourceSyncRun: {
          create: database.sourceSyncRun.create,
          findUnique: database.sourceSyncRun.findUnique,
        },
      },
    },
    { model: { $transaction: async (callback) => callback(database) } }
  );
  await assert.rejects(
    repository.startSyncRun(
      'org-a',
      'source-a',
      1,
      'second-key',
      new Date('2026-08-20T10:00:00.000Z')
    ),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.equal(creates, 0);
});

test('lease covers the worst-case envelope and an expired owner cannot complete or fail late', async () => {
  assert.ok(
    repositoryModule.SOURCE_RUN_LEASE_MS >=
      repositoryModule.SOURCE_WORST_CASE_ENVELOPE_MS
  );
  let sourceReads = 0;
  let sourceWrites = 0;
  const database = {
    sourceSyncRun: {
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    contentSource: {
      findFirst: async () => {
        sourceReads += 1;
      },
      updateMany: async () => {
        sourceWrites += 1;
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } }
  );
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'expired-lease',
      trigger: 'SYNC_NOW',
      configVersion: 1,
      status: 304,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: null,
      charset: null,
      compressedBytes: 0,
      decompressedBytes: 0,
      freshUntil: new Date('2026-08-20T10:00:00.000Z'),
      nextFetchNotBefore: new Date('2026-08-20T10:00:00.000Z'),
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date('2026-08-20T10:00:00.001Z'),
    }),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  await assert.rejects(
    repository.failSync(
      'org-a',
      'source-a',
      'run-a',
      'expired-lease',
      'TIMEOUT',
      new Date('2026-08-20T10:00:00.001Z')
    ),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.equal(sourceReads, 0);
  assert.equal(sourceWrites, 0);
});

test('completion uses a fresh clock immediately before lease CAS and rejects delayed expiry', async () => {
  const clocks = [
    new Date('2026-08-20T10:00:00.050Z'),
    new Date('2026-08-20T10:00:00.200Z'),
  ];
  let casWhere;
  const database = {
    sourceSyncRun: {
      findFirst: async ({ where }) => {
        assert.equal(
          where.leaseExpiresAt.gt.toISOString(),
          '2026-08-20T10:00:00.050Z'
        );
        return { id: 'run-a' };
      },
      updateMany: async ({ where }) => {
        casWhere = where;
        return { count: 0 };
      },
    },
    contentSource: {
      findFirst: async () =>
        source({
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'ALLOWED',
          currentSnapshotId: 'snapshot-a',
          currentSnapshot: { id: 'snapshot-a', contentHash: 'a'.repeat(64) },
        }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } },
    () => clocks.shift()
  );
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'lease-a',
      trigger: 'SYNC_NOW',
      configVersion: 1,
      status: 304,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: null,
      charset: null,
      compressedBytes: 0,
      decompressedBytes: 0,
      freshUntil: new Date('2026-08-20T11:00:00.000Z'),
      nextFetchNotBefore: new Date('2026-08-20T11:00:00.000Z'),
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.equal(
    casWhere.leaseExpiresAt.gt.toISOString(),
    '2026-08-20T10:00:00.200Z'
  );
});

test('a concurrent robots Allow-to-Deny change fences sync completion before any snapshot write', async () => {
  let snapshotWrites = 0;
  const database = {
    sourceSyncRun: { findFirst: async () => ({ id: 'run-a' }) },
    contentSource: {
      findFirst: async () =>
        source({
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
          robotsState: 'DISALLOWED',
          currentSnapshot: null,
        }),
    },
    sourceSnapshot: {
      findFirst: async () => null,
      create: async () => {
        snapshotWrites += 1;
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } },
    () => new Date('2026-08-20T10:00:00.000Z')
  );
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'lease-a',
      trigger: 'SYNC_NOW',
      configVersion: 1,
      status: 200,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: 'text/html',
      charset: 'utf-8',
      compressedBytes: 2,
      decompressedBytes: 2,
      freshUntil: new Date('2026-08-20T11:00:00.000Z'),
      nextFetchNotBefore: new Date('2026-08-20T11:00:00.000Z'),
      contentHash: 'a'.repeat(64),
      parser: 'bounded-html',
      parserVersion: '1',
      normalizedText: 'ok',
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.equal(snapshotWrites, 0);
});

test('draft validation deny advances the fence so a late Allow transaction cannot write a snapshot', async () => {
  const current = source({
    rightsState: 'CONFIRMED',
    robotsState: 'UNKNOWN',
    configVersion: 1,
  });
  let snapshotWrites = 0;
  const contentSource = {
    updateMany: async ({ where, data }) => {
      if (
        where.configVersion !== current.configVersion ||
        where.desiredState !== current.desiredState ||
        where.rightsState !== current.rightsState
      )
        return { count: 0 };
      if (data.lastErrorCode) {
        current.robotsState = data.robotsState;
        if (data.configVersion?.increment)
          current.configVersion += data.configVersion.increment;
      }
      return { count: 1 };
    },
    findFirst: async () => ({ ...current, currentSnapshot: null }),
  };
  const database = {
    contentSource,
    sourceSyncRun: {
      findFirst: async () => ({ id: 'run-a' }),
      updateMany: async () => ({ count: 1 }),
    },
    sourceSnapshot: {
      findFirst: async () => null,
      create: async () => {
        snapshotWrites += 1;
        return { id: 'late-snapshot' };
      },
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: { contentSource } },
    { model: { $transaction: async (callback) => callback(database) } },
    () => new Date('2026-08-20T10:00:00.000Z')
  );
  await repository.recordValidationPolicyFailure(
    'org-a',
    'source-a',
    'ROBOTS_DISALLOWED',
    'DISALLOWED',
    new Date('2026-08-20T10:00:00.000Z'),
    1,
    'DRAFT'
  );
  assert.equal(current.configVersion, 2);
  assert.equal(current.robotsState, 'DISALLOWED');
  await assert.rejects(
    repository.completeSync({
      organizationId: 'org-a',
      sourceId: 'source-a',
      runId: 'run-a',
      leaseId: 'lease-a',
      trigger: 'VALIDATE',
      configVersion: 1,
      status: 200,
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirectChain: ['https://example.com/'],
      contentType: 'text/html',
      charset: 'utf-8',
      compressedBytes: 2,
      decompressedBytes: 2,
      freshUntil: new Date('2026-08-20T11:00:00.000Z'),
      nextFetchNotBefore: new Date('2026-08-20T11:00:00.000Z'),
      contentHash: 'a'.repeat(64),
      parser: 'bounded-html',
      parserVersion: '1',
      normalizedText: 'ok',
      retrievalProvider: 'direct-fetch-v1',
      evidence: [],
      now: new Date('2026-08-20T10:00:00.000Z'),
    }),
    (error) => error.code === 'SOURCE_CONFLICT'
  );
  assert.equal(snapshotWrites, 0);
});

test('active sync refetches robots and persists a fenced deny before source retrieval', async () => {
  const failures = [];
  let fetches = 0;
  const current = source({
    desiredState: 'ACTIVE',
    rightsState: 'CONFIRMED',
    robotsState: 'ALLOWED',
    configVersion: 7,
  });
  const service = new ContentSourceRegistryService(
    {
      getById: async () => current,
      recordValidationPolicyFailure: async (...args) => failures.push(args),
      startSyncRun: async () => {
        throw new Error('source run must not start');
      },
    },
    {
      fetch: async (_url, kind) => {
        fetches += 1;
        assert.equal(kind, 'ROBOTS');
        return { body: Buffer.from('User-agent: *\nDisallow: /\n') };
      },
    },
    { directFetch: true },
    undefined,
    () => new Date('2026-08-20T10:00:00.000Z')
  );
  await assert.rejects(
    service.syncNow('org-a', 'source-a', 'admin-a', 'run-a'),
    (error) => error.code === 'ROBOTS_DISALLOWED'
  );
  assert.equal(fetches, 1);
  assert.deepEqual(failures[0].slice(0, 4), [
    'org-a',
    'source-a',
    'ROBOTS_DISALLOWED',
    'DISALLOWED',
  ]);
  assert.deepEqual(failures[0].slice(5), [7, 'ACTIVE']);
});

test('activation query requires confirmed rights, allowed robots and a current snapshot', async () => {
  let activationWhere;
  const repository = new ContentSourceRegistryRepository(
    {
      model: {
        contentSource: {
          updateMany: async ({ where }) => {
            activationWhere = where;
            return { count: 1 };
          },
          findFirst: async () => source({ desiredState: 'ACTIVE' }),
        },
      },
    },
    { model: {} }
  );
  await repository.activate('org-a', 'source-a', 'admin-a');
  assert.equal(activationWhere.rightsState, 'CONFIRMED');
  assert.deepEqual(activationWhere.robotsState, {
    in: ['ALLOWED', 'NOT_APPLICABLE'],
  });
  assert.deepEqual(activationWhere.currentSnapshotId, { not: null });
});

test('policy failures become visible as POLICY_BLOCKED while transient failures remain ERROR', async () => {
  const sourceStates = [];
  const database = {
    sourceSyncRun: { updateMany: async () => ({ count: 1 }) },
    contentSource: {
      updateMany: async ({ data }) => sourceStates.push(data.healthState),
    },
  };
  const repository = new ContentSourceRegistryRepository(
    { model: {} },
    { model: { $transaction: async (callback) => callback(database) } }
  );
  await repository.failSync(
    'org-a',
    'source-a',
    'run-a',
    'lease-a',
    'DNS_UNSAFE',
    new Date()
  );
  await repository.failSync(
    'org-a',
    'source-a',
    'run-b',
    'lease-b',
    'TIMEOUT',
    new Date()
  );
  assert.deepEqual(sourceStates, ['POLICY_BLOCKED', 'ERROR']);
});

test('controller uses the content-intelligence route and sends request tenant to every member read', async () => {
  const permissionEnums = loadTypeScriptModule(
    'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
  );
  const permissionDecorators = loadTypeScriptModule(
    'apps/backend/src/services/auth/permissions/permissions.ability.ts',
    { './permission.exception.class': permissionEnums }
  );
  const dtoModule = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/content-intelligence/content-source.dto.ts'
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
      // `content-factory-next-lh5s`: the controller took a second dependency
      // when the search door was added. Stubbed rather than loaded — the real
      // service reaches for a model client and a Tavily key, and this test is
      // about routing and tenancy.
      '@contentfactory/nestjs-libraries/openai/web.research.service': {
        WebResearchService: class {},
      },
    }
  );
  const calls = [];
  const controller = new controllerModule.ContentSourceController(
    {
      listSources: async (...args) => calls.push(args),
    },
    { research: async () => ({ summary: '', facts: [], sources: [], provider: 'tavily' }) }
  );
  await controller.list({ id: 'org-request' });
  assert.deepEqual(calls, [['org-request']]);
  assert.equal(
    Reflect.getMetadata('path', controllerModule.ContentSourceController),
    '/content-intelligence/sources'
  );
  const adminPolicy = (action) => [[action, permissionEnums.Sections.ADMIN]];
  for (const [method, action] of [
    ['create', permissionEnums.AuthorizationActions.Create],
    ['confirmRights', permissionEnums.AuthorizationActions.Update],
    ['activate', permissionEnums.AuthorizationActions.Update],
    ['validate', permissionEnums.AuthorizationActions.Update],
    ['sync', permissionEnums.AuthorizationActions.Update],
    ['archive', permissionEnums.AuthorizationActions.Delete],
  ]) {
    assert.deepEqual(
      Reflect.getMetadata(
        permissionDecorators.CHECK_POLICIES_KEY,
        controllerModule.ContentSourceController.prototype[method]
      ),
      adminPolicy(action),
      method
    );
  }
  for (const method of ['list', 'get', 'draftMaterial']) {
    assert.equal(
      Reflect.getMetadata(
        permissionDecorators.CHECK_POLICIES_KEY,
        controllerModule.ContentSourceController.prototype[method]
      ),
      undefined,
      `${method} stays available to an authenticated organization member`
    );
  }
});
