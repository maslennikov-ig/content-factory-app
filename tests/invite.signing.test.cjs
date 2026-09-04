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

const issueTeamInvitation = jest.fn(async () => 'signed-invitation');

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
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      issueTeamInvitation,
      // The real constant, not a number invented here: the screen states this
      // life out loud, so a test that made one up would agree with nothing.
      TEAM_INVITATION_TTL_SECONDS: 2 * 24 * 60 * 60,
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'inv01',
    },
    // organization.service.ts now writes the invitation through the string
    // catalog and the shared email shell; the loader resolves only what a
    // test names, so both are loaded for real.
    '@contentfactory/nestjs-libraries/locale/backend-strings': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/locale/backend-strings.ts'
    ),
    '@contentfactory/nestjs-libraries/emails/email.template': loadTypeScriptModule(
      'libraries/nestjs-libraries/src/emails/email.template.ts'
    ),
    '@contentfactory/helpers/auth/registration.approval': {
      resolveNewUserAccess: () => ({ activated: true, isSuperAdmin: false }),
      registrationRequiresApproval: () => false,
    },
  }
);

describe('the team invitation link', () => {
  beforeEach(() => {
    issueTeamInvitation.mockClear();
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

    const [payload] = issueTeamInvitation.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual([
      'boundEmail',
      'id',
      'inviterEmail',
      'inviterName',
      'orgId',
      'role',
      'workspaceName',
    ]);
    expect(payload.orgId).toBe('org-1');
  });

  /**
   * `content-factory-next-fn33.24`. An invitation issued without an address is
   * the open link an administrator sends through Telegram: there is nobody to
   * bind it to, and inventing a binding would break the link for everyone.
   */
  test('carries no binding when no address was given', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', email: 'owner@example.com' },
      { email: '', role: 'USER', sendEmail: false }
    );

    const [payload] = issueTeamInvitation.mock.calls[0];
    expect(payload).not.toHaveProperty('boundEmail');
  });

  /**
   * The checkbox is a second delivery, not a second kind of invitation. An
   * address typed into the form binds the link whether or not a letter goes
   * out — until 04.09.2026 the checkbox decided this, so an administrator who
   * typed an address and then copied the link handed out an open one.
   */
  test('binds a copied link to the address that was typed', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', email: 'owner@example.com' },
      { email: '  Guest@Example.COM ', role: 'USER', sendEmail: false }
    );

    expect(issueTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ boundEmail: 'guest@example.com' })
    );
  });

  /** The link, its expiry and its binding, for the screen to state out loud. */
  test('answers with the link, when it dies, and what it is bound to', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    const before = Date.now();
    const issued = await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', email: 'owner@example.com' },
      { email: 'guest@example.com', role: 'USER', sendEmail: false }
    );

    expect(issued.url).toBe('https://app.example/join-org?org=signed-invitation');
    expect(issued.boundEmail).toBe('guest@example.com');
    expect(issued.sentByEmail).toBe(false);
    // Two days, the same life `TEAM_INVITATION_TTL_SECONDS` gives the token.
    // The window is measured from a clock read before the call, so whatever
    // milliseconds the call itself took land inside it. The upper bound gets
    // the same slack as the lower one, or the suite fails whenever the machine
    // is a millisecond slower than the assertion assumed.
    const life = Date.parse(issued.expiresAt) - before;
    expect(life).toBeGreaterThan(2 * 24 * 60 * 60 * 1000 - 5000);
    expect(life).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000 + 5000);
  });

  test('refuses to send a letter with nowhere to send it', async () => {
    const sendEmail = jest.fn();
    const service = new OrganizationService({}, { sendEmail });

    await expect(
      service.inviteTeamMember(
        { id: 'org-1', name: 'Studio' },
        { id: 'user-1', email: 'owner@example.com' },
        { email: '', role: 'USER', sendEmail: true }
      )
    ).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(issueTeamInvitation).not.toHaveBeenCalled();
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

    const [payload] = issueTeamInvitation.mock.calls[0];
    expect(payload).not.toHaveProperty('saasName');
    expect(payload).not.toHaveProperty('name');
  });

  test('binds emailed invitations to a normalized address', async () => {
    const service = new OrganizationService({}, { sendEmail: jest.fn() });

    await service.inviteTeamMember(
      { id: 'org-1', name: 'Studio' },
      { id: 'user-1', name: 'Owner', email: 'owner@example.com' },
      {
        email: '  Guest@Example.COM ',
        role: 'EDITOR',
        sendEmail: true,
      }
    );

    expect(issueTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        boundEmail: 'guest@example.com',
        inviterName: 'Owner',
        inviterEmail: 'owner@example.com',
        workspaceName: 'Studio',
        role: 'EDITOR',
      })
    );
  });
});
