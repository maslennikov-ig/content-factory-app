require('reflect-metadata');
const { HttpException, RequestMethod } = require('@nestjs/common');
const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { AuthController } = loadTypeScriptModule(
  'apps/backend/src/api/routes/auth.controller.ts',
  {
    '../redis/redis.service': {
      ioRedis: {
        status: 'ready',
        duplicate: () => { throw new Error('Unexpected registration Redis I/O'); },
      },
    },
    '@contentfactory/backend/services/auth/auth.service': {
      AuthService: class {},
    },
    '@contentfactory/nestjs-libraries/services/email.service': {
      EmailService: class {},
    },
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      inspectTeamInvitation: async () => null,
      TeamInvitationError: class extends Error {},
    },
  }
);

describe('Telegram state inspection endpoint', () => {
  const createController = (purpose = 'link') => {
    const service = { telegramStatePurpose: jest.fn(async () => purpose) };
    const response = {
      header: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    return { controller: new AuthController(service, {}), service, response };
  };

  test('is the dedicated GET /auth/telegram/state route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuthController)).toBe('/auth');
    expect(
      Reflect.getMetadata(PATH_METADATA, AuthController.prototype.telegramState)
    ).toBe('/telegram/state');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AuthController.prototype.telegramState
      )
    ).toBe(RequestMethod.GET);
  });

  test.each(['login', 'link'])(
    'returns only %s purpose with no-store and forwards the current cookie',
    async (purpose) => {
      const { controller, service, response } = createController(purpose);

      await expect(
        controller.telegramState(
          'callback-state',
          {
            cookies: { oauth_state: 'browser-state', auth: 'private-session' },
          },
          response
        )
      ).resolves.toEqual({ purpose });

      expect(service.telegramStatePurpose).toHaveBeenCalledWith({
        state: 'callback-state',
        browserState: 'browser-state',
      });
      expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(response.cookie).not.toHaveBeenCalled();
      expect(response.clearCookie).not.toHaveBeenCalled();
    }
  );

  test.each([
    'missing state',
    'expired state',
    'consumed state',
    'foreign state',
    'Redis unavailable',
  ])(
    'refuses %s with the same public response and no-store',
    async (internalReason) => {
      const { controller, service, response } = createController();
      service.telegramStatePurpose.mockRejectedValue(new Error(internalReason));

      let refusal;
      try {
        await controller.telegramState('callback-state', {}, response);
      } catch (error) {
        refusal = error;
      }

      expect(refusal).toBeInstanceOf(HttpException);
      expect(refusal.getStatus()).toBe(400);
      expect(refusal.getResponse()).toBe('Invalid or expired Telegram state');
      expect(service.telegramStatePurpose).toHaveBeenCalledWith({
        state: 'callback-state',
        browserState: undefined,
      });
      expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(response.cookie).not.toHaveBeenCalled();
      expect(response.clearCookie).not.toHaveBeenCalled();
    }
  );
});
