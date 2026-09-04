const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-fn33.30`. A declined registration used to say nothing
 * at all, on purpose, and the person who registered waited for an answer that
 * was never coming. It now sends one short notice.
 *
 * Three things have to hold, and all three are about order. The address and the
 * language are read before the account row is deleted, because afterwards there
 * is nothing left to read them from. The rejection is not undone when the mail
 * queue refuses — the account is already gone, and an administrator must never
 * be asked to repeat a removal that happened. And the notice carries no reason
 * and no link: the real catalog is loaded here rather than mocked, so a link
 * quietly added to the copy fails this test.
 */
const backendStrings =
  'libraries/nestjs-libraries/src/locale/backend-strings.ts';

const nest = {
  Injectable: () => (target) => target,
  Logger: class Logger {
    constructor() {
      this.logged = [];
    }
    log(line) {
      this.logged.push(line);
    }
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

const pending = {
  id: 'pending-user',
  email: 'waiting@example.test',
  language: 'ru',
  activated: false,
  isSuperAdmin: false,
};

function service({ reject, sendEmail } = {}) {
  const state = { deleted: false, sent: [] };
  const users = {
    getUserById: async (id) => {
      if (id !== pending.id || state.deleted) return null;
      return { ...pending };
    },
    rejectPendingAccount: async (id) => {
      if (reject) return reject(id);
      state.deleted = true;
      return { id, organizationId: 'owned-org' };
    },
  };
  const notifications = {
    sendEmail: async (to, subject, html, replyTo, locale) => {
      if (sendEmail) return sendEmail();
      state.sent.push({ to, subject, html, locale });
    },
  };
  return { service: new UsersService(users, {}, notifications), state };
}

test('a rejected account gets one short notice, in its own language, after the delete', async () => {
  const { service: users, state } = service();

  await expect(
    users.rejectPendingAccount('pending-user', 'admin-1')
  ).resolves.toEqual({ id: 'pending-user', organizationId: 'owned-org' });

  expect(state.deleted).toBe(true);
  expect(state.sent).toHaveLength(1);
  expect(state.sent[0].to).toBe('waiting@example.test');
  expect(state.sent[0].locale).toBe('ru');
  expect(state.sent[0].subject).toContain('Content Factory');
  expect(state.sent[0].html).toContain('отклонён администратором');
  // No reason and nothing to click: not a link, not a mailbox to reply to.
  expect(state.sent[0].html).not.toContain('<a ');
  expect(state.sent[0].html).not.toContain('http');
});

test('the address and the language come from before the delete', async () => {
  // The repository stub answers the delete by making the account unreadable,
  // exactly as the real transaction does. A service that read the person after
  // the delete would have nothing to address.
  const { service: users, state } = service();

  await users.rejectPendingAccount('pending-user', 'admin-1');

  expect(state.sent[0].to).toBe('waiting@example.test');
});

test('a refused mail queue does not undo the rejection', async () => {
  const { service: users, state } = service({
    sendEmail: () => {
      throw new Error('queue unavailable');
    },
  });

  await expect(
    users.rejectPendingAccount('pending-user', 'admin-1')
  ).resolves.toMatchObject({ id: 'pending-user' });
  expect(state.deleted).toBe(true);
  expect(state.sent).toEqual([]);
});

test('a missing account is a 404 and sends nothing', async () => {
  const { service: users, state } = service();

  await expect(
    users.rejectPendingAccount('someone-else', 'admin-1')
  ).rejects.toMatchObject({ status: 404 });
  expect(state.sent).toEqual([]);
});

test('a rejection that fails sends nothing', async () => {
  const { service: users, state } = service({
    reject: () => {
      throw Object.assign(new Error('shared workspace'), { status: 400 });
    },
  });

  await expect(
    users.rejectPendingAccount('pending-user', 'admin-1')
  ).rejects.toMatchObject({ status: 400 });
  expect(state.sent).toEqual([]);
});

test('a rejection names the administrator in the log, as approval and blocking do', async () => {
  const { service: users } = service();
  const lines = [];
  users._logger = { log: (line) => lines.push(line), error: () => undefined };

  await users.rejectPendingAccount('pending-user', 'admin-1');

  expect(lines).toContain('Account pending-user rejected by admin-1');
});
