const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `UsersService.switchUser` (libraries/nestjs-libraries/src/database/prisma/
 * users/users.service.ts:159) mails both accounts a "login was changed"
 * notice. Before this task the subject and body were hardcoded English; now
 * each account gets its own translated copy, resolved from the language its
 * own row carries (see users.repository.ts:switchUserCredentials, which
 * returns `language` alongside `id`/`email`).
 *
 * `TypeScript` erases `UsersRepository`, `OrganizationRepository` and
 * `NotificationService` here because `users.service.ts` only ever names them
 * as constructor parameter types, never as values — so this file needs no
 * mock for those import paths, only `@nestjs/common` (a real `@Injectable`
 * decorator and `Logger`/`HttpException` are used as values) and the real
 * locale catalog.
 */
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

function buildService({ kept, switched }) {
  const sent = [];
  const usersRepository = {
    switchUserCredentials: async () => ({ kept, switched }),
  };
  const notificationService = {
    hasEmailProvider: () => true,
    sendEmail: async (to, subject, html, replyTo, language) => {
      sent.push({ to, subject, html, replyTo, language });
    },
  };
  const service = new UsersService(usersRepository, {}, notificationService);
  return { service, sent };
}

test('each account gets the login-changed notice in its own language, not a shared default', async () => {
  const { service, sent } = buildService({
    kept: { id: 'kept-id', email: 'ru-owner@example.com', language: 'ru' },
    switched: { id: 'switched-id', email: 'en-owner@example.com', language: 'en' },
  });

  await service.switchUser('kept-id', 'switched-id', 'admin-id');

  expect(sent).toHaveLength(2);
  const toRu = sent.find((email) => email.to === 'ru-owner@example.com');
  const toEn = sent.find((email) => email.to === 'en-owner@example.com');

  expect(toRu.subject).toBe('Логин для входа в Content Factory изменён');
  expect(toRu.subject).not.toBe('Your Content Factory login was changed');
  expect(toRu.html).toContain('ru-owner@example.com');
  expect(toRu.language).toBe('ru');

  expect(toEn.subject).toBe('Your Content Factory login was changed');
  expect(toEn.html).toContain('en-owner@example.com');
  expect(toEn.language).toBe('en');
});

test('an account with no stored language falls back to English instead of throwing', async () => {
  const { service, sent } = buildService({
    kept: { id: 'kept-id', email: 'legacy@example.com', language: undefined },
    switched: { id: 'switched-id', email: 'other@example.com', language: 'not-a-real-locale' },
  });

  await expect(
    service.switchUser('kept-id', 'switched-id', 'admin-id')
  ).resolves.toBeDefined();

  expect(sent.every((email) => email.subject === 'Your Content Factory login was changed')).toBe(
    true
  );
});

test('a failed notification is logged, not thrown, and does not block the other account', async () => {
  const usersRepository = {
    switchUserCredentials: async () => ({
      kept: { id: 'kept-id', email: 'first@example.com', language: 'en' },
      switched: { id: 'switched-id', email: 'second@example.com', language: 'en' },
    }),
  };
  const sent = [];
  const notificationService = {
    hasEmailProvider: () => true,
    sendEmail: async (to) => {
      if (to === 'first@example.com') throw new Error('smtp unavailable');
      sent.push(to);
    },
  };
  const service = new UsersService(usersRepository, {}, notificationService);

  await expect(
    service.switchUser('kept-id', 'switched-id', 'admin-id')
  ).resolves.toBeDefined();
  expect(sent).toEqual(['second@example.com']);
});
