import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { HttpException, Injectable } from '@nestjs/common';
import { Provider, Role } from '@prisma/client';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { UserDetailDto } from '@contentfactory/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto';
import {
  CONTENT_WORKFLOW_TAGS,
  CONTENT_WORKFLOW_TAG_KEYS,
} from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';
import {
  resolveBackendLocale,
  translateBackendString,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import {
  legacyIdentityIdentifier,
  normalizeIdentityIdentifier,
} from '@contentfactory/nestjs-libraries/database/prisma/users/user-identity';

/**
 * What a caller is allowed to learn about a sign-in method: which provider, the
 * identifier it signs in with, and when it was attached. Password hashes and
 * row ids stay inside the repository. Both the idempotent branch and the
 * creating branch of `linkIdentity` project through this, so the endpoint
 * cannot return one shape on the first call and a wider one on the second.
 */
const IDENTITY_SELECT = {
  provider: true,
  providerIdentifier: true,
  linkedAt: true,
} as const;

function identityError(code: string, message: string, status: number) {
  return new HttpException({ message, code }, status);
}

@Injectable()
export class UsersRepository {
  constructor(
    private _user: PrismaRepository<'user' | 'userIdentity'>,
    private _transaction: PrismaTransaction
  ) {}

  async switchUserCredentials(currentUserId: string, targetUserId: string) {
    return this._transaction.model.$transaction(async (tx) => {
      const [current, target] = await Promise.all([
        tx.user.findUnique({ where: { id: currentUserId } }),
        tx.user.findUnique({ where: { id: targetUserId } }),
      ]);

      if (!current || !target) {
        throw new Error('User not found');
      }

      const currentCredentials = this.credentials(current);
      const targetCredentials = this.credentials(target);
      const identities = await tx.userIdentity.findMany({
        where: { userId: { in: [current.id, target.id] } },
      });

      // (email, providerName) is unique and checked per statement, so park the
      // current user on a throwaway email before filling the two freed slots.
      await tx.user.update({
        where: { id: current.id },
        data: { email: `switch-${makeId(10)}-${current.email}` },
      });
      await tx.user.update({
        where: { id: target.id },
        data: currentCredentials,
      });
      await tx.user.update({
        where: { id: current.id },
        data: targetCredentials,
      });

      if (identities.length) {
        await tx.userIdentity.deleteMany({
          where: { userId: { in: [current.id, target.id] } },
        });
        await tx.userIdentity.createMany({
          data: identities.map((identity) => ({
            id: identity.id,
            provider: identity.provider,
            providerIdentifier: identity.providerIdentifier,
            linkedAt: identity.linkedAt,
            userId: identity.userId === current.id ? target.id : current.id,
          })),
        });
      }

      // `language` is not part of `credentials()`: it stays with the row, not
      // the login, so the account keeps the language it was already reading
      // in through the switch.
      return {
        kept: {
          id: current.id,
          email: targetCredentials.email,
          language: current.language,
        },
        switched: {
          id: target.id,
          email: currentCredentials.email,
          language: target.language,
        },
      };
    });
  }

  private credentials(user: {
    email: string;
    password: string | null;
    providerName: Provider;
    providerId: string | null;
    account: string | null;
    connectedAccount: boolean;
    activated: boolean;
  }) {
    return {
      email: user.email,
      password: user.password,
      providerName: user.providerName,
      providerId: user.providerId,
      account: user.account,
      connectedAccount: user.connectedAccount,
      activated: user.activated,
    };
  }

  getImpersonateUser(name: string) {
    return this._user.model.user.findMany({
      where: {
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
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 10,
    });
  }

  getUserById(id: string) {
    return this._user.model.user.findFirst({
      where: {
        id,
      },
    });
  }

  listPendingNewsletterDeliveries(limit: number, now: Date) {
    return this._user.model.user.findMany({
      where: {
        newsletterConsentAt: { not: null },
        newsletterConsentSource: { not: null },
        newsletterDeliveryPendingAt: { not: null },
        OR: [
          { newsletterDeliveryLeaseExpiresAt: null },
          { newsletterDeliveryLeaseExpiresAt: { lt: now } },
        ],
      },
      select: {
        id: true,
        newsletterDeliveryPendingAt: true,
      },
      orderBy: [{ newsletterDeliveryPendingAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  claimNewsletterDelivery(
    userId: string,
    pendingAt: Date,
    leaseId: string,
    leaseExpiresAt: Date,
    now: Date
  ) {
    return this._user.model.user.updateMany({
      where: {
        id: userId,
        newsletterConsentAt: { not: null },
        newsletterDeliveryPendingAt: pendingAt,
        OR: [
          { newsletterDeliveryLeaseExpiresAt: null },
          { newsletterDeliveryLeaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        newsletterDeliveryLeaseId: leaseId,
        newsletterDeliveryLeaseExpiresAt: leaseExpiresAt,
      },
    });
  }

  markNewsletterDelivered(userId: string, pendingAt: Date, leaseId: string) {
    return this._user.model.user.updateMany({
      where: {
        id: userId,
        newsletterConsentAt: { not: null },
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: leaseId,
      },
      data: {
        newsletterDeliveryPendingAt: null,
        newsletterDeliveredAt: new Date(),
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });
  }

  clearNewsletterDeliveryPending(
    userId: string,
    pendingAt: Date,
    leaseId: string
  ) {
    return this._user.model.user.updateMany({
      where: {
        id: userId,
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: leaseId,
      },
      data: {
        newsletterDeliveryPendingAt: null,
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });
  }

  releaseNewsletterDeliveryLease(
    userId: string,
    pendingAt: Date,
    leaseId: string
  ) {
    return this._user.model.user.updateMany({
      where: {
        id: userId,
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: leaseId,
      },
      data: {
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });
  }

  async getUserByEmail(email: string) {
    const normalizedEmail = normalizeIdentityIdentifier(Provider.LOCAL, email);
    const identity = await this._user.model.userIdentity.findUnique({
      where: {
        provider_providerIdentifier: {
          provider: Provider.LOCAL,
          providerIdentifier: normalizedEmail,
        },
      },
      include: {
        user: {
          include: {
            picture: {
              select: { id: true, path: true },
            },
          },
        },
      },
    });
    if (identity) return identity.user;

    return this._user.model.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        providerName: Provider.LOCAL,
      },
      include: {
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });
  }

  getUserWithActiveSubscriptionByEmail(email: string, excludeUserId: string) {
    return this._user.model.user.findFirst({
      where: {
        email,
        id: { not: excludeUserId },
        organizations: {
          some: {
            role: Role.SUPERADMIN,
            organization: {
              subscription: { is: { deletedAt: null } },
            },
          },
        },
      },
      select: { id: true, email: true, providerName: true },
    });
  }

  activateUser(id: string) {
    return this._user.model.user.update({
      where: {
        id,
      },
      data: {
        activated: true,
      },
    });
  }

  setTelegramBindingCode(userId: string, code: string, expiresAt: Date) {
    return this._user.model.user.update({
      where: { id: userId },
      data: {
        telegramBindingCode: code,
        telegramBindingCodeExpiresAt: expiresAt,
      },
    });
  }

  getTelegramBindingStatus(userId: string) {
    return this._user.model.user.findFirst({
      where: { id: userId },
      select: { telegramChatId: true },
    });
  }

  deactivateUser(id: string) {
    return this._user.model.user.update({
      where: {
        id,
      },
      data: {
        activated: false,
      },
    });
  }

  /**
   * A declined registration is deliberately narrower than a general account
   * delete. A pending account cannot have used the product, and its workspace
   * is safe to remove only while it belongs to that account alone. Every
   * decision and every delete shares one transaction, so a concurrent invite
   * or a foreign-key refusal leaves both records in place.
   */
  async rejectPendingAccount(id: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this._transaction.model.$transaction(
          async (tx) => {
            const user = await tx.user.findUnique({
              where: { id },
              select: {
                id: true,
                language: true,
                activated: true,
                isSuperAdmin: true,
                organizations: { select: { organizationId: true } },
              },
            });

            if (!user) {
              throw new HttpException('User not found', 404);
            }

            if (user.activated || user.isSuperAdmin) {
              throw new HttpException(
                'Only pending non-admin accounts can be rejected',
                400
              );
            }

            if (user.organizations.length !== 1) {
              throw new HttpException(
                'The pending account does not own one empty organization',
                400
              );
            }

            const organizationId = user.organizations[0].organizationId;
            const members = await tx.userOrganization.findMany({
              where: { organizationId },
              select: { userId: true },
            });

            if (members.length !== 1 || members[0].userId !== user.id) {
              throw new HttpException(
                'A shared organization cannot be deleted',
                400
              );
            }

            const organization = await tx.organization.findFirst({
              where: {
                id: organizationId,
                autoPost: { none: {} },
                Comments: { none: {} },
                credits: { none: {} },
                customers: { none: {} },
                errors: { none: {} },
                github: { none: {} },
                Integration: { none: {} },
                media: { none: {} },
                buyerOrganization: { none: {} },
                notifications: { none: {} },
                plugs: { none: {} },
                post: { none: {} },
                submittedPost: { none: {} },
                sets: { none: {} },
                signatures: { none: {} },
                thirdParty: { none: {} },
                usedCodes: { none: {} },
                webhooks: { none: {} },
                oauthApp: { none: {} },
                oauthAuthorizations: { none: {} },
                aiUsageRecords: { none: {} },
                subscription: { is: null },
                brandProfile: { none: {} },
                brandProfileVersions: { none: {} },
                brandProfileAuditEvents: { none: {} },
                contentSources: { none: {} },
                sourceSyncRuns: { none: {} },
                sourceSnapshots: { none: {} },
                sourceEvidence: { none: {} },
                contentEvidenceAssessments: { none: {} },
                contentFacts: { none: {} },
                contentFactEvidence: { none: {} },
                contentContextSnapshots: { none: {} },
                contentContextItems: { none: {} },
                contentOutputContexts: { none: {} },
                draftEvidence: { none: {} },
                brandVoiceMeasurements: { none: {} },
                brandVoiceSamples: { none: {} },
                brandVoiceEdits: { none: {} },
                contentPieces: { none: {} },
                contentDerivations: { none: {} },
                contentLeadSubscriptions: { none: {} },
                contentLeads: { none: {} },
                productEvents: {
                  every: {
                    name: 'register',
                    userId: user.id,
                    deduplicationKey: `register:${user.id}`,
                  },
                },
                aiProvider: {
                  is: {
                    usageMode: 'included',
                    apiKey: null,
                    textModel: null,
                    imageModel: null,
                    searchEnabled: false,
                    searchApiKey: null,
                  },
                },
              },
              select: {
                tags: { select: { name: true, color: true, deletedAt: true } },
              },
            });

            const locale = resolveBackendLocale(user.language);
            const expectedTags = CONTENT_WORKFLOW_TAGS.map(
              ({ color }, index) => ({
                name: translateBackendString(
                  CONTENT_WORKFLOW_TAG_KEYS[index],
                  locale
                ),
                color,
                deletedAt: null,
              })
            ).sort((a, b) => a.name.localeCompare(b.name));
            const actualTags = organization?.tags
              .map(({ name, color, deletedAt }) => ({
                name,
                color,
                deletedAt: deletedAt ? deletedAt.toISOString() : null,
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (
              !organization ||
              JSON.stringify(actualTags) !== JSON.stringify(expectedTags)
            ) {
              throw new HttpException(
                'The organization is not an empty registration workspace',
                400
              );
            }

            // UserOrganization has no schema cascade. Tags and AiProviderSetting are
            // the registration seed; the query above proves every other direct org
            // relation empty before any mutation, including cascade-backed content.
            await tx.userOrganization.deleteMany({
              where: { userId: user.id, organizationId },
            });
            const deletedUser = await tx.user.deleteMany({
              where: {
                id: user.id,
                activated: false,
                isSuperAdmin: false,
              },
            });
            if (deletedUser.count !== 1) {
              throw new HttpException(
                'The pending account changed before it could be rejected',
                409
              );
            }
            await tx.tags.deleteMany({ where: { orgId: organizationId } });
            await tx.organization.delete({ where: { id: organizationId } });

            return { id: user.id, organizationId };
          },
          { isolationLevel: 'Serializable' }
        );
      } catch (error: any) {
        if (error?.code !== 'P2034') throw error;
        if (attempt === 2) {
          throw new HttpException(
            'The pending account is being changed right now; try again',
            503
          );
        }
      }
    }

    throw new Error('Unreachable pending-account rejection retry state');
  }

  /**
   * Accounts as an administrator needs to see them: who is waiting, who is in,
   * and enough to tell two people apart. Passwords and provider ids stay out
   * of the projection — the page has no use for them.
   */
  listAccounts(params: {
    status: 'pending' | 'active' | 'all';
    search?: string;
    take: number;
    skip: number;
  }) {
    const where = {
      ...(params.status === 'all'
        ? {}
        : { activated: params.status === 'active' }),
      ...(params.search
        ? {
            OR: [
              {
                email: {
                  contains: params.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                name: { contains: params.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    return this._user.model.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        activated: true,
        isSuperAdmin: true,
        providerName: true,
        createdAt: true,
        lastOnline: true,
        organizations: {
          select: {
            role: true,
            organization: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params.take,
      skip: params.skip,
    });
  }

  countAccounts(status: 'pending' | 'active' | 'all') {
    return this._user.model.user.count({
      where: status === 'all' ? {} : { activated: status === 'active' },
    });
  }

  async getUserByProvider(providerId: string, provider: Provider) {
    const providerIdentifier = normalizeIdentityIdentifier(
      provider,
      providerId
    );
    const identity = await this._user.model.userIdentity.findUnique({
      where: {
        provider_providerIdentifier: { provider, providerIdentifier },
      },
      include: { user: true },
    });
    if (identity) return identity.user;

    return this._user.model.user.findFirst({
      where: {
        providerId,
        providerName: provider,
      },
    });
  }

  listIdentities(userId: string) {
    return this._user.model.userIdentity.findMany({
      where: { userId },
      select: IDENTITY_SELECT,
      orderBy: { linkedAt: 'asc' },
    });
  }

  /**
   * The three reasons an address cannot become this account's password login,
   * asked before anything is written and again inside the transaction that
   * writes. Asking early is what lets the caller refuse a confirmation email to
   * an address that could never be accepted; asking again is what makes the
   * refusal true, because twenty minutes pass in between.
   */
  private async assertLocalIdentityAvailable(
    client: any,
    userId: string,
    providerIdentifier: string
  ) {
    // The same question `forgot` and `updatePassword` ask, so the answer cannot
    // drift between them: before the backfill a legacy account says it has a
    // password login through `providerName`, and it must not be handed a second
    // one under a different address.
    if (await this.localSignInExists(client, userId)) {
      throw identityError(
        'password_sign_in_already_connected',
        'This account already has a password sign-in method',
        409
      );
    }

    const existing = await client.userIdentity.findUnique({
      where: {
        provider_providerIdentifier: {
          provider: Provider.LOCAL,
          providerIdentifier,
        },
      },
    });
    if (existing) {
      throw identityError(
        'identity_already_linked',
        'Identity is already linked',
        409
      );
    }

    await this.assertNoLegacyOwner(
      client,
      userId,
      Provider.LOCAL,
      providerIdentifier
    );
  }

  /**
   * During the compatibility window a legacy account may not have its
   * UserIdentity row yet. Refuse to create a row that would win the
   * identity-first lookup and shadow that account's existing login.
   */
  private async assertNoLegacyOwner(
    client: any,
    userId: string,
    provider: Provider,
    providerIdentifier: string
  ) {
    const legacyOwner = await client.user.findFirst({
      where: {
        id: { not: userId },
        providerName: provider,
        ...(provider === Provider.LOCAL
          ? {
              email: {
                equals: providerIdentifier,
                mode: 'insensitive' as const,
              },
            }
          : { providerId: providerIdentifier }),
      },
      select: { id: true },
    });
    if (legacyOwner) {
      throw identityError(
        'identity_already_linked',
        'Identity is already linked',
        409
      );
    }
  }

  /**
   * Whether an address can still be claimed as this account's password login.
   * Read-only: it decides whether a confirmation email is worth sending at all.
   */
  async assertLocalIdentityClaimable(
    userId: string,
    rawProviderIdentifier: string
  ) {
    const providerIdentifier = normalizeIdentityIdentifier(
      Provider.LOCAL,
      rawProviderIdentifier
    );
    if (!providerIdentifier) {
      throw identityError(
        'identity_email_required',
        'Provider identity is required',
        400
      );
    }
    await this.assertLocalIdentityAvailable(
      this._user.model,
      userId,
      providerIdentifier
    );
    return providerIdentifier;
  }

  /**
   * Creates the row. The password arrives already hashed: for LOCAL this is
   * reached only from a confirmed email, and the confirmation record never held
   * the plain password to begin with.
   */
  async linkIdentity(
    userId: string,
    provider: Provider,
    rawProviderIdentifier: string,
    passwordHash?: string
  ) {
    const providerIdentifier = normalizeIdentityIdentifier(
      provider,
      rawProviderIdentifier
    );
    if (!providerIdentifier) {
      throw identityError(
        'identity_email_required',
        'Provider identity is required',
        400
      );
    }
    if (provider === Provider.LOCAL && !passwordHash) {
      throw identityError(
        'identity_password_required',
        'Password is required for LOCAL identity',
        400
      );
    }

    try {
      return await this._transaction.model.$transaction(async (tx) => {
        const existing = await tx.userIdentity.findUnique({
          where: {
            provider_providerIdentifier: { provider, providerIdentifier },
          },
          select: { userId: true, ...IDENTITY_SELECT },
        });
        if (existing && existing.userId !== userId) {
          throw identityError(
            'identity_already_linked',
            'Identity is already linked',
            409
          );
        }
        if (existing) {
          const { userId: _owner, ...identity } = existing;
          return identity;
        }

        if (provider === Provider.LOCAL) {
          await this.assertLocalIdentityAvailable(
            tx,
            userId,
            providerIdentifier
          );
        } else {
          await this.assertNoLegacyOwner(
            tx,
            userId,
            provider,
            providerIdentifier
          );
        }

        const identity = await tx.userIdentity.create({
          data: { userId, provider, providerIdentifier },
          select: IDENTITY_SELECT,
        });
        if (provider === Provider.LOCAL) {
          await tx.user.update({
            where: { id: userId },
            data: { password: passwordHash! },
          });
        }
        return identity;
      });
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      if (error?.code === 'P2002') {
        throw identityError(
          'identity_already_linked',
          'Identity is already linked',
          409
        );
      }
      throw error;
    }
  }

  async unlinkIdentity(
    userId: string,
    provider: Provider,
    rawProviderIdentifier: string
  ) {
    const providerIdentifier = normalizeIdentityIdentifier(
      provider,
      rawProviderIdentifier
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this._transaction.model.$transaction(
          async (tx) => {
            const identity = await tx.userIdentity.findUnique({
              where: {
                provider_providerIdentifier: { provider, providerIdentifier },
              },
            });
            if (!identity || identity.userId !== userId) {
              throw identityError(
                'identity_not_found',
                'Identity not found',
                404
              );
            }

            const count = await tx.userIdentity.count({ where: { userId } });
            if (count <= 1) {
              throw identityError(
                'last_sign_in_method_protected',
                'The last identity cannot be unlinked',
                409
              );
            }

            const [user, replacement] = await Promise.all([
              tx.user.findUnique({ where: { id: userId } }),
              tx.userIdentity.findFirst({
                where: { userId, id: { not: identity.id } },
                orderBy: { linkedAt: 'asc' },
              }),
            ]);
            await tx.userIdentity.delete({ where: { id: identity.id } });

            // Only when the account has no password login left. Clearing it on
            // every LOCAL removal would lock out an account that still has one,
            // and leave `forgot` as the only way back in.
            const remainingLocal =
              provider === Provider.LOCAL
                ? await tx.userIdentity.count({
                    where: { userId, provider: Provider.LOCAL },
                  })
                : 0;
            const removedPrimary =
              !!user &&
              user.providerName === provider &&
              legacyIdentityIdentifier(user) === providerIdentifier;
            const userData = {
              ...(provider === Provider.LOCAL && remainingLocal === 0
                ? { password: null }
                : {}),
              ...(removedPrimary && replacement
                ? {
                    providerName: replacement.provider,
                    providerId:
                      replacement.provider === Provider.LOCAL
                        ? ''
                        : replacement.providerIdentifier,
                    ...(replacement.provider === Provider.LOCAL
                      ? { email: replacement.providerIdentifier }
                      : {}),
                  }
                : {}),
            };
            if (Object.keys(userData).length) {
              await tx.user.update({ where: { id: userId }, data: userData });
            }
            return { success: true };
          },
          { isolationLevel: 'Serializable' }
        );
      } catch (error: any) {
        if (error?.code !== 'P2034') throw error;
        // Three serialization conflicts in a row is contention, not a broken
        // request. Saying so as 503 is better than letting a raw Prisma code
        // surface as an unexplained 500.
        if (attempt === 2) {
          throw identityError(
            'sign_in_method_busy',
            'Sign-in methods are being changed right now; try again',
            503
          );
        }
      }
    }

    throw new Error('Unreachable identity unlink retry state');
  }

  /**
   * Whether this account can sign in with a password at all. Before the
   * backfill runs there are no identity rows, so a legacy account still says so
   * through `providerName`; after it, the identity row is the answer.
   */
  private async localSignInExists(client: any, userId: string) {
    const localIdentity = await client.userIdentity.findFirst({
      where: { userId, provider: Provider.LOCAL },
    });
    if (localIdentity) return true;

    const legacyUser = await client.user.findUnique({
      where: { id: userId },
      select: { providerName: true },
    });
    return legacyUser?.providerName === Provider.LOCAL;
  }

  hasLocalSignIn(userId: string) {
    return this.localSignInExists(this._user.model, userId);
  }

  updatePassword(id: string, password: string) {
    return this._transaction.model.$transaction(async (tx) => {
      if (!(await this.localSignInExists(tx, id))) {
        throw identityError(
          'local_identity_not_found',
          'LOCAL identity not found',
          404
        );
      }
      return tx.user.update({
        where: { id },
        data: { password: AuthService.hashPassword(password) },
      });
    });
  }

  changeAudienceSize(userId: string, audience: number) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        audience,
      },
    });
  }

  async getPersonal(userId: string) {
    const user = await this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        bio: true,
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });

    return user;
  }

  async changePersonal(userId: string, body: UserDetailDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        name: body.fullname,
        bio: body.bio,
        picture: body.picture
          ? {
              connect: {
                id: body.picture.id,
              },
            }
          : {
              disconnect: true,
            },
      },
    });
  }

  async getEmailNotifications(userId: string) {
    return this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        sendSuccessEmails: true,
        sendFailureEmails: true,
        sendStreakEmails: true,
      },
    });
  }

  async updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        sendSuccessEmails: body.sendSuccessEmails,
        sendFailureEmails: body.sendFailureEmails,
        sendStreakEmails: body.sendStreakEmails,
      },
    });
  }
}
