const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers/source-artifact.fixture.cjs');
const reject = (promise, code) => expect(promise).rejects.toMatchObject({ response: { code } });
async function draftFixture() {
  const f = fixture(), id = `draft_${randomUUID()}`;
  f.adaptation.postId = null; f.adaptation.integrationId = null;
  f.piece.brief = { version: 'social-factory-material/v1', material: { channelId: id, platform: 'telegram', destination: { kind: 'draft', id, publishable: false } } };
  f.tables.socialFactoryRecord.set(id, { id, organizationId: f.ids.org, kind: 'draft_destination', revision: 1, deletedAt: null, invalidatedAt: null, expiresAt: null,
    updatedAt: new Date('2026-01-01'), payload: { version: 1, id, kind: 'draft', publishable: false, actorId: f.ids.actor, platform: 'telegram', locale: 'ru', name: 'Owned draft destination', requestDigest: 'a'.repeat(64) } });
  const source = await f.service.resolve(f.ids.org, f.ids.actor, f.selection);
  return { ...f, id, source, input: { sourceArtifact: source.ref, body: 'Точная ручная правка самостоятельного черновика.', requestId: randomUUID() } };
}

test('standalone draft edit changes only the selected derivation and persists one exact replay receipt', async () => {
  const f = await draftFixture(), core = f.tables.contentPiece.get(f.ids.piece).body;
  const first = await f.service.editDraft(f.ids.org, f.ids.actor, f.input);
  const replay = await f.service.editDraft(f.ids.org, f.ids.actor, f.input);
  expect(replay).toEqual(first); expect(first.text).toBe(f.input.body); expect(first.ref.revision).not.toBe(f.source.ref.revision); expect(first.ref.postId).toBeUndefined();
  expect(f.tables.contentPiece.get(f.ids.piece).body).toBe(core);
  expect(f.tables.contentDerivation.get(f.ids.adaptation).body).toBe(f.input.body);
  expect(f.writes.filter(([name, action, , data]) => name === 'contentDerivation' && action === 'updateMany' && data.body !== undefined)).toHaveLength(1);
  expect(f.writes.filter(([name]) => name === 'post')).toEqual([]);
  expect([...f.tables.socialFactoryRecord.values()].filter(row => row.kind === 'action')).toHaveLength(1);
});

test.each(['owner', 'publishable', 'platform', 'deleted', 'invalidated', 'expired', 'missing', 'wrong-channel', 'connected'])('%s proof cannot authorize standalone draft editing', async condition => {
  const f = await draftFixture(), destination = f.tables.socialFactoryRecord.get(f.id), piece = f.tables.contentPiece.get(f.ids.piece);
  if (condition === 'owner') destination.payload.actorId = f.ids.otherActor;
  if (condition === 'publishable') destination.payload.publishable = true;
  if (condition === 'platform') destination.payload.platform = 'instagram';
  if (condition === 'deleted') destination.deletedAt = new Date();
  if (condition === 'invalidated') destination.invalidatedAt = new Date();
  if (condition === 'expired') destination.expiresAt = new Date(Date.now() - 1);
  if (condition === 'missing') f.tables.socialFactoryRecord.delete(f.id);
  if (condition === 'wrong-channel') piece.brief.material.destination.id = 'some-other-destination';
  if (condition === 'connected') f.tables.contentDerivation.get(f.ids.adaptation).integrationId = f.ids.integration;
  await reject(f.service.editDraft(f.ids.org, f.ids.actor, f.input), 'SOURCE_ARTIFACT_DRAFT_ONLY');
  expect(f.tables.contentDerivation.get(f.ids.adaptation).body).not.toBe(f.input.body);
  expect([...f.tables.socialFactoryRecord.values()].filter(row => row.kind === 'action')).toEqual([]);
});

test('another current editor cannot borrow destination ownership or replay the original owner edit', async () => {
  const f = await draftFixture();
  await reject(f.service.editDraft(f.ids.org, f.ids.otherActor, f.input), 'SOURCE_ARTIFACT_DRAFT_ONLY');
  await f.service.editDraft(f.ids.org, f.ids.actor, f.input);
  f.tables.socialFactoryRecord.get(f.id).invalidatedAt = new Date();
  await reject(f.service.editDraft(f.ids.org, f.ids.actor, f.input), 'SOURCE_ARTIFACT_DRAFT_ONLY');
});

test('stale expected revisions and conflicting request reuse cannot replace another saved edit', async () => {
  const f = await draftFixture(), first = await f.service.editDraft(f.ids.org, f.ids.actor, f.input);
  await reject(f.service.editDraft(f.ids.org, f.ids.actor, { ...f.input, body: 'Conflicting same request' }), 'SOURCE_ARTIFACT_IDEMPOTENCY_CONFLICT');
  await reject(f.service.editDraft(f.ids.org, f.ids.actor, { ...f.input, requestId: randomUUID(), body: 'Stale new request' }), 'SOURCE_ARTIFACT_STALE');
  const next = await f.service.editDraft(f.ids.org, f.ids.actor, { sourceArtifact: first.ref, body: 'A later explicit owned draft edit.', requestId: randomUUID() });
  await reject(f.service.editDraft(f.ids.org, f.ids.actor, f.input), 'SOURCE_ARTIFACT_STALE');
  expect(f.tables.contentDerivation.get(f.ids.adaptation).body).toBe(next.text);
});
