'use strict';

/**
 * `content-factory-next-fn33.19`: a workspace cannot lose its last
 * administrator.
 *
 * The protection used to be the `SUPERADMIN` role itself. Exactly one
 * membership per workspace held it — the creator's — and `deleteTeamMember`
 * refused anyone whose rank was above the person acting, which no
 * administrator could clear. Now that registration grants `ADMIN`, that rank
 * comparison lets one administrator remove another, and two administrators
 * removing each other would leave a workspace nobody can invite into, connect
 * a channel to, or hand over. So the rule is counted rather than named.
 *
 * `SUPERADMIN` rows written before the change are counted as administrators:
 * they are the same owners under the name the product used to print.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const noopDecorator = () => () => undefined;

class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : response?.message);
    this.status = status;
  }
}

const { OrganizationService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/organizations/organization.service.ts',
  {
    '@nestjs/common': { HttpException, Injectable: noopDecorator },
    '@prisma/client': { Organization: class {}, User: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository':
      { OrganizationRepository: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service':
      { NotificationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service':
      { AutopostService: class {} },
    '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto': {
      CreateOrgUserDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto': {
      AddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
      AdminAddTeamMemberDto: class {},
    },
    '@contentfactory/nestjs-libraries/auth/team-invitation': {
      issueTeamInvitation: async () => 'token',
    },
  }
);

/**
 * A workspace with the memberships given, and a service wired to it. Only the
 * three repository calls this path makes are answered.
 */
const isAdministrator = (role) => ['ADMIN', 'SUPERADMIN'].includes(role);

const workspaceOf = (memberships) => {
  const deleted = [];
  const administrators = () =>
    memberships.filter((membership) => isAdministrator(membership.role)).length;
  const repository = {
    getOrgsByUserId: async (userId) =>
      memberships
        .filter((membership) => membership.userId === userId)
        .map((membership) => ({
          id: 'org',
          users: [{ role: membership.role }],
        })),
    /**
     * The stand-in counts before it deletes, because since
     * `content-factory-next-fn33.102` the real repository does — inside the
     * transaction that deletes, which is the only place the count is still
     * true when it is used. A stand-in that dropped the rule would let the
     * cases below prove the service refuses something nothing refuses.
     * `tests/organization.last-admin-race.test.cjs` is where the transaction
     * itself is proven; this file owns who may act on whom.
     */
    deleteTeamMember: async (orgId, userId) => {
      const membership = memberships.find((one) => one.userId === userId);
      if (isAdministrator(membership?.role) && administrators() <= 1) {
        throw new Error('The workspace must keep at least one administrator');
      }
      deleted.push(userId);
      return { orgId, userId };
    },
  };

  return {
    deleted,
    service: new OrganizationService(repository, {}, {}),
  };
};

const asOrganization = (role) => ({ id: 'org', users: [{ role }] });

describe('removing someone from a workspace', () => {
  test('refuses to remove the last administrator', async () => {
    const { service, deleted } = workspaceOf([
      { userId: 'owner', role: 'ADMIN' },
      { userId: 'writer', role: 'USER' },
    ]);

    await expect(
      service.deleteTeamMember(asOrganization('ADMIN'), 'owner')
    ).rejects.toThrow('The workspace must keep at least one administrator');
    expect(deleted).toEqual([]);
  });

  test('refuses when the last administrator holds the older SUPERADMIN row', async () => {
    const { service, deleted } = workspaceOf([
      { userId: 'owner', role: 'SUPERADMIN' },
      { userId: 'writer', role: 'USER' },
    ]);

    await expect(
      service.deleteTeamMember(asOrganization('SUPERADMIN'), 'owner')
    ).rejects.toThrow('The workspace must keep at least one administrator');
    expect(deleted).toEqual([]);
  });

  test('allows removing an administrator while another one remains', async () => {
    const { service, deleted } = workspaceOf([
      { userId: 'owner', role: 'ADMIN' },
      { userId: 'second', role: 'ADMIN' },
    ]);

    await service.deleteTeamMember(asOrganization('ADMIN'), 'second');
    expect(deleted).toEqual(['second']);
  });

  test('leaves the removal of a member alone', async () => {
    const { service, deleted } = workspaceOf([
      { userId: 'owner', role: 'ADMIN' },
      { userId: 'writer', role: 'EDITOR' },
    ]);

    await service.deleteTeamMember(asOrganization('ADMIN'), 'writer');
    expect(deleted).toEqual(['writer']);
  });

  test('still refuses someone reaching above their own rank', async () => {
    const { service, deleted } = workspaceOf([
      { userId: 'owner', role: 'ADMIN' },
      { userId: 'second', role: 'ADMIN' },
    ]);

    await expect(
      service.deleteTeamMember(asOrganization('EDITOR'), 'second')
    ).rejects.toThrow('You do not have permission to delete this user');
    expect(deleted).toEqual([]);
  });
});
