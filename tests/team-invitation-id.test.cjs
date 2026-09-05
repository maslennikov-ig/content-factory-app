'use strict';

/**
 * `content-factory-next-fn33.100`: two invitations must never be minted with
 * the same identifier.
 *
 * The identifier an invitation carries is not a display name — it is the mark
 * that says «this particular invitation has been answered». Both places that
 * accept one, `addUserToOrg` and `createInvitedUser`, refuse when a user row
 * already holds it. That refusal is what stops one signed link from producing
 * two accounts, and it is correct.
 *
 * It is also why a short identifier is a defect rather than an inelegance. The
 * mark was minted as five characters out of a 62-letter alphabet — about 9·10⁸
 * values — and it is spent by the invitee, not by the inviter: the link is
 * consumed, the token is gone, and only then does the collision surface, as a
 * flat «could not add». The second person cannot retry, because the thing they
 * held has already been read. A workspace that has sent a few thousand
 * invitations is inside the birthday range for that alphabet.
 *
 * So the property under test is not «the identifier looks like a UUID». It is
 * that the space it is drawn from is large enough that a collision is not a
 * thing that happens: 122 random bits rather than 30. The format assertion is
 * how that is read off a single value.
 */

const noopDecorator = () => () => undefined;

class HttpException extends Error {
  constructor(response, status) {
    super(typeof response === 'string' ? response : response?.message);
    this.status = status;
  }
}

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const issued = [];

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
      TEAM_INVITATION_TTL_SECONDS: 604800,
      issueTeamInvitation: async (payload) => {
        issued.push(payload.id);
        return 'token';
      },
    },
  }
);

/** 122 random bits, written the way RFC 4122 version 4 writes them. */
const RANDOM_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const organization = { id: 'org-1', name: 'Workspace' };
const inviter = { id: 'user-1', name: 'Ada', email: 'ada@example.invalid' };

const serviceForInvites = () =>
  new OrganizationService(
    {},
    { hasEmailProvider: () => true, sendEmail: async () => undefined }
  );

/** The other door that mints one: adding somebody who already has an account. */
const serviceForDirectAdd = (accepted) =>
  new OrganizationService(
    {
      getUsersByEmail: async () => [{ id: 'invitee-1' }],
      getOrgsByUserId: async () => [],
      addUserToOrg: async (_userId, id) => {
        accepted.push(id);
        return { id: 'membership-1' };
      },
    },
    { hasEmailProvider: () => true, sendEmail: async () => undefined }
  );

describe('the mark an invitation carries', () => {
  beforeEach(() => {
    issued.length = 0;
  });

  test('an invitation link is minted from 122 bits, not from five characters', async () => {
    await serviceForInvites().inviteTeamMember(organization, inviter, {
      role: 'USER',
    });

    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatch(RANDOM_UUID);
  });

  test('adding an existing account by email mints from the same space', async () => {
    const accepted = [];
    await serviceForDirectAdd(accepted).addTeamMemberByEmail(organization, {
      email: 'invitee@example.invalid',
      role: 'USER',
    });

    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatch(RANDOM_UUID);
  });

  test('two thousand invitations from one process produce two thousand marks', async () => {
    const service = serviceForInvites();
    for (let i = 0; i < 2000; i += 1) {
      await service.inviteTeamMember(organization, inviter, { role: 'USER' });
    }

    // Two thousand draws from 62⁵ collide about 0.2% of the time, which is
    // too rare to fail on and far too common to ship: the loss is a person who
    // cannot join and cannot retry. Uniqueness here is the visible half of the
    // property; the width asserted above is the half that makes it true.
    expect(new Set(issued).size).toBe(2000);
  });
});
