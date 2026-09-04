'use strict';

/**
 * `content-factory-next-fn33.106`: who did it, in the log line.
 *
 * `docs/product/roles-matrix.md` promises that each of the four account
 * actions records who performed it. Rejection and deletion did; approval and
 * blocking wrote «Account X approved» and «Account X blocked» with nobody's
 * name on them, which is the one thing such a line exists to say.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const lines = [];

const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    log(message) {
      lines.push(message);
    }
    error() {}
  },
  HttpException: class HttpException extends Error {
    constructor(message, status) {
      super(typeof message === 'string' ? message : message.message);
      this.status = status;
    }
  },
};

const { UsersService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.repository':
      { UsersRepository: class UsersRepository {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class NotificationService {} },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class OrganizationRepository {} },
    '@contentfactory/nestjs-libraries/locale/backend-strings': {
      resolveBackendLocale: () => 'en',
      translateBackendString: () => '',
    },
    '@contentfactory/nestjs-libraries/integrations/telegram-admin-bind': {
      ADMIN_BIND_CLAIM_WINDOW_MS: 1,
      generateAdminBindCode: () => 'code',
    },
  }
);

const serviceFor = (user) => {
  const repository = {
    getUserById: async () => user,
    activateUser: async () => ({ id: user.id }),
    deactivateUser: async () => ({ id: user.id }),
  };
  return new UsersService(repository, { sendEmail: async () => {} });
};

beforeEach(() => {
  lines.length = 0;
});

test('approving an account records the administrator who approved it', async () => {
  const service = serviceFor({
    id: 'walker',
    email: 'walker@example.com',
    blockedAt: null,
    language: 'ru',
  });

  await service.approveAccount('walker', 'admin-7');

  expect(lines).toContain('Account walker approved by admin-7');
});

test('blocking an account records the administrator who blocked it', async () => {
  const service = serviceFor({
    id: 'walker',
    email: 'walker@example.com',
    isSuperAdmin: false,
  });

  await service.blockAccount('walker', 'admin-7');

  expect(lines).toContain('Account walker blocked by admin-7');
});

test('an approval with no administrator behind it still says so out loud', async () => {
  // The door is meant to pass the person who pressed the button. If a caller
  // ever leaves it out, the line says the author is unknown rather than
  // reading like a complete record.
  const service = serviceFor({
    id: 'walker',
    email: 'walker@example.com',
    blockedAt: null,
    language: 'ru',
  });

  await service.approveAccount('walker');

  expect(lines).toContain('Account walker approved by unknown');
});
