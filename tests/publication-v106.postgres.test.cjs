'use strict';
const { PrismaClient } = require('@prisma/client');
const { fixture, PUBLICATION_UNCERTAIN_V106 } = require('./helpers/publication-v106.module.cjs');

const dbUrl = process.env.CF_PUBLISH_DATABASE_URL;
(dbUrl ? describe : describe.skip)('V106 publication persistence on owned disposable PostgreSQL', () => {
  let db;
  beforeAll(async () => {
    const url = new URL(dbUrl);
    if (process.env.CF_PUBLISH_DATABASE_DISPOSABLE !== '1' || url.hostname !== '127.0.0.1' || url.pathname !== '/cf_publish_dbxe_test') {
      throw new Error('Only the explicitly owned disposable publication database is allowed');
    }
    db = new PrismaClient({ datasourceUrl: dbUrl });
    await db.organization.createMany({ data: [{ id: 'a', name: 'Synthetic A' }, { id: 'b', name: 'Synthetic B' }] });
    await db.integration.create({ data: {
      id: 'channel-a', organizationId: 'a', providerIdentifier: 'synthetic', internalId: 'synthetic',
      name: 'Synthetic channel', type: 'social', token: 'inert-fixture-token',
    } });
  });
  beforeEach(async () => {
    await db.post.deleteMany({});
    db.row = await db.post.create({ data: {
      id: 'p1', organizationId: 'a', integrationId: 'channel-a', state: 'QUEUE',
      content: 'Synthetic post', group: 'group-1', publishDate: new Date('2000-01-01Z'),
      settings: '{}', image: '[]',
    } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  const send = f => f.activity.postSocialV106(f.integration, [f.client.row], 'initial');
  const read = () => db.post.findUnique({ where: { id: 'p1' } });

  test('confirmed write survives streak failure and a new Prisma client; retry performs no remote write', async () => {
    const f = fixture(db, { streak: async () => { throw new Error('synthetic streak RPC failure'); } });
    await expect(send(f)).resolves.toEqual(f.receipts);
    await expect(f.activity.startPublicationStreakV106(f.key)).resolves.toEqual({ started: false });
    const persisted = await read();
    expect(persisted).toMatchObject({ state: 'PUBLISHED', releaseId: 'remote-1', releaseURL: f.receipts[0].releaseURL });
    expect(persisted.publicationJournal.attempts[0]).toMatchObject({ status: 'confirmed', receipts: f.receipts, auxiliaryFailure: 'streak' });
    await expect(f.repository.confirmPublicationV106(f.key, f.receipts)).resolves.toEqual(f.receipts);
    const restarted = new PrismaClient({ datasourceUrl: dbUrl });
    try {
      restarted.row = db.row;
      const recovery = fixture(restarted);
      await expect(send(recovery)).resolves.toEqual(f.receipts);
      expect(recovery.calls.writes).toBe(0);
    } finally { await restarted.$disconnect(); }
    expect(f.calls.writes).toBe(1);
  });

  test('ten concurrent claims and actual activity retries admit one local provider invocation', async () => {
    const f = fixture(db);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => send(f)));
    expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    expect(f.calls.writes).toBe(1);
    await expect(send(f)).resolves.toEqual(f.receipts);
    const post = await read();
    expect(post.state).toBe('PUBLISHED');
    expect(post.publicationJournal.attempts).toHaveLength(1);
    expect(post.publicationJournal.attempts[0].receipts).toEqual(f.receipts);
  });

  test('crash after durable claim leaves uncertainty on reconciliation and blocks all generations', async () => {
    const f = fixture(db);
    expect(await f.repository.claimPublicationV106(f.key)).toEqual({ status: 'claimed' });
    // No activity can prove whether the process died before or after the send.
    expect((await read()).error).toBe(PUBLICATION_UNCERTAIN_V106);
    const recovery = fixture(db);
    await expect(send(recovery)).rejects.toMatchObject({ type: 'publication_uncertain', nonRetryable: true });
    await expect(recovery.activity.postSocialV106(recovery.integration, [db.row], 'repeat:another-run')).rejects.toMatchObject({ type: 'publication_uncertain' });
    const post = await read();
    expect(post).toMatchObject({ state: 'ERROR', releaseId: null, error: PUBLICATION_UNCERTAIN_V106 });
    expect(post.publicationJournal.attempts[0].status).toBe('pending');
    expect(recovery.calls.writes).toBe(0);
  });

  test('lost provider response records uncertainty, receipt reconciliation rolls forward without a write', async () => {
    const f = fixture(db, { write: async () => { throw new Error('synthetic lost response'); } });
    await expect(send(f)).rejects.toMatchObject({ type: 'publication_uncertain' });
    const recovery = fixture(db);
    await expect(send(recovery)).rejects.toMatchObject({ type: 'publication_uncertain' });
    await recovery.repository.confirmPublicationV106(f.key, f.receipts); // verified authoritative receipt fixture
    await expect(send(recovery)).resolves.toEqual(f.receipts);
    expect((await read()).error).toBeNull();
    expect(f.calls.writes).toBe(1);
    expect(recovery.calls.writes).toBe(0);
  });

  test('known preparation failure leaves no claim and permits a corrected queued post on actual PostgreSQL', async () => {
    const f = fixture(db);
    f.service.updateTags = async () => { throw new Error('synthetic local preparation failure'); };
    await expect(send(f)).rejects.toMatchObject({ type: 'publication_preparation_failed' });
    const failed = await read();
    expect(failed).toMatchObject({ state: 'ERROR', content: 'Synthetic post' });
    expect(failed.publicationJournal).toBeNull();
    expect(f.calls.writes).toBe(0);
    db.row = await db.post.update({ where: { id: 'p1' }, data: { state: 'QUEUE', content: 'Corrected post' } });
    const corrected = fixture(db);
    await expect(send(corrected)).resolves.toEqual(corrected.receipts);
    expect(corrected.calls.writes).toBe(1);
    const confirmed = await read();
    expect(confirmed).toMatchObject({ state: 'PUBLISHED', content: 'Corrected post' });
    expect(confirmed.publicationJournal.attempts).toHaveLength(1);
    // An attempt already confirmed cannot be marked unsent by a late call.
    await corrected.repository.markPublicationPreparationFailureV106(corrected.key);
    expect(await read()).toEqual(confirmed);
  });

  test('a preparation diagnostic racing with a real PostgreSQL claim cannot overwrite it', async () => {
    const f = fixture(db);
    let signalRead, resumeRead;
    const readCaptured = new Promise(resolve => { signalRead = resolve; });
    const continueRead = new Promise(resolve => { resumeRead = resolve; });
    const reader = { row: db.row, post: {
      findFirst: async args => {
        const post = await db.post.findFirst(args);
        signalRead();
        await continueRead;
        return post;
      },
      updateMany: args => db.post.updateMany(args),
    } };
    const diagnostic = fixture(reader).repository.markPublicationPreparationFailureV106(f.key);
    await readCaptured;
    await f.repository.claimPublicationV106(f.key);
    const pending = await read();
    resumeRead();
    await diagnostic;
    expect(await read()).toEqual(pending);
    expect(pending.publicationJournal.attempts[0].status).toBe('pending');
    expect(f.calls.writes).toBe(0);
  });

  test('different tenant/integration cannot claim or confirm the same persisted Post', async () => {
    const f = fixture(db);
    const before = await read();
    expect(await f.repository.claimPublicationV106({ ...f.key, organizationId: 'b' })).toEqual({ status: 'refused' });
    expect(await f.repository.claimPublicationV106({ ...f.key, integrationId: 'foreign' })).toEqual({ status: 'refused' });
    await expect(f.repository.confirmPublicationV106({ ...f.key, organizationId: 'b' }, f.receipts)).rejects.toThrow('not found');
    expect(await read()).toEqual(before);
    expect(f.calls.writes).toBe(0);
  });

  test('concurrent receipt reconciliation is atomic and refuses a conflicting external ID', async () => {
    const f = fixture(db);
    await f.repository.claimPublicationV106(f.key);
    const conflicting = [{ ...f.receipts[0], postId: 'other-remote' }];
    const results = await Promise.allSettled([
      f.repository.confirmPublicationV106(f.key, f.receipts),
      f.repository.confirmPublicationV106(f.key, conflicting),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.message).toContain('Conflicting');
    const post = await read();
    expect(post.releaseId).toBe(post.publicationJournal.attempts[0].receipts[0].postId);
    expect(post.state).toBe('PUBLISHED');
  });

  test('confirmed initial and repeat receipts are retained separately; late initial retry keeps the repeat projection', async () => {
    const f = fixture(db);
    await send(f);
    const repeatReceipt = [{ ...f.receipts[0], postId: 'repeat-remote' }];
    f.provider.post = async () => { f.calls.writes++; return repeatReceipt; };
    await f.activity.postSocialV106(f.integration, [db.row], 'repeat:child-1');
    await expect(send(f)).resolves.toEqual(f.receipts);
    const post = await read();
    expect(post.releaseId).toBe('repeat-remote');
    expect(post.publicationJournal.attempts.map(a => a.receipts)).toEqual([f.receipts, repeatReceipt]);
    expect(f.calls.writes).toBe(2);
  });
});
