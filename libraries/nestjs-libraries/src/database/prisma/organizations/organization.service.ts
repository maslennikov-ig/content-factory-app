import { CreateOrgUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { HttpException, Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import { AddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AdminAddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { randomUUID } from 'node:crypto';
import type { AssignableOrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  ASSIGNABLE_ORGANIZATION_ROLES,
  isOrganizationAdmin,
  organizationRoleLevel,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
import { Organization, ShortLinkPreference, User } from '@prisma/client';
import { AutopostService } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service';
import { resolveNewUserAccess } from '@contentfactory/helpers/auth/registration.approval';
import {
  resolveBackendLocale,
  translateBackendString,
  translateBackendText,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import {
  emailActionBody,
  emailDirection,
} from '@contentfactory/nestjs-libraries/emails/email.template';
import {
  issueTeamInvitation,
  TEAM_INVITATION_TTL_SECONDS,
} from '@contentfactory/nestjs-libraries/auth/team-invitation';

@Injectable()
export class OrganizationService {
  constructor(
    private _organizationRepository: OrganizationRepository,
    private _notificationsService: NotificationService
  ) {}
  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & {
      providerId?: string;
      newsletterConsent?: boolean;
    },
    ip: string,
    userAgent: string
  ) {
    // Counting first is not transactional: two registrations arriving at the
    // same moment on a brand new instance could both read zero. On a
    // self-hosted instance the owner registers before anyone knows the
    // address, so the window is theoretical; the alternative would be a
    // database-level constraint upstream does not have.
    const access = resolveNewUserAccess({
      provider: body.provider,
      hasEmailProvider: this._notificationsService.hasEmailProvider(),
      firstOrganization: (await this.getCount()) === 0,
    });

    return this._organizationRepository.createOrgAndUser(
      body,
      access,
      ip,
      userAgent
    );
  }

  /**
   * `content-factory-next-fn33.18`: an account created by an invitation, with
   * no workspace of its own.
   *
   * Whether it starts switched on turns on one thing — did a person vouch for
   * this particular applicant.
   *
   * `vouchedFor` is true only for a link an administrator addressed to one
   * email (`boundEmail`): that link cannot be answered by anybody else, so the
   * administrator named the person, and the owner's decision of 04.09.2026
   * stands — the invitation is the approval, and the invited person waits for
   * nobody.
   *
   * An open link is not that. It carries no address, it is meant to be copied
   * and passed on, and whoever answers it is a stranger the administrator has
   * never named. Treating it as approval made
   * `CONTENT_FACTORY_REQUIRE_APPROVAL` bypassable by anybody holding a link,
   * which is not a gate at all (`content-factory-next-fn33.108`). So the
   * instance's own rule decides, exactly as it does at the front door, and the
   * membership is written regardless: the workspace the link names is where
   * this person belongs the moment their account is switched on.
   */
  createInvitedUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & {
      providerId?: string;
      newsletterConsent?: boolean;
    },
    invitation: { id: string; orgId: string; role: AssignableOrganizationRole },
    ip: string,
    userAgent: string,
    options: { vouchedFor: boolean }
  ) {
    const access = options.vouchedFor
      ? { activated: true }
      : resolveNewUserAccess({
          provider: body.provider,
          hasEmailProvider: this._notificationsService.hasEmailProvider(),
          // An invitation names a workspace, so there is always one already.
          firstOrganization: false,
        });

    return this._organizationRepository.createInvitedUser(
      body,
      invitation,
      { activated: access.activated },
      ip,
      userAgent
    );
  }

  async getCount() {
    return this._organizationRepository.getCount();
  }

  async createMaxUser(id: string, name: string, saasName: string, email: string) {
    // A JWT signed with the instance secret authorizes this reseller path, but
    // it is not an exception to the instance's approval policy. It also is
    // not self-service founder registration, so it cannot claim the empty
    // instance exception from resolveNewUserAccess.
    const { activated } = resolveNewUserAccess({
      provider: 'ENTERPRISE',
      hasEmailProvider: false,
      firstOrganization: false,
    });

    return this._organizationRepository.createMaxUser(
      id,
      name,
      saasName,
      email,
      activated
    );
  }

  addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: AssignableOrganizationRole
  ) {
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
  }

  isUserInOrg(userId: string, orgId: string) {
    return this._organizationRepository.isUserInOrg(userId, orgId);
  }

  getOrgById(id: string) {
    return this._organizationRepository.getOrgById(id);
  }

  getOrgByApiKey(api: string) {
    return this._organizationRepository.getOrgByApiKey(api);
  }

  getUserOrg(id: string) {
    return this._organizationRepository.getUserOrg(id);
  }

  getOrgsByUserId(userId: string) {
    return this._organizationRepository.getOrgsByUserId(userId);
  }

  /**
   * `content-factory-next-fn33.36`: a second workspace, created from inside
   * the product instead of by registering another account.
   *
   * Anybody signed in may do this and there is no cap on how many workspaces
   * one person keeps — the default the owner asked for. The tags are named in
   * the language of the person creating, the way registration names them in
   * the language of the form.
   */
  createOrganizationForUser(
    user: Pick<User, 'id'> & { language?: string | null },
    name: string
  ) {
    return this._organizationRepository.createOrgForUser(
      user.id,
      name,
      user.language
    );
  }

  updateApiKey(orgId: string) {
    return this._organizationRepository.updateApiKey(orgId);
  }

  getTeam(orgId: string) {
    return this._organizationRepository.getTeam(orgId);
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationRepository.setStreak(organizationId, type);
  }

  getOrgByCustomerId(customerId: string) {
    return this._organizationRepository.getOrgByCustomerId(customerId);
  }

  getProductEventActor(organizationId: string) {
    return this._organizationRepository.getProductEventActor(organizationId);
  }

  async inviteTeamMember(org: Organization, user: User, body: AddTeamMemberDto) {
    /**
     * `content-factory-next-fn33.100`. This is not a display name — it is the
     * mark that says «this invitation has been answered», and both places that
     * accept an invitation (`addUserToOrg`, `createInvitedUser`) refuse an id
     * a user row already holds. That refusal is what stops one signed link
     * from producing two accounts.
     *
     * Which is exactly why it was minted too narrow. Five characters of a
     * 62-letter alphabet is about 9·10⁸ values, and the mark is spent by the
     * invitee: the link is consumed and the token is gone before the collision
     * is noticed, so the second person gets a flat «could not add» and nothing
     * left to retry with. A few thousand invitations put an instance inside
     * the birthday range for that alphabet. 122 random bits take it out.
     */
    const id = randomUUID();
    // `content-factory-next-fn33.24`. The address, not the checkbox, decides
    // whether the invitation is bound to one mailbox: an administrator who
    // types an address and then sends the link through Telegram still means
    // «this is for that person». The checkbox only adds a letter, and without
    // an address there is nothing to add it to.
    const boundEmail = body.email?.trim().toLowerCase() || '';
    if (body.sendEmail && !boundEmail) {
      throw new HttpException(
        'An email address is required to send the invitation by email',
        400
      );
    }
    // Named fields, not a spread of the request body. Spreading it here turned
    // this endpoint into a signing oracle: any authenticated caller could have
    // the instance sign a payload of their choosing with its own JWT_SECRET,
    // and the signed token is handed straight back in the response. The global
    // ValidationPipe now runs with `whitelist: true`, which strips unknown
    // properties — but that is one pipe option away from being untrue again,
    // and the signature is issued here. Only what the invitation flow reads is
    // signed.
    const token = await issueTeamInvitation({
      id,
      orgId: org.id,
      role: body.role as AssignableOrganizationRole,
      workspaceName: org.name,
      inviterName: user.name || user.email,
      inviterEmail: user.email,
      ...(boundEmail ? { boundEmail } : {}),
    });
    // The same arithmetic `issueTeamInvitation` does for the token's own
    // `timeLimit`, a millisecond later. It is repeated rather than returned
    // because the screen has to say out loud how long the link lives, and the
    // signing helper's contract belongs to the invitation flow, not to this
    // response.
    const expiresAt = new Date(
      Date.now() + TEAM_INVITATION_TTL_SECONDS * 1000
    ).toISOString();
    const url = process.env.FRONTEND_URL + `/join-org?org=${token}`;
    if (body.sendEmail) {
      const inviter = user.name
        ? `${user.name} (${user.email})`
        : user.email;
      // The invitee usually has no account yet, so there is no language of
      // theirs to read. The inviter's is the closest thing the invitation
      // knows about: a team writes to a new member in the language the team
      // already works in.
      const locale = resolveBackendLocale(user.language);
      const dir = emailDirection(locale);
      await this._notificationsService.sendEmail(
        boundEmail,
        translateBackendText('email_team_invitation_subject', locale, {
          inviter: user.name || user.email,
          organization: org.name,
        }),
        emailActionBody({
          intro: translateBackendString('email_team_invitation_intro', locale, {
            inviter,
            organization: org.name,
          }),
          label: translateBackendString('email_team_invitation_action', locale),
          url,
          fallbackHint: translateBackendString(
            'email_action_fallback_hint',
            locale
          ),
          dir,
        }),
        undefined,
        locale
      );
    }
    // The link itself, and the two facts the screen has to state about it:
    // when it stops working, and whether it is bound to one address or open to
    // whoever holds it.
    return {
      url,
      expiresAt,
      sentByEmail: !!body.sendEmail,
      ...(boundEmail ? { boundEmail } : {}),
    };
  }

  async addTeamMemberByEmail(org: Organization, body: AdminAddTeamMemberDto) {
    const tier =
      // @ts-ignore
      org?.subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE');

    if (!pricing[tier].team_members) {
      throw new HttpException(
        'The organization plan does not include team members',
        400
      );
    }

    const users = await this._organizationRepository.getUsersByEmail(
      body.email
    );
    if (!users.length) {
      throw new HttpException(
        'No Content Factory account found for this email',
        400
      );
    }

    if (users.length > 1) {
      throw new HttpException(
        'Multiple accounts exist for this email (different login providers)',
        400
      );
    }

    const [user] = users;

    const userOrgs = await this._organizationRepository.getOrgsByUserId(
      user.id
    );
    if (userOrgs.some((current) => current.id === org.id)) {
      throw new HttpException(
        'User is already a member of this organization',
        400
      );
    }

    const added = await this._organizationRepository.addUserToOrg(
      user.id,
      // The same mark as an invitation link carries, from the same space and
      // for the same reason (`content-factory-next-fn33.100`): `addUserToOrg`
      // reads it as «has this invitation been answered», and a collision here
      // refuses a membership that nothing is wrong with.
      randomUUID(),
      org.id,
      body.role as AssignableOrganizationRole
    );

    if (!added) {
      throw new HttpException(
        'Could not add the user to the organization',
        400
      );
    }

    return { added: true };
  }

  async deleteTeamMember(org: Organization, userId: string) {
    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const findOrgToDelete = userOrgs.find((orgUser) => orgUser.id === org.id);
    if (!findOrgToDelete) {
      throw new Error('User is not part of this organization');
    }

    // @ts-ignore
    const myRole = org.users[0].role;
    const userRole = findOrgToDelete.users[0].role;
    const myLevel = organizationRoleLevel(myRole);
    const userLevel = organizationRoleLevel(userRole);

    // `content-factory-next-fn33.50`: an administrator may also remove an
    // equal — another administrator — as long as the workspace keeps one, the
    // clause counted just below. Equality alone is not enough: `USER` and
    // `EDITOR` share a level and neither administers anybody, so the equal
    // case is opened for administrators only.
    if (
      myLevel < userLevel ||
      (myLevel === userLevel && !isOrganizationAdmin(myRole))
    ) {
      throw new Error('You do not have permission to delete this user');
    }

    // `content-factory-next-fn33.19`: a workspace without an administrator is
    // a workspace nobody can invite into, connect a channel to, or hand over.
    // The old protection was the `SUPERADMIN` role itself — one per workspace,
    // never removable. Now that the creator is an ordinary `ADMIN`, the same
    // guarantee has to be counted: the last administrator stays, including
    // when they are removing themselves.
    //
    // The counting used to happen right here, and that was the defect
    // `content-factory-next-fn33.102` closed: a count taken in the service and
    // a delete issued after it are two statements, and two administrators
    // removing each other at the same moment both counted two. The count now
    // happens inside the transaction that deletes. What stays here is the part
    // that needs no transaction — who may act on whom.
    return this._organizationRepository.deleteTeamMember(org.id, userId);
  }

  /**
   * `content-factory-next-fn33.17`. Until this existed the only way to change
   * somebody's role was to remove them and invite them again, which is a
   * destructive move for a typo.
   *
   * Four rules, and they are the same ones removal answers to, read through
   * `organizationRoleLevel`:
   *
   *  - the role has to be one an administrator may hand out at all, so nobody
   *    reaches `SUPERADMIN` through this door;
   *  - nobody changes their own role — a lone administrator cannot lock
   *    themselves out of the workspace by accident;
   *  - only somebody below you, or — since `content-factory-next-fn33.50` —
   *    an equal, when you are an administrator and the workspace keeps one;
   *    which is the removal rule verbatim;
   *  - and only to a role no higher than your own, so the door cannot be used
   *    to hand out authority the caller does not hold. Today that last rule is
   *    unreachable — `ADMIN` is the highest role on offer and only an
   *    administrator gets past the rule above it — and it is written anyway,
   *    because «unreachable» is a property of the list of assignable roles,
   *    not of this method.
   */
  async updateTeamMemberRole(
    org: Organization,
    user: User,
    userId: string,
    role: AssignableOrganizationRole
  ) {
    if (
      !(ASSIGNABLE_ORGANIZATION_ROLES as readonly string[]).includes(role)
    ) {
      throw new HttpException('Unknown role', 400);
    }

    if (userId === user.id) {
      throw new HttpException('You cannot change your own role', 400);
    }

    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const membership = userOrgs.find((orgUser) => orgUser.id === org.id);
    if (!membership) {
      throw new HttpException('User is not part of this organization', 400);
    }

    // @ts-ignore the organization on the request carries the caller's own
    // membership row, exactly as `deleteTeamMember` reads it.
    const myRole = org.users[0].role;
    const myLevel = organizationRoleLevel(myRole);
    const theirLevel = organizationRoleLevel(membership.users[0].role);

    /**
     * `content-factory-next-fn33.50`. Until this the rule was «strictly below
     * you», and with `ADMIN` as the ceiling of the product that made promotion
     * a one-way door: the moment somebody became an administrator, the person
     * who promoted them could neither demote nor remove them, and only an
     * instance administrator could undo a mis-click.
     *
     * So an administrator may now act on an equal. Equality on its own is not
     * the licence — `USER` and `EDITOR` share a level and administer nobody —
     * being an administrator is, and what protects the workspace is the same
     * clause that already protects the last administrator from removal: one
     * has to remain. Yourself is still refused above, so an administrator
     * cannot walk out of their own workspace by this door either.
     */
    if (
      myLevel < theirLevel ||
      (myLevel === theirLevel && !isOrganizationAdmin(myRole))
    ) {
      throw new HttpException(
        'You do not have permission to change this role',
        400
      );
    }

    if (organizationRoleLevel(role) > myLevel) {
      throw new HttpException(
        'You cannot grant a role above your own',
        400
      );
    }

    // Demoting an administrator is the removal rule in a lighter form: a
    // workspace whose last administrator becomes a member is a workspace
    // nobody can invite into or connect a channel to, and getting back out of
    // it needs database access. Counted inside the transaction that writes the
    // role, for the reason `content-factory-next-fn33.102` records on
    // `keepingAnAdministrator`: counted here it was a promise about a moment
    // that had already passed by the time the write went out.
    await this._organizationRepository.updateTeamMemberRole(
      org.id,
      userId,
      role
    );

    return { role };
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._organizationRepository.disableOrEnableNonSuperAdminUsers(
      orgId,
      disable
    );
  }

  getShortlinkPreference(orgId: string) {
    return this._organizationRepository.getShortlinkPreference(orgId);
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organizationRepository.updateShortlinkPreference(
      orgId,
      shortlink
    );
  }
}
