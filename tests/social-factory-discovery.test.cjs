const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/discovery/';
const { SocialDiscoveryService, discoveryQueries } = loadTypeScriptModule(`${ROOT}social-discovery.service.ts`);
const { RegistryDiscoveryReader, TopicDiscoveryReader } = loadTypeScriptModule(`${ROOT}discovery.adapters.ts`);
const { PersistentSourceRecommendation } = loadTypeScriptModule(`${ROOT}source-recommendation.ts`);
const { ChannelProfileServiceV1 } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/social-factory/profiles/channel-profile.v1.ts',
  { '../social-factory.repository': { sourceRef: id => `source:${id}`, resourceRef: (kind, id) => `${kind}:${id}` } });
const NOW = new Date('2026-11-03T12:00:00Z');
const FUTURE = '2026-11-04T12:00:00Z';
function profile(overrides = {}) {
  return { version: 1, channelId: 'channel-a', platform: 'telegram', audience: 'engineering leads',
    promise: 'Reliable delivery', goals: ['educate'], expertise: ['Temporal workflows'], pillars: ['Temporal'],
    languages: ['en'], geography: ['international'], exclusions: ['gambling'], evidence: [], openQuestions: [], ...overrides };
}
function grant(overrides = {}) {
  return { organizationId: 'org-a', sourceId: 'source-a', revision: 'r1', purposes: ['discovery'],
    basis: 'owned', evidenceId: 'consent-1', expiresAt: FUTURE, origin: 'first_party',
    acquisition: 'first_party', sourceContext: 'company-wiki', channelIds: ['channel-a'], ...overrides };
}
function document(overrides = {}) {
  return { id: 'doc-a', title: 'Temporal patterns', text: 'Temporal workflows improve reliable delivery for engineering leads.',
    origin: 'first_party', retainUntil: FUTURE,
    evidence: { id: 'evidence-a', source: 'source-a', capturedAt: NOW.toISOString(), expiresAt: FUTURE,
      sourceId: 'source-a', ownerScope: 'org-a', purpose: 'discovery',
      rights: 'permitted', access: 'first_party', factStatus: 'unknown', sourceRevision: 'snapshot-a' }, ...overrides };
}
function request(overrides = {}) {
  return { organizationId: 'org-a', profileRevision: 1, profile: profile(),
    sources: [{ id: 'source-a', grant: grant() }], ...overrides };
}
function stand({ documents = [document()], webDocuments = [], disabled = false, now = () => NOW } = {}) {
  const records = new Map();
  const generations = new Map();
  const source = { read: jest.fn(async () => documents) };
  const web = { search: jest.fn(async () => ({ disabled, documents: webDocuments })) };
  const cache = {
    generation: jest.fn(async (org) => String(generations.get(org) || 0)),
    read: jest.fn(async (org, key) => ({ generation: String(generations.get(org) || 0),
      result: records.get(`${org}:${key}`) || null })),
    write: jest.fn(async (org, key, generation, value) => {
      if (generation !== String(generations.get(org) || 0)) return false;
      records.set(`${org}:${key}`, value); return true;
    }),
    invalidateOrganization: jest.fn(async (org) => {
      generations.set(org, (generations.get(org) || 0) + 1);
      for (const key of records.keys()) if (key.startsWith(`${org}:`)) records.delete(key);
    }),
  };
  const shown = new Set();
  const recommendations = { claim: jest.fn(async (org, channel, acknowledged) => {
    const key = `${org}:${channel}`;
    if (shown.has(key)) return false;
    shown.add(key); return !acknowledged;
  }) };
  return { service: new SocialDiscoveryService(source, web, cache, recommendations, now), source, web, cache, records, recommendations };
}

test('cold start offers channel-specific proposals with no sources, paid research or invented statistics', async () => {
  const s = stand();
  const result = await s.service.discover(request({ sources: [] }));
  expect(result.candidates).toEqual([]);
  expect(result.planningPrompts[0]).toMatchObject({ pillar: 'Temporal', status: 'proposal' });
  expect(result.recommendSources).toBe(true);
  expect(s.source.read).not.toHaveBeenCalled();
  expect(s.web.search).not.toHaveBeenCalled();
  expect((await s.service.discover(request({ sources: [] }))).recommendSources).toBe(false);
  const acknowledged = await s.service.discover(request({ sources: [], sourceRecommendationAcknowledged: true }));
  expect(acknowledged.recommendSources).toBe(false);
  const minimal = await s.service.discover(request({ sources: [], profile: profile({ pillars: [], expertise: [] }) }));
  expect(minimal.planningPrompts.length).toBeGreaterThan(0);
});

test('new unsaved channel resolved from company defaults supports discovery with revision zero', async () => {
  const profiles = new ChannelProfileServiceV1({
    store: { read: async () => null, page: async () => ({ items: [], nextCursor: null }) },
    integrations: { getIntegrationById: async () => ({ id: 'channel-a', providerIdentifier: 'telegram', contentLanguage: 'en', deletedAt: null, writingProfile: {} }) },
    brands: { getActiveRuntimeVersion: async () => ({ profile: { id: 'brand-a' },
      version: { id: 'brand-version-a', contentDigest: 'digest-a', content: {
        project: { audiences: [{ name: 'engineering leads' }], positioning: 'Reliable delivery', contentGoals: ['educate'] },
        voice: { defaultLanguage: 'en' }, guardrails: { prohibitedTopics: [], prohibitedClaims: [] },
      } } }) },
  });
  const resolved = await profiles.resolve('org-a', 'channel-a');
  expect(resolved.revision).toBe(0);
  const result = await stand().service.discover(request({ profile: resolved.profile, profileRevision: resolved.revision, sources: [] }));
  expect(result.profileRevision).toBe(0);
  expect(result.planningPrompts.length).toBeGreaterThan(0);
  expect(result.recommendSources).toBe(true);
});

test('a failed run never consumes the one-time invitation; the next successful response presents it', async () => {
  const s = stand();
  s.cache.read.mockRejectedValueOnce(new Error('Redis unavailable'));
  await expect(s.service.discover(request({ sources: [] }))).rejects.toThrow('Redis unavailable');
  expect(s.recommendations.claim).not.toHaveBeenCalled();
  expect((await s.service.discover(request({ sources: [] }))).recommendSources).toBe(true);
  expect((await s.service.discover(request({ sources: [] }))).recommendSources).toBe(false);
});

test('query generation is tied to brief and includes exclusions without leaking source bodies', () => {
  const queries = discoveryQueries(request());
  expect(queries[0]).toContain('Temporal');
  expect(queries[0]).toContain('engineering leads');
  expect(queries[0]).toContain('international');
  expect(queries[0]).toContain('-gambling');
  expect(queries[0]).not.toContain('company-wiki');
});

test('same company channels have distinct relevance and cache contexts', async () => {
  const s = stand();
  const first = await s.service.discover(request());
  expect(first.candidates).toHaveLength(1);
  const second = await s.service.discover(request({ profile: profile({ channelId: 'channel-b', audience: 'bakers',
    promise: 'sourdough bread', expertise: ['baking'], pillars: ['sourdough'] }),
    sources: [{ id: 'source-a', grant: grant({ channelIds: ['channel-b'] }) }] }));
  expect(second.candidates).toHaveLength(0);
  expect(second.contextKey).not.toBe(first.contextKey);
});

test('irrelevant high-performance content does not outrank relevant unknown-performance content', async () => {
  const observed = { availability: 'available', value: 999999, metric: 'views', window: '7d', observedAt: NOW.toISOString() };
  const s = stand({ documents: [document(), document({ id: 'unrelated', title: 'Sourdough', text: 'Baking bread.', performance: observed })] });
  const result = await s.service.discover(request());
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].performance).toEqual({ availability: 'unknown' });
  expect(result.candidates[0].performance).not.toHaveProperty('value');
});

test('real raw zero stays available while missing/invalid observations stay unknown', async () => {
  const valid = { availability: 'available', value: 0, metric: 'views', window: '7d', observedAt: NOW.toISOString(), accountSize: 20, format: 'reel', ageSeconds: 600 };
  for (const observation of [valid, { ...valid, value: -1 }, { ...valid, observedAt: undefined }, { availability: 'restricted' }]) {
    const result = await stand({ documents: [document({ performance: observation })] }).service.discover(request());
    expect(result.candidates[0].performance.availability).toBe(observation === valid ? 'available' :
      observation.availability === 'restricted' ? 'restricted' : 'unknown');
    if (observation === valid) expect(result.candidates[0].performance).toMatchObject({ value: 0, accountSize: 20, format: 'reel' });
  }
});

test.each([
  [{ organizationId: 'org-b' }, 'SOURCE_SCOPE_REQUIRED'],
  [{ channelIds: ['elsewhere'] }, 'SOURCE_SCOPE_REQUIRED'],
  [{ purposes: ['editorial'] }, 'AI_REUSE_PERMISSION_REQUIRED'],
  [{ expiresAt: '2026-11-02T12:00:00Z' }, 'SOURCE_PERMISSION_EXPIRED'],
  [{ revokedAt: NOW.toISOString() }, 'SOURCE_PERMISSION_EXPIRED'],
  [{ evidenceId: '' }, 'SOURCE_PROVENANCE_REQUIRED'],
  [{ origin: 'telegram', acquisition: 'upload' }, 'TELEGRAM_SCOPED_CONSENT_REQUIRED'],
  [{ origin: 'telegram', acquisition: 'licensed' }, 'TELEGRAM_SCOPED_CONSENT_REQUIRED'],
])('rights are checked before source and reusable cache reads: %p', async (change, code) => {
  const s = stand();
  const result = await s.service.discover(request({ sources: [{ id: 'source-a', grant: grant(change) }] }));
  expect(result.gaps).toContainEqual({ sourceId: 'source-a', code });
  expect(result.candidates).toHaveLength(0);
  expect(s.source.read).not.toHaveBeenCalled();
  expect(s.cache.read).not.toHaveBeenCalled();
});

test('Telegram consent is scoped and continued independently of forwarding/upload route', async () => {
  const telegramConsent = { evidenceId: 'consent-all', context: 'chat-1', allRelevantUsers: true,
    explicitInformedAffirmative: true, continued: true };
  for (const consent of [telegramConsent, { ...telegramConsent, context: 'other-chat' }, { ...telegramConsent, continued: false }]) {
    const s = stand({ documents: [document({ origin: 'telegram' })] });
    const result = await s.service.discover(request({ sources: [{ id: 'source-a', grant: grant({ origin: 'telegram',
      acquisition: 'upload', sourceContext: 'chat-1', telegramConsent: consent }) }] }));
    expect(result.candidates).toHaveLength(consent === telegramConsent ? 1 : 0);
  }
});

test('public search cannot bypass platform rights by changing access method', async () => {
  const s = stand({ webDocuments: [document({ origin: 'telegram' }), document({ id: 'yt', origin: 'youtube' })] });
  const result = await s.service.discover(request({ sources: [], allowWebSearch: true }));
  expect(result.candidates).toEqual([]);
  expect(result.gaps.filter(gap => gap.code === 'PLATFORM_REUSE_PERMISSION_REQUIRED')).toHaveLength(2);
});

test('web search reports one aggregated rights gap without leaking or admitting rejected results', async () => {
  const row = id => ({ externalId: id, sourceUrl: `https://example.test/${id}`, title: 'Temporal patterns', excerpt: 'Temporal workflows improve delivery.' });
  const gateway = { check: jest.fn(async () => ({ disabled: false, items: [row('private-a'), row('private-b')] })) };
  const web = new TopicDiscoveryReader(gateway, async (_org, url) => ({ origin: 'web', rights: url.endsWith('/permitted') ? 'permitted' : 'unknown',
    expiresAt: FUTURE, access: 'public', evidenceId: url, sourceId: url }), () => NOW);
  const s = stand();
  const service = new SocialDiscoveryService(s.source, web, s.cache, s.recommendations, () => NOW);
  const refused = await service.discover(request({ sources: [], allowWebSearch: true }));
  expect(refused.gaps).toEqual([{ code: 'WEB_SEARCH_REUSE_PERMISSION_REQUIRED' }]);
  expect(refused.candidates).toEqual([]); expect(JSON.stringify(refused)).not.toMatch(/private-a|private-b/);
  gateway.check.mockResolvedValue({ disabled: false, items: [row('private-a'), row('private-b'), row('permitted')] });
  const result = await service.discover(request({ sources: [], allowWebSearch: true }));
  expect(result.gaps).toEqual([{ code: 'WEB_SEARCH_REUSE_PERMISSION_REQUIRED' }]);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].evidence[0].sourceId).toBe('https://example.test/permitted');
  expect(JSON.stringify(result)).not.toMatch(/private-a|private-b/);
  expect(s.cache.write).not.toHaveBeenCalled();
  gateway.check.mockResolvedValue({ disabled: false, items: [] });
  const empty = await service.discover(request({ sources: [], allowWebSearch: true }));
  expect(empty.gaps).toEqual([]); expect(empty.candidates).toEqual([]);
});

test('disabled or failed research yields useful cold start, never fake observations', async () => {
  const s = stand({ disabled: true });
  let result = await s.service.discover(request({ sources: [], allowWebSearch: true }));
  expect(result.gaps).toContainEqual({ code: 'WEB_SEARCH_DISABLED' });
  expect(result.planningPrompts).toHaveLength(1);
  expect(result.candidates).toEqual([]);
  s.web.search.mockRejectedValue(new Error('private-provider-key'));
  result = await s.service.discover(request({ sources: [], allowWebSearch: true }));
  expect(JSON.stringify(result)).not.toContain('private-provider-key');
  expect(result.gaps).toContainEqual({ code: 'WEB_SEARCH_UNAVAILABLE' });
});

test('cache revalidates live registered sources and does not hide new snapshot material', async () => {
  const s = stand();
  await s.service.discover(request());
  const cached = await s.service.discover(request());
  expect(cached.fromCache).toBe(true);
  expect(s.source.read).toHaveBeenCalledTimes(2);
  s.source.read.mockResolvedValue([document(), document({ id: 'doc-b', title: 'Temporal retry' })]);
  expect((await s.service.discover(request())).candidates).toHaveLength(2);
  s.source.read.mockRejectedValue(new Error('Source purged'));
  const purged = await s.service.discover(request());
  expect(purged.fromCache).toBe(false);
  expect(purged.candidates).toHaveLength(0);
});

test('source revocation while reading blocks stale in-flight cache writes and delivery', async () => {
  const s = stand();
  s.source.read.mockImplementation(async () => { await s.service.invalidateOrganization('org-a'); return [document()]; });
  await expect(s.service.discover(request())).rejects.toThrow('DISCOVERY_INVALIDATED_DURING_RUN');
  expect(s.records.size).toBe(0);
});

test('retention respects the shortest grant, evidence or document expiry; stale/future evidence is omitted', async () => {
  const expiresAt = '2026-11-03T12:01:00Z';
  const s = stand({ documents: [document({ retainUntil: expiresAt }),
    document({ id: 'stale', retainUntil: '2026-11-03T11:00:00Z' }),
    document({ id: 'future', evidence: { ...document().evidence, capturedAt: FUTURE } })] });
  const result = await s.service.discover(request());
  expect(result.expiresAt).toBe(new Date(expiresAt).toISOString());
  expect(result.candidates).toHaveLength(1);
  expect(s.cache.write.mock.calls[0][4]).toBe(60000);
});

test('hard exclusions and origin mismatch prevent reuse', async () => {
  const s = stand({ documents: [document({ text: 'Temporal gambling workflow' }), document({ id: 'mismatch', origin: 'telegram' })] });
  const result = await s.service.discover(request());
  expect(result.candidates).toHaveLength(0);
  expect(result.gaps).toContainEqual({ sourceId: 'source-a', code: 'SOURCE_ORIGIN_MISMATCH' });
});

test('cross-tenant, revoked and wrong-purpose evidence never enters discovery', async () => {
  for (const change of [{ ownerScope: 'org-b' }, { revokedAt: NOW.toISOString() }, { purpose: 'training' }, { sourceId: undefined }]) {
    const s = stand({ documents: [document({ evidence: { ...document().evidence, ...change } })] });
    expect((await s.service.discover(request())).candidates).toEqual([]);
  }
});

test.each([
  ['Клиники', 'пациенты', 'Понятная стоматология', 'Стоматология: как выбрать щётку', 'Стоматология для пациентов: правила ухода'],
  ['Furniture', 'designers', 'Durable materials', 'Furniture material guide', 'Furniture for designers and durable materials'],
  ['Consulting', 'founders', 'Practical strategy', 'Consulting playbook', 'Consulting for founders: practical strategy'],
])('representative local service, product and B2B briefs remain channel-relevant: %s', async (pillar, audience, promise, title, text) => {
  const s = stand({ documents: [document({ title, text })] });
  const result = await s.service.discover(request({ profile: profile({ audience, promise, pillars: [pillar], expertise: [] }) }));
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].performance.availability).toBe('unknown');
});

test('accepted in-scope findings change the next queries/plan and expired or withdrawn findings do not', async () => {
  const finding = { version: 1, id: 'finding-a', channelIds: ['channel-a'], statement: 'Prioritize incident walkthroughs',
    status: 'accepted', uncertainty: 'association from a small sample', observationIds: ['observation-a'], sourceIds: ['publication-a'],
    expiresAt: FUTURE, interpretation: 'association' };
  const s = stand();
  const first = await s.service.discover(request({ sources: [], findings: [finding] }));
  expect(first.queries[0]).toContain(finding.statement);
  expect(first.planningPrompts[0].angle).toContain(finding.uncertainty);
  expect(first.findingIds).toEqual(['finding-a']);
  const withdrawn = await s.service.discover(request({ sources: [], findings: [{ ...finding, status: 'withdrawn' }] }));
  expect(withdrawn.findingIds).toEqual([]);
  expect(withdrawn.contextKey).not.toBe(first.contextKey);
});

test('registry adapter uses organization-filtered immutable material and preserves unknown fact status', async () => {
  const repository = { getDraftMaterial: jest.fn(async () => ({ source: { id: 'source-a', organizationId: 'org-a',
    kind: 'MANUAL', displayName: 'Wiki' }, snapshot: { id: 'snapshot-a', normalizedTitle: 'Temporal guide' },
    evidence: [{ id: 'evidence-a', excerpt: 'Temporal workflow', observedAt: NOW, freshUntil: null }] })) };
  const reader = new RegistryDiscoveryReader(repository, () => NOW);
  const result = await reader.read('org-a', { id: 'source-a', grant: grant() });
  expect(repository.getDraftMaterial).toHaveBeenCalledWith('org-a', 'source-a');
  expect(result[0].evidence).toMatchObject({ factStatus: 'unknown', sourceRevision: 'snapshot-a', purpose: 'discovery' });
  await expect(reader.read('org-b', { id: 'source-a', grant: grant() })).rejects.toThrow('SCOPE_MISMATCH');
});

test('topic adapter uses existing query gateway and never treats popularity prose as metrics or access as license', async () => {
  const gateway = { check: jest.fn(async () => ({ disabled: false, items: [{ externalId: 'a', title: 'Temporal',
    sourceUrl: 'https://t.me/example/1', excerpt: 'Temporal workflow', reason: { en: '1000 views', ru: '1000 просмотров' } }] })) };
  const rights = jest.fn(async () => ({ origin: 'web', rights: 'unknown', expiresAt: FUTURE,
    access: 'public', evidenceId: 'policy-1', sourceId: 'source-web-1' }));
  const reader = new TopicDiscoveryReader(gateway, rights, () => NOW);
  const result = await reader.search('org-a', 'Temporal');
  expect(gateway.check).toHaveBeenCalledWith('org-a', 'Temporal');
  expect(result.documents[0].origin).toBe('telegram');
  expect(result.documents[0].evidence.rights).toBe('unknown');
  expect(result.documents[0]).not.toHaveProperty('performance');
});

test('optional source recommendation is persisted per tenant/channel and concurrent creates do not nag', async () => {
  const rows = new Map();
  const store = {
    transact: async fn => fn(store),
    read: async (org, kind, id) => rows.get(`${org}:${kind}:${id}`),
    put: async value => { rows.set(`${value.organizationId}:${value.kind}:${value.id}`, value); return value; },
  };
  const first = new PersistentSourceRecommendation(store, () => NOW);
  expect(await first.claim('org-a', 'channel-a', false)).toBe(true);
  expect(await new PersistentSourceRecommendation(store, () => NOW).claim('org-a', 'channel-a', false)).toBe(false);
  expect(await first.claim('org-b', 'channel-a', false)).toBe(true);
  expect(await first.claim('org-a', 'channel-b', true)).toBe(false);
  const racingStore = { read: async () => null,
    put: async () => { throw { code: 'SOCIAL_FACTORY_CONFLICT' }; },
    transact: async fn => fn(racingStore) };
  const racing = new PersistentSourceRecommendation(racingStore, () => NOW);
  expect(await racing.claim('org-a', 'race', false)).toBe(false);
});
