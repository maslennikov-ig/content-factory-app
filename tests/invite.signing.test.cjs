const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const signJWT = jest.fn((payload) => `signed:${JSON.stringify(payload)}`);

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpException: class extends Error {},
    },
    '@prisma/client': { ShortLinkPreference: {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto': {
      AddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
      AdminAddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
      { AutopostService: class {} },
    '@contentfactory/helpers/auth/auth.service': { AuthService: { signJWT } },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'inv01',
    },
    '@contentfactory/helpers/auth/registration.approval': {
      resolveNewUserAccess: () => ({ activated: true, isSuperAdmin: false }),
      registrationRequiresApproval: () => false,
    },
  }
);

describe('the team invitation link', () => {
  beforeEach(() => {
    signJWT.mockClear();
    process.env.FRONTEND_URL = 'https://app.example';
  });

  test('signs only what the invitation flow reads', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    // The global ValidationPipe runs without `whitelist`, so a request body
    // carrying unknown properties arrives with them intact. This is the exact
    // shape an attacker would send.
    const body = {
      email: 'guest@example.com',
      role: 'USER',
      sendEmail: false,
      saasName: 'anything',
      injected: 'ULTIMATE',
    };

    await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', email: 'owner@example.com' },
      body
    );

    const [payload] = signJWT.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'id',
      'orgId',
      'role',
      'timeLimit',
    ]);
    expect(payload.orgId).toBe('org-1');
    expect(payload.email).toBe('guest@example.com');
  });

  test('refuses to carry a field the caller invented', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', email: 'owner@example.com' },
      {
        email: 'guest@example.com',
        role: 'USER',
        sendEmail: false,
        // Two fields `/enterprise/create-user` would read out of a signed
        // token. Signing them here would make this endpoint mint credentials.
        saasName: 'attacker',
        name: 'attacker',
      }
    );

    const [payload] = signJWT.mock.calls[0];
    expect(payload).not.toHaveProperty('saasName');
    expect(payload).not.toHaveProperty('name');
  });
});
