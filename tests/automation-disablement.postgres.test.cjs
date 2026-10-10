'use strict';

const { PrismaClient } = require('@prisma/client');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { fixture, input, internalInput, runScheduled } = require('./helpers/automation-disablement.module.cjs');
const { IntegrationRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': { PrismaRepository: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
  }
);
const dbUrl = process.env.CF_AUTOMATION_DATABASE_URL;

(dbUrl ? describe : describe.skip)('automation wake on owned disposable PostgreSQL', () => {
  let db, repository, log;
  beforeAll(async () => {
    const url = new URL(dbUrl);
    if (process.env.CF_AUTOMATION_DATABASE_DISPOSABLE !== '1' || url.hostname !== '127.0.0.1' ||
      url.pathname !== '/cf_automation_dbxe_test') {
      throw new Error('Only the explicitly owned disposable automation database is allowed');
    }
    db = new PrismaClient({ datasourceUrl: dbUrl });
    const model = { model: db };
    repository = new IntegrationRepository(model, model, model, model, model, model);
    await db.organization.createMany({ data: [{ id: 'org', name: 'Synthetic' }, { id: 'foreign', name: 'Synthetic foreign' }] });
  });
  beforeEach(async () => {
    log = jest.spyOn(console, 'info').mockImplementation(() => {});
    await db.integration.deleteMany({});
    await db.integration.createMany({ data: ['source', 'target'].map(id => ({
      id, internalId: id, organizationId: 'org', providerIdentifier: 'synthetic',
      type: 'social', name: 'Synthetic', token: 'synthetic-sensitive-token',
    })) });
    await db.plugs.create({ data: { id: 'plug', organizationId: 'org', integrationId: 'source',
      plugFunction: 'promote', data: JSON.stringify([{ name: 'text', value: 'Synthetic content' }]) } });
  });
  afterEach(() => { log?.mockRestore(); });
  afterAll(async () => { await db?.$disconnect(); });

  test.each([
    ['inactive plug', () => db.plugs.update({ where: { id: 'plug' }, data: { activated: false } })],
    ['removed plug', () => db.plugs.delete({ where: { id: 'plug' } })],
    ['disabled channel', () => db.integration.update({ where: { id: 'source' }, data: { disabled: true } })],
    ['deleted channel', () => db.integration.update({ where: { id: 'source' }, data: { deletedAt: new Date('2000-01-01Z') } })],
  ])('fresh persisted %s defeats the cached V105 schedule', async (_name, disable) => {
    const f = fixture(repository);
    expect((await repository.getPlug('plug')).activated).toBe(true);
    const calls = await runScheduled(5, f, { onWake: async () => { await disable(); } });
    expect(calls.processPlug).toBe(1);
    expect(f.provider.promote).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  test.each(['source', 'target'])('fresh disabled/deleted %s suppresses internal execution', async side => {
    for (const patch of [{ disabled: true, deletedAt: null }, { disabled: false, deletedAt: new Date('2000-01-01Z') }]) {
      log.mockClear();
      const f = fixture(repository);
      const calls = await runScheduled(6, f, { kind: 'internal', onWake: async () => {
        await db.integration.update({ where: { id: side }, data: patch });
      } });
      expect(calls.processInternalPlug).toBe(1);
      expect(f.provider.repost).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
    }
  });

  test('enabled persisted global and internal actions still execute', async () => {
    const f = fixture(repository);
    expect(await f.service.processPlugs(input)).toBe(false);
    expect(await f.service.processInternalPlug(internalInput)).toBeUndefined();
    expect(f.provider.promote).toHaveBeenCalledTimes(1);
    expect(f.provider.repost).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  test('existing organization-scoped internal lookup excludes another tenant', async () => {
    const f = fixture(repository);
    expect(await f.service.processInternalPlug({ ...internalInput, orgId: 'foreign' })).toBeUndefined();
    expect(f.provider.repost).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
