const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';
const OriginalDate = global.Date; const NOW = new OriginalDate('2030-01-01T12:00:00Z');
beforeEach(() => { jest.useFakeTimers({now:NOW}); });
afterEach(() => { jest.useRealTimers(); });
const prismaMock = { PrismaRepository: class {}, PrismaTransaction: class {} };
const repository = loadTypeScriptModule(`${ROOT}/social-factory.repository.ts`, { '../../database/prisma/prisma.service': prismaMock, '../../database/prisma/posts/publication-store.v106': { PublicationStoreV106: class {} } });
const authority = loadTypeScriptModule(`${ROOT}/editorial/source-authority.v1.ts`);
const { SocialFactorySourcePermissionService } = loadTypeScriptModule(`${ROOT}/source-permission.service.ts`, {
  './social-factory.repository': repository, './editorial/source-authority.v1': authority,
  '../source-registry/source-registry.repository': { ContentSourceRegistryRepository: class {} },
});
const future = '2031-01-01T00:00:00.000Z'; const past = '2029-01-01T00:00:00.000Z';
function source(overrides = {}) {
  return { organizationId: 'org', id: 'source', kind: 'URL', canonicalUrl: 'https://example.test/article', displayName: 'Registered source', configVersion: 2,
    currentSnapshotId: 'snapshot', desiredState: 'ACTIVE', rightsState: 'CONFIRMED', usagePurpose: 'EVIDENCE', rightsConfirmedByUserId: 'owner', rightsConfirmedAt: new Date(past), freshUntil: new Date(future), archivedAt: null, purgedAt: null,
    currentSnapshot: { id: 'snapshot', organizationId: 'org', sourceId: 'source', normalizedTitle: 'Registered text', retrievalProvider: 'source-fetch-v1', requestedCanonicalUrl: null, finalCanonicalUrl: null, providerMetadata: null, retentionUntil: new Date(future), purgedAt: null, supersededAt: null,
      evidence: [{ id: 'evidence', organizationId: 'org', sourceSnapshotId: 'snapshot', excerpt: 'Fictional source example', observedAt: new Date(past), freshUntil: new Date(future), freshnessStatus: 'FRESH', tombstone: null, locator: null, structuredData: null }] }, ...overrides };
}
function input(extra = {}) { return { sourceId: 'source', expectedRevision: 0, purposes: ['discovery', 'editorial'], basis: 'consented', expiresAt: future, origin: 'web', acquisition: 'url', sourceContext: 'context', channelIds: ['channel'], ...extra }; }
function copy(value) {
  if (value && Object.prototype.toString.call(value) === '[object Date]') return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]));
  return value;
}
function matches(row, where = {}) {
  if (!row) return false;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(child => matches(row, child));
    if (key === 'AND') return value.every(child => matches(row, child));
    const actual = row[key];
    if (value instanceof OriginalDate) return new OriginalDate(actual).getTime() === value.getTime();
    if (value && typeof value === 'object') {
      if ('is' in value) return matches(actual, value.is);
      if ('gt' in value) return actual != null && new OriginalDate(actual).getTime() > new OriginalDate(value.gt).getTime();
      if ('lte' in value) return actual != null && new OriginalDate(actual).getTime() <= new OriginalDate(value.lte).getTime();
      if ('has' in value) return actual?.includes(value.has);
      if ('in' in value) return value.in.includes(actual);
      return matches(actual, value);
    }
    return actual === value;
  });
}
function fixture(row = source()) {
  const db = { row: copy(row), records: [], events: [], failRedact: false, permissionUnknown: false, queue: Promise.resolve() };
  const client = {
    contentSource: {
      findFirst: async ({ where }) => matches(db.row, where) ? copy(db.row) : null,
      updateMany: async ({ where, data }) => { db.events.push('source-lock'); if (!matches(db.row, where)) return { count: 0 }; Object.assign(db.row, data); return { count: 1 }; },
    },
    socialFactoryRecord: {
      findFirst: async ({ where }) => { if (db.permissionUnknown && where.kind === 'source_permission') throw new Error('unreadable state'); return copy(db.records.find(row => matches(row, where)) ?? null); },
      findMany: async ({ where }) => copy(db.records.filter(row => matches(row, where))),
      create: async ({ data }) => { db.events.push('permission-create'); if (db.records.some(row => row.organizationId === data.organizationId && row.kind === data.kind && row.id === data.id)) throw Object.assign(new Error('duplicate'), { code: 'P2002' }); const row = { revision: 1, deletedAt: null, invalidatedAt: null, expiresAt: null, sourceIds: [], parentId: null, createdAt: NOW, updatedAt: NOW, ...copy(data) }; db.records.push(row); return copy(row); },
      updateMany: async ({ where, data }) => {
        if (data.payload?.redacted && db.failRedact) throw new Error('redaction failed');
        db.events.push(data.payload?.redacted ? 'redact' : 'permission-update'); let count = 0;
        for (const row of db.records.filter(row => matches(row, where))) { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : copy(value); count++; }
        return { count };
      },
    },
    $transaction: async (work, options) => {
      expect(options.isolationLevel).toBe('Serializable');
      const previous = db.queue; let release; db.queue = new Promise(resolve => { release = resolve; }); await previous;
      const before = { row: copy(db.row), records: copy(db.records) };
      try { return await work(client); } catch (error) { db.row = before.row; db.records = before.records; throw error; } finally { release(); }
    },
  };
  const store = new repository.SocialFactoryRepository({ model: client }, { model: client });
  const service = new SocialFactorySourcePermissionService(store, {}, {});
  const seed = async (grant = input(), extra = {}) => client.socialFactoryRecord.create({ data: { organizationId: 'org', kind: 'source_permission', id: 'source', payload: { ...grant, organizationId: 'org', revision: '1', evidenceId: 'owner:actor:source:1' }, expiresAt: new Date(grant.expiresAt), ...extra } });
  const descendant = async () => client.socialFactoryRecord.create({ data: { organizationId: 'org', kind: 'editorial', id: 'derived', sourceIds: [repository.sourceRef('source')], payload: { text: 'private derived text' } } });
  const stamp = permissionRevision => ({ sourceId: 'source', sourceConfigVersion: 2, snapshotId: 'snapshot', rightsConfirmedAt: past, permissionRevision });
  return { db, client, store, service, seed, descendant, stamp };
}

test('save locks source then permission and normalizes origin from registered lineage rather than caller claims', async () => {
  const f = fixture(); const saved = await f.service.save('org', 'actor', input({ origin: 'first_party' }));
  expect(saved.payload.origin).toBe('web'); expect(saved.payload.evidenceId).toBe('owner:actor:source:1');
  expect(f.db.events.slice(0, 2)).toEqual(['source-lock', 'permission-create']);
  expect((await f.store.readSourcePermissionState('org', 'source')).state).toBe('present');
});
test.each(['direct-url', 'forwarded-upload'])('Telegram %s cannot be relabelled as web to bypass consent', async route => {
  const row = source();
  if (route === 'direct-url') row.canonicalUrl = 'https://t.me/example/10';
  else { row.kind = 'MANUAL'; row.canonicalUrl = null; row.currentSnapshot.retrievalProvider = 'manual-v1'; row.currentSnapshot.evidence[0].locator = { sourceUrl: 'https://t.me/example/10' }; }
  const f = fixture(row);
  await expect(f.service.save('org', 'actor', input({ origin: 'web', acquisition: 'upload' }))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_TELEGRAM_CONSENT_REQUIRED');
  expect(f.db.records).toHaveLength(0);
});
test('valid scoped Telegram consent preserves actual Telegram origin through upload', async () => {
  const row = source(); row.currentSnapshot.providerMetadata = { originPlatform: 'telegram', sourceContext: 'context' };
  const f = fixture(row); const saved = await f.service.save('org', 'actor', input({ origin: 'first_party', acquisition: 'upload', telegramConsent: { evidenceId: 'consent', context: 'context', allRelevantUsers: true, explicitInformedAffirmative: true, continued: true } }));
  expect(saved.payload.origin).toBe('telegram');
});
test('expired live permissions renew only with explicit exact raw revision and remain distinct from absence', async () => {
  const f = fixture(); await f.seed(input({ expiresAt: past }));
  expect(await f.store.read('org', 'source_permission', 'source')).toBeNull();
  await expect(f.service.save('org', 'actor', input())).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_CONFLICT');
  const renewed = await f.service.save('org', 'actor', input({ expectedRevision: 1 }));
  expect(renewed.revision).toBe(2); expect(renewed.payload.expiresAt).toBe(future);
  await expect(f.store.transact(store => store.assertSourceAdmissions('org', [f.stamp(1)]))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
});
test.each(['deleted', 'invalidated', 'revoked'])('%s permissions cannot be implicitly resurrected by save', async state => {
  const f = fixture(); await f.seed(input({ expiresAt: past }), state === 'deleted' ? { deletedAt: NOW } : state === 'invalidated' ? { invalidatedAt: NOW } : {});
  if (state === 'revoked') f.db.records[0].payload.revokedAt = past;
  await expect(f.service.save('org', 'actor', input({ expectedRevision: 1 }))).rejects.toHaveProperty('code', state === 'revoked' ? 'SOCIAL_FACTORY_SOURCE_PERMISSION_REVOKED' : 'SOCIAL_FACTORY_SOURCE_PERMISSION_DELETED');
  expect(f.db.records[0].revision).toBe(1);
});
test('unreadable or malformed permission state fails closed rather than creating a new baseline', async () => {
  const f = fixture(); f.db.permissionUnknown = true;
  await expect(f.service.save('org', 'actor', input())).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_PERMISSION_UNAVAILABLE');
  f.db.permissionUnknown = false; await f.seed(); f.db.records[0].payload = { redacted: true };
  await expect(f.service.save('org', 'actor', input({ expectedRevision: 1 }))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_PERMISSION_STATE_INVALID');
});
test('save scope transition and source descendant redaction commit atomically or roll back together', async () => {
  const f = fixture(); await f.seed(); await f.descendant(); f.db.failRedact = true;
  await expect(f.service.save('org', 'actor', input({ expectedRevision: 1, channelIds: ['new-channel'] }))).rejects.toThrow('redaction failed');
  expect(f.db.records[0].revision).toBe(1); expect(f.db.records[1].payload.text).toBe('private derived text');
  f.db.failRedact = false; await f.service.save('org', 'actor', input({ expectedRevision: 1, channelIds: ['new-channel'] }));
  expect(f.db.records[0].payload.channelIds).toEqual(['new-channel']); expect(f.db.records[1].payload).toEqual({ redacted: true });
});
test('revoke can read expired raw grant and atomically preserves its tombstone while redacting descendants', async () => {
  const f = fixture(); await f.seed(input({ expiresAt: past })); await f.descendant();
  const result = await f.service.revoke('org', 'source', 1); expect(result.redacted).toBe(1);
  const raw = await f.store.readSourcePermissionState('org', 'source'); expect(raw.record.revision).toBe(2); expect(raw.record.payload.revokedAt).toBe(NOW.toISOString());
  expect(await f.store.read('org', 'source_permission', 'source')).toBeNull();
  expect(await f.service.revoke('org', 'source', 2)).toEqual({ redacted: 0 });
  expect((await f.store.readSourcePermissionState('org', 'source')).record.revision).toBe(2);
});
test('failed revoke redaction rolls back the permission update instead of leaving a partial revocation', async () => {
  const f = fixture(); await f.seed(); await f.descendant(); f.db.failRedact = true;
  await expect(f.service.revoke('org', 'source', 1)).rejects.toThrow('redaction failed');
  expect(f.db.records[0].payload.revokedAt).toBeUndefined(); expect(f.db.records[0].revision).toBe(1);
});
test('permission creation serializes with the native fence and invalidates its old absent-permission stamp', async () => {
  const f = fixture(); let entered; let release;
  const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  const native = f.store.transact(async store => { await store.assertSourceAdmissions('org', [f.stamp(null)]); entered(); await gate; await store.put({ organizationId: 'org', kind: 'editorial', id: 'native-derived', payload: { text: 'derived before restricted scope' }, sourceIds: [repository.sourceRef('source')], expectedRevision: 0 }); });
  await started; let saved = false; const saving = f.service.save('org', 'actor', input()).then(() => { saved = true; });
  await Promise.resolve(); expect(saved).toBe(false); release(); await native; await saving;
  expect(await f.store.read('org', 'editorial', 'native-derived')).toBeNull();
  await expect(f.store.transact(store => store.assertSourceAdmissions('org', [f.stamp(null)]))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
});
test('concurrent explicit revision saves cannot both overwrite the same permission', async () => {
  const f = fixture(); await f.seed();
  const results = await Promise.allSettled([f.service.save('org', 'actor', input({ expectedRevision: 1 })), f.service.save('org', 'actor', input({ expectedRevision: 1, channelIds: ['different'] }))]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(row => row.status === 'rejected').reason.code).toBe('SOCIAL_FACTORY_CONFLICT');
});
test('all requested purposes are validated, and registered free export requires an explicit licensed basis', async () => {
  const f = fixture();
  await expect(f.service.save('org', 'actor', input({ purposes: ['editorial', 'licensed_registry_export_v1'] }))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_EXPORT_LICENSE_REQUIRED');
  const saved = await f.service.save('org', 'actor', input({ purposes: ['editorial', 'licensed_registry_export_v1'], basis: 'licensed', acquisition: 'licensed' }));
  expect(saved.payload.purposes).toEqual(['editorial', 'licensed_registry_export_v1']);
});

test('identical still-active owner grant extension preserves native content while old admission stamp becomes stale', async () => {
  const row = source(); row.freshUntil = new Date('2034-01-01T00:00:00Z'); row.currentSnapshot.retentionUntil = new Date('2034-01-01T00:00:00Z');
  const f = fixture(row); await f.service.save('org', 'actor', input()); await f.descendant();
  f.db.records.find(row => row.id === 'derived').expiresAt = new Date(future);
  const before = copy(f.db.records.find(row => row.id === 'derived'));
  const extended = await f.service.save('org', 'actor', input({ expectedRevision: 1, expiresAt: '2032-01-01T00:00:00.000Z', purposes: ['editorial', 'discovery'] }));
  expect(extended.revision).toBe(2); expect(extended.payload.evidenceId).toBe('owner:actor:source:2');
  const retained = f.db.records.find(row => row.id === 'derived');
  expect(retained.payload).toEqual(before.payload); expect(retained.sourceIds).toEqual(before.sourceIds);
  expect(retained.expiresAt.toISOString()).toBe('2032-01-01T00:00:00.000Z');
  await expect(f.store.transact(store => store.assertSourceAdmissions('org', [f.stamp(1)]))).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
  await f.store.transact(store => store.assertSourceAdmissions('org', [f.stamp(2)]));
});
test.each([
  ['scope', { channelIds: ['other-channel'] }, 'actor'],
  ['purpose', { purposes: ['editorial'] }, 'actor'],
  ['provenance', { acquisition: 'upload' }, 'actor'],
  ['basis', { basis: 'owned' }, 'actor'],
  ['shorter expiry', { expiresAt: '2030-06-01T00:00:00.000Z' }, 'actor'],
  ['different attesting owner', {}, 'another-owner'],
])('a %s change still purges derived material instead of masquerading as an extension', async (_name, change, actor) => {
  const f = fixture(); await f.service.save('org', 'actor', input()); await f.descendant();
  await f.service.save('org', actor, input({ expectedRevision: 1, ...change }));
  expect(f.db.records.find(row => row.id === 'derived').payload).toEqual({ redacted: true });
});
test('same Telegram consent extension preserves content but replacing consent provenance purges it', async () => {
  const row = source(); row.canonicalUrl = 'https://t.me/example/10';
  const consent = { evidenceId: 'same-consent', context: 'context', allRelevantUsers: true, explicitInformedAffirmative: true, continued: true };
  const f = fixture(row); await f.service.save('org', 'actor', input({ telegramConsent: consent })); await f.descendant();
  await f.service.save('org', 'actor', input({ expectedRevision: 1, expiresAt: '2032-01-01T00:00:00.000Z', telegramConsent: consent }));
  expect(f.db.records.find(row => row.id === 'derived').payload.text).toBe('private derived text');
  await f.service.save('org', 'actor', input({ expectedRevision: 2, expiresAt: '2033-01-01T00:00:00.000Z', telegramConsent: { ...consent, evidenceId: 'new-consent-evidence' } }));
  expect(f.db.records.find(row => row.id === 'derived').payload).toEqual({ redacted: true });
});
