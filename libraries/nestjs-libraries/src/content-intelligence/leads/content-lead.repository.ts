import { canonicalizeSourceUrl } from '../source-registry/network-policy';
import { assertLeadSourceRefs, readLeadSourceRefs, mergeLeadSourceRefs, type LeadSourceRefsV1 } from './lead-source-refs';
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
      /**
       * What the row is unique on. An address for a feed; the synthetic
       * `topic://<slug>` key for a topic (`lead-topic-key.ts`) — the service
       * derives it, this call only stores it.
       */
      canonicalUrl: string;
      /** The topic as typed, for `TOPIC` rows; `null` for every other kind. */
      query?: string | null;
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
          query: input.query ?? null,
          checkIntervalMinutes: input.checkIntervalMinutes,
          linkedAutoPostId: input.linkedAutoPostId || null,
          createdByUserId: actorUserId,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // The index behind both sentences is the same
        // `(organizationId, kind, canonicalUrl)`; only the word for what was
        // already taken differs, and a person who typed a topic never saw an
        // address to be told about.
        throw new ContentLeadError(
          'SUBSCRIPTION_CONFLICT',
          input.kind === 'TOPIC'
            ? 'This topic is already watched'
            : 'This address is already subscribed',
          409
        );
      }
      throw error;
    }
  }

  /**
   * How many live subscriptions the workspace holds
   * (`content-factory-next-ni7x`). Archived rows carry `deletedAt` and do
   * not count — unsubscribing is how a workspace makes room, so a row that
   * no longer ticks must not keep a slot.
   */
  async countSubscriptions(organizationId: string) {
    return this.client().contentLeadSubscription.count({
      where: { organizationId, deletedAt: null },
    });
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

  /**
   * The row on the unique key `(organizationId, kind, canonicalUrl)`,
   * archived or not (review W4-23 F3): what a new subscription to the same
   * thing would collide with.
   */
  async findSubscriptionByKey(organizationId: string, kind: string, canonicalUrl: string) {
    return this.client().contentLeadSubscription.findFirst({
      where: { organizationId, kind, canonicalUrl },
    });
  }

  /** One subscription of the workspace, archived or not (review W4-23 F9). */
  async findSubscriptionAnyState(organizationId: string, id: string) {
    return this.client().contentLeadSubscription.findFirst({
      where: { organizationId, id },
      select: { id: true },
    });
  }

  /**
   * Brings an archived subscription back as a new one (review W4-23 F3): live,
   * `ACTIVE`, no last problem, with the name, topic and schedule of the new
   * request. Only an archived row is revived; `null` when it no longer is.
   */
  async reviveSubscription(
    organizationId: string,
    id: string,
    data: {
      displayName: string;
      query: string | null;
      checkIntervalMinutes: number;
      linkedAutoPostId: string | null;
    }
  ) {
    const changed = await this.client().contentLeadSubscription.updateMany({
      where: { organizationId, id, deletedAt: { not: null } },
      data: { ...data, deletedAt: null, state: 'ACTIVE', lastErrorCode: null },
    });
    if (changed.count !== 1) return null;
    return this.client().contentLeadSubscription.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
  }

  async getSubscription(organizationId: string, id: string) {
    const subscription = await this.client().contentLeadSubscription.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
    if (!subscription) subscriptionNotFound();
    return subscription;
  }

  /**
   * `lastCheckedAt` is optional on purpose (content-factory-next-fn33.52).
   * It is the date the subscription row shows as «заглядывали <дата>», so
   * only a call that actually opened the feed passes it; a refused check
   * omits it and the previous value — often "never" — stays as it was.
   * Omitting the key leaves the column out of the `updateMany` data
   * entirely, which is what keeps the old value.
   */
  async recordCheckResult(
    organizationId: string,
    id: string,
    data: { state: string; lastErrorCode: string | null; lastCheckedAt?: Date }
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

  /** Same-tenant URL overlap remembers decisions while sources accumulate. */
  async upsertStoryLeads(
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
      sourceRefsJson: LeadSourceRefsV1;
    }>
  ) {
    if (!items.length) return { created: 0 };
    // Validate the whole batch before opening a write transaction.
    const checked = items.map((item) => ({
      ...item,
      sourceRefsJson: assertLeadSourceRefs(item.sourceRefsJson),
    }));
    const canonical = (url: string) => {
      try {
        return canonicalizeSourceUrl(url);
      } catch {
        return url;
      }
    };
    for (const item of checked) {
      if (
        !item.sourceRefsJson.sources.some(
          (source) => canonical(source.url) === canonical(item.sourceUrl)
        ) ||
        item.sourceRefsJson.sources.some(
          (source) =>
            source.canonicalUrl !== null &&
            canonical(source.url) !== source.canonicalUrl
        )
      )
        throw new Error('INVALID_LEAD_SOURCE_REFS');
    }
    const storedRefs = (row: any): LeadSourceRefsV1 =>
      readLeadSourceRefs(row.sourceRefsJson) || {
        version: 1,
        sources: [
          {
            url: row.sourceUrl,
            canonicalUrl: canonical(row.sourceUrl),
            primaryStatus: 'UNKNOWN',
          },
        ],
        attributions: [],
        truncated: false,
      };
    for (let attempt = 0; ; attempt++) {
      try {
        return await (this.transaction.model as any).$transaction(
          async (database: any) => {
            let created = 0;
            // One same-tenant projection per transaction attempt. Include all
            // historic URL variants; a row limit would miss overlap evidence.
            const rows = await database.contentLead.findMany({
              where: { organizationId, subscriptionId },
              select: { id: true, externalId: true, sourceUrl: true, sourceRefsJson: true },
            });
            for (const item of checked) {
              const urls = new Set(
                item.sourceRefsJson.sources.map((source) =>
                  canonical(source.canonicalUrl || source.url)
                )
              );
              const matches = rows.filter(
                (row: any) =>
                  row.externalId === item.externalId ||
                  storedRefs(row).sources.some((source) =>
                    urls.has(canonical(source.canonicalUrl || source.url))
                  )
              );
              if (matches.length > 1)
                throw new ContentLeadError(
                  'LEAD_NOT_NEW',
                  'Story overlaps several saved leads; existing decisions were preserved',
                  409
                );
              const existing = matches[0];
              const sourceRefsJson = existing
                ? mergeLeadSourceRefs(storedRefs(existing), item.sourceRefsJson)
                : item.sourceRefsJson;
              const primary = sourceRefsJson.sources.find(
                (source) => source.primaryStatus === 'VERIFIED_PRIMARY'
              );
              const data = {
                title: item.title,
                excerpt: item.excerpt,
                sourceUrl: primary?.url || item.sourceUrl,
                publishedAt: item.publishedAt,
                reasonRu: item.reasonRu,
                reasonEn: item.reasonEn,
                sourceRefsJson,
              };
              if (existing) {
                const changed = await database.contentLead.updateMany({
                  where: {
                    organizationId, subscriptionId,
                    ...(existing.id ? { id: existing.id } : { externalId: existing.externalId }),
                  },
                  data,
                });
                if (changed.count !== 1) leadNotFound();
                Object.assign(existing, { sourceUrl: data.sourceUrl, sourceRefsJson });
              } else {
                const result = await database.contentLead.createMany({
                  data: [
                    {
                      organizationId,
                      subscriptionId,
                      externalId: item.externalId,
                      ...data,
                    },
                  ],
                  skipDuplicates: true,
                });
                if (result.count !== 1) throw new Error('LEAD_STORY_WRITE_CONFLICT');
                created += result.count;
                // createMany returns no generated id. The unique tenant /
                // subscription / externalId key addresses this new row when
                // a later item in this batch overlaps its accumulated URLs.
                rows.push({ externalId: item.externalId, sourceUrl: data.sourceUrl, sourceRefsJson });
              }
            }
            return { created };
          },
          { isolationLevel: 'Serializable' }
        );
      } catch (error: any) {
        if (error?.code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
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

  /**
   * «Не надо» for several leads at once (`kcxz.45`): all or nothing, in one
   * transaction. Every id must be a lead of the workspace; one already
   * declined is a no-op, as `dismissLead` treats it; one taken to work refuses
   * the whole batch. The new ones change in one `updateMany` filtered on
   * `NEW`, and a count short of them — a lead taken on the screen between the
   * read and the write — rolls the transaction back.
   */
  async dismissLeads(
    organizationId: string,
    leadIds: readonly string[],
    actorUserId: string,
    now: Date
  ): Promise<{ dismissed: string[]; alreadyDismissed: string[] }> {
    return (this.transaction.model as any).$transaction(async (database: any) => {
      const rows = (await database.contentLead.findMany({
        where: { organizationId, id: { in: [...leadIds] } },
        select: { id: true, status: true },
      })) as Array<{ id: string; status: string }>;
      const byId = new Map(rows.map((row) => [row.id, row.status]));
      if (leadIds.some((id) => !byId.has(id))) leadNotFound();
      if (leadIds.some((id) => byId.get(id) !== 'NEW' && byId.get(id) !== 'DISMISSED')) {
        throw new ContentLeadError('LEAD_NOT_NEW', 'Only a new lead can be declined', 409);
      }
      const fresh = leadIds.filter((id) => byId.get(id) === 'NEW');
      if (fresh.length) {
        const changed = await database.contentLead.updateMany({
          where: { organizationId, id: { in: fresh }, status: 'NEW' },
          data: { status: 'DISMISSED', dismissedAt: now, dismissedByUserId: actorUserId },
        });
        if (changed.count !== fresh.length) {
          throw new ContentLeadError('LEAD_NOT_NEW', 'Only a new lead can be declined', 409);
        }
      }
      return {
        dismissed: fresh,
        alreadyDismissed: leadIds.filter((id) => byId.get(id) === 'DISMISSED'),
      };
    });
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
