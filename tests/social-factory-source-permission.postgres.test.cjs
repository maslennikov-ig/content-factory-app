const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';
const repository = loadTypeScriptModule(`${ROOT}/social-factory.repository.ts`);
const authority = loadTypeScriptModule(`${ROOT}/editorial/source-authority.v1.ts`);
const { SocialFactorySourcePermissionService } = loadTypeScriptModule(`${ROOT}/source-permission.service.ts`, {
  './social-factory.repository': repository, './editorial/source-authority.v1': authority,
  '../source-registry/source-registry.repository': { ContentSourceRegistryRepository: class {} },
});
const url = process.env.CF_SOCIAL_FACTORY_DATABASE_URL;
const local = url && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname);
async function fixture() {
  const db = new PrismaClient({ datasourceUrl: url });
  const org = await db.organization.create({ data: { name: 'Synthetic source permission test' } });
  const close=async()=>{
    await db.sourceEvidence.deleteMany({where:{organizationId:org.id}});
    await db.contentSource.updateMany({where:{organizationId:org.id},data:{currentSnapshotId:null}});
    await db.sourceSnapshot.deleteMany({where:{organizationId:org.id}});
    await db.contentSource.deleteMany({where:{organizationId:org.id}});
    await db.organization.delete({where:{id:org.id}});await db.$disconnect();
  };
  try {
  const now = new Date(); const before = new Date(now.getTime() - 60000); const future = new Date(now.getTime() + 86400000);
  const actor = randomUUID();
  const source = await db.contentSource.create({ data: { organizationId: org.id, kind: 'MANUAL', displayName: 'Synthetic owned source', canonicalKey: randomUUID(), createdByUserId: actor, updatedByUserId: actor, desiredState: 'ACTIVE', rightsState: 'CONFIRMED', rightsConfirmedAt: before, rightsConfirmedByUserId: actor, usagePurpose: 'EVIDENCE' } });
  const snapshot = await db.sourceSnapshot.create({ data: { organizationId: org.id, sourceId: source.id, sequence: 1, observedAt: before, validatedAt: before, contentHash: 'synthetic', parser: 'manual', parserVersion: 'v1', retrievalProvider: 'manual-v1', normalizedText: 'Synthetic private teaching example', retentionUntil: future,
    evidence: { create: { excerpt: 'Synthetic private teaching example', observedAt: before, freshnessStatus: 'NOT_MONITORED' } } } });
  await db.contentSource.update({ where: { id: source.id }, data: { currentSnapshotId: snapshot.id } });
  const store = new repository.SocialFactoryRepository({ model: db }, { model: db });
  const service = new SocialFactorySourcePermissionService(store, {}, {});
  const input = revision => ({ sourceId: source.id, expectedRevision: revision, purposes: ['discovery', 'editorial'], basis: 'owned', expiresAt: future.toISOString(), origin: 'web', acquisition: 'first_party', sourceContext: source.id, channelIds: ['synthetic-channel'] });
  const stamp = revision => ({ sourceId: source.id, sourceConfigVersion: source.configVersion, snapshotId: snapshot.id, rightsConfirmedAt: before.toISOString(), permissionRevision: revision });
  return { db, org, source, snapshot, store, service, input, stamp, now,
    close };
  }catch(error){await close();throw error;}
}
test('expired live permission renews by exact raw revision on real PostgreSQL', { skip: !local }, async () => {
  const f = await fixture(); try {
    const saved = await f.service.save(f.org.id, 'owner', f.input(0)); assert.equal(saved.payload.origin, 'first_party');
    const expired = new Date(f.now.getTime() - 1000);
    await f.db.socialFactoryRecord.update({ where: { organizationId_kind_id: { organizationId: f.org.id, kind: 'source_permission', id: f.source.id } }, data: { expiresAt: expired, payload: { ...saved.payload, expiresAt: expired.toISOString() } } });
    assert.equal(await f.store.read(f.org.id, 'source_permission', f.source.id), null);
    await assert.rejects(f.service.save(f.org.id, 'owner', f.input(0)), error => error.code === 'SOCIAL_FACTORY_CONFLICT');
    const renewed = await f.service.save(f.org.id, 'owner', f.input(1)); assert.equal(renewed.revision, 2);
    await assert.rejects(f.service.save(f.org.id, 'owner', f.input(1)), error => error.code === 'SOCIAL_FACTORY_CONFLICT');
  } finally { await f.close(); }
});
test('permission revoke waits for the actual native source fence then atomically redacts its descendant', { skip: !local }, async () => {
  const f = await fixture(); try {
    await f.service.save(f.org.id, 'owner', f.input(0));
    let entered; let release; const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
    const publishing = f.db.$transaction(async tx => {
      await repository.assertSourceAdmissionsV1(tx, f.org.id, [f.stamp(1)]); entered(); await gate;
      await tx.socialFactoryRecord.create({ data: { organizationId: f.org.id, kind: 'editorial', id: 'synthetic-derived', sourceIds: [repository.sourceRef(f.source.id)], payload: { text: 'Synthetic private teaching example' } } });
    }, { isolationLevel: 'Serializable', timeout: 10000 });
    await started; let revoked = false;
    const revoking = f.service.revoke(f.org.id, f.source.id, 1).then(result => { revoked = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(revoked, false);
    release(); await publishing; const result = await revoking; assert.equal(result.redacted, 1);
    assert.equal(await f.store.read(f.org.id, 'editorial', 'synthetic-derived'), null);
    const permission = await f.store.readSourcePermissionState(f.org.id, f.source.id); assert.equal(permission.state, 'present'); assert.ok(permission.record.payload.revokedAt);
    await assert.rejects(f.store.transact(store => store.assertSourceAdmissions(f.org.id, [f.stamp(1)])), error => error.code === 'SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
  } finally { await f.close(); }
});

test('same live grant extension preserves real native bytes while changed permission revisions remain fenced', { skip: !local }, async () => {
  const f = await fixture(); try {
    await f.service.save(f.org.id, 'owner', f.input(0));
    const integration = await f.db.integration.create({ data: { organizationId: f.org.id, internalId: randomUUID(), name: 'Synthetic native history', providerIdentifier: 'telegram', type: 'social', token: 'synthetic-only' } });
    const piece = await f.db.contentPiece.create({ data: { organizationId: f.org.id, title: 'Retained native title', body: 'Retained native piece bytes', brief: { text: 'Retained brief' }, createdByUserId: randomUUID() } });
    const post = await f.db.post.create({ data: { organizationId: f.org.id, integrationId: integration.id, group: randomUUID(), state: 'PUBLISHED', publishDate: f.now, content: 'Retained published native bytes', image: '[{"id":"synthetic-image"}]', settings: '{"caption":"Original saved caption"}' } });
    const derivation = await f.db.contentDerivation.create({ data: { organizationId: f.org.id, contentPieceId: piece.id, postId: post.id, platform: 'telegram', format: 'post', body: 'Retained native derivation bytes' } });
    await f.store.put({ organizationId: f.org.id, kind: 'action', id: 'synthetic-native-receipt', expectedRevision: 0, sourceIds: [repository.sourceRef(f.source.id)], payload: { type: 'native_material_receipt', material: { pieceId: piece.id, derivationId: derivation.id, settings: {}, assets: [] } } });
    const extension = { ...f.input(1), expiresAt: new Date(f.now.getTime() + 172800000).toISOString(), purposes: ['editorial', 'discovery'] };
    const updated = await f.service.save(f.org.id, 'owner', extension); assert.equal(updated.revision, 2);
    const retainedPost = await f.db.post.findUnique({ where: { id: post.id } });
    assert.equal(retainedPost.content, post.content); assert.equal(retainedPost.image, post.image); assert.equal(retainedPost.settings, post.settings); assert.equal(retainedPost.state, 'PUBLISHED');
    assert.equal((await f.db.contentPiece.findUnique({ where: { id: piece.id } })).body, piece.body);
    assert.equal((await f.db.contentDerivation.findUnique({ where: { id: derivation.id } })).body, derivation.body);
    assert.ok(await f.store.read(f.org.id, 'action', 'synthetic-native-receipt'));
    await assert.rejects(f.store.transact(store => store.assertSourceAdmissions(f.org.id, [f.stamp(1)])), error => error.code === 'SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
    await f.store.transact(store => store.assertSourceAdmissions(f.org.id, [f.stamp(2)]));
    await f.service.revoke(f.org.id, f.source.id, 2);
    assert.equal((await f.db.post.findUnique({ where: { id: post.id } })).content, '');
    assert.equal((await f.db.contentPiece.findUnique({ where: { id: piece.id } })).body, '');
  } finally { await f.close(); }
});

test('extended permission retention survives the old deadline without extending another source earlier limit', { skip: !local }, async () => {
  const f = await fixture(); try {
    const oldDeadline = new Date(f.now.getTime() + 3600000); const extendedDeadline = new Date(f.now.getTime() + 7200000); const earlierDeadline = new Date(f.now.getTime() + 1800000);
    await f.service.save(f.org.id, 'owner', { ...f.input(0), expiresAt: oldDeadline.toISOString() });
    const integration = await f.db.integration.create({ data: { organizationId: f.org.id, internalId: randomUUID(), name: 'Synthetic retained publication', providerIdentifier: 'telegram', type: 'social', token: 'synthetic-only' } });
    const piece = await f.db.contentPiece.create({ data: { organizationId: f.org.id, title: 'History after renewal', body: 'Keep after original permission deadline', createdByUserId: randomUUID() } });
    const post = await f.db.post.create({ data: { organizationId: f.org.id, integrationId: integration.id, group: randomUUID(), state: 'PUBLISHED', publishDate: f.now, content: 'Keep published bytes after original deadline', image: '[]', settings: '{}' } });
    const derivation = await f.db.contentDerivation.create({ data: { organizationId: f.org.id, contentPieceId: piece.id, postId: post.id, platform: 'telegram', format: 'post', body: 'Keep derivative bytes' } });
    await f.store.put({ organizationId: f.org.id, kind: 'action', id: 'renewed-history', expectedRevision: 0, sourceIds: [repository.sourceRef(f.source.id)], payload: { type: 'native_material_receipt', material: { pieceId: piece.id, derivationId: derivation.id, settings: {}, assets: [] } } });
    const other = await f.db.contentSource.create({ data: { organizationId: f.org.id, kind: 'MANUAL', displayName: 'Synthetic earlier-retention source', canonicalKey: randomUUID(), createdByUserId: randomUUID(), updatedByUserId: randomUUID(), desiredState: 'ACTIVE', rightsState: 'CONFIRMED', rightsConfirmedAt: f.now, rightsConfirmedByUserId: randomUUID(), usagePurpose: 'EVIDENCE' } });
    const otherSnapshot = await f.db.sourceSnapshot.create({ data: { organizationId: f.org.id, sourceId: other.id, sequence: 1, observedAt: f.now, validatedAt: f.now, contentHash: 'earlier', parser: 'manual', parserVersion: 'v1', retrievalProvider: 'manual-v1', retentionUntil: earlierDeadline } });
    await f.db.contentSource.update({ where: { id: other.id }, data: { currentSnapshotId: otherSnapshot.id } });
    await f.store.put({ organizationId: f.org.id, kind: 'editorial', id: 'earlier-second-source', expectedRevision: 0, sourceIds: [repository.sourceRef(f.source.id), repository.sourceRef(other.id)], payload: { text: 'This must expire at the second source deadline' } });
    await f.service.save(f.org.id, 'owner', { ...f.input(1), expiresAt: extendedDeadline.toISOString() });
    const history = await f.db.socialFactoryRecord.findUnique({ where: { organizationId_kind_id: { organizationId: f.org.id, kind: 'action', id: 'renewed-history' } } });
    const limited = await f.db.socialFactoryRecord.findUnique({ where: { organizationId_kind_id: { organizationId: f.org.id, kind: 'editorial', id: 'earlier-second-source' } } });
    assert.equal(history.expiresAt.toISOString(), extendedDeadline.toISOString());
    assert.equal(limited.expiresAt.toISOString(), earlierDeadline.toISOString());
    await f.store.purgeExpired(f.org.id, new Date(f.now.getTime() + 5400000));
    assert.equal((await f.db.post.findUnique({ where: { id: post.id } })).content, post.content);
    assert.equal((await f.db.contentPiece.findUnique({ where: { id: piece.id } })).body, piece.body);
    assert.equal((await f.db.contentDerivation.findUnique({ where: { id: derivation.id } })).body, derivation.body);
    assert.ok(await f.store.read(f.org.id, 'action', 'renewed-history'));
    assert.equal(await f.store.read(f.org.id, 'editorial', 'earlier-second-source'), null);
  } finally { await f.close(); }
});
