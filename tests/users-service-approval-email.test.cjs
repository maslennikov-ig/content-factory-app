const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    log() {}
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  },
};

const { UsersService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
  {
    '@nestjs/common': nest,
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      generateAdminBindCode: () => 'unused-in-this-suite',
      ADMIN_BIND_CLAIM_WINDOW_MS: 15 * 60 * 1_000,
    },
  }
);

function buildService(user) {
  const queued = [];
  const usersRepository = {
    getUserById: async () => user,
    activateUser: async () => ({ id: user.id, activated: true }),
  };
  const notificationService = {
    sendEmail: async (to, subject, html, replyTo, language) => {
      queued.push({ to, subject, html, replyTo, language });
    },
  };
  return {
    service: new UsersService(usersRepository, {}, notificationService),
    queued,
  };
}

test('approveAccount queues a localized sign-in email after activating the approved account', async () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://factory.example';

  try {
    const { service, queued } = buildService({
      id: 'approved-user',
      email: 'new-user@example.com',
      language: 'ru',
    });

    await expect(service.approveAccount('approved-user')).resolves.toEqual({
      id: 'approved-user',
      activated: true,
    });

    expect(queued).toEqual([
      {
        to: 'new-user@example.com',
        subject: 'Аккаунт одобрен — теперь можно войти',
        html: expect.stringContaining('https://factory.example/auth'),
        replyTo: undefined,
        language: 'ru',
      },
    ]);
  } finally {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  }
});

test('approveAccount does not queue an email when the account is missing', async () => {
  const queued = [];
  const service = new UsersService(
    {
      getUserById: async () => null,
      activateUser: async () => {
        throw new Error('must not activate a missing account');
      },
    },
    {},
    {
      sendEmail: async (...args) => queued.push(args),
    }
  );

  await expect(service.approveAccount('missing-user')).rejects.toMatchObject({
    message: 'User not found',
    status: 404,
  });
  expect(queued).toEqual([]);
});

test('approveAccount keeps the completed activation when the email queue rejects', async () => {
  const user = {
    id: 'approved-user',
    email: 'new-user@example.com',
    language: 'en',
  };
  let activated = false;
  const service = new UsersService(
    {
      getUserById: async () => user,
      activateUser: async () => {
        activated = true;
        return { id: user.id, activated: true };
      },
    },
    {},
    {
      sendEmail: async () => {
        throw new Error('Temporal is unavailable');
      },
    }
  );

  await expect(service.approveAccount(user.id)).resolves.toEqual({
    id: user.id,
    activated: true,
  });
  expect(activated).toBe(true);
});
