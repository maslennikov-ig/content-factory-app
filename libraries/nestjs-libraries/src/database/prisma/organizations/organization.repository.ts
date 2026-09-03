import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { Role, ShortLinkPreference, SubscriptionTier } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import {
  CONTENT_WORKFLOW_TAGS,
  CreateOrgUserDto,
} from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import type { AssignableOrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { organizationRoleLevel } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type { NewUserAccess } from '@contentfactory/helpers/auth/registration.approval';
import { randomUUID } from 'node:crypto';
import { normalizeIdentityIdentifier } from '@contentfactory/nestjs-libraries/database/prisma/users/user-identity';
import { NEWSLETTER_CONSENT_SOURCE_REGISTRATION } from '@contentfactory/helpers/auth/newsletter.consent';
import {
  resolveBackendLocale,
  translateBackendString,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';

// Order matches `CONTENT_WORKFLOW_TAGS`. The color in that array is fixed and
// unrelated to language, so only the name is resolved per registration
// language; the key list stays here rather than in `starter-template.ts`
// because that file is loaded bare (no mocks) by several tests and must not
// gain a `@contentfactory/*` import of its own.
const CONTENT_WORKFLOW_TAG_KEYS = [
  'content_workflow_tag_plan',
  'content_workflow_tag_draft',
  'content_workflow_tag_review',
  'content_workflow_tag_schedule',
] as const;

@Injectable()
export class OrganizationRepository {
  private readonly _logger = new Logger(OrganizationRepository.name);

  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>
  ) {}

  createMaxUser(
    id: string,
    name: string,
    saasName: string,
    email: string,
    activated: boolean
  ) {
    const maxUserEmail = email
      ? email.split('@').join(`+${saasName}@`)
      : `${saasName}+` + makeId(10) + '@contentfactory.invalid';
    return this._organization.model.organization.create({
      select: {
        id: true,
        apiKey: true,
      },
      data: {
        name: name ? `${name}###${id}` : `Unnamed User###${id}`,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        isTrailing: false,
        subscription: {
          create: {
            totalChannels: 1000000,
            subscriptionTier: 'ULTIMATE',
            isLifetime: true,
            period: 'YEARLY',
          },
        },
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated,
                email: maxUserEmail,
                name: name ? `${name}###${id}` : `Unnamed User###${id}`,
                providerName: 'LOCAL',
                password: AuthService.hashPassword(makeId(500)),
                timezone: 0,
                identities: {
                  create: {
                    provider: 'LOCAL',
                    providerIdentifier: normalizeIdentityIdentifier(
                      'LOCAL',
                      maxUserEmail
                    ),
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  getOrgByApiKey(api: string) {
    return this._organization.model.organization.findFirst({
      where: {
        apiKey: api,
      },
      include: {
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
          },
        },
        // The public API authenticates by organization key, so the approval
        // gate has no user to look at unless it is loaded here.
        users: {
          select: {
            user: {
              select: {
                activated: true,
              },
            },
          },
        },
      },
    });
  }

  getCount() {
    return this._organization.model.organization.count();
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                role: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  getImpersonateUser(name: string) {
    return this._userOrg.model.userOrganization.findMany({
      where: {
        OR: [
          {
            organizationId: {
              contains: name,
            },
          },
          {
            user: {
              OR: [
                {
                  name: {
                    contains: name,
                  },
                },
                {
                  email: {
                    contains: name,
                  },
                },
                {
                  id: {
                    contains: name,
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  updateApiKey(orgId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        apiKey: AuthService.fixedEncryption(makeId(20)),
      },
    });
  }

  async getOrgsByUserId(userId: string) {
    return this._organization.model.organization.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          where: {
            userId,
          },
          select: {
            disabled: true,
            role: true,
          },
        },
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  getUsersByEmail(email: string) {
    return this._user.model.user.findMany({
      where: {
        email,
      },
    });
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: AssignableOrganizationRole
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    if (
      process.env.STRIPE_PUBLISHABLE_KEY &&
      checkForSubscription?.subscription?.subscriptionTier ===
        SubscriptionTier.STANDARD
    ) {
      return false;
    }

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        role,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & {
      providerId?: string;
      /**
       * Consent already decided by the auth service, not the raw request
       * field: the eligibility rule belongs there, and what reaches the
       * database is the answer, not the question.
       */
      newsletterConsent?: boolean;
    },
    access: NewUserAccess,
    ip: string,
    userAgent: string
  ) {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const organizationName =
      [body.workspaceName, body.company]
        .find((value) => typeof value === 'string' && value.trim())
        ?.trim() || 'Workspace';
    // Unknown, empty or unshipped values fall back to English rather than
    // rejecting the registration; see `resolveBackendLocale`.
    const locale = resolveBackendLocale((body as { language?: unknown }).language);
    // There is no starter-template choice on the registration form any more:
    // every new workspace gets the content-workflow tags, unconditionally,
    // named in the language the person was reading when they signed up.
    const workflowTagsData = {
      tags: {
        create: CONTENT_WORKFLOW_TAGS.map(({ color }, index) => ({
          name: translateBackendString(CONTENT_WORKFLOW_TAG_KEYS[index], locale),
          color,
        })),
      },
    };

    // One statement, so the consent cannot outlive a failed account creation
    // or the account outlive a lost consent.
    const consentedAt = body.newsletterConsent ? new Date() : null;
    const consent = consentedAt
      ? {
          newsletterConsentAt: consentedAt,
          newsletterConsentSource: NEWSLETTER_CONSENT_SOURCE_REGISTRATION,
          newsletterDeliveryPendingAt: consentedAt,
        }
      : {};

    const createOrganization = this._organization.model.organization.create({
      data: {
        id: organizationId,
        name: organizationName,
        apiKey: AuthService.fixedEncryption(makeId(20)),
        allowTrial: true,
        isTrailing: true,
        aiProvider: {
          create: { usageMode: 'included' },
        },
        ...workflowTagsData,
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                id: userId,
                activated: access.activated,
                isSuperAdmin: access.isSuperAdmin,
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : '',
                providerName: body.provider,
                providerId: body.providerId || '',
                timezone: 0,
                language: locale,
                ip,
                agent: userAgent,
                identities: {
                  create: {
                    provider: body.provider,
                    providerIdentifier: normalizeIdentityIdentifier(
                      body.provider,
                      body.provider === 'LOCAL'
                        ? body.email
                        : body.providerId || ''
                    ),
                  },
                },
                ...consent,
              },
            },
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: true,
          },
        },
      },
    });
    const organization = await createOrganization;

    // Analytics is written after the account exists and never inside its
    // transaction. Schema is applied as a separate step after the containers
    // come up (docs/operations/production-deploy.md), so there is a window
    // where `ProductEvent` is not in the database yet; inside the transaction
    // that window turned every registration into a 500.
    try {
      await (this._organization.model as any).productEvent.create({
        data: {
          name: 'register',
          properties: {},
          deduplicationKey: `register:${userId}`,
          organizationId,
          userId,
        },
      });
    } catch (error) {
      this._logger.error(
        `Failed to record register for organization ${organizationId}`,
        error
      );
    }

    return organization;
  }

  getOrgByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async getProductEventActor(organizationId: string) {
    const members = await this._userOrg.model.userOrganization.findMany({
      where: {
        organizationId,
        disabled: false,
      },
      select: {
        userId: true,
        role: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // The most senior member, and the earliest to join among equals — the
    // query above is already ordered by `createdAt`, and sorting is stable.
    return members.sort(
      (left, right) =>
        organizationRoleLevel(right.role) - organizationRoleLevel(left.role)
    )[0];
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    try {
      await this._organization.model.organization.update({
        where: {
          id: organizationId,
          ...(type === 'start'
            ? {
                streakSince: null,
              }
            : {}),
        },
        data: {
          ...(type === 'end' ? { streakSince: null } : {}),
          ...(type === 'start' ? { streakSince: new Date() } : {}),
        },
      });
    } catch (err) {}
  }

  async getTeam(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            role: true,
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
              },
            },
          },
        },
      },
    });
  }

  getAllUsersOrgs(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        role: {
          not: Role.SUPERADMIN,
        },
      },
      data: {
        disabled: disable,
      },
    });
  }

  getShortlinkPreference(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        shortlink: true,
      },
    });
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        shortlink,
      },
    });
  }
}
