'use strict';

/**
 * `content-factory-next-fn33.125`. The workspace name field on registration is
 * marked optional, and leaving it empty gave the workspace the literal name
 * `'Workspace'` — hard-coded on the server, where no language had been looked
 * at. On a Russian screen that was the single English word on the page, and it
 * was the name of the reader's own workplace.
 *
 * Two halves, and they are separate on purpose. New workspaces get a name in
 * the language of the registration, through the same backend catalog the
 * starter tags already use. Workspaces already called `'Workspace'` are not
 * renamed by a migration — nobody may quietly rewrite a name someone might
 * have chosen — so the screen reads that exact value as «not named yet» and
 * shows the translated default instead.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const backendStrings = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/locale/backend-strings.ts'
);

const { OrganizationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@prisma/client': {
      Role: {
        SUPERADMIN: 'SUPERADMIN',
        ADMIN: 'ADMIN',
        EDITOR: 'EDITOR',
        USER: 'USER',
      },
      ShortLinkPreference: {},
      SubscriptionTier: { STANDARD: 'STANDARD' },
    },
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class Logger {
        log() {}
        warn() {}
        error() {}
      },
    },
    '@contentfactory/helpers/auth/auth.service': {
      AuthService: { fixedEncryption: () => '', hashPassword: () => '' },
    },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CONTENT_WORKFLOW_TAGS: [],
      CreateOrgUserDto: class CreateOrgUserDto {},
    },
    '@contentfactory/nestjs-libraries/dtos/auth/starter-template': {
      CONTENT_WORKFLOW_TAG_KEYS: [],
    },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      organizationRoleLevel: () => 0,
    },
    '@contentfactory/helpers/auth/registration.approval': {},
    '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
      normalizeIdentityIdentifier: (_provider, value) => value,
    },
    '@contentfactory/helpers/auth/newsletter.consent': {
      NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
    },
    // The real catalog, not a stub: the point of the fix is which words come
    // out of it.
    '@contentfactory/nestjs-libraries/locale/backend-strings': backendStrings,
  }
);

const repositoryOverCreate = () => {
  const created = [];
  const model = {
    organization: {
      create: (args) => {
        created.push(args.data);
        return Promise.resolve({ id: args.data.id, name: args.data.name });
      },
    },
    productEvent: {
      create: () => Promise.reject(new Error('no analytics in this test')),
    },
  };
  const repository = new OrganizationRepository(
    { model },
    { model },
    { model },
    { model },
    { model }
  );
  return { repository, created };
};

describe('a workspace nobody named gets a name in the reader’s language', () => {
  test('the catalog carries the default name in all sixteen locales', () => {
    for (const locale of backendStrings.BACKEND_LOCALES) {
      const value = backendStrings.translateBackendText(
        'workspace_default_name',
        locale
      );
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }
    expect(
      backendStrings.translateBackendText('workspace_default_name', 'ru')
    ).toBe('Рабочая область');
    expect(
      backendStrings.translateBackendText('workspace_default_name', 'en')
    ).toBe('Workspace');
  });

  test('registering in Russian with the name left empty does not write the English word', async () => {
    const { repository, created } = repositoryOverCreate();

    await repository.createOrgForUser('user-1', undefined, 'ru');

    expect(created[0].name).toBe('Рабочая область');
  });

  test('a name that was typed in is used exactly as typed', async () => {
    const { repository, created } = repositoryOverCreate();

    await repository.createOrgForUser('user-1', '  Окно поста  ', 'ru');

    expect(created[0].name.trim()).toBe('Окно поста');
  });

  test('an unknown language still gets a name, in English', async () => {
    const { repository, created } = repositoryOverCreate();

    await repository.createOrgForUser('user-1', '   ', 'xx-not-real');

    expect(created[0].name).toBe('Workspace');
  });
});

describe('the screen reads the old literal name as «not named yet»', () => {
  const label = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/helpers/workspace-name.ts'
  );
  const t = (key, fallback) =>
    key === 'workspace_default_name' ? 'Рабочая область' : fallback;

  test('the exact literal is replaced by the translated default', () => {
    expect(label.workspaceDisplayName('Workspace', t)).toBe('Рабочая область');
  });

  test('a name that merely contains the word is left alone', () => {
    expect(label.workspaceDisplayName('Workspace of Ivan', t)).toBe(
      'Workspace of Ivan'
    );
    expect(label.workspaceDisplayName('My Workspace', t)).toBe('My Workspace');
    expect(label.workspaceDisplayName('workspace', t)).toBe('workspace');
  });

  test('an empty or missing name falls back to the same default rather than to nothing', () => {
    expect(label.workspaceDisplayName('', t)).toBe('Рабочая область');
    expect(label.workspaceDisplayName(null, t)).toBe('Рабочая область');
    expect(label.workspaceDisplayName(undefined, t)).toBe('Рабочая область');
  });
});
