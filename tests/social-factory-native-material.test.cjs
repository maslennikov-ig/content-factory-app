require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/';
const prismaMock = { PrismaRepository: class {}, PrismaTransaction: class {} };
const { PostsRepository } = loadWithMocks(base + 'database/prisma/posts/posts.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': prismaMock,
});
const { ContentBriefRepository } = loadWithMocks(base + 'content-intelligence/brief/content-brief.repository.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': prismaMock,
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository': { PostsRepository },
});
const { resolveSourceArtifactV1 } = loadWithMocks(base + 'content-intelligence/social-factory/source-artifact.repository.ts');
const { NativeEditorialMaterialService } = loadWithMocks(base + 'content-intelligence/social-factory/editorial/native-material.service.ts', {
  '../../../database/prisma/integrations/integration.service': { IntegrationService: class {} },
  '../../../integrations/integration.manager': { IntegrationManager: class {} },
  '../../pieces/piece.repository': { PieceRepository: class {} },
});

function fixture({ platform = 'telegram', format = 'post', editor = 'html' } = {}) {
  let tables = { contentSource: [{ organizationId: 'a', id: 'source', configVersion: 1, currentSnapshotId: 'snapshot', rightsState: 'CONFIRMED', rightsConfirmedAt: null, archivedAt: null, purgedAt: null, desiredState: 'ACTIVE', usagePurpose: 'EVIDENCE', kind: 'MANUAL', currentSnapshot: { purgedAt: null, supersededAt: null, retentionUntil: null } }], contentPiece: [], post: [], contentDerivation: [], socialFactoryRecord: [], media: [
    { organizationId: 'a', id: 'm1', path: '/one.jpg', deletedAt: null, alt: 'First' },
    { organizationId: 'a', id: 'm2', path: '/two.jpg', deletedAt: null },
    { organizationId: 'b', id: 'foreign', path: '/foreign.jpg', deletedAt: null },
  ], integration: [{ organizationId: 'a', id: 'channel', providerIdentifier: platform, deletedAt: null }],
    userOrganization: [{ organizationId: 'a', userId: 'user', id: 'membership', role: 'EDITOR', disabled: false, user: { activated: true } }],
    tags: [], tagsPosts: [], contentOutputContext: [], draftEvidence: [] };
  const input = { sourceAdmissions: [{ sourceId: 'source', sourceConfigVersion: 1, snapshotId: 'snapshot', rightsConfirmedAt: null, permissionRevision: null }], campaignId: 'campaign', itemId: 'item', requestId: 'request', scheduledAt: '2030-01-01T12:00:00.000Z',
    material: { version: 1, channelId: 'channel', platform, format, title: 'Original title', hook: 'Hook', body: '**Exact** content',
      caption: 'Caption with **marks**', assets: [], settings: {}, evidence: [{ id: 'e1', sourceId: 'source', source: 'owned', rights: 'permitted' }],
      playbook: { version: '1', sourceDate: '2026-11-03' } } };
  tables.socialFactoryRecord.push(
    { organizationId: 'a', kind: 'campaign', id: 'campaign', payload: { state: 'active' }, deletedAt: null, invalidatedAt: null, expiresAt: null },
    { organizationId: 'a', kind: 'campaign_item', id: 'item', payload: { campaignId: 'campaign', channelId: 'channel', platform, format, scheduledAt: input.scheduledAt, state: 'preparing', contentRevision: 3 }, deletedAt: null, invalidatedAt: null, expiresAt: null });
  let sequence = 0, transactionTail = Promise.resolve(), receiptFailures = 0, upsertFailures = 0;
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(clause => match(row, clause));
    if (key === 'organizationId_id') return row.organizationId === value.organizationId && row.id === value.id;
    if (Object.prototype.toString.call(value) === '[object Date]') return new Date(row[key]).getTime() === value.getTime();
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('equals' in value) return JSON.stringify(row[key]) === JSON.stringify(value.equals);
      if ('in' in value) return value.in.includes(row[key]);
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if (key === 'post') return true;
      if (key === 'currentSnapshot') return match(row[key], value.is ?? value);
    }
    return row[key] === value;
  });
  const simplify = data => {
    const row = structuredClone(data);
    if (row.integration) { row.integrationId = row.integration.connect.id; delete row.integration; }
    if (row.organization) { row.organizationId = row.organization.connect.id; delete row.organization; }
    if (row.parentPost) { row.parentPostId = row.parentPost.connect?.id ?? null; delete row.parentPost; }
    return row;
  };
  const delegates = db => Object.fromEntries(Object.keys(db).map(name => [name, {
    findFirst: async ({ where }) => structuredClone(db[name].find(row => match(row, where)) || null),
    findMany: async ({ where } = {}) => structuredClone(db[name].filter(row => match(row, where))),
    count: async ({ where } = {}) => db[name].filter(row => match(row, where)).length,
    create: async ({ data }) => {
      if (name === 'socialFactoryRecord' && data.kind === 'action' && receiptFailures-- > 0) throw { code: 'P2034' };
      if (db[name].some(row => row.id === data.id && row.organizationId === data.organizationId)) throw { code: 'P2002' };
      const row = { id: `${name}-${++sequence}`, createdAt: new Date('2026-11-03T12:00:00Z'), archivedAt: null, deletedAt: null, ...simplify(data) };
      db[name].push(row); return structuredClone(row);
    },
    upsert: async ({ where, create, update }) => {
      if (name === 'post' && upsertFailures > 0 && ++upsertFailures === 3) throw new Error('middle post failed');
      const old = db[name].find(row => match(row, where));
      if (old) { Object.assign(old, simplify(update)); return structuredClone(old); }
      const row = { createdAt: new Date('2026-11-03T12:00:00Z'), deletedAt: null, parentPostId: null, ...simplify(create) };
      db[name].push(row); return structuredClone(row);
    },
    updateMany: async ({ where, data }) => { const selected = db[name].filter(row => match(row, where)); selected.forEach(row => Object.assign(row, structuredClone(data))); return { count: selected.length }; },
    deleteMany: async ({ where }) => { const before = db[name].length; db[name] = db[name].filter(row => !match(row, where)); return { count: before - db[name].length }; },
  } ]));
  const client = { $transaction: (work, options) => {
    expect(options.isolationLevel).toBe('Serializable');
    const run = transactionTail.then(async () => { const draft = structuredClone(tables); const result = await work(delegates(draft)); tables = draft; return result; });
    transactionTail = run.catch(() => {}); return run;
  } };
  const ref = { model: client };
  const posts = new PostsRepository(ref, ref, ref, ref, ref, ref, ref);
  const briefs = new ContentBriefRepository(ref, posts);
  const integrationLookup = jest.fn(async (org, id) => tables.integration.find(row => row.organizationId === org && row.id === id) || null);
  const service = new NativeEditorialMaterialService({ createNativeMaterialDraft: (...args) => briefs.createNativeMaterialDraft(...args) },
    { getIntegrationById: integrationLookup },
    { getSocialIntegration: () => ({ editor, post() {}, ...(platform === 'threads' ? { comment() {} } : {}) }) });
  return { input, service, posts, briefs, integrationLookup, sourceDb: () => delegates(tables), tables: () => tables,
    failReceipt: count => { receiptFailures = count; }, failMiddlePost: () => { upsertFailures = 1; } };
}
const asset = (id, mediaId) => ({ id, mediaId, kind: 'image', mimeType: 'image/jpeg', role: 'visual', provenance: { revision: '1', sourceIds: ['source'] } });

test('complete material persists title, original body, rendered caption, ordered actual media and full settings as native drafts', async () => {
  const f = fixture({ platform: 'threads' });
  f.input.material.assets = [asset('second', 'm2'), asset('first', 'm1')];
  f.input.material.settings = { disable_notification: true };
  const saved = await f.service.save('a', 'user', f.input);
  const t = f.tables();
  expect(saved).toMatchObject({ pieceId: t.contentPiece[0].id, derivationId: t.contentDerivation[0].id });
  expect(t.contentPiece[0]).toMatchObject({ title: 'Original title', body: '**Exact** content', createdByUserId: 'user', language: 'ru' });
  expect(t.post[0]).toMatchObject({ state: 'DRAFT', content: '<p>Caption with <strong>marks</strong></p>', integrationId: 'channel' });
  expect(JSON.parse(t.post[0].image).map(image => [image.id, image.path])).toEqual([['m2', '/two.jpg'], ['m1', '/one.jpg']]);
  expect(JSON.parse(t.post[0].settings)).toEqual({ disable_notification: true, __type: 'threads' });
  expect(t.socialFactoryRecord.find(row => row.kind === 'action').sourceIds).toEqual(expect.arrayContaining(['source:source', 'resource:campaign_item:item']));
  expect(f.input.material.pieceId).toBeUndefined();
});

test('lost response and concurrent identical requests return the same receipt without duplicating native rows or overwriting later edits', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.service.save('a', 'user', f.input), f.service.save('a', 'user', f.input)]);
  expect(a).toEqual(b); expect(f.tables().post).toHaveLength(1); expect(f.tables().contentPiece).toHaveLength(1);
  f.tables().post[0].content = '<p>Human edit after save</p>';
  expect(await f.service.save('a', 'user', f.input)).toEqual(a);
  expect(f.tables().post[0].content).toBe('<p>Human edit after save</p>');
  f.input.material.title = 'Different request payload';
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_IDEMPOTENCY_CONFLICT');
});

test('transaction retry rolls back the losing objects and preserves deterministic post identity', async () => {
  const f = fixture(); f.failReceipt(1);
  await f.service.save('a', 'user', f.input);
  expect(f.tables().post).toHaveLength(1); expect(f.tables().contentPiece).toHaveLength(1);
  expect(f.tables().post[0].id).toMatch(/^native_post_[a-f0-9]{64}_0$/);
});

test('Threads material persists every ordered reply through the existing native parent chain', async () => {
  const f = fixture({ platform: 'threads', format: 'thread' });
  f.input.material.posts = [{ index: 1, text: 'First **post**' }, { index: 2, text: 'Second reply' }, { index: 3, text: 'Third reply' }];
  await f.service.save('a', 'user', f.input);
  const posts = f.tables().post;
  expect(posts.map(post => post.content)).toEqual(['<p>First <strong>post</strong></p>', '<p>Second reply</p>', '<p>Third reply</p>']);
  expect(posts.map(post => post.parentPostId)).toEqual([null, posts[0].id, posts[1].id]);
  expect(f.tables().contentDerivation[0].postId).toBe(posts[0].id);
  expect(posts.every(post => post.state === 'DRAFT')).toBe(true);
});

test('a failure in a middle thread part rolls back core, posts, adaptation and receipt together', async () => {
  const f = fixture({ platform: 'threads', format: 'thread' });
  f.input.material.posts = [{ index: 0, text: 'First' }, { index: 1, text: 'Second' }]; f.failMiddlePost();
  await expect(f.service.save('a', 'user', f.input)).rejects.toThrow('middle post failed');
  expect(f.tables().post).toHaveLength(0); expect(f.tables().contentPiece).toHaveLength(0); expect(f.tables().contentDerivation).toHaveLength(0);
  expect(f.tables().socialFactoryRecord.filter(row => row.kind === 'action')).toHaveLength(0);
});

test('foreign media and foreign actors cannot create native objects', async () => {
  const f = fixture(); f.input.material.assets = [asset('foreign', 'foreign')];
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_MEDIA_NOT_FOUND');
  f.input.material.assets = [];
  await expect(f.service.save('a', 'stranger', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_MEMBERSHIP_REQUIRED');
  expect(f.tables().contentPiece).toHaveLength(0); expect(f.tables().post).toHaveLength(0);
});

test('invalidated receipts cannot recreate removed source-derived material', async () => {
  const f = fixture(); await f.service.save('a', 'user', f.input);
  const receipt = f.tables().socialFactoryRecord.find(row => row.payload.type === 'native_material_receipt'); receipt.invalidatedAt = new Date(); receipt.payload = { redacted: true };
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_INVALIDATED');
  expect(f.tables().post).toHaveLength(1);
});

test('different request ids for the same source revision reuse one complete native draft', async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.service.save('a', 'user', f.input),
    f.service.save('a', 'user', { ...f.input, requestId: 'another-dispatch' })]);
  expect(second).toEqual(first); expect(f.tables().post).toHaveLength(1); expect(f.tables().contentPiece).toHaveLength(1);
  const changed = structuredClone(f.input); changed.requestId = 'changed-material'; changed.material.body = 'New content same revision';
  await expect(f.service.save('a', 'user', changed)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_REVISION_CONFLICT');
  expect(f.tables().post).toHaveLength(1);
});

test('source snapshot admission is rechecked inside the native write transaction and cannot fall back after revocation', async () => {
  const f = fixture();
  f.tables().contentSource[0].configVersion = 2;
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'SOCIAL_FACTORY_SOURCE_CHANGED');
  expect(f.tables().post).toHaveLength(0); expect(f.tables().contentPiece).toHaveLength(0);
  f.tables().contentSource[0].configVersion = 1; f.input.sourceAdmissions = [];
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_SOURCE_ADMISSION_REQUIRED');
  expect(f.tables().post).toHaveLength(0);
});

test('source-less owner material persists with no source subscription or admission', async () => {
  const f = fixture(); f.input.material.evidence = []; f.input.sourceAdmissions = [];
  await expect(f.service.save('a', 'user', f.input)).resolves.toHaveProperty('pieceId');
});

test('Telegram stores the complete authoritative rendered title, hook, body and CTA with native rich formatting', async () => {
  const f = fixture();
  f.input.material.cta = 'Read the **next step**';
  f.input.material.settings.renderedText = '**Original title**\n\nHook\n\n**Exact** content\n\nRead the **next step**';
  f.input.material.settings.lengthChoiceId = 'short-material';
  const saved = await f.service.save('a', 'user', f.input);
  expect(f.tables().post[0].content).toBe('<p><strong>Original title</strong></p><p>Hook</p><p><strong>Exact</strong> content</p><p>Read the <strong>next step</strong></p>');
  expect(saved.settings.lengthChoiceId).toBe('short-material');
  expect(saved.caption).toBe(f.input.material.caption);
});

test('a finished video keeps its cover in material and sends only the final video attachment',async()=>{
 const f=fixture({platform:'youtube',format:'long_video'});
 f.tables().media.find(row=>row.id==='m2').path='/final.mp4';
 f.input.material.assets=[{...asset('cover','m1'),role:'cover',url:'/one.jpg'},{id:'final',mediaId:'m2',kind:'video',role:'final',url:'/final.mp4',mimeType:'video/mp4',provenance:{revision:'r',sourceIds:['source']}}];
 const saved=await f.service.save('a','user',f.input);
 expect(saved.assets.map(asset=>asset.role)).toEqual(['cover','final']);
 expect(JSON.parse(f.tables().post[0].image).map(asset=>asset.id)).toEqual(['m2']);

});

test('a foreign deterministic post id is refused by native ownership checks without reading tenant material into the draft',async()=>{
 const original=fixture();await original.service.save('a','user',original.input);
 const foreign={...structuredClone(original.tables().post[0]),organizationId:'b',integrationId:'foreign-channel',content:'Foreign private content'};
 const f=fixture();f.tables().post.push(foreign);
 await expect(f.service.save('a','user',f.input)).rejects.toMatchObject({code:'POST_NOT_FOUND',message:'Post was not found'});
 expect(f.tables().post).toEqual([foreign]);
 expect(f.tables().contentPiece).toHaveLength(0);expect(f.tables().contentDerivation).toHaveLength(0);
 expect(f.tables().socialFactoryRecord.filter(row=>row.kind==='action')).toHaveLength(0);
});

function standaloneFixture(options) {
  const f = fixture(options), destination = { kind: 'draft', id: 'channel', publishable: false };
  f.tables().integration = [];
  f.input.material.destination = destination;
  f.tables().socialFactoryRecord.find(row => row.kind === 'campaign_item').payload.destination = structuredClone(destination);
  f.tables().socialFactoryRecord.push({ organizationId: 'a', kind: 'draft_destination', id: 'channel', revision: 1,
    deletedAt: null, invalidatedAt: null, expiresAt: null,
    payload: { version: 1, ...destination, actorId: 'user', platform: f.input.material.platform, locale: 'ru', name: 'Явный черновик', requestDigest: 'server-request' } });
  return f;
}

test('explicit draft destination saves a complete native piece and adaptation without integration or Post rows', async () => {
  const f = standaloneFixture(), postWrite = jest.spyOn(f.posts, 'createOrUpdatePost');
  f.input.material.settings = { renderedText: '**Полный заголовок**\n\nХук\n\nТело\n\nПризыв', lengthChoiceId: 'short-material' };
  f.input.material.assets = [asset('second', 'm2'), asset('first', 'm1')];
  f.input.material.scenes = [{ index: 0, startSeconds: 0, endSeconds: 5, spokenText: 'Текст сцены', visualIntent: 'Собственное изображение' }];
  const saved = await f.service.save('a', 'user', f.input), tables = f.tables();
  expect(saved).toMatchObject({ destination: { kind: 'draft', publishable: false }, pieceId: tables.contentPiece[0].id, derivationId: tables.contentDerivation[0].id });
  expect(tables.contentPiece[0]).toMatchObject({ organizationId: 'a', kind: 'CORE', title: 'Original title', body: '**Exact** content', createdByUserId: 'user',
    brief: { material: { assets: f.input.material.assets, scenes: f.input.material.scenes, settings: f.input.material.settings, destination: f.input.material.destination } } });
  expect(tables.contentDerivation[0]).toMatchObject({ organizationId: 'a', contentPieceId: saved.pieceId, integrationId: null, postId: null,
    state: 'DRAFT', platform: 'telegram', title: 'Original title', body: f.input.material.settings.renderedText });
  expect(tables.post).toEqual([]); expect(tables.integration).toEqual([]);
  expect(f.integrationLookup).not.toHaveBeenCalled(); expect(postWrite).not.toHaveBeenCalled();
  const receipts = tables.socialFactoryRecord.filter(row => row.kind === 'action');
  expect(receipts).toHaveLength(2); expect(receipts.every(row => row.payload.postIds.length === 0)).toBe(true);
});

test('standalone Threads keep every ordered part without pretending to have a publication chain', async () => {
  const f = standaloneFixture({ platform: 'threads', format: 'thread' });
  f.input.material.posts = [{ index: 1, text: 'Первая часть **жирным**' }, { index: 2, text: 'Вторая часть' }, { index: 3, text: 'Третья часть' }];
  const saved = await f.service.save('a', 'user', f.input);
  expect(f.tables().contentDerivation[0]).toMatchObject({ body: f.input.material.posts.map(post => post.text).join('\n\n'), postId: null, integrationId: null });
  expect(saved.posts).toEqual(f.input.material.posts); expect(f.tables().post).toEqual([]);
});

test('standalone concurrent/restarted requests reuse one snapshot and preserve subsequent editor text', async () => {
  const f = standaloneFixture(); f.failReceipt(1);
  const [a, b] = await Promise.all([f.service.save('a', 'user', f.input), f.service.save('a', 'user', { ...f.input, requestId: 'same-revision-other-request' })]);
  expect(a).toEqual(b); expect(f.tables().contentPiece).toHaveLength(1); expect(f.tables().contentDerivation).toHaveLength(1);
  f.tables().contentDerivation[0].body = 'Сохранённая правка человека';
  expect(await f.service.save('a', 'user', f.input)).toEqual(a);
  expect(f.tables().contentDerivation[0].body).toBe('Сохранённая правка человека');
  expect(f.tables().post).toEqual([]);
  const changed = structuredClone(f.input); changed.material.body = 'Другой материал той же версии'; changed.requestId = 'conflicting-revision';
  await expect(f.service.save('a', 'user', changed)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_REVISION_CONFLICT');
});

test.each(['actor', 'platform', 'deleted', 'item-destination'])('standalone draft refuses invalid %s authority before native objects are created', async change => {
  const f = standaloneFixture(), row = f.tables().socialFactoryRecord.find(row => row.kind === 'draft_destination');
  if (change === 'actor') row.payload.actorId = 'another-editor';
  if (change === 'platform') row.payload.platform = 'youtube';
  if (change === 'deleted') row.deletedAt = new Date();
  if (change === 'item-destination') delete f.tables().socialFactoryRecord.find(row => row.kind === 'campaign_item').payload.destination;
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', change === 'item-destination' ? 'NATIVE_MATERIAL_CAMPAIGN_SCOPE' : 'NATIVE_MATERIAL_DESTINATION_SCOPE');
  expect(f.tables().contentPiece).toEqual([]); expect(f.tables().contentDerivation).toEqual([]); expect(f.tables().post).toEqual([]);
});

test('standalone destination is explicit and never falls back to a fake connected channel', async () => {
  const f = standaloneFixture(); f.input.material.destination.publishable = true;
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_DESTINATION_INVALID');
  f.input.material.destination.publishable = false; f.input.material.destination.id = 'different';
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_DESTINATION_INVALID');
  delete f.input.material.destination;
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_CHANNEL_SCOPE');
  expect(f.tables().integration).toEqual([]); expect(f.tables().contentPiece).toEqual([]);
});

test('standalone cached receipts still require current destination and actual owned media', async () => {
  const f = standaloneFixture(); f.input.material.assets = [asset('first', 'm1')];
  await f.service.save('a', 'user', f.input);
  const row = f.tables().socialFactoryRecord.find(row => row.kind === 'draft_destination'); row.payload.actorId = 'another-editor';
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_DESTINATION_SCOPE');
  row.payload.actorId = 'user'; f.tables().media.find(row => row.id === 'm1').deletedAt = new Date();
  await expect(f.service.save('a', 'user', f.input)).rejects.toHaveProperty('code', 'NATIVE_MATERIAL_MEDIA_NOT_FOUND');
  expect(f.tables().contentPiece).toHaveLength(1); expect(f.tables().post).toEqual([]);
});

for (const standalone of [false, true]) test(`source artifact is checked inside native writer before fresh save and receipt replay (standalone=${standalone})`, async () => {
  const f = standalone ? standaloneFixture() : fixture();
  const sourcePiece = { organizationId: 'a', id: 'original-piece', kind: 'CORE', title: 'Исходная статья', body: 'Точный сохранённый исходник', brief: {}, language: 'ru',
    archivedAt: null, updatedAt: new Date('2026-01-01T00:00:00Z') };
  f.tables().contentPiece.push(sourcePiece);
  const artifact = await resolveSourceArtifactV1(f.sourceDb(), 'a', 'user', { version: 1, kind: 'piece', pieceId: sourcePiece.id });
  f.input.material.sourceArtifact = artifact.ref;
  sourcePiece.body = 'Уже изменённый исходник';
  await expect(f.service.save('a', 'user', f.input)).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
  expect(f.tables().contentPiece).toHaveLength(1); expect(f.tables().post).toHaveLength(0);
  sourcePiece.body = artifact.text;
  const saved = await f.service.save('a', 'user', f.input);
  expect(saved.sourceArtifact).toEqual(artifact.ref); expect(f.tables().contentPiece).toHaveLength(2);
  const current = f.tables().contentPiece.find(row => row.id === sourcePiece.id); current.body = 'Правка после сохранения';
  await expect(f.service.save('a', 'user', f.input)).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
  await expect(f.service.save('a', 'user', { ...f.input, requestId: 'same-revision-replay' })).rejects.toMatchObject({ response: { code: 'SOURCE_ARTIFACT_STALE' } });
  expect(f.tables().contentPiece).toHaveLength(2); expect(f.tables().contentDerivation).toHaveLength(1);
});


test('standalone core uses destination locale rather than interface language; connected language stays compatible', async () => {
  const f = standaloneFixture();
  f.tables().socialFactoryRecord.find(row => row.kind === 'draft_destination').payload.locale = 'es';
  await f.service.save('a', 'user', f.input, 'en');
  expect(f.tables().contentPiece[0].language).toBe('es');
  expect(f.tables().post).toEqual([]);
  const connected = fixture();
  await connected.service.save('a', 'user', connected.input, 'en');
  expect(connected.tables().contentPiece[0].language).toBe('en');
});


test('Instagram text-only standalone post stores its full author text, not only a shorter caption',async()=>{
 const f=standaloneFixture({platform:'instagram',format:'post'});f.input.material.body='The actual draft says SEVEN minutes.';f.input.material.caption='A shorter description without the fact.';f.input.material.cta='Choose the next step.';
 const saved=await f.service.save('a','user',f.input),derivation=f.tables().contentDerivation[0];
 expect(derivation.body).toBe([f.input.material.title,f.input.material.hook,f.input.material.body,f.input.material.cta].join('\n\n'));
 expect(derivation.body).toContain('SEVEN');expect(saved.caption).toBe(f.input.material.caption);expect(saved.assets).toEqual([]);expect(f.tables().integration).toEqual([]);expect(f.tables().post).toEqual([]);
});
