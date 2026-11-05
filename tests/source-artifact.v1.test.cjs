const { createHash, randomUUID } = require('node:crypto');
const { fixture, loadTypeScriptModule, base, authenticated: { withAuthenticatedSession } } = require('./helpers/source-artifact.fixture.cjs');
const { SourceArtifactRefSchemaV1 } = loadTypeScriptModule(base + 'content-intelligence/social-factory/contracts/source-artifact.v1.ts');
const reject = (promise, code) => expect(promise).rejects.toMatchObject({ response: { code } });

test('the selected linked post is authoritative and its exact UTF8 bytes define contentDigest', async () => {
  const f = fixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(source).toMatchObject({ actorId: f.ids.actor, organizationId: f.ids.org, title: f.post.title, text: f.post.content, locale: 'ru',
    ref: { ...f.selection, postId: f.ids.post } });
  expect(source.text).not.toContain('10 kg');
  expect(source.contentDigest).toBe(createHash('sha256').update(f.post.content, 'utf8').digest('hex'));
  expect(SourceArtifactRefSchemaV1.safeParse(source.ref).success).toBe(true);
  expect(f.writes).toEqual([]);
  expect(f.reads.every(([, where]) => where.organizationId === f.ids.org)).toBe(true);
});

test('post-only content or version changes invalidate the reference without any derivation or core edit', async () => {
  const f = fixture(), original = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  f.editPost('<p>Масса 13 кг. Не содержит сахар.</p>\n');
  await reject(f.service.resolve(f.ids.org, f.ids.actor, original.ref), 'SOURCE_ARTIFACT_STALE');
  const current = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(current.text).toBe(f.post.content); expect(current.ref.revision).not.toBe(original.ref.revision);
  const digest = current.contentDigest; f.post.updatedAt = new Date(f.post.updatedAt.getTime() + 1);
  const stamped = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(stamped.ref.revision).not.toBe(current.ref.revision); expect(stamped.contentDigest).toBe(digest);
});

test('title and persisted locale participate in revision while contentDigest remains text-only', async () => {
  const f = fixture(), original = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  f.post.title = 'A changed title'; f.integration.contentLanguage = 'de';
  const current = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(current.locale).toBe('de'); expect(current.title).toBe('A changed title');
  expect(current.ref.revision).not.toBe(original.ref.revision); expect(current.contentDigest).toBe(original.contentDigest);
});

test('unlinked owned adaptation uses its own text and source piece locale without fabricating a post', async () => {
  const f = fixture(); f.adaptation.postId = null; f.adaptation.integrationId = null;
  const result = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(result.text).toBe(f.adaptation.body); expect(result.locale).toBe(f.piece.language); expect(result.ref.postId).toBeUndefined();
  await reject(f.service.resolve(f.ids.org, f.ids.actor, { ...f.selection, postId: f.ids.post }), 'SOURCE_ARTIFACT_NOT_FOUND');
});

test('a standalone adaptation-only edit changes the source stamp while the base piece remains untouched', async () => {
  const f = fixture(); f.adaptation.postId = null; f.adaptation.integrationId = null;
  const first = await f.service.resolve(f.ids.org, f.ids.actor, f.selection), core = f.piece.body;
  f.adaptation.body = 'Точная новая правка самостоятельной адаптации.';
  f.adaptation.updatedAt = new Date(f.adaptation.updatedAt.getTime() + 1);
  await reject(f.service.resolve(f.ids.org, f.ids.actor, first.ref), 'SOURCE_ARTIFACT_STALE');
  const next = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  expect(next.text).toBe(f.adaptation.body); expect(next.ref.kind).toBe('adaptation'); expect(next.ref.postId).toBeUndefined(); expect(f.piece.body).toBe(core);
});

test.each(['foreign-org', 'wrong-piece', 'wrong-post', 'archived', 'deleted-post', 'foreign-integration'])('%s cannot resolve through a valid-looking source selection', async condition => {
  const f = fixture(); let org = f.ids.org, selection = { ...f.selection };
  if (condition === 'foreign-org') org = randomUUID();
  if (condition === 'wrong-piece') selection.pieceId = randomUUID();
  if (condition === 'wrong-post') selection.postId = randomUUID();
  if (condition === 'archived') f.piece.archivedAt = new Date();
  if (condition === 'deleted-post') f.post.deletedAt = new Date();
  if (condition === 'foreign-integration') f.integration.organizationId = randomUUID();
  await expect(f.service.resolve(org, f.ids.actor, selection)).rejects.toMatchObject({ status: condition === 'foreign-org' ? 403 : 404 });
  expect(f.writes).toEqual([]);
});

test('empty linked post and caller-supplied authority/text are rejected without falling back to stale derivation', async () => {
  const f = fixture(); f.post.content = ' \n';
  await reject(f.service.resolve(f.ids.org, f.ids.actor, f.selection), 'SOURCE_ARTIFACT_EMPTY');
  for (const extra of [{ text: 'invented' }, { actorId: f.ids.actor }, { organizationId: f.ids.org }, { rights: 'owned' }]) {
    await reject(f.service.resolve(f.ids.org, f.ids.actor, { ...f.selection, ...extra }), 'SOURCE_ARTIFACT_INPUT_INVALID');
  }
});

test('membership and authenticated principal are current, while resolved stamps cannot be replayed by another actor', async () => {
  const f = fixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  await reject(f.service.assertCurrent(f.ids.org, f.ids.otherActor, source), 'SOURCE_ARTIFACT_ACCESS_DENIED');
  await reject(withAuthenticatedSession(f.ids.actor, 'synthetic-session', () => f.service.resolve(f.ids.org, f.ids.otherActor, f.selection)), 'SOURCE_ARTIFACT_ACCESS_DENIED');
  f.tables.user.get(f.ids.actor).activated = false;
  await reject(f.service.resolve(f.ids.org, f.ids.actor, f.selection), 'SOURCE_ARTIFACT_ACCESS_DENIED');
});

test('read-only assertions retain exact source; transaction assertions fence all source rows without bumping timestamps', async () => {
  const f = fixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  await f.service.assertCurrent(f.ids.org, f.ids.actor, source); expect(f.writes).toEqual([]);
  await f.db.$transaction(tx => f.repository.assertSourceArtifactCurrentV1(tx, f.ids.org, f.ids.actor, source.ref));
  expect(f.writes.map(([name]) => name)).toEqual(['contentPiece', 'contentDerivation', 'post', 'integration']);
  expect(f.piece.updatedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z'); expect(f.post.updatedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  expect(f.integration.updatedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
});

test('a changed row between read and compare-and-set refuses the writer assertion', async () => {
  const f = fixture(), source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  const update = f.db.post.updateMany;
  f.db.post.updateMany = async query => { f.editPost('Changed while source was being claimed.'); return update(query); };
  await reject(f.db.$transaction(tx => f.repository.assertSourceArtifactCurrentV1(tx, f.ids.org, f.ids.actor, source.ref)), 'SOURCE_ARTIFACT_STALE');
});
