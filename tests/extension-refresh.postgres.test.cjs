'use strict';

const { PrismaClient } = require('@prisma/client');
const {
  AuthService,
  COOKIES,
  GENERATION_KEY,
  encodedCookies,
  encryptedDetails,
  grant,
  serviceFor,
  controllerFor,
} = require('./helpers/extension-refresh.module.cjs');
const dbUrl = process.env.CF_EXTENSION_DATABASE_URL;

(dbUrl ? describe : describe.skip)(
  'extension refresh on owned disposable PostgreSQL',
  () => {
    let db, savedSecret;
    beforeAll(async () => {
      const url = new URL(dbUrl);
      if (
        process.env.CF_EXTENSION_DATABASE_DISPOSABLE !== '1' ||
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/cf_extension_dbxe_test'
      ) {
        throw new Error(
          'Only the explicitly owned disposable extension database is allowed'
        );
      }
      savedSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'synthetic-extension-postgres-secret';
      db = new PrismaClient({ datasourceUrl: dbUrl });
      await db.organization.createMany({
        data: [
          { id: 'a', name: 'Synthetic A' },
          { id: 'b', name: 'Synthetic B' },
        ],
      });
    });
    beforeEach(async () => {
      await db.integration.deleteMany({});
      await db.integration.createMany({
        data: ['a', 'b'].map((organizationId) => ({
          id: organizationId === 'a' ? 'channel' : 'foreign-channel',
          organizationId,
          internalId: 'account',
          providerIdentifier: 'skool',
          type: 'social',
          name: 'Synthetic',
          token: 'old-token',
          customInstanceDetails: encryptedDetails(),
        })),
      });
    });
    afterAll(async () => {
      await db?.$disconnect();
      if (savedSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = savedSecret;
    });
    const read = () => db.integration.findUnique({ where: { id: 'channel' } });
    const provider = () => ({
      identifier: 'skool',
      isChromeExtension: true,
      authenticate: jest.fn(async () => ({
        id: 'account',
        name: 'Synthetic',
        accessToken: 'fresh-token',
        expiresIn: 3600,
      })),
    });
    const controller = (p) => controllerFor(serviceFor(db), p);
    const refresh = (c, jwt = grant()) =>
      c.extensionRefreshCookies({ jwt, cookies: encodedCookies() });

    test.each([
      ['deleted', { deletedAt: new Date('2000-01-01T00:00:00Z') }],
      ['disabled', { disabled: true }],
      ['reconnected', { customInstanceDetails: null }],
    ])(
      '%s persisted connection refuses the old grant without any provider call',
      async (_name, data) => {
        if (_name === 'reconnected')
          data = { customInstanceDetails: encryptedDetails('connection-2') };
        await db.integration.update({ where: { id: 'channel' }, data });
        const before = await read(),
          p = provider();
        await expect(refresh(controller(p))).rejects.toMatchObject({
          status: 401,
        });
        expect(p.authenticate).not.toHaveBeenCalled();
        expect(await read()).toEqual(before);
      }
    );

    test.each([
      ['deleted', { deletedAt: new Date('2000-01-01T00:00:00Z') }],
      ['disabled', { disabled: true }],
      ['reconnected', { token: 'new-connection-token' }],
    ])(
      '%s during authentication cannot be overwritten by a late real DB write',
      async (_name, data) => {
        const p = provider();
        let moved;
        p.authenticate.mockImplementationOnce(async () => {
          if (_name === 'reconnected')
            data = {
              ...data,
              customInstanceDetails: encryptedDetails('connection-2'),
            };
          await db.integration.update({ where: { id: 'channel' }, data });
          moved = await read();
          return { id: 'account', accessToken: 'late-token', expiresIn: 3600 };
        });
        await expect(refresh(controller(p))).rejects.toMatchObject({
          status: 409,
        });
        expect(await read()).toEqual(moved);
      }
    );

    test('real reconnect creates two distinct generations with identical cookies; normal refresh stays valid', async () => {
      const p = provider(),
        c = controller(p);
      const body = {
        state: 'fixture-state',
        code: encodedCookies(),
        timezone: '0',
      };
      const first = await c.connectSocialMedia('skool', body);
      const second = await c.connectSocialMedia('skool', body);
      expect(first.id).toBe(second.id);
      expect(
        AuthService.verifyJWT(first.extensionToken).connectionGeneration
      ).not.toBe(
        AuthService.verifyJWT(second.extensionToken).connectionGeneration
      );
      p.authenticate.mockClear();
      await expect(refresh(c, first.extensionToken)).rejects.toMatchObject({
        status: 401,
      });
      expect(p.authenticate).not.toHaveBeenCalled();
      const foreign = await db.integration.findUnique({
        where: { id: 'foreign-channel' },
      });
      await expect(refresh(c, second.extensionToken)).resolves.toEqual({
        success: true,
      });
      await expect(refresh(c, second.extensionToken)).resolves.toEqual({
        success: true,
      });
      const stored = JSON.parse(
        AuthService.fixedDecryption((await read()).customInstanceDetails)
      );
      expect(stored).toEqual({
        ...COOKIES,
        [GENERATION_KEY]: AuthService.verifyJWT(second.extensionToken)
          .connectionGeneration,
      });
      expect(
        await db.integration.findUnique({ where: { id: 'foreign-channel' } })
      ).toEqual(foreign);
    });

    test('a late account-mismatch diagnostic cannot mark a new connection', async () => {
      const p = provider();
      let moved;
      p.authenticate.mockImplementationOnce(async () => {
        await db.integration.update({
          where: { id: 'channel' },
          data: { customInstanceDetails: encryptedDetails('connection-2') },
        });
        moved = await read();
        return { id: 'other-account' };
      });
      await expect(refresh(controller(p))).rejects.toMatchObject({
        status: 409,
      });
      expect(await read()).toEqual(moved);
    });
  }
);
