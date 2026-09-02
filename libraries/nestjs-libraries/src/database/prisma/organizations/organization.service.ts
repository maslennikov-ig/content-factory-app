import { CreateOrgUserDto } from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { HttpException, Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import { AddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AdminAddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import dayjs from 'dayjs';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
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
    role: 'USER' | 'ADMIN'
  ) {
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
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
    const timeLimit = dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm:ss');
    const id = makeId(5);
    // Named fields, not a spread of the request body. Spreading it here turned
    // this endpoint into a signing oracle: any authenticated caller could have
    // the instance sign a payload of their choosing with its own JWT_SECRET,
    // and the signed token is handed straight back in the response. The global
    // ValidationPipe now runs with `whitelist: true`, which strips unknown
    // properties — but that is one pipe option away from being untrue again,
    // and the signature is issued here. Only what the invitation flow reads is
    // signed.
    const url =
      process.env.FRONTEND_URL +
      `/?org=${AuthService.signJWT({
        email: body.email,
        role: body.role,
        orgId: org.id,
        timeLimit,
        id,
      })}`;
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
        body.email,
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
    return { url };
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
      makeId(5),
      org.id,
      body.role as 'USER' | 'ADMIN'
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
    const myLevel = myRole === 'USER' ? 0 : myRole === 'ADMIN' ? 1 : 2;
    const userLevel = userRole === 'USER' ? 0 : userRole === 'ADMIN' ? 1 : 2;

    if (myLevel < userLevel) {
      throw new Error('You do not have permission to delete this user');
    }

    return this._organizationRepository.deleteTeamMember(org.id, userId);
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
