'use strict';

/**
 * `content-factory-next-fn33.126`. Searching the account list filtered the
 * rows and nothing else: `countAccounts` took a status and no search, so the
 * page count was still the count of the whole database. One match came back
 * under «1 / 2» with a live «Next», and after that account was deleted the
 * list was empty while the counter still said «1 / 2».
 *
 * Two counts are wanted, not one. `total` is what the header says — how many
 * accounts this instance has, which is a fact about the instance and must not
 * move when somebody types in a search box. `matching` is how many the current
 * status and search select, and that is the only one paging may be built on.
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

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
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
    '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class OrganizationRepository {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class NotificationService {} },
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

/** Every `where` the repository builds, in the order it built them. */
const recordCalls = () => {
  const counted = [];
  const listed = [];
  const prisma = {
    model: {
      user: {
        findMany: (args) => {
          listed.push(args.where);
          return Promise.resolve([]);
        },
        count: (args) => {
          counted.push(args.where);
          // Whole database 34, one row matches the search.
          const hasSearch = Boolean(args.where.OR);
          return Promise.resolve(hasSearch ? 1 : 34);
        },
      },
    },
  };
  const repository = new repositoryModule.UsersRepository(prisma, prisma);
  const service = new serviceModule.UsersService(
    repository,
    {},
    {},
    {},
    {},
    {}
  );
  return { service, counted, listed };
};

describe('content-factory-next-fn33.126 — the count follows the search', () => {
  test('a search narrows the count paging is built on, and leaves the instance total alone', async () => {
    const { service, counted } = recordCalls();

    const result = await service.listAccounts({
      status: 'all',
      search: 'walkc-victim',
      page: 0,
      limit: 25,
    });

    expect(result.matching).toBe(1);
    expect(result.total).toBe(34);
    // The header's «Awaiting» is a fact about the instance too.
    expect(result.pending).toBe(34);

    const withSearch = counted.filter((where) => Boolean(where.OR));
    expect(withSearch).toHaveLength(1);
    expect(withSearch[0].OR).toEqual([
      { email: { contains: 'walkc-victim', mode: 'insensitive' } },
      { name: { contains: 'walkc-victim', mode: 'insensitive' } },
    ]);
  });

  test('the same search is counted under the same status the list is read with', async () => {
    const { service, counted } = recordCalls();

    await service.listAccounts({
      status: 'pending',
      search: 'walkc',
      page: 0,
      limit: 25,
    });

    const withSearch = counted.find((where) => Boolean(where.OR));
    expect(withSearch.activated).toBe(false);
    expect(withSearch.blockedAt).toBeNull();
  });

  test('with no search the matching count is the status count, and nothing extra is asked of the database', async () => {
    const { service, counted } = recordCalls();

    const result = await service.listAccounts({
      status: 'all',
      page: 0,
      limit: 25,
    });

    expect(result.matching).toBe(34);
    expect(counted.every((where) => !where.OR)).toBe(true);
  });
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule: loadTsx } = require('./helpers/load-tsx.cjs');

const admin = loadTsx(
  'apps/frontend/src/components/admin/admin-users.component.tsx'
);
const variables = loadTsx(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const oneRow = [
  {
    id: 'victim',
    email: 'walkc-victim@cf-dev.local',
    name: 'Пострадавший',
    activated: true,
    blockedAt: null,
    isSuperAdmin: false,
    providerName: 'LOCAL',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastOnline: '2026-09-01T10:00:00.000Z',
    organizations: [],
  },
];

const renderList = async (data) => {
  await act(async () => {
    render(
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(admin.AdminUsersView, {
          allowed: true,
          status: 'all',
          searchInput: 'walkc-victim',
          page: 0,
          data,
          onStatusChange: () => {},
          onSearchInputChange: () => {},
          onApplySearch: () => {},
          onRetry: () => {},
          onAction: () => {},
          onPageChange: () => {},
        })
      )
    );
  });
  await act(async () => {});
};

afterEach(() => cleanup());

describe('content-factory-next-fn33.126 — the paging row reads the matching count', () => {
  test('one match offers no second page and no live «Next»', async () => {
    await renderList({
      users: oneRow,
      pending: 0,
      total: 34,
      matching: 1,
      approvalRequired: true,
    });

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(document.body.textContent).not.toContain('1 / 2');
  });

  test('a real second page still offers one', async () => {
    await renderList({
      users: oneRow,
      pending: 0,
      total: 34,
      matching: 34,
      approvalRequired: true,
    });

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next.disabled).toBe(false);
    expect(document.body.textContent).toContain('1 / 2');
  });
});
