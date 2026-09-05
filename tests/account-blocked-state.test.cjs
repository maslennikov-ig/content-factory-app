/**
 * A blocked account and an account waiting for approval are two states.
 *
 * `content-factory-next-fn33.66`. Both used to be `activated: false` and
 * nothing else, so on the live walkthrough of 04.09.2026 a blocked person
 * turned up on the «Awaiting approval» tab, in the «Awaiting» counter — on an
 * instance with approval switched off, where nobody can be waiting — wearing
 * the same yellow badge as a newcomer, with an «Approve» button that would
 * have handed their access straight back. Nothing on the screen could tell the
 * two apart, and the recovery looked like an ordinary approval.
 *
 * `User.blockedAt` is the difference: written when a block is placed, cleared
 * when the account comes back on.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');

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
    }
  },
};

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {}, Role: {} },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      legacyIdentityIdentifier: () => '',
      normalizeIdentityIdentifier: () => '',
    },
  }
);

const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/users/users.service.ts',
  {
    '@nestjs/common': nest,
    '@prisma/client': { Provider: {} },
    '@contentfactory/nestjs-libraries/database/prisma/users/users.repository':
      repositoryModule,
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

const { UsersRepository } = repositoryModule;
const { UsersService } = serviceModule;

/** A repository over a fake `user` model that records every write. */
const repositoryOver = (model) => {
  const calls = { update: [], findMany: [], count: [] };
  const user = {
    model: {
      user: {
        update: async (query) => {
          calls.update.push(query);
          return { id: query.where.id, ...query.data };
        },
        findMany: async (query) => {
          calls.findMany.push(query);
          return [];
        },
        count: async (query) => {
          calls.count.push(query);
          return 0;
        },
        ...model,
      },
    },
  };
  return { calls, repository: new UsersRepository(user, {}, {}, {}, {}) };
};

describe('the column that tells a block from a wait', () => {
  test('blocking stamps the moment it happened', async () => {
    const { calls, repository } = repositoryOver({});

    await repository.deactivateUser('walk1-block');

    expect(calls.update[0].where).toEqual({ id: 'walk1-block' });
    expect(calls.update[0].data.activated).toBe(false);
    expect(calls.update[0].data.blockedAt).toBeInstanceOf(Date);
  });

  test('switching an account back on clears the stamp in the same statement', async () => {
    const { calls, repository } = repositoryOver({});

    await repository.activateUser('walk1-block');

    expect(calls.update[0].data).toEqual({ activated: true, blockedAt: null });
  });

  test('the pending list and its counter leave blocked accounts out', async () => {
    const { calls, repository } = repositoryOver({});

    await repository.listAccounts({ status: 'pending', take: 25, skip: 0 });
    await repository.countAccounts({ status: 'pending' });

    expect(calls.findMany[0].where).toMatchObject({
      activated: false,
      blockedAt: null,
    });
    expect(calls.count[0].where).toEqual({ activated: false, blockedAt: null });
  });

  test('the active list is still every switched-on account', async () => {
    const { calls, repository } = repositoryOver({});

    await repository.listAccounts({ status: 'active', take: 25, skip: 0 });
    await repository.countAccounts({ status: 'active' });

    expect(calls.findMany[0].where).toMatchObject({ activated: true });
    expect(calls.findMany[0].where.blockedAt).toBeUndefined();
    expect(calls.count[0].where).toEqual({ activated: true });
  });

  test('the screen is told which accounts are blocked', async () => {
    const { calls, repository } = repositoryOver({});

    await repository.listAccounts({ status: 'all', take: 25, skip: 0 });

    expect(calls.findMany[0].select.blockedAt).toBe(true);
  });
});

describe('the two doors', () => {
  const serviceFor = (user) => {
    const repository = {
      getUserById: async () => user,
      activateUser: jest.fn(async () => ({})),
      deactivateUser: jest.fn(async () => ({})),
    };
    return {
      repository,
      service: new UsersService(repository, { sendEmail: jest.fn() }),
    };
  };

  test('approval refuses a blocked account instead of quietly lifting the block', async () => {
    const { service, repository } = serviceFor({
      id: 'blocked',
      email: 'blocked@example.com',
      blockedAt: new Date(),
    });

    await expect(service.approveAccount('blocked')).rejects.toThrow(
      'This account is blocked, not waiting for approval'
    );
    expect(repository.activateUser).not.toHaveBeenCalled();
  });

  test('unblocking switches the account on and sends nothing', async () => {
    const sendEmail = jest.fn();
    const repository = {
      getUserById: async () => ({
        id: 'blocked',
        email: 'blocked@example.com',
        blockedAt: new Date(),
      }),
      activateUser: jest.fn(async () => ({})),
    };
    const service = new UsersService(repository, { sendEmail });

    await service.unblockAccount('blocked', 'admin');

    expect(repository.activateUser).toHaveBeenCalledWith('blocked');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('unblocking an account nobody blocked is refused', async () => {
    const { service, repository } = serviceFor({
      id: 'waiting',
      email: 'waiting@example.com',
      blockedAt: null,
    });

    await expect(service.unblockAccount('waiting', 'admin')).rejects.toThrow(
      'This account is not blocked'
    );
    expect(repository.activateUser).not.toHaveBeenCalled();
  });
});

describe('the accounts screen', () => {
  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'apps/frontend/src/components/admin/admin-users.component.tsx'
    ),
    'utf8'
  );

  test('a blocked row wears its own label and offers Unblock, not Approve', () => {
    expect(source).toContain("accountState(row) === 'blocked'");
    expect(source).toContain("t('unblock', 'Unblock')");
    expect(source).toContain("t('blocked', 'Blocked')");
    // Approval is offered only to somebody actually waiting.
    expect(source).toContain("accountState(row) === 'pending' && (");
    expect(source).not.toContain('!row.activated && (');
  });

  test('the door for the button exists on the backend', () => {
    const controller = fs.readFileSync(
      path.join(repositoryRoot, 'apps/backend/src/api/routes/admin.controller.ts'),
      'utf8'
    );
    expect(controller).toContain("@Post('/users/:id/unblock')");
    expect(controller).toContain('this.assertSuperAdmin(user)');
  });
});
