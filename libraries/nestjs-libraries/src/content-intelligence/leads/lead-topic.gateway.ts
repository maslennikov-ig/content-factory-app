import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalizeSourceUrl } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/network-policy';
import { DISCOVERY_WINDOW_DAYS } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import type { WebResearchResult } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import type { LeadFeedCheckResultV1, LeadFeedItemV1 } from './lead-feed.gateway';

/**
 * Watches a topic, and nothing else (`content-factory-next-75xn.7`).
 *
 * The sibling of `lead-feed.gateway.ts`, answering the other half of «Откуда
 * идеи»: a person who knows *what* they want to follow but not *whose* feed
 * carries it. Same result contract (`LeadFeedCheckResultV1`), so
 * `ContentLeadService` picks a gateway by the row's `kind` and everything
 * after that point — the reason, the dismissal memory, the queue, the
 * perpetual workflow — is the code the feed kind already runs.
 *
 * Deliberately not a second search stack. `WebResearchService.research`
 * already owns engine choice, keys, the egress guard and the usage ledger;
 * this file only asks it one narrow question — «what appeared about this in
 * the last thirty days» — and turns the rows it answers with into candidates
 * for `lead-reason.ts` to explain. The window is the product's own
 * `DISCOVERY_WINDOW_DAYS`, handed to both engines by the adapters in
 * `ai.clients.ts`; nothing here re-implements recency.
 *
 * `LEAD_TOPIC_CHECK_ENABLED` is its own switch for the reason
 * `lead-feed.gateway.ts` gives for `LEAD_FEED_CHECK_ENABLED`: one operator
 * turning on outbound traffic for one feature must not silently turn it on
 * for another. It is the sharper case of the two — reading an address a
 * person typed is one thing, and sending that person's topics to a paid
 * search engine on a schedule is another — so a server may run feed
 * subscriptions with topic subscriptions off, and the screen says so.
 *
 * No `level` is passed to `research`. A level is an explicit, quota-counted
 * choice a person makes on the research panel; a subscription's own tick is
 * not that, and charging a background check against the workspace's paid
 * research allowance would spend it without anyone asking.
 */

export type LeadTopicItemV1 = LeadFeedItemV1;

/**
 * The identity a repeated check must reproduce exactly.
 *
 * `ContentLeadRepository.upsertLeads` remembers a decline by
 * `(organizationId, subscriptionId, externalId)`, so the identity of a
 * discovered page has to survive the engine handing back the same page with a
 * different tracking suffix, a different case in the host, or a trailing
 * fragment. `canonicalizeSourceUrl` is the same normalisation the source
 * registry and feed subscriptions already use, which is why it is reused
 * rather than answered again here.
 *
 * It refuses anything that is not plain HTTPS, and a search engine may return
 * such a row. That is not a reason to drop the row — a person can still read
 * it — so the fallback is a content hash, which is stable across checks for
 * the same reason the feed gateway's fallback is.
 */
function sourceIdentity(url: string): { externalId: string; sourceUrl: string } {
  try {
    const canonical = canonicalizeSourceUrl(url);
    return { externalId: canonical, sourceUrl: canonical };
  } catch {
    const trimmed = (url || '').trim();
    return {
      externalId: createHash('sha256').update(trimmed).digest('hex'),
      sourceUrl: trimmed,
    };
  }
}

function parsedDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class LeadTopicGateway {
  private readonly enabled: boolean;
  private readonly windowDays: number;
  private readonly now: () => Date;

  constructor(
    /**
     * The class itself rather than a narrow port type: Nest resolves a
     * constructor parameter by its runtime token, and a structural type has
     * none. A test hands over an object with just `research` and the same
     * code runs.
     */
    private readonly research: WebResearchService,
    @Optional()
    options: { enabled?: boolean; windowDays?: number; now?: () => Date } = {}
  ) {
    this.enabled =
      options.enabled ?? process.env.LEAD_TOPIC_CHECK_ENABLED === 'true';
    this.windowDays = options.windowDays ?? DISCOVERY_WINDOW_DAYS;
    this.now = options.now ?? (() => new Date());
  }

  get capabilityEnabled(): boolean {
    return this.enabled;
  }

  /** The window this gateway asks with, for the sentence that names it. */
  get checkWindowDays(): number {
    return this.windowDays;
  }

  async check(
    organizationId: string,
    query: string
  ): Promise<LeadFeedCheckResultV1> {
    // Before anything else and before the subject is even read: with the
    // switch off this method makes no outbound request of any kind, the same
    // promise `LeadFeedGateway.check` makes.
    if (!this.enabled) return { disabled: true };
    const subject = (query || '').trim();
    if (!subject) return { disabled: false, items: [] };

    const result: WebResearchResult = await this.research.research(
      organizationId,
      subject,
      { task: 'discovery', windowDays: this.windowDays }
    );

    // The first fact a row carries is the fragment a person reads under the
    // title — the same role the feed item's excerpt plays. Facts are already
    // retold in the product's own words by the research service; nothing is
    // quoted here that it did not hand over.
    const excerptByUrl = new Map<string, string>();
    for (const fact of result.facts || []) {
      const text = (fact?.text || '').trim();
      if (!text || !fact.sourceUrl) continue;
      if (!excerptByUrl.has(fact.sourceUrl)) excerptByUrl.set(fact.sourceUrl, text);
    }

    const oldestAllowed =
      this.now().getTime() - this.windowDays * 24 * 60 * 60 * 1000;
    const items = new Map<string, LeadFeedItemV1>();
    for (const source of result.sources || []) {
      const raw = (source?.url || '').trim();
      if (!raw) continue;
      const publishedAt = parsedDate(source.publishedAt ?? null);
      // A dated page older than the window is dropped. The engines are asked
      // for the window and both apply it, but neither promises it for a row
      // whose date it discovered after the fact — and a lead announced as
      // «свежее за 30 дней» must not be three years old. An undated row is
      // kept: «no date» is not «old», and dropping it would hide most of what
      // a search engine returns.
      if (publishedAt && publishedAt.getTime() < oldestAllowed) continue;
      const { externalId, sourceUrl } = sourceIdentity(raw);
      if (items.has(externalId)) continue;
      const title = (source.title || '').trim() || sourceUrl;
      items.set(externalId, {
        externalId,
        title,
        excerpt: excerptByUrl.get(source.url) || null,
        sourceUrl,
        publishedAt,
      });
    }

    return { disabled: false, items: [...items.values()] };
  }
}
