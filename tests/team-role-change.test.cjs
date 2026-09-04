/**
 * Who may change whose role, and to what.
 *
 * `content-factory-next-fn33.17`. Until this door existed the only correction
 * available for a wrong role was to remove the person and invite them again,
 * so the rules here are the ones removal already answers to, read through the
 * one ranking in `organization.roles.ts`: only somebody below you, only to a
 * role no higher than your own, and never yourself.
 *
 * The boundaries are the point. A door that hands out authority the caller
 * does not hold is not a convenience feature with a bug, it is a way for an
 * administrator to make themselves an instance administrator.
 */

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

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      HttpException: class HttpException extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
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
      issueTeamInvitation: jest.fn(async () => 'signed'),
      TEAM_INVITATION_TTL_SECONDS: 2 * 24 * 60 * 60,
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'inv01',
    },
    // Loaded for real, as `tests/invite.signing.test.cjs` does: the loader
    // resolves only what a test names, and these two are the invitation
    // email's own machinery.
    '@contentfactory/nestjs-libraries/locale/backend-strings':
      loadTypeScriptModule(
        'libraries/nestjs-libraries/src/locale/backend-strings.ts'
      ),
    '@contentfactory/nestjs-libraries/emails/email.template':
      loadTypeScriptModule(
        'libraries/nestjs-libraries/src/emails/email.template.ts'
      ),
    '@contentfactory/helpers/auth/registration.approval': {
      resolveNewUserAccess: () => ({ activated: true, isSuperAdmin: false }),
      registrationRequiresApproval: () => false,
    },
  }
);

const ORG_ID = 'org-1';

/**
 * The two reads the service does: the caller's own membership arrives on the
 * request with the organization, the target's is looked up by user.
 */
const serviceFor = ({ members, admins }) => {
  const updateTeamMemberRole = jest.fn(async () => ({}));
  const repository = {
    updateTeamMemberRole,
    // How many administrators the workspace has, counted the way the
    // repository counts them unless a test says otherwise.
    countAdmins: jest.fn(async () =>
      typeof admins === 'number'
        ? admins
        : Object.values(members).filter((role) =>
            ['ADMIN', 'SUPERADMIN'].includes(role)
          ).length
    ),
    getOrgsByUserId: jest.fn(async (userId) =>
      members[userId]
        ? [{ id: ORG_ID, users: [{ role: members[userId] }] }]
        : []
    ),
  };
  return {
    service: new OrganizationService(repository, { sendEmail: jest.fn() }),
    updateTeamMemberRole,
  };
};

const orgAs = (role) => ({ id: ORG_ID, name: 'Studio', users: [{ role }] });

describe('changing a team member’s role', () => {
  test('an administrator may raise a member to editor', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', member: 'USER' },
    });

    await expect(
      service.updateTeamMemberRole(
        orgAs('ADMIN'),
        { id: 'boss' },
        'member',
        'EDITOR'
      )
    ).resolves.toEqual({ role: 'EDITOR' });

    expect(updateTeamMemberRole).toHaveBeenCalledWith(
      ORG_ID,
      'member',
      'EDITOR'
    );
  });

  test('an administrator may raise a member to administrator — their own ceiling', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', member: 'USER' },
    });

    await service.updateTeamMemberRole(
      orgAs('ADMIN'),
      { id: 'boss' },
      'member',
      'ADMIN'
    );

    expect(updateTeamMemberRole).toHaveBeenCalledWith(ORG_ID, 'member', 'ADMIN');
  });

  /**
   * `content-factory-next-fn33.50`. The rule used to be «strictly below you»,
   * which made promotion to administrator a door with no way back: the person
   * who promoted somebody by mistake could not undo it from any screen.
   */
  test('an administrator may demote an equal administrator', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', peer: 'ADMIN' },
    });

    await expect(
      service.updateTeamMemberRole(orgAs('ADMIN'), { id: 'boss' }, 'peer', 'USER')
    ).resolves.toEqual({ role: 'USER' });
    expect(updateTeamMemberRole).toHaveBeenCalledWith(ORG_ID, 'peer', 'USER');
  });

  /**
   * The clause that makes the equal case safe, and the same one removal
   * answers to: a workspace whose last administrator is demoted is a workspace
   * nobody can invite into or connect a channel to.
   */
  test('the last administrator is not demoted', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'SUPERADMIN', only: 'ADMIN' },
      admins: 1,
    });

    await expect(
      service.updateTeamMemberRole(
        orgAs('SUPERADMIN'),
        { id: 'boss' },
        'only',
        'USER'
      )
    ).rejects.toThrow('The workspace must keep at least one administrator');
    expect(updateTeamMemberRole).not.toHaveBeenCalled();
  });

  test('an equal is not counted twice: raising an administrator to administrator asks nobody', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', peer: 'ADMIN' },
      admins: 1,
    });

    await service.updateTeamMemberRole(
      orgAs('ADMIN'),
      { id: 'boss' },
      'peer',
      'ADMIN'
    );
    expect(updateTeamMemberRole).toHaveBeenCalledWith(ORG_ID, 'peer', 'ADMIN');
  });

  test('an administrator cannot demote the instance administrator', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', founder: 'SUPERADMIN' },
    });

    await expect(
      service.updateTeamMemberRole(
        orgAs('ADMIN'),
        { id: 'boss' },
        'founder',
        'USER'
      )
    ).rejects.toThrow('You do not have permission to change this role');
    expect(updateTeamMemberRole).not.toHaveBeenCalled();
  });

  /**
   * The one that matters most: `SUPERADMIN` is the instance's own role and is
   * not on the list an administrator may hand out, so this door cannot mint
   * one however the levels happen to fall.
   */
  test('nobody is promoted to instance administrator through this door', async () => {
    for (const mine of ['ADMIN', 'SUPERADMIN']) {
      const { service, updateTeamMemberRole } = serviceFor({
        members: { boss: mine, member: 'USER' },
      });

      await expect(
        service.updateTeamMemberRole(
          orgAs(mine),
          { id: 'boss' },
          'member',
          'SUPERADMIN'
        )
      ).rejects.toThrow('Unknown role');
      expect(updateTeamMemberRole).not.toHaveBeenCalled();
    }
  });

  test('a role the product has never heard of is refused', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN', member: 'USER' },
    });

    await expect(
      service.updateTeamMemberRole(
        orgAs('ADMIN'),
        { id: 'boss' },
        'member',
        'DEPUTY_EMPEROR'
      )
    ).rejects.toThrow('Unknown role');
    expect(updateTeamMemberRole).not.toHaveBeenCalled();
  });

  test('nobody changes their own role', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN' },
    });

    await expect(
      service.updateTeamMemberRole(orgAs('ADMIN'), { id: 'boss' }, 'boss', 'USER')
    ).rejects.toThrow('You cannot change your own role');
    expect(updateTeamMemberRole).not.toHaveBeenCalled();
  });

  test('somebody outside the workspace is not a member to change', async () => {
    const { service, updateTeamMemberRole } = serviceFor({
      members: { boss: 'ADMIN' },
    });

    await expect(
      service.updateTeamMemberRole(
        orgAs('ADMIN'),
        { id: 'boss' },
        'stranger',
        'USER'
      )
    ).rejects.toThrow('User is not part of this organization');
    expect(updateTeamMemberRole).not.toHaveBeenCalled();
  });

  /**
   * `USER` and `EDITOR` share a level on purpose, and the level answers one
   * question: whether the caller outranks the person acted upon. An editor
   * outranks nobody, so an editor changes nobody.
   */
  test.each(['USER', 'EDITOR'])(
    'a %s cannot change anybody, including a peer',
    async (mine) => {
      const { service, updateTeamMemberRole } = serviceFor({
        members: { me: mine, peer: 'USER' },
      });

      await expect(
        service.updateTeamMemberRole(orgAs(mine), { id: 'me' }, 'peer', 'ADMIN')
      ).rejects.toThrow('You do not have permission to change this role');
      expect(updateTeamMemberRole).not.toHaveBeenCalled();
    }
  );
});
