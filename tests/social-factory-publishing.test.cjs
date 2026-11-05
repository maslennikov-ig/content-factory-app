const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { fixture: publicationFixture } = require('./helpers/publication-v109.module.cjs');
const root = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/';
class DomainError extends Error { constructor(code) { super(code); this.code = code; } }
const mocks = {
  '../social-factory.repository': { SocialFactoryRepository: class {}, SocialFactoryError: DomainError },
  '../../../database/prisma/integrations/integration.service': { IntegrationService: class {} },
  '../../../database/prisma/posts/posts.service': { PostsService: class {} },
  '../../../integrations/integration.manager': { IntegrationManager: class {} },
  '../../pieces/piece.service': { PieceService: class {} },
  '../../pieces/piece.repository': { PieceRepository: class {} },
};
const { SocialFactoryPublishingService } = loadTypeScriptModule(root + 'publishing/publishing.service.ts', mocks);
const { CampaignService, approvalDigest } = loadTypeScriptModule(root + 'campaign/campaign.service.ts', mocks);
const { AutonomyService } = loadTypeScriptModule(root + 'autonomy/autonomy.service.ts', mocks);
const { providerCapability } = loadTypeScriptModule(root + 'publishing/provider-capabilities.ts');

function memoryStore() {
  const rows = new Map(); let transactionActive = false;
  const key = (org, kind, id) => [org, kind, id].join(':');
  const repo = {
    read: async (org, kind, id) => structuredClone(rows.get(key(org, kind, id)) || null),
    list: async (org, kind, _limit, parentId) => structuredClone([...rows.values()].filter(row => row.organizationId === org && row.kind === kind && (parentId === undefined || row.parentId === parentId))),
    put: async input => {
      const k = key(input.organizationId, input.kind, input.id), before = rows.get(k);
      if ((before?.revision || 0) !== input.expectedRevision) throw new DomainError('SOCIAL_FACTORY_CONFLICT');
      const row = { ...input, parentId: input.parentId ?? before?.parentId ?? null, revision: input.expectedRevision + 1 };
      rows.set(k, structuredClone(row)); return structuredClone(row);
    },
    transact: async work => {
      if (transactionActive) return work(repo);
      const savedRows = structuredClone([...rows]); const savedNative = repo.captureNative?.(); transactionActive = true;
      try { return await work(repo); }
      catch (error) { rows.clear(); for (const [k, v] of savedRows) rows.set(k, v); if (savedNative) repo.restoreNative(savedNative); throw error; }
      finally { transactionActive = false; }
    },
  };
  return repo;
}
async function fixture({ platform = 'telegram', format = 'post', withEditor = true, authority = 'user' } = {}) {
  const repo = memoryStore(), campaigns = new CampaignService(repo), autonomy = new AutonomyService(repo);
  const f = publicationFixture();
  f.integration.providerIdentifier = platform;
  f.provider.editor = 'none';
  const nativePost = f.client.row;
  nativePost.integration = f.integration;
  const pieces = {
    scheduleAdaptation: jest.fn(async () => { nativePost.state = 'QUEUE'; return { adaptation: {} }; }),
    unscheduleAdaptation: jest.fn(async () => { nativePost.state = 'DRAFT'; return { adaptation: {} }; }),
  };
  nativePost.state = 'DRAFT';
  const native = {
    workspaceDraft: async (org, piece, derivation) => org === 'a' && piece === 'piece' && derivation === 'derivation'
      ? { id: derivation, platform, postId: nativePost.id, post: structuredClone(nativePost) } : null,
    findMedia: async (org, id) => org === 'a' && id === 'asset' ? { id, path: '/image.jpg' } : null,
  };
  const integrationService = { getIntegrationById: async (org, id) => org === 'a' && id === f.integration.id ? f.integration : null };
  const posts = { getPostById: async (id, org) => org === 'a' && id === nativePost.id ? structuredClone(nativePost) : null };
  const service = new SocialFactoryPublishingService(repo, campaigns, autonomy, integrationService,
    { getSocialIntegration: () => f.provider }, pieces, native, posts);
  const campaign = await campaigns.create('a', { actorId: 'owner', requestId: 'campaign-1', name: 'Campaign',
    startsAt: new Date(Date.now() + 3600_000).toISOString(), endsAt: new Date(Date.now() + 7200_000).toISOString(),
    timeZone: 'Europe/Moscow', allocations: [{ channelId: f.integration.id, platform, format, count: 1 }] });
  const itemId = campaign.itemIds[0];
  let item = await campaigns.setMaterial('a', campaign.id, itemId, { expectedContentRevision: 1,
    material: { version: 1, channelId: f.integration.id, platform, format, title: 'Title', hook: 'Hook',
      body: nativePost.content, assets: [], evidence: [], settings: {}, playbook: { version: '1', sourceDate: '2026-11-03' },
      ...(withEditor ? { pieceId: 'piece', derivationId: 'derivation' } : {}) } });
  item = await campaigns.approve('a', campaign.id, itemId, { actorId: 'owner', expectedContentRevision: item.contentRevision, digest: approvalDigest(item) });
  const input = { campaignId: campaign.id, itemId, requestId: 'delivery-1', action: 'schedule', authority,
    actorId: 'owner', expectedContentRevision: item.contentRevision, approvalDigest: item.approval.digest };
  const { SocialFactoryRepository: AtomicRepository } = loadTypeScriptModule(root + 'social-factory.repository.ts');
  repo.client = () => f.client;
  repo.captureNative = () => structuredClone(nativePost);
  repo.restoreNative = value => { for (const key of Object.keys(nativePost)) delete nativePost[key]; Object.assign(nativePost, value); };
  repo.claimNativePublication = (key, authorize) => AtomicRepository.prototype.claimNativePublication.call(repo, key, authorize);
  f.activity.publicationGuard = service;
  f.service.getPostById = posts.getPostById;
  return { ...f, repo, campaigns, autonomy, pieces, nativePost, native, service, campaign, item, input };
}

test('scheduling uses the native adaptation, preserves approval and never claims provider publication', async () => {
  const f = await fixture();
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'scheduled', postId: 'p1' });
  expect(f.pieces.scheduleAdaptation).toHaveBeenCalledWith('a', 'piece', 'derivation', { date: f.item.scheduledAt }, 'ru');
  const item = (await f.campaigns.get('a', f.campaign.id)).items[0];
  expect(item).toMatchObject({ state: 'scheduled', contentRevision: 2, postId: 'p1' });
  expect(item.publication).toBeUndefined();
  expect(f.calls.writes).toBe(0);
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'scheduled' });
  expect(f.pieces.scheduleAdaptation).toHaveBeenCalledTimes(1);
});

test('actual V106 receipt projects publication; replay does not send or change receipt observation time', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  await f.activity.postSocialV109(f.integration, [f.nativePost], 'initial');
  const published = (await f.campaigns.get('a', f.campaign.id)).items[0];
  expect(published).toMatchObject({ state: 'published', publication: { externalId: 'remote-1', provider: 'telegram', revision: 2 } });
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).resolves.toEqual(f.receipts);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].publication.publishedAt).toBe(published.publication.publishedAt);
  expect(f.calls.writes).toBe(1);
});

test('stopping a queued campaign blocks the activity even if native unscheduling was unavailable', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  await f.campaigns.stop('a', f.campaign.id, 'owner');
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_PUBLICATION_REVOKED');
  expect(f.calls.writes).toBe(0); expect(f.nativePost.publicationJournal).toBeNull();
});

test('editing queued native content invalidates the campaign approval snapshot', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  f.nativePost.content = 'Editor changed independently';
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_EDITOR_REVISION_MISMATCH');
  expect(f.calls.writes).toBe(0);
});

test('lost provider result remains uncertain and cannot automatically submit again', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  f.provider.post = async () => { f.calls.writes++; throw new Error('response lost'); };
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('type', 'publication_uncertain');
  await expect(f.service.deliver('a', { ...f.input, requestId: 'retry' })).resolves.toMatchObject({ state: 'uncertain' });
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('type', 'publication_uncertain');
  expect(f.calls.writes).toBe(1);
});

test('failure to project a confirmed receipt retries projection and preserves exactly one send', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  const real = f.service.syncReceipt.bind(f.service); let fail = true;
  f.service.syncReceipt = async (...args) => { if (fail) { fail = false; throw new Error('projection unavailable'); } return real(...args); };
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toThrow('projection unavailable');
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
});

test('missing editor reference yields draft continuation, and another tenant cannot resolve a campaign', async () => {
  const f = await fixture({ withEditor: false });
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'draft' });
  await expect(f.service.deliver('b', f.input)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_NOT_FOUND');
  expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

test('provider-specific capability is conservative about Instagram Story account type and link stickers', () => {
  const integration = { id: 'channel', providerIdentifier: 'instagram', token: 'private', additionalSettings: '[]' };
  const provider = { post: () => {}, postAnalytics: () => {} };
  const unknown = providerCapability(integration, provider);
  expect(unknown.formats).not.toContain('story'); expect(unknown.links).not.toContain('story');
  const business = providerCapability({ ...integration, additionalSettings: JSON.stringify([{ key: 'account_type', value: 'BUSINESS' }]) }, provider);
  expect(business.formats).toContain('story');
  expect(JSON.stringify(business)).not.toContain('private');
  expect(providerCapability({ ...integration, disabled: true }, provider).publishing).toBe('unavailable');
});

test('unsupported account/format and missing TikTok item consent offer manual continuation', async () => {
  const story = await fixture({ platform: 'instagram', format: 'story' });
  await expect(story.service.deliver('a', story.input)).resolves.toMatchObject({ state: 'manual' });
  const tiktok = await fixture({ platform: 'tiktok', format: 'short' });
  await expect(tiktok.service.deliver('a', tiktok.input)).resolves.toMatchObject({ state: 'manual' });
  expect(story.pieces.scheduleAdaptation).not.toHaveBeenCalled(); expect(tiktok.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

test('queue cancellation uses native unschedule and leaves the activity permanently blocked', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  await f.campaigns.stop('a', f.campaign.id, 'owner');
  await expect(f.service.cancelPending('a', f.campaign.id)).resolves.toEqual({ cancelled: [f.item.id], blocked: [] });
  expect(f.pieces.unscheduleAdaptation).toHaveBeenCalledWith('a', 'piece', 'derivation', 'ru');
  expect(f.nativePost.state).toBe('DRAFT');
});

test('capabilities never promise deprecated YouTube favorites or external description clicks', () => {
  const result = providerCapability({ id: 'yt', providerIdentifier: 'youtube', token: 'private' }, { post() {}, postAnalytics() {} });
  expect(result.metrics).not.toContain('favorites'); expect(result.links).not.toContain('description');
});

test('grant revoked after scheduling is rechecked at the real provider boundary', async () => {
  const f = await fixture({ authority: 'agent' });
  const grant = await f.autonomy.grant('a', { authority: 'user', actorId: 'owner', requestId: 'grant-1',
    mode: 'prepare_approve', channelIds: [f.integration.id], actions: ['schedule', 'publish'],
    expiresAt: new Date(Date.now() + 86400_000).toISOString(), platformConsentIds: [] });
  await f.service.deliver('a', { ...f.input, grantId: grant.id });
  await f.autonomy.revoke('a', grant.id, 'owner');
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('code', 'AUTONOMY_GRANT_INACTIVE');
  expect(f.calls.writes).toBe(0); expect(f.nativePost.publicationJournal).toBeNull();
});

test('source revocation keeps the durable binding and fails closed when approved material is withdrawn', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  const record = await f.repo.read('a', 'campaign_item', f.item.id);
  delete record.payload.material; delete record.payload.approval;
  record.payload.contentRevision++; record.payload.state = 'needs_input';
  record.payload.blocker = { code: 'SOURCE_REVOKED', detail: 'Source withdrawn.' };
  await f.repo.put({ ...record, expectedRevision: record.revision });
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_PUBLICATION_REVOKED');
  expect(await f.repo.read('a', 'publication_binding', 'p1')).not.toBeNull();
  expect(f.calls.writes).toBe(0);
});

test('actual media references are tenant-scoped and must match editor attachments', async () => {
  const f = await fixture();
  const record = await f.repo.read('a', 'campaign_item', f.item.id);
  record.payload.material.assets = [{ id: 'visual', mediaId: 'other-tenant-media', kind: 'image', mimeType: 'image/jpeg', role: 'cover', provenance: { sourceIds: [], revision: '1' } }];
  f.nativePost.image = JSON.stringify([{ id: 'other-tenant-media', path: '/private.jpg' }]);
  await f.repo.put({ ...record, expectedRevision: record.revision });
  await expect(f.service.deliver('a', f.input)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_MEDIA_NOT_FOUND');
  expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

test('an already queued unrelated post cannot be adopted by a campaign', async () => {
  const f = await fixture(); f.nativePost.state = 'QUEUE';
  await expect(f.service.deliver('a', f.input)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_EDITOR_NOT_DRAFT');
  expect(await f.repo.read('a', 'publication_binding', 'p1')).toBeNull();
});

test('unavailable guard repository blocks external writes', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  f.repo.read = async () => { throw new Error('repository unavailable'); };
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toThrow('repository unavailable');
  expect(f.calls.writes).toBe(0); expect(f.nativePost.publicationJournal).toBeNull();
});

test('known native enqueue failure can retry the same approved post without recreating material', async () => {
  const f = await fixture();
  f.pieces.scheduleAdaptation.mockRejectedValueOnce(new Error('native queue unavailable'));
  await expect(f.service.deliver('a', f.input)).rejects.toThrow('native queue unavailable');
  const failed = (await f.campaigns.get('a', f.campaign.id)).items[0];
  expect(failed.state).toBe('failed'); expect(f.nativePost.publicationJournal).toBeNull();
  await f.campaigns.retry('a', f.campaign.id, [f.item.id]);
  await expect(f.service.deliver('a', { ...f.input, requestId: 'known-local-retry' })).resolves.toMatchObject({ state: 'scheduled' });
  await f.activity.postSocialV109(f.integration, [f.nativePost], 'initial');
  expect(f.calls.writes).toBe(1);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].publication.externalId).toBe('remote-1');
});

test('stop racing the native queue RPC cancels the newly queued post before any external send', async () => {
  const f = await fixture();
  f.pieces.scheduleAdaptation.mockImplementationOnce(async () => {
    await f.campaigns.stop('a', f.campaign.id, 'owner');
    f.nativePost.state = 'QUEUE';
    return { adaptation: {} };
  });
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'draft' });
  expect(f.nativePost.state).toBe('DRAFT'); expect(f.pieces.unscheduleAdaptation).toHaveBeenCalledTimes(1);
  expect(f.calls.writes).toBe(0);
});

test('lost native queue response is recovered by inspecting the same post and linking its scheduled state', async () => {
  const f = await fixture();
  f.pieces.scheduleAdaptation.mockImplementationOnce(async () => { f.nativePost.state = 'QUEUE'; throw new Error('queue response lost'); });
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'scheduled', postId: 'p1' });
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('scheduled');
  expect(f.pieces.scheduleAdaptation).toHaveBeenCalledTimes(1);
});

test('native provider settings outside the approved material cannot silently change publication behavior', async () => {
  const f = await fixture(); f.nativePost.settings = JSON.stringify({ disable_notification: true });
  await expect(f.service.deliver('a', f.input)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_EDITOR_SETTINGS_MISMATCH');
  expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

test('TikTok inbox upload is manual continuation and never counted as publication', async () => {
  const f = await fixture({ platform: 'tiktok', format: 'short' });
  const record = await f.repo.read('a', 'campaign_item', f.item.id);
  record.payload.material.settings.content_posting_method = 'UPLOAD';
  await f.repo.put({ ...record, expectedRevision: record.revision });
  await expect(f.service.deliver('a', { ...f.input, requiredConsentId: 'item-consent' })).resolves.toMatchObject({ state: 'manual' });
  expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

async function threadFixture(options = {}) {
  const f = await fixture({ platform: 'threads', format: 'thread', ...options });
  const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
  const { Prisma } = require('@prisma/client');
  const { PublicationStoreV106 } = loadWithMocks('libraries/nestjs-libraries/src/database/prisma/posts/publication-store.v106.ts');
  const { PieceRepository } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
    '../materials/content-material.repository': { ContentMaterialRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  });
  const texts = ['Synthetic post', 'Second post', 'Third post'];
  const material = structuredClone(f.item.material); material.posts = texts.map((text, index) => ({ index, text }));
  f.item = await f.campaigns.setMaterial('a', f.campaign.id, f.item.id, { expectedContentRevision: f.item.contentRevision, material });
  f.item = await f.campaigns.approve('a', f.campaign.id, f.item.id, { actorId: 'owner', expectedContentRevision: f.item.contentRevision, digest: approvalDigest(f.item) });
  f.input.expectedContentRevision = f.item.contentRevision; f.input.approvalDigest = f.item.approval.digest;
  const rows = [f.nativePost, ...texts.slice(1).map((content, index) => ({ ...structuredClone(f.nativePost), id: `p${index + 2}`, content, parentPostId: `p${index + 1}` }))];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    if (value && typeof value === 'object' && 'equals' in value) return value.equals === Prisma.DbNull ? row[key] === null : JSON.stringify(row[key]) === JSON.stringify(value.equals);
    return row[key] === value;
  });
  const client = { post: {
    findFirst: async ({ where }) => structuredClone(rows.find(row => matches(row, where)) || null),
    findMany: async ({ where }) => structuredClone(rows.filter(row => matches(row, where))),
    updateMany: async ({ where, data }) => { const selected = rows.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, structuredClone(data))); return { count: selected.length }; },
  }, socialFactoryRecord: { findFirst: async ({ where }) => f.repo.read(where.organizationId, where.kind, where.id) } };
  const nativeRepository = new PieceRepository({ model: { $transaction: work => work(client) } }, {}, {});
  f.native.setNativeThreadQueue = nativeRepository.setNativeThreadQueue.bind(nativeRepository);
  f.service.posts.getPostById = async (id, org) => org === 'a' ? structuredClone(rows.find(row => row.id === id) || null) : null;
  f.service.posts.getPostsRecursively = async (id, _include, org) => org === 'a' && id === 'p1' ? structuredClone(rows) : [];
  f.repo.client = () => client;
  f.repo.captureNative = () => structuredClone(rows);
  f.repo.restoreNative = saved => saved.forEach((value, index) => { for (const key of Object.keys(rows[index])) delete rows[index][key]; Object.assign(rows[index], value); });
  f.activity.posts.getPostById = f.service.posts.getPostById;
  const journal = new PublicationStoreV106(client);
  Object.assign(f.activity.posts, {
    inspectPublicationV106: key => journal.inspect(key), claimPublicationV106: key => journal.claim(key),
    confirmPublicationV106: (key, receipts) => journal.confirm(key, receipts), markPublicationUncertainV106: key => journal.markUncertain(key),
  });
  f.provider.comment = async (_id, _parent, _last, _token, details) => { f.calls.comments++; const id = details[0].id;
    return [{ id, postId: `remote-${id}`, releaseURL: `https://threads.invalid/${id}`, status: 'success' }]; };
  return { ...f, rows };
}
const sendRoot = f => f.activity.postSocialV109(f.integration, [f.rows[0]], 'initial');
const sendReply = (f, index) => f.activity.postCommentV109('remote-1', index > 1 ? `remote-p${index}` : undefined, f.integration, [f.rows[index]], 'initial');

test('full native Threads chain arms replies and completes only after every real V106 receipt', async () => {
  const f = await threadFixture();
  await expect(f.service.deliver('a', f.input)).resolves.toMatchObject({ state: 'scheduled' });
  expect(f.rows.map(row => row.state)).toEqual(['QUEUE', 'QUEUE', 'QUEUE']);
  await sendRoot(f);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('submitting');
  await expect(f.service.reconcile('a', f.campaign.id, f.item.id)).resolves.toMatchObject({ state: 'uncertain', externalId: 'remote-1' });
  expect((await f.autonomy.getAction('a', (await f.campaigns.get('a', f.campaign.id)).items[0].actionId)).state).toBe('submitting');
  await sendReply(f, 1);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].publication).toBeUndefined();
  await sendReply(f, 2);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0]).toMatchObject({ state: 'published', publication: { externalId: 'remote-1', revision: 3 } });
  await sendRoot(f); await sendReply(f, 1); await sendReply(f, 2);
  expect(f.calls).toMatchObject({ writes: 1, comments: 2 });
});

test('stop after a thread root was accepted blocks every remaining reply and disarms unsent native children', async () => {
  const f = await threadFixture(); await f.service.deliver('a', f.input); await sendRoot(f);
  await f.campaigns.stop('a', f.campaign.id, 'owner');
  await expect(sendReply(f, 1)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_PUBLICATION_REVOKED');
  await f.service.cancelPending('a', f.campaign.id);
  expect(f.rows.map(row => row.state)).toEqual(['PUBLISHED', 'DRAFT', 'DRAFT']);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('cancelled');
  expect(f.calls).toMatchObject({ writes: 1, comments: 0 });
});

test('lost reply response keeps partial thread uncertain and never duplicates root or reply', async () => {
  const f = await threadFixture(); await f.service.deliver('a', f.input); await sendRoot(f);
  f.provider.comment = async () => { f.calls.comments++; throw new Error('reply response lost'); };
  await expect(sendReply(f, 1)).rejects.toHaveProperty('type', 'publication_uncertain');
  await expect(sendReply(f, 1)).rejects.toHaveProperty('type', 'publication_uncertain');
  await expect(sendReply(f, 2)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_THREAD_PREDECESSOR_UNCONFIRMED');
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('uncertain');
  expect(f.calls).toMatchObject({ writes: 1, comments: 1 });
});

test('editing a native reply invalidates the complete approved thread before the first send', async () => {
  const f = await threadFixture(); await f.service.deliver('a', f.input);
  f.rows[1].content = 'Changed reply';
  await expect(sendRoot(f)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_EDITOR_REVISION_MISMATCH');
  expect(f.calls).toMatchObject({ writes: 0, comments: 0 });
});

test('revoking a thread grant between accepted root and first reply blocks remaining provider writes', async () => {
  const f = await threadFixture({ authority: 'agent' });
  const grant = await f.autonomy.grant('a', { authority: 'user', actorId: 'owner', requestId: 'thread-grant',
    mode: 'prepare_approve', channelIds: [f.integration.id], actions: ['schedule', 'publish'],
    expiresAt: new Date(Date.now() + 86400_000).toISOString(), platformConsentIds: [] });
  await f.service.deliver('a', { ...f.input, grantId: grant.id }); await sendRoot(f);
  await f.autonomy.revoke('a', grant.id, 'owner');
  await expect(sendReply(f, 1)).rejects.toHaveProperty('code', 'AUTONOMY_GRANT_INACTIVE');
  await f.service.cancelPending('a', f.campaign.id);
  expect(f.rows.map(row => row.state)).toEqual(['PUBLISHED', 'DRAFT', 'DRAFT']);
  expect(f.calls).toMatchObject({ writes: 1, comments: 0 });
});

test('source withdrawal between accepted thread parts prevents all remaining replies', async () => {
  const f = await threadFixture(); await f.service.deliver('a', f.input); await sendRoot(f);
  const record = await f.repo.read('a', 'campaign_item', f.item.id);
  record.payload.contentRevision++; delete record.payload.material; delete record.payload.approval;
  record.payload.state = 'needs_input'; record.payload.blocker = { code: 'SOURCE_REVOKED', detail: 'Source withdrawn.' };
  await f.repo.put({ ...record, expectedRevision: record.revision });
  await expect(sendReply(f, 1)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_PUBLICATION_REVOKED');
  await f.service.cancelPending('a', f.campaign.id);
  expect(f.rows[1].state).toBe('DRAFT'); expect(f.rows[2].state).toBe('DRAFT');
  expect(f.calls).toMatchObject({ writes: 1, comments: 0 });
});

test('V109 ignores stale workflow content/settings/media and sends only the freshly approved native row', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  let outbound;
  f.provider.post = async (_id, _token, details) => { f.calls.writes++; outbound = details[0]; return f.receipts; };
  const stale = { ...f.nativePost, content: 'STALE UNAPPROVED CONTENT', settings: JSON.stringify({ privacy: 'other' }), image: JSON.stringify([{ id: 'foreign', path: '/foreign.jpg' }]) };
  await f.activity.postSocialV109(f.integration, [stale], 'initial');
  expect(outbound).toMatchObject({ message: 'Synthetic post', settings: {}, media: [] });
  expect(f.calls.writes).toBe(1);
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('published');
});

test('V109 validates the final outbound payload after native preparation before admission or journal claim', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  f.activity.posts.updateTags = async (_org, posts) => posts.map(post => ({ ...post, content: 'Unexpected prepared replacement' }));
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_OUTBOUND_APPROVAL_MISMATCH');
  expect(f.calls.writes).toBe(0); expect(f.nativePost.publicationJournal).toBeNull();
  const item = (await f.campaigns.get('a', f.campaign.id)).items[0];
  expect((await f.autonomy.getAction('a', item.actionId)).state).toBe('reserved');
});

test('V109 atomically rolls back submitting when the native journal claim fails before any provider write', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  const update = f.client.post.updateMany; let fail = true;
  f.client.post.updateMany = async args => { if (fail && args.data.publicationJournal) { fail = false; throw new Error('claim DB failure before journal'); } return update(args); };
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).rejects.toThrow('claim DB failure before journal');
  expect(f.nativePost.publicationJournal).toBeNull(); expect(f.calls.writes).toBe(0);
  const item = (await f.campaigns.get('a', f.campaign.id)).items[0];
  expect((await f.autonomy.getAction('a', item.actionId)).state).toBe('reserved');
  await expect(f.activity.postSocialV109(f.integration, [f.nativePost], 'initial')).resolves.toEqual(f.receipts);
  expect(f.calls.writes).toBe(1);
});

test('actual V109 workflow sends the complete native thread through versioned guarded activities', async () => {
  const f = await threadFixture(); await f.service.deliver('a', f.input);
  f.activity.posts.getPostsRecursively = f.service.posts.getPostsRecursively;
  const { workflow } = require('./helpers/publication-v109.module.cjs');
  const run = workflow({
    getPost: async () => f.rows[0], getPostsListV109: (...args) => f.activity.getPostsListV109(...args),
    postSocialV109: (...args) => f.activity.postSocialV109(...args), postCommentV109: (...args) => f.activity.postCommentV109(...args),
    startPublicationStreakV109: async () => ({ started: true }), isCommentable: async () => true,
    inAppNotification: async () => {}, changeState: async () => {}, sendWebhooksV108: async () => {},
    internalPlugs: async () => [], globalPlugs: async () => [],
  });
  await run({ taskQueue: 'threads', postId: 'p1', organizationId: 'a' });
  expect(f.calls).toMatchObject({ writes: 1, comments: 2 });
  expect((await f.campaigns.get('a', f.campaign.id)).items[0].state).toBe('published');
});

test('V110 recovery dynamically keeps bound campaign roots on V109 and ordinary posts on V108', async () => {
  const f = await fixture(); await f.service.deliver('a', f.input);
  const signal = jest.fn(async () => {});
  f.activity.posts.searchForMissingThreeHoursPosts = async () => [f.nativePost, { ...f.nativePost, id: 'ordinary' }];
  f.temporal.client.getRawClient = () => ({ workflow: { signalWithStart: signal } });
  await f.activity.searchForMissingThreeHoursPostsV110();
  expect(signal.mock.calls.map(call => call[0])).toEqual(['postWorkflowV109', 'postWorkflowV108']);
});

test('confirmed optional YouTube-cover warning remains published and visible through the native campaign reader without a second send',async()=>{
 const {YOUTUBE_THUMBNAIL_FAILED_STATUS,YOUTUBE_THUMBNAIL_WARNING}=loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/publication-warnings.ts');
 const f=await fixture();
 f.provider.post=async()=>{f.calls.writes++;return [{...f.receipts[0],status:YOUTUBE_THUMBNAIL_FAILED_STATUS}];};
 await f.service.deliver('a',f.input);
 await f.activity.postSocialV109(f.integration,[f.nativePost],'initial');
 const first=await f.service.reconcile('a',f.campaign.id,f.item.id);
 expect(first).toMatchObject({state:'published',externalId:'remote-1',reason:YOUTUBE_THUMBNAIL_WARNING});
 const item=(await f.campaigns.get('a',f.campaign.id)).items[0];
 expect(item).toMatchObject({state:'published',publication:{externalId:'remote-1'},blocker:{code:'PUBLISHED',detail:YOUTUBE_THUMBNAIL_WARNING}});
 expect(await f.service.reconcile('a',f.campaign.id,f.item.id)).toEqual(first);
 expect(f.calls.writes).toBe(1);expect(f.nativePost.error).toBe(YOUTUBE_THUMBNAIL_WARNING);
});

async function tikTokConsentFixture(branded=false){
 const f=await fixture({platform:'tiktok',format:'short'});
 const settings={content_posting_method:'DIRECT_POST',brand_content_toggle:branded,brand_organic_toggle:false};
 const material={...f.item.material,settings,assets:[{id:'asset',mediaId:'asset',kind:'video',role:'final',url:'/image.jpg'}]};
 let item=await f.campaigns.setMaterial('a',f.campaign.id,f.item.id,{expectedContentRevision:f.item.contentRevision,material});
 item=await f.campaigns.approve('a',f.campaign.id,item.id,{actorId:'owner',expectedContentRevision:item.contentRevision,digest:approvalDigest(item)});
 f.nativePost.settings=JSON.stringify(settings);f.nativePost.image=JSON.stringify([{id:'asset',path:'/image.jpg'}]);
 return {...f,item,input:{...f.input,expectedContentRevision:item.contentRevision,approvalDigest:item.approval.digest}};
}
test('TikTok per-item declarations cannot be replaced by an invented generic consent string',async()=>{
 const f=await tikTokConsentFixture();
 await expect(f.service.deliver('a',{...f.input,requiredConsentId:'invented-all-posts',consentIds:['invented-all-posts']})).rejects.toHaveProperty('code','AUTONOMY_PLATFORM_CONSENT_REQUIRED');
 expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});
test('a server-confirmed TikTok declaration receipt permits only its exact item revision request and policy',async()=>{
 const f=await tikTokConsentFixture(true);
 const receipt=await f.service.confirmPublicationConsent('a',{...f.input,authority:'native_approval',approvedDigest:f.item.approval.digest});
 expect(receipt.declarations.map(row=>row.id)).toEqual(['music_usage','branded_content']);
 await expect(f.service.deliver('a',{...f.input,requiredConsentId:receipt.id})).resolves.toMatchObject({state:'scheduled'});
 expect(f.pieces.scheduleAdaptation).toHaveBeenCalledTimes(1);
});

test.each(['actor','request','action','revision','policy','invalidated'])('TikTok scoped consent rejects %s substitution before queueing',async boundary=>{
 const f=await tikTokConsentFixture(true),receipt=await f.service.confirmPublicationConsent('a',{...f.input,authority:'native_approval',approvedDigest:f.item.approval.digest});
 const input={...f.input,requiredConsentId:receipt.id};
 if(boundary==='actor')input.actorId='another-actor';
 if(boundary==='request')input.requestId='another-request';
 if(boundary==='action')input.action='publish';
 if(boundary==='revision'){
  const changed=await f.campaigns.setMaterial('a',f.campaign.id,f.item.id,{expectedContentRevision:f.item.contentRevision,material:{...f.item.material,body:'Changed public copy'}});input.expectedContentRevision=changed.contentRevision;
 }
 if(boundary==='policy'||boundary==='invalidated'){
  const row=await f.repo.read('a','action',receipt.id);
  if(boundary==='policy')row.payload.declarations[0].version='old-policy';else row.invalidatedAt=new Date();
  await f.repo.put({...row,expectedRevision:row.revision});
 }
 await expect(f.service.deliver('a',input)).rejects.toHaveProperty('code','AUTONOMY_PLATFORM_CONSENT_REQUIRED');expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});

test.each(['none','args_only','content_only','changed_content','valid'])('native TikTok delivery requires the existing exact user-confirmation fingerprints: %s',async proof=>{
 const f=await tikTokConsentFixture(true);
 f.repo.purgeExpired=async()=>0;
 const {SocialFactoryService}=loadTypeScriptModule(root+'social-factory.service.ts',{
  ...mocks,'./social-factory.repository':{SocialFactoryRepository:class{},SocialFactoryError:DomainError},
  '../../database/prisma/integrations/integration.service':{IntegrationService:class{}},'./learning/learning.service':{SocialFactoryLearningService:class{}},
 });
 const factory=new SocialFactoryService(f.campaigns,f.autonomy,f.repo,{getIntegrationById:async()=>f.nativePost.integration},{forPlanning:async()=>({findings:[],findingIds:[]})});
 const {loadRegistry,servicesFrom,requestContextFor,executeTool,IDENTITY}=require('./helpers/agent-capabilities.cjs');
 const registry=loadRegistry(),identity={...IDENTITY,organizationId:'a',userId:'owner'},services=servicesFrom({SocialFactoryService:factory,SocialFactoryPublishingService:f.service});
 const cap=registry.CAPABILITY_CATALOGUE.find(row=>row.id==='campaign.deliver'),tool=registry.buildCapabilityTool(cap,{entrance:'chat',language:'ru',services}),context=requestContextFor(registry,identity);
 const args=cap.input.parse({campaignId:f.campaign.id,itemId:f.item.id,requestId:f.input.requestId,action:f.input.action,expectedContentRevision:f.item.contentRevision,approvalDigest:f.item.approval.digest,requiredConsentId:'model-invented'});
 expect(cap.input.safeParse({...args,authority:'native_approval',approvedDigest:f.item.approval.digest}).success).toBe(false);
 const description=await cap.describeApproval({...identity,service:services},args);expect(description).toContain('Music Usage Confirmation');expect(description).toContain('Branded Content Policy');
 const bound=await registry.approvalContentDigest([cap],services,identity,'campaign_deliver',args);
 if(['args_only','changed_content','valid'].includes(proof))registry.grantApproval(context,registry.approvalFingerprint('campaign_deliver',args));
 if(['content_only','changed_content','valid'].includes(proof))registry.grantApproval(context,registry.approvalContentFingerprint('campaign_deliver',args,bound));
 if(proof==='changed_content'){
  const row=await f.repo.read('a','campaign_item',f.item.id);row.payload.material.settings.brand_content_toggle=false;await f.repo.put({...row,expectedRevision:row.revision});
 }
 const result=await executeTool(tool,args,{requestContext:context});
 const receipts=(await f.repo.list('a','action')).filter(row=>row.payload.type==='publication_consent');
 if(proof==='valid'){
  expect(result.output.ok).toBe(true);expect(receipts).toHaveLength(1);expect(receipts[0].payload).toMatchObject({actorId:'owner',campaignId:f.campaign.id,itemId:f.item.id,requestId:f.input.requestId,deliveryAction:'schedule',contentRevision:f.item.contentRevision});
  expect(f.pieces.scheduleAdaptation).toHaveBeenCalledTimes(1);
 }else{
  expect(result.output).toMatchObject({ok:false,code:'AUTONOMY_PLATFORM_CONSENT_REQUIRED'});expect(receipts).toHaveLength(0);expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
 }
});

test('a generic autopilot platform-consent grant cannot authorize TikTok declarations',async()=>{
 const f=await tikTokConsentFixture();
 const grant=await f.autonomy.grant('a',{authority:'user',actorId:'owner',requestId:'autopilot-grant',mode:'autopilot',channelIds:[f.item.channelId],actions:['prepare','publish','schedule'],platformConsentIds:['all-posts'],expiresAt:'2099-01-01T00:00:00Z'});
 await f.campaigns.setMode('a',f.campaign.id,{actorId:'owner',mode:'autopilot',grantId:grant.id});
 await expect(f.service.deliver('a',{...f.input,authority:'agent',grantId:grant.id,requiredConsentId:'all-posts'})).rejects.toHaveProperty('code','AUTONOMY_PLATFORM_CONSENT_REQUIRED');
 expect(f.pieces.scheduleAdaptation).not.toHaveBeenCalled();
});
test('scheduled TikTok publication rechecks its scoped declaration receipt before outbound submission',async()=>{
 const f=await tikTokConsentFixture();
 const post=jest.spyOn(f.provider,'post');
 const consent=await f.service.confirmPublicationConsent('a',{...f.input,authority:'native_approval',approvedDigest:f.item.approval.digest});
 await f.service.deliver('a',{...f.input,requiredConsentId:consent.id});
 const row=await f.repo.read('a','action',consent.id);row.invalidatedAt=new Date();await f.repo.put({...row,expectedRevision:row.revision});
 await expect(f.service.beforeSend('a',f.nativePost.id)).rejects.toHaveProperty('code','AUTONOMY_PLATFORM_CONSENT_REQUIRED');
 expect(post).not.toHaveBeenCalled();
});
