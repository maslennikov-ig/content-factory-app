'use strict';

require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { RerenderAdaptationBold, preBoldEditorHtml } = loadWithMocks(
  'apps/commands/src/tasks/rerender.adaptation.bold.ts',
  {
    'nestjs-command': { Command: () => () => undefined, Option: () => () => undefined },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  }
);
const { editorHtml } = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts'
);
const BODY = 'Срок держится, когда **о нём знает клиент**.';
const dbUrl = process.env.CF_BACKFILL_DATABASE_URL;

(dbUrl ? describe : describe.skip)('bold backfill on owned disposable PostgreSQL', () => {
  let db;
  beforeAll(async () => {
    const url = new URL(dbUrl);
    if (process.env.CF_BACKFILL_DATABASE_DISPOSABLE !== '1' ||
        url.hostname !== '127.0.0.1' || url.pathname !== '/cf_backfill_dbxe_test') {
      throw new Error('Only the explicitly owned disposable backfill database is allowed');
    }
    db = new PrismaClient({ datasourceUrl: dbUrl });
    await db.organization.create({ data: { id: 'a', name: 'Synthetic backfill' } });
    await db.integration.create({ data: {
      id: 'channel', organizationId: 'a', providerIdentifier: 'telegram', internalId: 'synthetic',
      name: 'Synthetic channel', type: 'social', token: 'inert-fixture-token',
    } });
    await db.contentPiece.create({ data: {
      id: 'piece', organizationId: 'a', title: 'Synthetic piece', body: BODY,
      createdByUserId: 'synthetic-user',
    } });
  });
  beforeEach(async () => {
    await db.contentDerivation.deleteMany({});
    await db.post.deleteMany({});
    await db.post.create({ data: {
      id: 'post', organizationId: 'a', integrationId: 'channel', state: 'DRAFT',
      content: preBoldEditorHtml(BODY, 'html'), group: 'synthetic-group',
      publishDate: new Date('2000-01-01T00:00:00Z'),
    } });
    await db.contentDerivation.create({ data: {
      id: 'cut', organizationId: 'a', contentPieceId: 'piece', postId: 'post',
      platform: 'telegram', format: 'post', body: BODY,
      updatedAt: new Date('2000-01-01T00:00:00Z'),
    } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  const task = (afterRead = async () => {}) => {
    const client = {
      organization: db.organization,
      contentDerivation: { findMany: async args => {
        const rows = await db.contentDerivation.findMany(args);
        await afterRead();
        return rows;
      } },
      post: db.post,
    };
    const command = new RerenderAdaptationBold(
      { model: client }, { getSocialIntegration: () => ({ editor: 'html' }) }
    );
    command._logger = { log: () => undefined };
    return command;
  };
  const readPair = () => Promise.all([
    db.post.findUnique({ where: { id: 'post' } }),
    db.contentDerivation.findUnique({ where: { id: 'cut' } }),
  ]);

  test.each([
    ['post content', () => db.post.update({
      where: { id: 'post' }, data: { content: '<p>Новая ручная правка</p>' },
    })],
    ['derivation body', () => db.contentDerivation.update({
      where: { id: 'cut' }, data: { body: 'Новая **ручная** адаптация.' },
    })],
    ['derivation version with unchanged body', () => db.contentDerivation.update({
      where: { id: 'cut' }, data: { updatedAt: new Date('2000-01-02T00:00:00Z') },
    })],
    ['raw body spacing', () => db.contentDerivation.update({
      where: { id: 'cut' }, data: { body: ` ${BODY} `, updatedAt: new Date('2000-01-01T00:00:00Z') },
    })],
    ['post state', () => db.post.update({
      where: { id: 'post' }, data: { state: 'QUEUE' },
    })],
    ['post deletion', () => db.post.update({
      where: { id: 'post' }, data: { deletedAt: new Date('2000-01-02T00:00:00Z') },
    })],
  ])('retains a committed %s change after reading and counts it skipped', async (_name, edit) => {
    let edited;
    const command = task(async () => { await edit(); edited = await readPair(); });

    expect(await command.rerender(true, false)).toEqual({
      seen: 1, planned: 1, rewritten: 0, skipped: 1,
    });
    expect(await readPair()).toEqual(edited);
  });

  test('an unchanged machine render updates once without changing the derivation', async () => {
    const before = await readPair();
    expect(await task().rerender(true, false)).toEqual({
      seen: 1, planned: 1, rewritten: 1, skipped: 0,
    });
    const after = await readPair();
    expect(after[0].content).toBe(editorHtml(BODY, 'html'));
    expect(after[1]).toEqual(before[1]);
    expect((await task().rerender(true, false)).rewritten).toBe(0);
    expect(await readPair()).toEqual(after);
  });

  test('two commands reading the same version perform one actual update', async () => {
    let resume, readers = 0;
    const gate = new Promise(resolve => { resume = resolve; });
    const afterRead = async () => {
      if (++readers === 2) resume();
      await gate;
    };
    const results = await Promise.all([
      task(afterRead).rerender(true, false), task(afterRead).rerender(true, false),
    ]);
    expect(results.map(result => result.rewritten).sort()).toEqual([0, 1]);
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(1);
    expect((await readPair())[0].content).toBe(editorHtml(BODY, 'html'));
  });
});
