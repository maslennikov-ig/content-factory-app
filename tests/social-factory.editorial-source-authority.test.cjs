'use strict';
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const {
  EditorialSourceAuthorityV1,
  sourcePermissionFailureV1,
  sourceOriginFromUrlV1,
} = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/source-authority.v1.ts'
);
const { SourceRegistryError } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts'
);

// Exercise the existing repository's real getDraftMaterial implementation and
// query contract. No database/network service is started by this focused suite.
function registryClass() {
  const filename = path.resolve(
    __dirname,
    '../libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.repository.ts'
  );
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const module = { exports: {} };
  const requireLocal = (request) => {
    if (
      request ===
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service'
    )
      return { PrismaRepository: class {}, PrismaTransaction: class {} };
    if (request === './errors') return { SourceRegistryError };
    if (request === '../social-factory/source-lifecycle.port')
      return loadTypeScriptModule(
        'libraries/nestjs-libraries/src/content-intelligence/social-factory/source-lifecycle.port.ts'
      );
    if (request === './source-fetch.gateway')
      return {
        DEFAULT_SOURCE_FETCH_BUDGETS: {
          redirects: 5,
          dnsTimeoutMs: 2000,
          totalTimeoutMs: 20000,
        },
      };
    return require(request);
  };
  new Function('require', 'module', 'exports', compiled)(
    requireLocal,
    module,
    module.exports
  );
  return module.exports.ContentSourceRegistryRepository;
}
const ContentSourceRegistryRepository = registryClass();
const NOW = new Date('2026-11-03T12:00:00Z');
const FUTURE = new Date('2026-11-04T12:00:00Z');

function source(kind = 'URL', overrides = {}) {
  const snapshot = {
    id: 'snapshot-a',
    organizationId: 'org-a',
    sourceId: 'source-a',
    normalizedTitle: 'A registered source, not a verified claim',
    retrievalProvider: kind === 'MANUAL' ? 'manual-v1' : 'source-fetch-v1',
    retentionUntil: FUTURE,
    purgedAt: null,
    supersededAt: null,
    providerMetadata: null,
    requestedCanonicalUrl: null,
    finalCanonicalUrl: null,
    evidence: [
      {
        id: 'evidence-observation-a',
        organizationId: 'org-a',
        sourceSnapshotId: 'snapshot-a',
        excerpt: 'A fictional teaching example, not a measured client outcome.',
        observedAt: NOW,
        freshUntil: kind === 'MANUAL' ? null : FUTURE,
        freshnessStatus: kind === 'MANUAL' ? 'NOT_MONITORED' : 'FRESH',
        tombstone: null,
        locator: null,
        structuredData: null,
      },
    ],
  };
  return {
    id: 'source-a',
    organizationId: 'org-a',
    kind,
    canonicalUrl: kind === 'MANUAL' ? null : 'https://example.com/guide',
    displayName: 'Registered example',
    currentSnapshotId: 'snapshot-a',
    currentSnapshot: snapshot,
    desiredState: 'ACTIVE',
    rightsState: 'CONFIRMED',
    usagePurpose: 'EVIDENCE',
    rightsConfirmedByUserId: 'owner-a',
    rightsConfirmedAt: NOW,
    freshUntil: kind === 'MANUAL' ? null : FUTURE,
    configVersion: 2,
    archivedAt: null,
    purgedAt: null,
    ...overrides,
  };
}

function permission(overrides = {}, recordOverrides = {}) {
  return {
    state: 'present',
    record: {
      organizationId: 'org-a',
      kind: 'source_permission',
      id: 'source-a',
      revision: 3,
      deletedAt: null,
      invalidatedAt: null,
      expiresAt: null,
      payload: {
        organizationId: 'org-a',
        sourceId: 'source-a',
        channelIds: ['channel-a'],
        revision: 'permission-revision-3',
        evidenceId: 'persisted-grant-a',
        purposes: ['editorial'],
        basis: 'consented',
        origin: 'web',
        acquisition: 'url',
        sourceContext: 'context-a',
        expiresAt: FUTURE.toISOString(),
        ...overrides,
      },
      ...recordOverrides,
    },
  };
}

function setup(row = source(), state = { state: 'absent' }) {
  const findFirst = jest.fn(async () => row);
  const registry = new ContentSourceRegistryRepository(
    { model: { contentSource: { findFirst } } },
    {},
    () => NOW
  );
  const store = {
    read: jest.fn(async () => {
      throw new Error('Never use ambiguous live-read null semantics');
    }),
    readSourcePermissionState: jest.fn(async () => state),
  };
  const reader = new EditorialSourceAuthorityV1(store, registry, () => NOW);
  return { reader, store, findFirst, row };
}
const read = (fixture, purpose = 'editorial_generation') =>
  fixture.reader.read('org-a', 'channel-a', ['source-a'], purpose);

test.each(['MANUAL', 'URL'])(
  'cold start reuses permitted %s registry material without a new manual grant',
  async (kind) => {
    const fixture = setup(source(kind));
    const result = await read(fixture);
    expect(result.gaps).toEqual([]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].evidence[0]).toMatchObject({
      id: 'evidence-observation-a',
      sourceId: 'source-a',
      rights: 'permitted',
      factStatus: 'unknown',
      ownerScope: 'org-a',
      purpose: 'editorial',
      sourceRevision: 'snapshot-a',
    });
    expect(result.documents[0].evidence[0]).not.toHaveProperty('grantId');
    expect(result.admissions).toEqual([
      {
        sourceId: 'source-a',
        sourceConfigVersion: 2,
        snapshotId: 'snapshot-a',
        rightsConfirmedAt: NOW.toISOString(),
        permissionRevision: null,
      },
    ]);
    expect(fixture.store.read).not.toHaveBeenCalled();
    expect(fixture.store.readSourcePermissionState).toHaveBeenCalledWith(
      'org-a',
      'source-a'
    );
    expect(fixture.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-a',
          id: 'source-a',
          archivedAt: null,
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
        },
        include: {
          currentSnapshot: {
            include: {
              evidence: {
                where: { tombstone: null },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      })
    );
  }
);

test('source texts are bounded and duplicate IDs do not duplicate content or reads', async () => {
  const row = source();
  row.currentSnapshot.evidence[0].excerpt = 'x'.repeat(7000);
  const fixture = setup(row);
  const result = await fixture.reader.read('org-a', 'channel-a', [
    'source-a',
    'source-a',
  ]);
  expect(result.documents[0].text).toHaveLength(5000);
  expect(fixture.findFirst).toHaveBeenCalledTimes(1);
});

test('source evidence reuses the existing URL redaction before leaving the registry adapter', async () => {
  const result = await read(
    setup(
      source('URL', {
        canonicalUrl: 'https://example.com/guide?private=synthetic#fragment',
      })
    )
  );
  expect(result.documents[0].evidence[0].sourceUrl).toBe(
    'https://example.com/guide'
  );
});

test('a registry-validated 304 renewal uses current source freshness rather than the original evidence deadline', async () => {
  const row = source();
  row.currentSnapshot.evidence[0].freshUntil = new Date('2026-11-02T12:00:00Z');
  const result = await read(setup(row));
  expect(result.gaps).toEqual([]);
  expect(result.documents[0].evidence[0].expiresAt).toBe(FUTURE.toISOString());
});

test.each([
  [{ organizationId: 'org-b' }, {}, 'SOURCE_PERMISSION_SCOPE_MISMATCH'],
  [{ sourceId: 'source-b' }, {}, 'SOURCE_PERMISSION_SCOPE_MISMATCH'],
  [{ channelIds: ['other-channel'] }, {}, 'SOURCE_PERMISSION_SCOPE_MISMATCH'],
  [{ revokedAt: NOW.toISOString() }, {}, 'SOURCE_PERMISSION_EXPIRED'],
  [{ expiresAt: NOW.toISOString() }, {}, 'SOURCE_PERMISSION_EXPIRED'],
  [{ expiresAt: 'invalid' }, {}, 'SOURCE_PERMISSION_EXPIRED'],
  [{ purposes: ['discovery'] }, {}, 'SOURCE_PERMISSION_PURPOSE_REQUIRED'],
  [{}, { invalidatedAt: NOW }, 'SOURCE_PERMISSION_INACTIVE'],
  [{}, { deletedAt: NOW }, 'SOURCE_PERMISSION_INACTIVE'],
  [{}, { expiresAt: NOW }, 'SOURCE_PERMISSION_INACTIVE'],
])(
  'persisted permission %j/%j fails without returning content',
  async (payload, record, code) => {
    const fixture = setup(source(), permission(payload, record));
    expect(await read(fixture)).toEqual({
      admissions: [],
      documents: [],
      gaps: [{ sourceId: 'source-a', code }],
    });
    expect(fixture.findFirst).not.toHaveBeenCalled();
  }
);

test.each([
  [{ organizationId: 'org-b' }, 'SOURCE_REGISTRY_SCOPE_MISMATCH'],
  [{ currentSnapshotId: 'wrong-snapshot' }, 'SOURCE_REGISTRY_SCOPE_MISMATCH'],
  [{ archivedAt: NOW }, 'SOURCE_REGISTRY_INACTIVE'],
  [{ desiredState: 'PAUSED' }, 'SOURCE_REGISTRY_INACTIVE'],
  [{ rightsState: 'DENIED' }, 'SOURCE_REGISTRY_INACTIVE'],
  [{ usagePurpose: 'STYLE_REFERENCE' }, 'SOURCE_REGISTRY_INACTIVE'],
  [{ rightsConfirmedByUserId: null }, 'SOURCE_RIGHTS_AUTHORITY_REQUIRED'],
  [{ rightsConfirmedAt: FUTURE }, 'SOURCE_RIGHTS_AUTHORITY_REQUIRED'],
  [{ freshUntil: NOW }, 'SOURCE_REGISTRY_STALE'],
])(
  'registry source %j is rejected despite an accidental adapter response',
  async (overrides, code) => {
    expect(await read(setup(source('URL', overrides)))).toEqual({
      admissions: [],
      documents: [],
      gaps: [{ sourceId: 'source-a', code }],
    });
  }
);

test('real repository rejects a purged snapshot before the reader can expose it', async () => {
  const row = source();
  row.currentSnapshot.purgedAt = NOW;
  expect(await read(setup(row))).toEqual({
    admissions: [],
    documents: [],
    gaps: [{ sourceId: 'source-a', code: 'SOURCE_REGISTRY_UNAVAILABLE' }],
  });
});

test('evidence cannot cross tenant or snapshot boundaries', async () => {
  const row = source();
  row.currentSnapshot.evidence[0].organizationId = 'org-b';
  expect(await read(setup(row))).toEqual({
    admissions: [],
    documents: [],
    gaps: [{ sourceId: 'source-a', code: 'SOURCE_EVIDENCE_SCOPE_MISMATCH' }],
  });
});

test.each([
  'https://t.me/channel/123',
  'https://telegram.me/channel/123',
  'https://t.me./channel/123',
])(
  'Telegram canonical URL %s cannot be renamed web by a persisted grant',
  async (canonicalUrl) => {
    const result = await read(
      setup(source('URL', { canonicalUrl }), permission({ origin: 'web' }))
    );
    expect(result).toEqual({
      admissions: [],
      documents: [],
      gaps: [
        { sourceId: 'source-a', code: 'TELEGRAM_SCOPED_CONSENT_REQUIRED' },
      ],
    });
  }
);

test('Telegram manual import retains lineage restrictions despite manual-v1 acquisition', async () => {
  const row = source('MANUAL');
  row.currentSnapshot.providerMetadata = { originPlatform: 'telegram' };
  expect(await read(setup(row))).toEqual({
    admissions: [],
    documents: [],
    gaps: [{ sourceId: 'source-a', code: 'SOURCE_PERMISSION_REQUIRED' }],
  });
});

test('known third-party lineage does not become owned just because its container is a manual document', async () => {
  const row = source('MANUAL');
  row.currentSnapshot.providerMetadata = { originPlatform: 'other' };
  expect((await read(setup(row))).gaps[0].code).toBe(
    'SOURCE_PERMISSION_REQUIRED'
  );
});

test('Telegram scoped consent binds the actual source and channel and retains unknown factual truth', async () => {
  const row = source('URL', { canonicalUrl: 'https://t.me/channel/123' });
  const grant = permission({
    origin: 'web',
    telegramConsent: {
      evidenceId: 'consent-a',
      context: 'context-a',
      allRelevantUsers: true,
      explicitInformedAffirmative: true,
      continued: true,
    },
  });
  const result = await read(setup(row, grant));
  expect(result.gaps).toEqual([]);
  expect(result.documents[0].evidence[0]).toMatchObject({
    originPlatform: 'telegram',
    factStatus: 'unknown',
    grantId: 'persisted-grant-a',
    consentExpiresAt: FUTURE.toISOString(),
    purpose: 'editorial',
  });
  grant.record.payload.telegramConsent.continued = false;
  expect((await read(setup(row, grant))).gaps[0].code).toBe(
    'TELEGRAM_SCOPED_CONSENT_REQUIRED'
  );
});

test.each([{ state: 'unknown' }, null])(
  'ambiguous permission state %j fails closed before reading registry content',
  async (state) => {
    const fixture = setup(source(), state);
    expect((await read(fixture)).gaps[0].code).toBe(
      'SOURCE_PERMISSION_STATE_UNKNOWN'
    );
    expect(fixture.findFirst).not.toHaveBeenCalled();
  }
);

test('an unavailable authority port fails closed rather than using the generic live read', async () => {
  const fixture = setup();
  delete fixture.store.readSourcePermissionState;
  expect((await read(fixture)).gaps[0].code).toBe(
    'SOURCE_PERMISSION_STATE_UNKNOWN'
  );
  expect(fixture.store.read).not.toHaveBeenCalled();
});

test('licensed registry export requires its own persisted purpose and license basis', async () => {
  const purpose = 'licensed_registry_export_v1';
  expect(
    (await read(setup(source(), { state: 'absent' }), purpose)).gaps[0].code
  ).toBe('SOURCE_PERMISSION_REQUIRED');
  expect(
    (await read(setup(source(), permission({ basis: 'licensed' })), purpose))
      .gaps[0].code
  ).toBe('SOURCE_PERMISSION_PURPOSE_REQUIRED');
  expect(
    (
      await read(
        setup(source(), permission({ basis: 'owned', purposes: [purpose] })),
        purpose
      )
    ).gaps[0].code
  ).toBe('SOURCE_EXPORT_LICENSE_REQUIRED');
  const result = await read(
    setup(source(), permission({ basis: 'licensed', purposes: [purpose] })),
    purpose
  );
  expect(result.gaps).toEqual([]);
  expect(result.documents[0].evidence[0]).toMatchObject({
    access: 'licensed',
    purpose,
    factStatus: 'unknown',
    permissionBasis: 'scoped_grant',
  });
  expect(result.admissions).toEqual([
    {
      sourceId: 'source-a',
      sourceConfigVersion: 2,
      snapshotId: 'snapshot-a',
      rightsConfirmedAt: NOW.toISOString(),
      permissionRevision: 3,
    },
  ]);
});

test('shared helper exports classify Telegram URLs and check persisted discovery scope', () => {
  expect(typeof sourcePermissionFailureV1).toBe('function');
  expect(typeof sourceOriginFromUrlV1).toBe('function');
  expect(sourceOriginFromUrlV1('https://t.me/channel/123')).toBe('telegram');
  expect(sourceOriginFromUrlV1('https://sub.telegram.org./message')).toBe(
    'telegram'
  );
  expect(sourceOriginFromUrlV1('https://t.me.attacker.example/message')).toBe(
    'web'
  );
  expect(sourceOriginFromUrlV1('https://youtu.be/example')).toBe('youtube');
  expect(sourceOriginFromUrlV1('file:///tmp/example')).toBeNull();
  const row = permission({ purposes: ['discovery'] }).record;
  expect(
    sourcePermissionFailureV1(
      row,
      'org-a',
      'channel-a',
      'source-a',
      'discovery',
      NOW.getTime()
    )
  ).toBeNull();
  expect(
    sourcePermissionFailureV1(
      row,
      'org-a',
      'channel-a',
      'source-a',
      'editorial_generation',
      NOW.getTime()
    )
  ).toBe('SOURCE_PERMISSION_PURPOSE_REQUIRED');
  expect(
    sourcePermissionFailureV1(
      row,
      'org-b',
      'channel-a',
      'source-a',
      'discovery',
      NOW.getTime()
    )
  ).toBe('SOURCE_PERMISSION_SCOPE_MISMATCH');
});
