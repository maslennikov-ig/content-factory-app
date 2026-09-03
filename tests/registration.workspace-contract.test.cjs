const path = require('node:path');
const { validate } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const Provider = { LOCAL: 'LOCAL', GOOGLE: 'GOOGLE' };
const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  { '@prisma/client': { Provider } },
  {
    sources: {
      './starter-template':
        'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts',
    },
  }
);
const { CreateOrgUserDto } = dtoModule;

function registrationBody(overrides = {}) {
  return Object.assign(new CreateOrgUserDto(), {
    email: 'owner@example.com',
    password: 'long-secret12',
    provider: Provider.LOCAL,
    providerToken: '',
    ...overrides,
  });
}

function loadOrganizationRepository() {
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts',
    {
      '@prisma/client': {
        Role: { SUPERADMIN: 'SUPERADMIN' },
        SubscriptionTier: { STANDARD: 'STANDARD' },
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class PrismaRepository {},
      },
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: {
          fixedEncryption: (value) => value,
          hashPassword: (value) => `hashed:${value}`,
        },
      },
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => 'generated-key',
      },
      '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto':
        dtoModule,
      '@contentfactory/nestjs-libraries/dtos/auth/starter-template':
        loadTypeScriptModule(
          'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts'
        ),
      '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
        normalizeIdentityIdentifier: (_provider, value) =>
          value.trim().toLowerCase(),
      },
      '@contentfactory/helpers/auth/newsletter.consent': {
        NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
      },
      '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
        'libraries/nestjs-libraries/src/locale/backend-strings.ts'
      ),
    }
  ).OrganizationRepository;
}

function createRepository() {
  const organizationCreates = [];
  const productEventCreates = [];
  const model = {
    organization: {
      create: async (query) => {
        organizationCreates.push(query);
        return {
          id: query.data.id,
          users: [{ user: { id: query.data.users.create.user.create.id } }],
        };
      },
    },
    productEvent: {
      create: async (query) => {
        productEventCreates.push(query);
        return query.data;
      },
    },
  };
  const OrganizationRepository = loadOrganizationRepository();
  return {
    organizationCreates,
    repository: new OrganizationRepository(
      { model },
      { model: {} },
      { model: {} }
    ),
  };
}

async function createWorkspace(body) {
  const { repository, organizationCreates } = createRepository();
  await repository.createOrgAndUser(
    body,
    { activated: true, isSuperAdmin: false },
    '127.0.0.1',
    'test-agent'
  );
  return organizationCreates;
}

const WORKFLOW_TAG_QUARTET = [
  { name: 'Plan', color: '#7FB03A' },
  { name: 'Draft', color: '#4D7CFE' },
  { name: 'Review', color: '#F59E0B' },
  { name: 'Schedule', color: '#8B5CF6' },
];

describe('progressive registration contract', () => {
  test('requires the shared password policy only for new LOCAL registration passwords', async () => {
    const shortLocal = await validate(registrationBody({ password: 'A1!abc' }));
    const missingSymbol = await validate(registrationBody({ password: 'Abcdef1' }));
    const minimumLocal = await validate(registrationBody({ password: 'A1!abcd' }));
    const shortProvider = await validate(
      registrationBody({
        provider: Provider.GOOGLE,
        providerToken: '',
        password: 'short',
      })
    );

    expect(shortLocal.some((error) => error.property === 'password')).toBe(true);
    expect(missingSymbol.some((error) => error.property === 'password')).toBe(true);
    expect(minimumLocal).toHaveLength(0);
    expect(shortProvider).toHaveLength(0);
  });

  test.each([
    ['legacy company', { company: 'Legacy Studio' }],
    ['workspace name', { workspaceName: 'Launch Workspace' }],
    ['default workspace', {}],
    // A stale client (an unclosed tab from before the starter-template
    // picker was removed) may still send the old field. There is no
    // `starterTemplate` decorator on the DTO any more, so `validate()` has
    // nothing to check it against — it is just an inert extra property here.
    // `tests/global.validation-pipe.test.cjs` covers the real request path,
    // where the global `ValidationPipe`'s `whitelist: true` strips it.
    ['legacy starterTemplate field', { starterTemplate: 'blank' }],
  ])('accepts %s without making legacy fields mandatory', async (_label, fields) => {
    await expect(validate(registrationBody(fields))).resolves.toHaveLength(0);
  });

  // The guard for content-factory-next-pdbe: the starter-template choice is
  // gone from the registration form, and every workspace must get the
  // content-workflow tags every time, with no way left to opt out. Before the
  // fix this repository only attached the quartet when
  // `starterTemplate === 'content-workflow'`; a plain registration created no
  // tags at all.
  test('every new workspace gets the content-workflow tag quartet, unconditionally', async () => {
    const creates = await createWorkspace({
      ...registrationBody({}),
      email: 'default-owner@example.com',
    });

    expect(creates).toHaveLength(1);
    expect(creates[0].data.tags).toEqual({ create: WORKFLOW_TAG_QUARTET });
  });

  // Compatibility: a stale client that still sends the retired
  // `starterTemplate` field (in either of its old values) must not lose the
  // tags or break the registration. The field is simply ignored now.
  test.each([
    ['blank', 'blank'],
    ['content-workflow', 'content-workflow'],
    ['an unrecognised value', 'anything-else'],
  ])(
    'a legacy starterTemplate value of %s does not change the outcome: tags are still created',
    async (_label, starterTemplate) => {
      const creates = await createWorkspace({
        ...registrationBody({ starterTemplate }),
        email: `legacy-${starterTemplate}@example.com`,
      });

      expect(creates[0].data.tags).toEqual({ create: WORKFLOW_TAG_QUARTET });
      expect(creates[0].data).not.toHaveProperty('starterTemplate');
    }
  );

  test('localizes the four workflow tag names to a Russian registration, colors untouched', async () => {
    const creates = await createWorkspace({
      ...registrationBody({ language: 'ru' }),
      email: 'workflow-owner-ru@example.com',
    });

    expect(creates[0].data.tags).toEqual({
      create: [
        { name: 'План', color: '#7FB03A' },
        { name: 'Черновик', color: '#4D7CFE' },
        { name: 'Проверка', color: '#F59E0B' },
        { name: 'Расписание', color: '#8B5CF6' },
      ],
    });
  });

  test('an unshipped language falls back to English tag names instead of failing', async () => {
    const creates = await createWorkspace({
      ...registrationBody({ language: 'not-a-real-locale' }),
      email: 'workflow-owner-fallback@example.com',
    });

    expect(creates[0].data.tags.create.map((tag) => tag.name)).toEqual([
      'Plan',
      'Draft',
      'Review',
      'Schedule',
    ]);
  });

  test('persists the registration language on the created user, defaulting to English', async () => {
    const [ruCreates, blankCreates] = await Promise.all([
      createWorkspace({
        ...registrationBody({ language: 'ru' }),
        email: 'lang-ru@example.com',
      }),
      createWorkspace({
        ...registrationBody({}),
        email: 'lang-default@example.com',
      }),
    ]);

    expect(ruCreates[0].data.users.create.user.create.language).toBe('ru');
    expect(blankCreates[0].data.users.create.user.create.language).toBe('en');
  });

  test('does not emit a successful registration event when the atomic create fails', async () => {
    const productEventCreate = jest.fn();
    const model = {
      organization: {
        create: jest.fn(async () => {
          throw new Error('nested tag create failed');
        }),
      },
      productEvent: { create: productEventCreate },
    };
    const OrganizationRepository = loadOrganizationRepository();
    const repository = new OrganizationRepository(
      { model },
      { model: {} },
      { model: {} }
    );

    await expect(
      repository.createOrgAndUser(
        registrationBody({}),
        { activated: true, isSuperAdmin: false },
        '127.0.0.1',
        'test-agent'
      )
    ).rejects.toThrow('nested tag create failed');
    expect(model.organization.create).toHaveBeenCalledTimes(1);
    expect(productEventCreate).not.toHaveBeenCalled();
  });

  test('a duplicate identity cannot leave a second organization or tag quartet', async () => {
    const persistedOrganizations = [];
    const seenEmails = new Set();
    const productEventCreate = jest.fn(async () => undefined);
    const model = {
      organization: {
        create: jest.fn(async (query) => {
          const user = query.data.users.create.user.create;
          if (seenEmails.has(user.email)) {
            throw new Error('unique identity conflict');
          }
          seenEmails.add(user.email);
          persistedOrganizations.push(query.data);
          return { id: query.data.id, users: [{ user }] };
        }),
      },
      productEvent: { create: productEventCreate },
    };
    const OrganizationRepository = loadOrganizationRepository();
    const repository = new OrganizationRepository(
      { model },
      { model: {} },
      { model: {} }
    );
    const body = registrationBody({
      email: 'one-owner@example.com',
    });

    await repository.createOrgAndUser(
      body,
      { activated: true, isSuperAdmin: false },
      '127.0.0.1',
      'test-agent'
    );
    await expect(
      repository.createOrgAndUser(
        body,
        { activated: true, isSuperAdmin: false },
        '127.0.0.1',
        'test-agent'
      )
    ).rejects.toThrow('unique identity conflict');

    expect(persistedOrganizations).toHaveLength(1);
    expect(persistedOrganizations[0].tags.create).toHaveLength(4);
    expect(productEventCreate).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'workspace name wins',
      {
        workspaceName: '  Primary Workspace  ',
        company: 'Legacy Studio',
      },
      'Primary Workspace',
    ],
    ['legacy company remains compatible', { company: 'Legacy Studio' }, 'Legacy Studio'],
    ['missing names use a neutral default', {}, 'Workspace'],
  ])('%s', async (_label, fields, expectedName) => {
    const creates = await createWorkspace({
      ...registrationBody(fields),
      email: 'private-owner@example.com',
    });

    expect(creates).toHaveLength(1);
    expect(creates[0].data.name).toBe(expectedName);
    expect(creates[0].data).not.toHaveProperty('workspaceName');
    expect(creates[0].data).not.toHaveProperty('starterTemplate');
    expect(creates[0].data.aiProvider).toEqual({
      create: { usageMode: 'included' },
    });
  });
});
