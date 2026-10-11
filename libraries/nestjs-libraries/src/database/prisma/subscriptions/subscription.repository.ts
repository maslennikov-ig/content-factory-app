import { HttpException, Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import dayjs from 'dayjs';
import { Organization, Prisma } from '@prisma/client';

export type InheritedCreditAllowance = {
  from: Date;
  limit: number;
};

/** A concurrent admission spent the allowance after the door's preview read. */
class CreditAllowanceExceeded extends HttpException {
  constructor() {
    super('Media generation allowance exhausted', 402);
  }
}

@Injectable()
export class SubscriptionRepository {
  constructor(
    private readonly _subscription: PrismaRepository<'subscription'>,
    private readonly _organization: PrismaRepository<'organization'>,
    private readonly _user: PrismaRepository<'user'>,
    private readonly _credits: PrismaRepository<'credits'>,
    private _usedCodes: PrismaRepository<'usedCodes'>,
    private readonly _transaction: PrismaTransaction
  ) {}

  getUserAccount(userId: string) {
    return this._user.model.user.findFirst({
      where: {
        id: userId,
      },
      select: {
        account: true,
        connectedAccount: true,
      },
    });
  }

  getCode(code: string) {
    return this._usedCodes.model.usedCodes.findFirst({
      where: {
        code,
      },
    });
  }

  updateAccount(userId: string, account: string) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        account,
      },
    });
  }

  getSubscriptionByOrganizationId(organizationId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
  }

  /**
   * The subscription as the web request's organization carries it
   * (`OrganizationRepository.getOrgsByUserId`'s include): the same row, the
   * same fields, no `deletedAt` filter — a caller that holds only the
   * workspace id (the agent chat) reads the credits rule's tier and window
   * exactly as the door does (review W4-25 F8).
   */
  getSubscriptionAsOrganizationCarries(organizationId: string) {
    return this._subscription.model.subscription.findUnique({
      where: {
        organizationId,
      },
      select: {
        subscriptionTier: true,
        totalChannels: true,
        isLifetime: true,
        createdAt: true,
      },
    });
  }

  updateConnectedStatus(account: string, accountCharges: boolean) {
    return this._user.model.user.updateMany({
      where: {
        account,
      },
      data: {
        connectedAccount: accountCharges,
      },
    });
  }

  getCustomerIdByOrgId(organizationId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        id: organizationId,
      },
      select: {
        paymentId: true,
      },
    });
  }

  checkSubscription(organizationId: string, subscriptionId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        identifier: subscriptionId,
        deletedAt: null,
      },
    });
  }

  deleteSubscriptionByCustomerId(customerId: string) {
    return this._subscription.model.subscription.deleteMany({
      where: {
        organization: {
          paymentId: customerId,
        },
      },
    });
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._organization.model.organization.update({
      where: {
        id: organizationId,
      },
      data: {
        paymentId: customerId,
      },
    });
  }

  async getSubscriptionByOrgId(orgId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId: orgId,
      },
    });
  }

  async getSubscriptionByCustomerId(customerId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organization: {
          paymentId: customerId,
        },
      },
    });
  }

  async getOrganizationByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async createOrUpdateSubscription(
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    totalChannels: number,
    billing: 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE',
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: { id: string }
  ) {
    const findOrg =
      org || (await this.getOrganizationByCustomerId(customerId))!;

    if (!findOrg) {
      return;
    }

    await this._subscription.model.subscription.upsert({
      where: {
        organizationId: findOrg.id,
        ...(!code
          ? {
              organization: {
                paymentId: customerId,
              },
            }
          : {}),
      },
      update: {
        subscriptionTier: billing,
        totalChannels,
        period,
        identifier,
        isLifetime: !!code,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        deletedAt: null,
      },
      create: {
        organizationId: findOrg.id,
        subscriptionTier: billing,
        isLifetime: !!code,
        totalChannels,
        period,
        cancelAt: cancelAt ? new Date(cancelAt * 1000) : null,
        identifier,
        deletedAt: null,
      },
    });

    await this._organization.model.organization.update({
      where: {
        id: findOrg.id,
      },
      data: {
        isTrailing,
        allowTrial: false,
      },
    });

    if (code) {
      await this._usedCodes.model.usedCodes.create({
        data: {
          code,
          orgId: findOrg.id,
        },
      });
    }
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        identifier,
        deletedAt: null,
      },
      include: {
        organization: true,
      },
    });
  }

  getSubscription(organizationId: string) {
    return this._subscription.model.subscription.findFirst({
      where: {
        organizationId,
        deletedAt: null,
      },
    });
  }

  async getCreditsFrom(
    organizationId: string,
    from: dayjs.Dayjs,
    type = 'ai_images'
  ) {
    const load = await this._credits.model.credits.groupBy({
      by: ['organizationId'],
      where: {
        organizationId,
        type,
        createdAt: {
          gte: from.toDate(),
        },
      },
      _sum: {
        credits: true,
      },
    });

    return load?.[0]?._sum?.credits || 0;
  }

  async useCredit<T>(
    org: Organization,
    type = 'ai_images',
    func: () => Promise<T>,
    allowance?: InheritedCreditAllowance
  ) {
    const data = await this.reserveCredit(org.id, type, allowance);

    try {
      return await func();
    } catch (err) {
      await this._credits.model.credits.delete({
        where: {
          id: data.id,
        },
      });
      throw err;
    }
  }

  /** Only admission is retried; the provider runs after this transaction commits. */
  private async reserveCredit(
    organizationId: string,
    type: string,
    allowance?: InheritedCreditAllowance
  ) {
    const data = { organizationId, credits: 1, type };
    // Unbilled image generation has always counted without an inherited limit.
    if (!allowance) return this._credits.model.credits.create({ data });
    if (allowance.limit <= 0) throw new CreditAllowanceExceeded();

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this._transaction.model.$transaction(
          async (tx) => {
            const load = await tx.credits.groupBy({
              by: ['organizationId'],
              where: {
                organizationId,
                type,
                createdAt: { gte: allowance.from },
              },
              _sum: { credits: true },
            });
            const used = load?.[0]?._sum?.credits || 0;
            if (used >= allowance.limit) throw new CreditAllowanceExceeded();
            return tx.credits.create({ data });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 1_000,
            timeout: 2_000,
          }
        );
      } catch (error) {
        // PostgreSQL may reject one overlapping count-and-insert. Re-read its
        // allowance in a new transaction, at most three attempts, never by
        // replaying external work. A quota refusal or another DB error is final.
        if ((error as { code?: string })?.code !== 'P2034' || attempt >= 2) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.floor(Math.random() * 25 * 2 ** attempt))
        );
      }
    }
  }

  setCustomerId(orgId: string, customerId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        paymentId: customerId,
      },
    });
  }
}
