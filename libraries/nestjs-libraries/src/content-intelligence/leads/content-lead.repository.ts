import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { ContentLeadError } from './errors';

type PrismaClientLike = Record<string, any>;

function subscriptionNotFound(): never {
  throw new ContentLeadError(
    'SUBSCRIPTION_NOT_FOUND',
    'Subscription was not found',
    404
  );
}

function leadNotFound(): never {
  throw new ContentLeadError('LEAD_NOT_FOUND', 'Lead was not found', 404);
}

const monthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

@Injectable()
export class ContentLeadRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly transaction: PrismaTransaction
  ) {}

  private client() {
    return this.repository.model as PrismaClientLike;
  }

  async createSubscription(
    organizationId: string,
    actorUserId: string,
    input: {
      kind: string;
      displayName: string;
      canonicalUrl: string;
      checkIntervalMinutes: number;
      linkedAutoPostId?: string | null;
    }
  ) {
    try {
      return await this.client().contentLeadSubscription.create({
        data: {
          organizationId,
          kind: input.kind,
          displayName: input.displayName,
          canonicalUrl: input.canonicalUrl,
          checkIntervalMinutes: input.checkIntervalMinutes,
          linkedAutoPostId: input.linkedAutoPostId || null,
          createdByUserId: actorUserId,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ContentLeadError(
          'SUBSCRIPTION_CONFLICT',
          'This address is already subscribed',
          409
        );
      }
      throw error;
    }
  }

  async listSubscriptions(organizationId: string, now: Date) {
    const since = monthStart(now);
    const subscriptions = await this.client().contentLeadSubscription.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        linkedAutoPost: { select: { id: true, title: true, active: true } },
      },
    });
    if (!subscriptions.length) return [];
    const ids = subscriptions.map((row: any) => row.id);
    const [monthCounts, acceptedCounts] = await Promise.all([
      this.client().contentLead.groupBy({
        by: ['subscriptionId'],
        where: { organizationId, subscriptionId: { in: ids }, observedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.client().contentLead.groupBy({
        by: ['subscriptionId'],
        where: {
          organizationId,
          subscriptionId: { in: ids },
          status: 'ACCEPTED',
          acceptedAt: { gte: since },
        },
        _count: { _all: true },
      }),
    ]);
    const monthById = new Map(
      monthCounts.map((row: any) => [row.subscriptionId, row._count._all])
    );
    const acceptedById = new Map(
      acceptedCounts.map((row: any) => [row.subscriptionId, row._count._all])
    );
    return subscriptions.map((row: any) => ({
      ...row,
      leadsThisMonth: monthById.get(row.id) ?? 0,
      acceptedThisMonth: acceptedById.get(row.id) ?? 0,
    }));
  }

  async getSubscription(organizationId: string, id: string) {
    const subscription = await this.client().contentLeadSubscription.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
    if (!subscription) subscriptionNotFound();
    return subscription;
  }

  async recordCheckResult(
    organizationId: string,
    id: string,
    data: { state: string; lastErrorCode: string | null; lastCheckedAt: Date }
  ) {
    const changed = await this.client().contentLeadSubscription.updateMany({
      where: { organizationId, id, deletedAt: null },
      data,
    });
    if (changed.count !== 1) subscriptionNotFound();
  }

  async archiveSubscription(organizationId: string, id: string, now: Date) {
    const changed = await this.client().contentLeadSubscription.updateMany({
      where: { organizationId, id, deletedAt: null },
      data: { deletedAt: now, state: 'PAUSED' },
    });
    if (changed.count !== 1) subscriptionNotFound();
  }

  /**
   * The one call the dismissal memory rests on.
   *
   * `skipDuplicates` means a row already on `(organizationId, subscriptionId,
   * externalId)` is left exactly as it is — its `status`, whatever a person
   * already set it to, is never touched by a check that happens to see the
   * same item again. Only genuinely new items get a new row, and every new
   * row starts `NEW`, which the column default already guarantees without
   * this call naming it.
   */
  async upsertLeads(
    organizationId: string,
    subscriptionId: string,
    items: Array<{
      externalId: string;
      title: string;
      excerpt: string | null;
      sourceUrl: string;
      publishedAt: Date | null;
      reasonRu: string;
      reasonEn: string;
    }>
  ) {
    if (!items.length) return { created: 0 };
    const result = await this.client().contentLead.createMany({
      data: items.map((item) => ({
        organizationId,
        subscriptionId,
        externalId: item.externalId,
        title: item.title,
        excerpt: item.excerpt,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        reasonRu: item.reasonRu,
        reasonEn: item.reasonEn,
      })),
      skipDuplicates: true,
    });
    return { created: result.count ?? 0 };
  }

  async listLeads(
    organizationId: string,
    filter: { status?: string; subscriptionId?: string }
  ) {
    return this.client().contentLead.findMany({
      where: {
        organizationId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
      },
      orderBy: [{ observedAt: 'desc' }],
      take: 200,
      include: {
        subscription: { select: { id: true, displayName: true, kind: true } },
      },
    });
  }

  async getLead(organizationId: string, leadId: string) {
    const lead = await this.client().contentLead.findFirst({
      where: { organizationId, id: leadId },
      include: {
        subscription: { select: { id: true, displayName: true, kind: true } },
      },
    });
    if (!lead) leadNotFound();
    return lead;
  }

  async dismissLead(
    organizationId: string,
    leadId: string,
    actorUserId: string,
    now: Date
  ) {
    const changed = await this.client().contentLead.updateMany({
      where: { organizationId, id: leadId, status: 'NEW' },
      data: { status: 'DISMISSED', dismissedAt: now, dismissedByUserId: actorUserId },
    });
    if (changed.count !== 1) {
      const existing = await this.client().contentLead.findFirst({
        where: { organizationId, id: leadId },
        select: { id: true, status: true },
      });
      if (!existing) leadNotFound();
      if (existing.status === 'DISMISSED') {
        // Already dismissed — the memory this action exists to create is
        // already in place, so a repeated call is a no-op, not a conflict.
        return this.getLead(organizationId, leadId);
      }
      throw new ContentLeadError(
        'LEAD_NOT_NEW',
        'Only a new lead can be declined',
        409
      );
    }
    return this.getLead(organizationId, leadId);
  }

  async acceptLead(
    organizationId: string,
    leadId: string,
    actorUserId: string,
    now: Date
  ) {
    const changed = await this.client().contentLead.updateMany({
      where: { organizationId, id: leadId, status: 'NEW' },
      data: { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: actorUserId },
    });
    if (changed.count !== 1) {
      const existing = await this.client().contentLead.findFirst({
        where: { organizationId, id: leadId },
        select: { id: true, status: true },
      });
      if (!existing) leadNotFound();
      if (existing.status === 'ACCEPTED') return this.getLead(organizationId, leadId);
      throw new ContentLeadError(
        'LEAD_NOT_NEW',
        'Only a new lead can be taken to work',
        409
      );
    }
    return this.getLead(organizationId, leadId);
  }

  /** For "this address already drafts on its own" — read-only, never writes AutoPost. */
  async listActiveAutoPosts(organizationId: string) {
    return this.client().autoPost.findMany({
      where: { organizationId, deletedAt: null, active: true },
      select: { id: true, title: true, url: true },
      orderBy: [{ title: 'asc' }],
    });
  }

  async getAutoPost(organizationId: string, id: string) {
    const autopost = await this.client().autoPost.findFirst({
      where: { organizationId, id, deletedAt: null },
      select: { id: true },
    });
    if (!autopost) {
      throw new ContentLeadError(
        'AUTOPOST_NOT_FOUND',
        'AutoPost was not found',
        404
      );
    }
    return autopost;
  }
}
