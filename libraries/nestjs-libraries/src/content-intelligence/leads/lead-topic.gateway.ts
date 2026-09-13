import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SourceFetchGateway } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway';
import { SourceRegistryError } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/errors';
import { canonicalizeSourceUrl } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/network-policy';
import {
  assertDomainAllowed,
  assertRobotsAllowed,
  parseDeniedDomains,
  robotsUrlFor,
} from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy';
import { DISCOVERY_WINDOW_DAYS } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import {
  WebResearchService,
  cleanExcerpt,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import type { WebResearchResult } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { discoveryJunkReason, uniqueStems } from './lead-junk';
import { pageDate } from './lead-page-date';
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
 *
 * Since the quality pass of 13.09.2026 (`content-factory-next-75xn.23`) a row
 * has to earn its place three times over, because half of what a sweep brought
 * back was not a lead. **A date is required**: most rows arrive dated now that
 * the discovery task asks Tavily with the `news` topic, and the rest are read
 * through `SourceFetchGateway` for the date the page states about itself
 * (`lead-page-date.ts`, at most eight pages per check). A row still undated
 * after that is dropped — «свежее за тридцать дней» is printed under it, and
 * the product must know that to be true. **Junk goes before the model**
 * (`lead-junk.ts`): social mirrors, PDFs, rows with no readable text and rows
 * sharing no word with the topic never reach a paid call. **Relevance is
 * judged once**, inside the research operation, by `lead-discovery-judge.ts`,
 * and its sentence about what the material says replaces the deterministic one
 * `lead-reason.ts` would print.
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

/**
 * At most this many pages are opened per check to date a row the engine left
 * undated. A sweep returns a couple of dozen rows and a person is waiting for
 * the answer; the rest of the undated rows are dropped rather than queued,
 * which is the same decision the date rule makes everywhere else.
 */
const MAXIMUM_PAGE_READS = 8;

/** Per page, robots and the page itself together. A slow site is not a lead. */
const PAGE_READ_DEADLINE_MS = 4_000;

const HTML_CONTENT_TYPE = /\b(?:text\/html|application\/xhtml\+xml)\b/i;

/** Abandons a page read rather than letting one slow host hold up the check. */
function withDeadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Page read exceeded ${milliseconds}ms`)),
      milliseconds
    );
    timer.unref?.();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type TopicCandidate = {
  externalId: string;
  sourceUrl: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  reason: { ru: string; en: string } | null;
};

@Injectable()
export class LeadTopicGateway {
  private readonly logger = new Logger('LeadTopicGateway');
  private readonly enabled: boolean;
  private readonly windowDays: number;
  private readonly now: () => Date;
  private readonly deniedDomains: string[];
  private readonly maximumPageReads: number;
  private readonly pageReadDeadlineMs: number;

  constructor(
    /**
     * The class itself rather than a narrow port type: Nest resolves a
     * constructor parameter by its runtime token, and a structural type has
     * none. A test hands over an object with just `research` and the same
     * code runs.
     */
    private readonly research: WebResearchService,
    /**
     * The same constrained fetch the source registry and the feed gateway use
     * — SSRF-safe, redirect-pinned, budget-bounded — borrowed for one narrow
     * question: what date does this page state about itself. Optional so a
     * server or a test without it degrades to «no date», which drops the row
     * rather than inventing one.
     */
    @Optional()
    private readonly pages?: SourceFetchGateway,
    @Optional()
    options: {
      enabled?: boolean;
      windowDays?: number;
      now?: () => Date;
      deniedDomains?: string[];
      maximumPageReads?: number;
      pageReadDeadlineMs?: number;
    } = {}
  ) {
    this.enabled =
      options.enabled ?? process.env.LEAD_TOPIC_CHECK_ENABLED === 'true';
    this.windowDays = options.windowDays ?? DISCOVERY_WINDOW_DAYS;
    this.now = options.now ?? (() => new Date());
    this.deniedDomains =
      options.deniedDomains || parseDeniedDomains(process.env.SOURCE_DENIED_DOMAINS);
    this.maximumPageReads = options.maximumPageReads ?? MAXIMUM_PAGE_READS;
    this.pageReadDeadlineMs = options.pageReadDeadlineMs ?? PAGE_READ_DEADLINE_MS;
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
    // retold in the product's own words by the research service; the chrome
    // cleaning is run again here because an excerpt that reads «Go / workflow /
    // Version: v1.48.0 / Opens a new window» is what the owner saw under forty
    // titles on 13.09.2026, and this is the last place before the card.
    const excerptByUrl = new Map<string, string>();
    for (const fact of result.facts || []) {
      const text = cleanExcerpt((fact?.text || '').trim()).text.trim();
      if (!text || !fact.sourceUrl) continue;
      if (!excerptByUrl.has(fact.sourceUrl)) excerptByUrl.set(fact.sourceUrl, text);
    }

    /**
     * What the cheap `classify` pass inside the research operation decided, by
     * the address the engine used. Absent when the workspace has no model key,
     * when the call failed, or when the rules already refused the row — and
     * absent is «not judged», never «irrelevant».
     */
    const judged = new Map<string, { ru: string; en: string } | null>();
    const refused = new Set<string>();
    for (const verdict of result.discovery || []) {
      const url = (verdict?.url || '').trim();
      if (!url) continue;
      if (!verdict.relevant) {
        refused.add(url);
        continue;
      }
      const ru = (verdict.reason?.ru || '').trim();
      const en = (verdict.reason?.en || '').trim();
      judged.set(url, ru && en ? { ru, en } : null);
    }

    const topicStems = uniqueStems(subject);
    const oldestAllowed =
      this.now().getTime() - this.windowDays * 24 * 60 * 60 * 1000;
    const dropped: Record<string, number> = {};
    const note = (reason: string) => {
      dropped[reason] = (dropped[reason] || 0) + 1;
    };

    const candidates = new Map<string, TopicCandidate>();
    for (const source of result.sources || []) {
      const raw = (source?.url || '').trim();
      if (!raw) continue;
      const { externalId, sourceUrl } = sourceIdentity(raw);
      if (candidates.has(externalId)) continue;
      if (refused.has(raw)) {
        note('JUDGED_IRRELEVANT');
        continue;
      }
      const excerpt = excerptByUrl.get(source.url) || null;
      const junk = discoveryJunkReason(
        {
          url: sourceUrl,
          title: (source.title || '').trim(),
          excerpt,
          score: source.score ?? null,
        },
        topicStems
      );
      if (junk) {
        note(junk);
        continue;
      }
      const publishedAt = parsedDate(source.publishedAt ?? null);
      // A dated page older than the window is dropped. The engines are asked
      // for the window and both apply it, but neither promises it for a row
      // whose date it discovered after the fact — and a lead announced as
      // «свежее за 30 дней» must not be three years old.
      if (publishedAt && publishedAt.getTime() < oldestAllowed) {
        note('OUT_OF_WINDOW');
        continue;
      }
      candidates.set(externalId, {
        externalId,
        sourceUrl,
        title: (source.title || '').trim() || sourceUrl,
        excerpt,
        publishedAt,
        reason: judged.get(raw) ?? null,
      });
    }

    await this.dateUndatedRows([...candidates.values()]);

    const items: LeadFeedItemV1[] = [];
    for (const candidate of candidates.values()) {
      // The rule the whole exercise exists for: no date, no lead. «Нет даты» is
      // not «старое», and that is exactly why it used to keep evergreen
      // explainers in a list titled «что нового» (F14, 13.09.2026).
      if (!candidate.publishedAt) {
        note('NO_DATE');
        continue;
      }
      if (candidate.publishedAt.getTime() < oldestAllowed) {
        note('OUT_OF_WINDOW');
        continue;
      }
      items.push({
        externalId: candidate.externalId,
        title: candidate.title,
        excerpt: candidate.excerpt,
        sourceUrl: candidate.sourceUrl,
        publishedAt: candidate.publishedAt,
        reason: candidate.reason,
      });
    }

    const refusedCount = Object.values(dropped).reduce((sum, n) => sum + n, 0);
    if (refusedCount) {
      this.logger.debug(
        `Topic sweep kept ${items.length} of ${
          items.length + refusedCount
        } rows: ${Object.entries(dropped)
          .map(([reason, count]) => `${reason}=${count}`)
          .join(', ')}.`
      );
    }

    return { disabled: false, items };
  }

  /**
   * Reads at most `MAXIMUM_PAGE_READS` undated pages for the date they state
   * about themselves, in parallel and each under its own deadline.
   *
   * Mutates the candidates it was given, because a page read either supplies
   * the one missing field or changes nothing. Every failure — robots, a
   * redirect the policy refuses, a timeout, a page that is not HTML — leaves
   * the row undated, and an undated row is dropped by the caller. Nothing here
   * throws: a sweep must not fail because one host was slow.
   */
  private async dateUndatedRows(candidates: TopicCandidate[]): Promise<void> {
    if (!this.pages) return;
    const undated = candidates
      .filter((candidate) => !candidate.publishedAt)
      .slice(0, this.maximumPageReads);
    if (!undated.length) return;
    const now = this.now();
    await Promise.all(
      undated.map(async (candidate) => {
        try {
          const html = await withDeadline(
            this.readPage(candidate.sourceUrl),
            this.pageReadDeadlineMs
          );
          candidate.publishedAt = pageDate(html, candidate.sourceUrl, now);
        } catch (error) {
          this.logger.debug(
            `No date read from a discovered page: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
    );
  }

  /**
   * One page, through the constrained fetch, with robots honoured.
   *
   * `null` rather than an exception for the two ordinary «nothing to read
   * here» answers — a site that refuses machine reading, and a response that
   * is not HTML — so the address rule of `lead-page-date.ts` still gets its
   * turn. A PDF ends here: it has no markup to date it with, and
   * `lead-junk.ts` refuses it by content type on the next check anyway.
   */
  private async readPage(url: string): Promise<string | null> {
    if (!this.pages) return null;
    const target = canonicalizeSourceUrl(url);
    assertDomainAllowed(target, this.deniedDomains);
    try {
      const robots = await this.pages.fetch(robotsUrlFor(target), 'ROBOTS');
      assertRobotsAllowed(robots.body, target);
    } catch (error) {
      // A site with no `robots.txt` has denied nothing; every other failure
      // here is the site's answer about reading it, and it is respected.
      if (!(error instanceof SourceRegistryError && error.code === 'REMOTE_4XX')) {
        throw error;
      }
    }
    const page = await this.pages.fetch(target, 'URL');
    if (page.contentType && !HTML_CONTENT_TYPE.test(page.contentType)) return null;
    return page.body.toString('utf8');
  }
}
