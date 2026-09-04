const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');

/**
 * `content-factory-next-fn33.53`. The language flag in the header used to write
 * a browser cookie and nothing else. `User.language` therefore kept the value
 * registration wrote — English for everybody who registered with an English
 * browser — and every letter the server sends reads that field. Approval,
 * rejection, invitation: all English, forever, no matter what the person chose.
 *
 * Three things are checked, and the last is the one that matters to a reader:
 * the door stores a language, refuses one it cannot write letters in, and after
 * a change to Russian the approval letter arrives in Russian.
 */

const backendStrings =
  'libraries/nestjs-libraries/src/locale/backend-strings.ts';

const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    log() {}
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(typeof message === 'string' ? message : message.message);
      this.status = status;
      this.response = message;
    }
  },
};

const { UsersService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.repository':
      {},
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class OrganizationRepository {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class NotificationService {} },
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      ADMIN_BIND_CLAIM_WINDOW_MS: 1,
      generateAdminBindCode: () => 'code',
    },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/locale/backend-strings': backendStrings,
    },
  }
);

const { UserLanguageDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/users/user.language.dto.ts',
  {},
  {
    sources: {
      '@contentfactory/nestjs-libraries/locale/backend-strings': backendStrings,
    },
  }
);

/** One account row, as the repository would hold it. */
function service() {
  const account = {
    id: 'walker',
    email: 'walker@example.test',
    language: 'en',
    activated: false,
  };
  const state = { sent: [], writes: [] };

  const users = {
    getUserById: async (id) => (id === account.id ? { ...account } : null),
    changeLanguage: async (id, language) => {
      state.writes.push({ id, language });
      account.language = language;
    },
    activateUser: async (id) => {
      account.activated = true;
      return { id };
    },
  };
  const notifications = {
    sendEmail: async (to, subject, html, replyTo, locale) => {
      state.sent.push({ to, subject, html, locale });
    },
  };

  return {
    service: new UsersService(users, {}, notifications),
    state,
    account,
  };
}

test('the door stores the chosen language on the account', async () => {
  const { service: users, state, account } = service();

  await users.changeLanguage('walker', 'ru');

  expect(state.writes).toEqual([{ id: 'walker', language: 'ru' }]);
  expect(account.language).toBe('ru');
});

test('a language the server cannot write letters in is refused, not stored', async () => {
  const { service: users, state, account } = service();

  await expect(users.changeLanguage('walker', 'klingon')).rejects.toMatchObject(
    { status: 400 }
  );

  expect(state.writes).toEqual([]);
  expect(account.language).toBe('en');
});

test('the shape of the request names one of the shipped languages', async () => {
  const good = await validate(
    plainToInstance(UserLanguageDto, { language: 'ru' })
  );
  expect(good).toEqual([]);

  for (const bad of [{ language: 'klingon' }, { language: 42 }, {}]) {
    const errors = await validate(plainToInstance(UserLanguageDto, bad));
    expect(errors.map((error) => error.property)).toEqual(['language']);
  }
});

test('after the change to Russian the approval letter arrives in Russian', async () => {
  const { service: users, state } = service();

  // Before the change the same approval goes out in English.
  await users.approveAccount('walker');
  expect(state.sent[0].locale).toBe('en');
  expect(state.sent[0].subject).toContain('approved');

  await users.changeLanguage('walker', 'ru');
  await users.approveAccount('walker');

  expect(state.sent).toHaveLength(2);
  expect(state.sent[1].locale).toBe('ru');
  expect(state.sent[1].subject).toContain('Аккаунт одобрен');
  expect(state.sent[1].html).toContain('ваш аккаунт одобрен');
});
