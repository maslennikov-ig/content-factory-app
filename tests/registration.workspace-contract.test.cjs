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
const { CreateOrgUserDto, STARTER_TEMPLATES } = dtoModule;

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
      '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
        normalizeIdentityIdentifier: (_provider, value) =>
          value.trim().toLowerCase(),
      },
      '@contentfactory/helpers/auth/newsletter.consent': {
        NEWSLETTER_CONSENT_SOURCE_REGISTRATION: 'registration',
      },
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

describe('progressive registration contract', () => {
  test('requires twelve characters only for new LOCAL registration passwords', async () => {
    const shortLocal = await validate(registrationBody({ password: '12345678901' }));
    const minimumLocal = await validate(registrationBody({ password: '123456789012' }));
    const shortProvider = await validate(
      registrationBody({
        provider: Provider.GOOGLE,
        providerToken: '',
        password: 'short',
      })
    );

    expect(shortLocal.some((error) => error.property === 'password')).toBe(true);
    expect(minimumLocal).toHaveLength(0);
    expect(shortProvider).toHaveLength(0);
  });

  test.each([
    ['legacy company', { company: 'Legacy Studio' }],
    ['workspace name', { workspaceName: 'Launch Workspace' }],
    ['default workspace', {}],
    ['blank starter intent', { starterTemplate: 'blank' }],
  ])('accepts %s without making legacy fields mandatory', async (_label, fields) => {
    await expect(validate(registrationBody(fields))).resolves.toHaveLength(0);
  });

  test('exposes the safe no-op and the one supported workflow template', () => {
    expect(STARTER_TEMPLATES).toEqual(['blank', 'content-workflow']);
  });

  test('nests exactly four workflow tags in the same organization create', async () => {
    const creates = await createWorkspace({
      ...registrationBody({ starterTemplate: 'content-workflow' }),
      email: 'workflow-owner@example.com',
    });

    expect(creates).toHaveLength(1);
    expect(creates[0].data.tags).toEqual({
      create: [
        { name: 'Plan', color: '#7FB03A' },
        { name: 'Draft', color: '#4D7CFE' },
        { name: 'Review', color: '#F59E0B' },
        { name: 'Schedule', color: '#8B5CF6' },
      ],
    });
  });

  test('keeps blank registration free of template records', async () => {
    const creates = await createWorkspace({
      ...registrationBody({ starterTemplate: 'blank' }),
      email: 'blank-owner@example.com',
    });

    expect(creates[0].data).not.toHaveProperty('tags');
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
        registrationBody({ starterTemplate: 'content-workflow' }),
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
      starterTemplate: 'content-workflow',
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

  test.each(['content-calendar', '', 'BLANK', 1, null])(
    'rejects unsupported starter intent %p',
    async (starterTemplate) => {
      const errors = await validate(registrationBody({ starterTemplate }));
      expect(errors.some((error) => error.property === 'starterTemplate')).toBe(
        true
      );
    }
  );

  test.each([
    [
      'workspace name wins',
      {
        workspaceName: '  Primary Workspace  ',
        company: 'Legacy Studio',
        starterTemplate: 'blank',
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
