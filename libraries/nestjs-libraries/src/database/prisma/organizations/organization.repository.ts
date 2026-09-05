import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { Role, ShortLinkPreference, SubscriptionTier } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import {
  CONTENT_WORKFLOW_TAGS,
  CreateOrgUserDto,
} from '@contentfactory/nestjs-libraries/dtos/auth/create.org.user.dto';
import { CONTENT_WORKFLOW_TAG_KEYS } from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import type { AssignableOrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  isOrganizationAdmin,
  organizationRoleLevel,
} from '@contentfactory/nestjs-libraries/user/organization.roles';
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
// language.

/**
 * The two roles that administer a workspace, as one list rather than as the
 * same pair of enum members retyped at each query that needs it.
 *
 * `SUPERADMIN` is here for the rows written before
 * `content-factory-next-fn33.19`: nothing grants that role any more, and the
 * people who hold it are the same owners under the name the product used to
 * print.
 */
const ADMINISTRATOR_ROLES = [Role.SUPERADMIN, Role.ADMIN];

/**
 * The one sentence a workspace hears when a removal or a demotion would leave
 * it with nobody who can invite, connect a channel or hand it over. Written
 * once because two doors reach it.
 */
const LAST_ADMINISTRATOR = 'The workspace must keep at least one administrator';

@Injectable()
export class OrganizationRepository {
  private readonly _logger = new Logger(OrganizationRepository.name);

  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>,
    private _transaction: PrismaTransaction
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
            // `content-factory-next-fn33.19`: the person a workspace is
            // created for is its `ADMIN`. `Role.SUPERADMIN` is not handed out
            // any more — the instance operator is the `User.isSuperAdmin`
            // flag, and two different rights sharing one name is what made
            // the team screen call a workspace owner «Super administrator».
            role: Role.ADMIN,
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
      // `content-factory-next-fn33.34`: without an order the database is free
      // to return the rows in any order it likes, and the first of them is
      // what `auth.middleware` opens for somebody who has no `showorg`
      // cookie. Oldest first, with the id to break ties, so the same person
      // lands in the same workspace on every fresh sign-in.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

  /**
   * `content-factory-next-fn33.6`: does this account already belong to this
   * organization? Asked before an invitation is spent, so that a link opened
   * inside the workspace it invites to is answered rather than burned.
   */
  async isUserInOrg(userId: string, orgId: string) {
    const membership = await this._userOrg.model.userOrganization.findFirst({
      where: {
        userId,
        organizationId: orgId,
      },
      select: {
        id: true,
      },
    });

    return !!membership;
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: AssignableOrganizationRole
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      const checkIfInviteExists = await tx.user.findFirst({
        where: {
          inviteId: id,
        },
      });

      if (checkIfInviteExists) {
        return false;
      }

      // `@@unique([userId, organizationId])` turns a second membership into a
      // raw Prisma error, and it used to surface as a 500 on a state that is
      // not an error at all. Inside the transaction, so a race between two
      // accepts still ends with one membership rather than a collision.
      const existingMembership = await tx.userOrganization.findFirst({
        where: {
          userId,
          organizationId: orgId,
        },
        select: {
          id: true,
        },
      });

      if (existingMembership) {
        return false;
      }

      const checkForSubscription = await tx.organization.findFirst({
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

      const create = await tx.userOrganization.create({
        data: {
          role,
          userId,
          organizationId: orgId,
        },
      });

      await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          inviteId: id,
        },
      });

      return create;
    });
  }

  /**
   * `content-factory-next-fn33.18`: registration that answers an invitation.
   *
   * Someone who arrives through an invitation link is not founding anything.
   * Until now registration always created a workspace first and offered the
   * invitation afterwards, so an invited person ended up with two: an empty
   * one of their own and the one they were actually asked to join. This
   * writes only what the invitation describes — the account and its
   * membership — in one statement, so a failure leaves neither behind.
   *
   * Whether the account is `activated` is decided by the caller and handed in,
   * because the answer depends on which kind of invitation this is.
   * `OrganizationService.createInvitedUser` holds the rule: a link an
   * administrator addressed to one person vouches for that person and stands
   * in for the instance approval, while an open link — one copied out of the
   * product and passable to anyone — vouches for nobody and leaves the
   * instance's own rule in charge. `isSuperAdmin` stays false either way;
   * nothing about being invited makes anyone an operator of the instance.
   *
   * `inviteId` is written on the user for the same reason `addUserToOrg`
   * writes it: it is the mark that this particular invitation has been
   * answered, and the check below is what stops one signed link from
   * producing two accounts if two requests race.
   */
  async createInvitedUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & {
      providerId?: string;
      newsletterConsent?: boolean;
    },
    invitation: { id: string; orgId: string; role: AssignableOrganizationRole },
    access: { activated: boolean },
    ip: string,
    userAgent: string
  ) {
    const locale = resolveBackendLocale(
      (body as { language?: unknown }).language
    );
    const consentedAt = body.newsletterConsent ? new Date() : null;
    const consent = consentedAt
      ? {
          newsletterConsentAt: consentedAt,
          newsletterConsentSource: NEWSLETTER_CONSENT_SOURCE_REGISTRATION,
          newsletterDeliveryPendingAt: consentedAt,
        }
      : {};

    const membership = await this._transaction.model.$transaction(
      async (tx) => {
        const answered = await tx.user.findFirst({
          where: { inviteId: invitation.id },
          select: { id: true },
        });
        if (answered) {
          return false as const;
        }

        const organization = await tx.organization.findFirst({
          where: { id: invitation.orgId },
          select: { id: true },
        });
        if (!organization) {
          return false as const;
        }

        return tx.userOrganization.create({
          data: {
            role: invitation.role,
            organization: { connect: { id: invitation.orgId } },
            user: {
              create: {
                activated: access.activated,
                isSuperAdmin: false,
                inviteId: invitation.id,
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
          select: {
            id: true,
            role: true,
            organizationId: true,
            user: true,
          },
        });
      }
    );

    if (!membership) {
      return false as const;
    }

    // Outside the transaction, for the reason `createOrgAndUser` spells out:
    // the analytics table can legitimately be missing right after a deploy,
    // and inside the transaction that turned a registration into a 500.
    try {
      await (this._organization.model as any).productEvent.create({
        data: {
          name: 'register',
          properties: { invited: true },
          deduplicationKey: `register:${membership.user.id}`,
          organizationId: invitation.orgId,
          userId: membership.user.id,
        },
      });
    } catch (error) {
      this._logger.error(
        `Failed to record register for invited user ${membership.user.id}`,
        error
      );
    }

    return membership;
  }

  /**
   * Everything a new workspace is, apart from who is in it: the name, the key,
   * the trial flags, the AI provider row and the content-workflow tags named
   * in the reader's language.
   *
   * Registration and `content-factory-next-fn33.36` (a second workspace for an
   * account that already exists) both go through here, so the two doors cannot
   * drift into producing different workspaces.
   */
  private newOrganizationData(
    id: string,
    name: string | undefined,
    language: unknown
  ) {
    // Unknown, empty or unshipped values fall back to English rather than
    // rejecting the request; see `resolveBackendLocale`.
    const locale = resolveBackendLocale(language);
    return {
      id,
      name: (typeof name === 'string' && name.trim()) || 'Workspace',
      apiKey: AuthService.fixedEncryption(makeId(20)),
      allowTrial: true,
      isTrailing: true,
      aiProvider: {
        create: { usageMode: 'included' as const },
      },
      // There is no starter-template choice on the registration form any more:
      // every new workspace gets the content-workflow tags, unconditionally,
      // named in the language the person was reading at the time.
      tags: {
        create: CONTENT_WORKFLOW_TAGS.map(({ color }, index) => ({
          name: translateBackendString(CONTENT_WORKFLOW_TAG_KEYS[index], locale),
          color,
        })),
      },
    };
  }

  /**
   * `content-factory-next-fn33.36`: a second workspace for somebody who
   * already has an account.
   *
   * The account itself is not touched — `activated` in particular stays as the
   * approval flow left it — and the person who asked becomes the `ADMIN` of
   * what they created, the same rank registration grants.
   */
  async createOrgForUser(
    userId: string,
    name: string | undefined,
    language: unknown
  ) {
    const organizationId = randomUUID();
    const organization = await this._organization.model.organization.create({
      data: {
        ...this.newOrganizationData(organizationId, name, language),
        users: {
          create: {
            role: Role.ADMIN,
            user: { connect: { id: userId } },
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Analytics never blocks the workspace it describes; see `createOrgAndUser`
    // for why this table can be missing right after a deploy.
    try {
      await (this._organization.model as any).productEvent.create({
        data: {
          name: 'create_organization',
          properties: {},
          deduplicationKey: `create_organization:${organizationId}`,
          organizationId,
          userId,
        },
      });
    } catch (error) {
      this._logger.error(
        `Failed to record create_organization for organization ${organizationId}`,
        error
      );
    }

    return organization;
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
    const organizationName = [body.workspaceName, body.company].find(
      (value) => typeof value === 'string' && value.trim()
    );
    const language = (body as { language?: unknown }).language;
    const locale = resolveBackendLocale(language);

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
        ...this.newOrganizationData(organizationId, organizationName, language),
        users: {
          create: {
            // `content-factory-next-fn33.19`: the creator of a workspace is
            // its `ADMIN`. See `createMaxUser` for why `Role.SUPERADMIN` is
            // no longer assigned anywhere.
            role: Role.ADMIN,
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
          /**
           * `content-factory-next-fn33.51`. Without an order Postgres returns
           * the rows however the last write left them, so changing somebody's
           * role moved their row — usually to the end — the instant the screen
           * re-read the list. An administrator correcting two roles in a row
           * clicked the second dropdown on a person who had just slid into
           * that place. Joining time is the one order that does not change
           * when a role does; `id` settles the tie for two rows written in the
           * same instant, which the seed script does.
           */
          orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
          select: {
            role: true,
            user: {
              select: {
                email: true,
                // The team list signs its rows with the person's own name and
                // falls back to the address only when the profile is empty
                // (`content-factory-next-fn33.16`). Without this column the
                // list had no name to show and derived one from the mailbox
                // for everybody.
                name: true,
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

  /**
   * One serializable transaction with a bounded retry, for the writes that
   * have to read the workspace before they are allowed to happen.
   *
   * The same shape as `UsersRepository.serializableWithRetry`, and the second
   * copy of it in this package — see the note on
   * `keepingAnAdministrator` below. `P2034` is Postgres refusing a write
   * conflict, which is an instruction to retry rather than a failure to
   * report; three attempts and then a plain «busy», so a person waiting on a
   * button never waits forever.
   */
  private async serializableWithRetry<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
    busyMessage: string
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this._transaction.model.$transaction(run, {
          isolationLevel: 'Serializable',
        });
      } catch (error: any) {
        if (error?.code !== 'P2034') throw error;
        if (attempt === 2) {
          throw new HttpException(busyMessage, 503);
        }
      }
    }

    throw new Error('Unreachable serializable retry state');
  }

  /**
   * `content-factory-next-fn33.102`. Both writes that can take a workspace's
   * last administrator away, done as one transaction each: read the membership,
   * count the administrators, write.
   *
   * The rule is older than this method — `content-factory-next-fn33.19` — and
   * it was read correctly. What was wrong was where it was read. The count sat
   * in `OrganizationService` as its own call and the write was another, so two
   * administrators demoting each other at the same moment both counted two,
   * both passed, and both wrote: a workspace with nobody who can invite,
   * connect a channel or hand it over, and no way back without database
   * access. The count was true when it was taken and false when it was used.
   *
   * `Serializable` rather than a lock, because Prisma has no `FOR UPDATE`
   * without raw SQL and this repository does not write raw SQL. The count is a
   * predicate read over the administrators of one workspace and the write
   * lands inside that predicate, which is precisely the read-write cycle
   * Postgres's serializable snapshot isolation refuses; the loser comes back
   * as `P2034`, is retried by the helper above, re-reads the committed count
   * and is then refused on the merits, with the sentence a person can act on.
   *
   * The refusal lives here rather than in the service because here is the only
   * place it can be made to hold. The service still owns everything about
   * *who* may act on *whom* — rank against rank — which is policy and needs no
   * transaction.
   */
  private async keepingAnAdministrator<T>(
    orgId: string,
    userId: string,
    losesAnAdministrator: (role: Role) => boolean,
    write: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.serializableWithRetry(async (tx) => {
      const membership = await tx.userOrganization.findFirst({
        where: { userId, organizationId: orgId },
        select: { id: true, role: true },
      });

      if (!membership) {
        throw new HttpException('User is not part of this organization', 400);
      }

      if (losesAnAdministrator(membership.role)) {
        const administrators = await tx.userOrganization.count({
          where: {
            organizationId: orgId,
            role: { in: ADMINISTRATOR_ROLES },
          },
        });
        if (administrators <= 1) {
          throw new HttpException(LAST_ADMINISTRATOR, 400);
        }
      }

      return write(tx);
    }, 'This workspace is being changed right now; try again');
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this.keepingAnAdministrator(
      orgId,
      userId,
      (role) => isOrganizationAdmin(role),
      (tx) =>
        tx.userOrganization.delete({
          where: {
            userId_organizationId: {
              userId,
              organizationId: orgId,
            },
          },
        })
    );
  }

  /**
   * Switches a workspace off for everyone but the people who can switch it
   * back on — the administrators.
   *
   * The exemption used to be `Role.SUPERADMIN` alone, which was the role the
   * creator received. Since `content-factory-next-fn33.19` the creator is an
   * `ADMIN`, and leaving the filter as it was would have disabled the very
   * account that has to reach billing to restore the subscription. Existing
   * `SUPERADMIN` rows stay exempt: they are the same people, under the name
   * the product used before.
   */
  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        role: {
          notIn: ADMINISTRATOR_ROLES,
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

  /**
   * `content-factory-next-fn33.17`. One membership row, one column. Added as
   * its own block at the end of the class rather than beside `deleteTeamMember`
   * so that the two changes to this file in the same wave do not collide.
   *
   * Every rule about who may do this lives in `organization.service.ts`; the
   * repository writes what it is told, as the rest of this class does.
   */
  updateTeamMemberRole(orgId: string, userId: string, role: Role) {
    return this.keepingAnAdministrator(
      orgId,
      userId,
      // Only a demotion can cost the workspace an administrator. Promoting
      // somebody, or moving a member between `USER` and `EDITOR`, never counts.
      (current) => isOrganizationAdmin(current) && !isOrganizationAdmin(role),
      (tx) =>
        tx.userOrganization.update({
          where: {
            userId_organizationId: {
              userId,
              organizationId: orgId,
            },
          },
          data: {
            role,
          },
        })
    );
  }
}
