import { Injectable, Logger, Optional } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId as organizationSearchAttribute } from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';
import { canonicalizeSourceUrl } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/network-policy';
import { SourceRegistryError } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/errors';
import { ContentLeadRepository } from './content-lead.repository';
import { LeadFeedGateway } from './lead-feed.gateway';
import { leadReason } from './lead-reason';
import { ContentLeadError } from './errors';

const workflowIdFor = (subscriptionId: string) =>
  `content-lead-check-${subscriptionId}`;

function presentSubscription(row: any) {
  return {
    id: row.id,
    kind: row.kind,
    displayName: row.displayName,
    canonicalUrl: row.canonicalUrl,
    state: row.state,
    checkIntervalMinutes: row.checkIntervalMinutes,
    lastCheckedAt: row.lastCheckedAt,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
    leadsThisMonth: row.leadsThisMonth ?? 0,
    acceptedThisMonth: row.acceptedThisMonth ?? 0,
    linkedAutoPost: row.linkedAutoPost
      ? {
          id: row.linkedAutoPost.id,
          title: row.linkedAutoPost.title,
          active: row.linkedAutoPost.active,
        }
      : null,
  };
}

function presentLead(row: any) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    subscriptionName: row.subscription?.displayName ?? null,
    title: row.title,
    excerpt: row.excerpt,
    sourceUrl: row.sourceUrl,
    publishedAt: row.publishedAt,
    observedAt: row.observedAt,
    reasonRu: row.reasonRu,
    reasonEn: row.reasonEn,
    status: row.status,
    dismissedAt: row.dismissedAt,
    acceptedAt: row.acceptedAt,
  };
}

/**
 * «Откуда идеи» — a subscription checked on a schedule, and the leads it
 * brought back.
 *
 * `content-factory-next-odb8.3`. `docs/product/content-section-map.md` §1 и §2
 * names the two facts this module exists because of: the topic radar
 * (`content-brief.radar.ts`) never looked at a source, and `AutoPost`
 * generates a full draft on its own hourly workflow without ever showing a
 * person the item it drafted from. This module produces a *reason to write*,
 * shown before anything is generated, and remembers a decline the way
 * `AutoPost` never had to — see `ContentLeadRepository.upsertLeads`.
 *
 * AutoPost втягивание (owner's brief, §"Что построить"): not a merge. Nothing
 * here calls `AutopostService`, edits an `AutoPost` row or changes the
 * `autoPostDraftV2Workflow` a running AutoPost already depends on — that
 * workflow is explicitly off limits to mutate. What is pulled in is one
 * pointer: `ContentLeadSubscription.linkedAutoPostId`, set when a person
 * creates a subscription for an address that already has an active AutoPost,
 * so the list reads "this already drafts on its own" instead of showing the
 * same feed twice under two names that do not know about each other. Full
 * unification — AutoPost's own draft becoming "auto-accept every lead from
 * this subscription" — would mean moving a production workflow's trigger and
 * is left for its own task; see the report for what that would take.
 *
 * The owner's open question — whether an accepted lead becomes material a
 * brief can cite as evidence — is deliberately unanswered here. `acceptLead`
 * marks the lead `ACCEPTED` and returns a brief prefill; it creates no
 * `SourceEvidence`, no `ContentFact`, nothing `content-brief.service.ts`'s
 * grounding check would ever see.
 */
@Injectable()
export class ContentLeadService {
  private readonly logger = new Logger(ContentLeadService.name);

  constructor(
    private readonly repository: ContentLeadRepository,
    private readonly gateway: LeadFeedGateway,
    @Optional() private readonly temporal?: TemporalService,
    @Optional() private readonly now: () => Date = () => new Date()
  ) {}

  get feedCheckEnabled(): boolean {
    return this.gateway.capabilityEnabled;
  }

  private async startPeriodicCheck(
    organizationId: string,
    subscriptionId: string,
    checkIntervalMinutes: number
  ) {
    try {
      const client = this.temporal?.client.getRawClient();
      if (!client) return;
      await client.workflow.start('contentLeadCheckWorkflow', {
        workflowId: workflowIdFor(subscriptionId),
        taskQueue: 'main',
        args: [{ organizationId, subscriptionId, checkIntervalMinutes }],
        // A start against an id that is already Running just attaches to
        // it — cheap and idempotent, which is what lets the manual check
        // path call this again as a recovery, not only `createSubscription`.
        workflowIdConflictPolicy: 'USE_EXISTING',
        typedSearchAttributes: new TypedSearchAttributes([
          { key: organizationSearchAttribute, value: organizationId },
        ]),
      });
    } catch (error) {
      // Best-effort: the manual "Проверить сейчас" route and the guarded
      // dismissal memory do not depend on Temporal being reachable, and a
      // workspace whose periodic check failed to schedule still has a
      // usable subscription — it just has to be checked by hand until the
      // next create or resume tries again.
      this.logger.warn(
        `Could not start the periodic check for subscription ${subscriptionId}: ${
          (error as Error)?.message
        }`
      );
    }
  }

  private async stopPeriodicCheck(subscriptionId: string) {
    try {
      await this.temporal?.terminateWorkflow(workflowIdFor(subscriptionId));
    } catch {
      // Nothing was running, or Temporal is unreachable — either way there
      // is nothing left to terminate that this call needs to report.
    }
  }

  async listSubscriptions(organizationId: string) {
    const rows = await this.repository.listSubscriptions(
      organizationId,
      this.now()
    );
    return {
      subscriptions: rows.map(presentSubscription),
      capabilities: { feedCheck: this.feedCheckEnabled },
    };
  }

  async listAutoPostsToLink(organizationId: string) {
    return this.repository.listActiveAutoPosts(organizationId);
  }

  async createSubscription(
    organizationId: string,
    actorUserId: string,
    input: {
      kind: 'RSS';
      displayName: string;
      canonicalUrl: string;
      checkIntervalMinutes?: number;
      linkedAutoPostId?: string;
    }
  ) {
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new ContentLeadError(
        'INVALID_URL',
        'A subscription needs a name',
        422
      );
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeSourceUrl(input.canonicalUrl);
    } catch (error) {
      if (error instanceof SourceRegistryError) {
        throw new ContentLeadError('INVALID_URL', error.message, error.status);
      }
      throw error;
    }
    if (input.linkedAutoPostId) {
      await this.repository.getAutoPost(organizationId, input.linkedAutoPostId);
    }
    const checkIntervalMinutes = input.checkIntervalMinutes ?? 1440;
    const subscription = await this.repository.createSubscription(
      organizationId,
      actorUserId,
      {
        kind: input.kind,
        displayName,
        canonicalUrl,
        checkIntervalMinutes,
        linkedAutoPostId: input.linkedAutoPostId || null,
      }
    );
    await this.startPeriodicCheck(
      organizationId,
      subscription.id,
      checkIntervalMinutes
    );
    return presentSubscription({ ...subscription, leadsThisMonth: 0, acceptedThisMonth: 0 });
  }

  async archiveSubscription(organizationId: string, id: string) {
    await this.repository.archiveSubscription(organizationId, id, this.now());
    await this.stopPeriodicCheck(id);
    return { archived: true };
  }

  /**
   * "Проверить сейчас" and the periodic workflow's own tick both call this.
   * `ensurePeriodicCheck` is only ever passed by the manual "Проверить
   * сейчас" route (`ContentLeadController.check`): if the periodic
   * workflow failed to start when the subscription was created — Temporal
   * unreachable at that moment — nothing else ever retried starting it, and
   * `ContentLeadRepository.setState` sat there unused as the only trace that
   * a recovery path was meant to exist. A person clicking "check now"
   * doubles as that recovery, via the same idempotent
   * `workflowIdConflictPolicy: 'USE_EXISTING'` `startPeriodicCheck` already
   * uses. Left at its default (`false`), the periodic workflow's own tick —
   * which calls this with no options — does not pay for an extra Temporal
   * round trip every interval.
   *
   * Not a source-registry sync: nothing here writes a `SourceSnapshot` or
   * `SourceEvidence`. A feed item becomes a `ContentLead` row, or — if the
   * item's `externalId` already has one from an earlier check — it becomes
   * nothing at all, whatever that earlier row's `status` now reads.
   */
  async checkSubscription(
    organizationId: string,
    subscriptionId: string,
    options: { ensurePeriodicCheck?: boolean } = {}
  ) {
    const subscription = await this.repository.getSubscription(
      organizationId,
      subscriptionId
    );
    const now = this.now();

    // `schema.prisma`'s own comment on `ContentLeadSubscription.state`: "A
    // row stays ACTIVE through an ordinary failed check — the check retries
    // on its own schedule — so ERRORED means the last attempt itself
    // failed, not that the subscription stopped trying." Only a state that
    // is neither of those — PAUSED is the one this schema declares — means
    // "do not check". Treating ERRORED the same as PAUSED here would make
    // the very first transient failure permanent: nothing else in this
    // service ever moves a live row back to ACTIVE, so a check that never
    // runs again could never recover it.
    if (subscription.state !== 'ACTIVE' && subscription.state !== 'ERRORED') {
      return { checked: false, reason: 'NOT_ACTIVE', created: 0 };
    }

    if (options.ensurePeriodicCheck) {
      await this.startPeriodicCheck(
        organizationId,
        subscriptionId,
        subscription.checkIntervalMinutes
      );
    }

    if (!this.feedCheckEnabled) {
      await this.repository.recordCheckResult(organizationId, subscriptionId, {
        state: subscription.state,
        lastErrorCode: 'CHECK_DISABLED',
        lastCheckedAt: now,
      });
      return { checked: false, reason: 'CHECK_DISABLED', created: 0 };
    }

    try {
      const result = await this.gateway.check(
        subscription.canonicalUrl,
        subscription.kind as 'RSS'
      );
      if (result.disabled) {
        await this.repository.recordCheckResult(organizationId, subscriptionId, {
          state: subscription.state,
          lastErrorCode: 'CHECK_DISABLED',
          lastCheckedAt: now,
        });
        return { checked: false, reason: 'CHECK_DISABLED', created: 0 };
      }

      // Every new title this pass, across the workspace's other subscriptions
      // too — `lead-reason.ts`'s "repeated across subscriptions" rule reads
      // this workspace-wide, not just within one feed.
      const [otherNewLeads, recentOwnPosts] = await Promise.all([
        this.repository.listLeads(organizationId, { status: 'NEW' }),
        Promise.resolve([] as string[]),
      ]);
      const siblingTitles = otherNewLeads
        .filter((row: any) => row.subscriptionId !== subscriptionId)
        .map((row: any) => row.title);

      const items = result.items.map((item) => {
        const reason = leadReason({
          title: item.title,
          excerpt: item.excerpt,
          subscriptionDisplayName: subscription.displayName,
          ownPostsText: recentOwnPosts,
          siblingTitles,
        });
        return {
          externalId: item.externalId,
          title: item.title,
          excerpt: item.excerpt,
          sourceUrl: item.sourceUrl,
          publishedAt: item.publishedAt,
          reasonRu: reason.ru,
          reasonEn: reason.en,
        };
      });
      const { created } = await this.repository.upsertLeads(
        organizationId,
        subscriptionId,
        items
      );
      await this.repository.recordCheckResult(organizationId, subscriptionId, {
        // Only ERRORED recovers to ACTIVE on a success — this is that
        // recovery path. Not an unconditional overwrite: the gate above
        // guarantees `subscription.state` is ACTIVE or ERRORED here, but
        // writing it this way means a success can never itself un-pause a
        // row, even if that gate's reach ever changes.
        state: subscription.state === 'ERRORED' ? 'ACTIVE' : subscription.state,
        lastErrorCode: null,
        lastCheckedAt: now,
      });
      return { checked: true, created };
    } catch (error) {
      const code =
        error instanceof SourceRegistryError ? error.code : 'CHECK_FAILED';
      await this.repository.recordCheckResult(organizationId, subscriptionId, {
        state: 'ERRORED',
        lastErrorCode: code,
        lastCheckedAt: now,
      });
      return { checked: false, reason: code, created: 0 };
    }
  }

  async listLeads(
    organizationId: string,
    filter: { status?: string; subscriptionId?: string }
  ) {
    const rows = await this.repository.listLeads(organizationId, filter);
    return { leads: rows.map(presentLead) };
  }

  async dismissLead(organizationId: string, leadId: string, actorUserId: string) {
    const row = await this.repository.dismissLead(
      organizationId,
      leadId,
      actorUserId,
      this.now()
    );
    return presentLead(row);
  }

  /**
   * "Взять в работу". Marks the lead as spent and hands back what the Brief
   * tab prefills a thesis with — nothing is written to `ContentBrief` or
   * `ContentFact` here, the same way clicking a radar topic in
   * `voice-brief.container.tsx` only fills a field client-side.
   */
  async acceptLead(organizationId: string, leadId: string, actorUserId: string) {
    const row = await this.repository.acceptLead(
      organizationId,
      leadId,
      actorUserId,
      this.now()
    );
    return presentLead(row);
  }
}
