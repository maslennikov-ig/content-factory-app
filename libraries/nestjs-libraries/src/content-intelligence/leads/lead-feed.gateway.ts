import { Injectable, Optional } from '@nestjs/common';
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
import { parseSourcePayload } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-parser';

/**
 * Reads a subscription's feed, and nothing else.
 *
 * Deliberately not a new fetch stack: `SourceFetchGateway` already does the
 * SSRF-safe, redirect-pinned, budget-bounded HTTP for `ContentSource`, and
 * `parseSourcePayload`/`assertRobotsAllowed` already do the parsing and the
 * robots check. This file only orders those calls for a different question —
 * "what is new since last time" rather than "what does this page say" — and
 * turns the feed's own items into candidates for `lead-reason.ts` to explain.
 *
 * `docs/product/content-section-map.md` §3-4: on the boxes running this
 * product today, `SOURCE_DIRECT_FETCH` and `SOURCE_PERIODIC_SYNC` are both
 * off, and a subscription check is exactly that kind of network call.
 * `enabled` here is its own flag rather than reusing either — a workspace's
 * leads and its source registry are unrelated features that happen to share
 * a fetch mechanism, and one operator turning fetching on for one must not
 * silently turn it on for the other.
 */

export type LeadFeedKind = 'RSS';

export type LeadFeedItemV1 = {
  externalId: string;
  title: string;
  excerpt: string | null;
  sourceUrl: string;
  publishedAt: Date | null;
};

export type LeadFeedCheckResultV1 =
  | { disabled: true; items?: undefined }
  | { disabled: false; items: LeadFeedItemV1[] };

/**
 * `upsertLeads` remembers a decline by `(organizationId, subscriptionId,
 * externalId)` (`ContentLeadRepository.upsertLeads`,
 * `content-lead-dismissal-guard.test.cjs`). A feed item with no id, guid or
 * link used to fall back to `${url}#${index}` — a purely positional id. Once
 * a person dismissed the lead that was at, say, index 1, whatever the feed
 * happened to place at index 1 on a later check silently inherited that
 * dismissal, even though it was unrelated content the person never saw.
 *
 * A content-derived hash has no such position dependency: the same item
 * keeps the same identity wherever the feed puts it, and different content
 * never collides just because it landed on the same index.
 */
function fallbackIdentity(
  url: string,
  title: string,
  publishedAt: Date | null
): string {
  const key = `${url}|${title}|${publishedAt ? publishedAt.toISOString() : ''}`;
  return createHash('sha256').update(key).digest('hex');
}

function itemTitle(
  structured: { title?: unknown } | undefined,
  excerpt: string,
  fallback: string
): string {
  const declared = typeof structured?.title === 'string' ? structured.title.trim() : '';
  if (declared) return declared;
  const fromExcerpt = excerpt.trim();
  if (fromExcerpt) return fromExcerpt.slice(0, 160);
  return fallback;
}

@Injectable()
export class LeadFeedGateway {
  private readonly enabled: boolean;
  private readonly deniedDomains: string[];

  constructor(
    private readonly fetch: SourceFetchGateway,
    @Optional()
    options: { enabled?: boolean; deniedDomains?: string[] } = {}
  ) {
    this.enabled =
      options.enabled ?? process.env.LEAD_FEED_CHECK_ENABLED === 'true';
    this.deniedDomains =
      options.deniedDomains ||
      parseDeniedDomains(process.env.SOURCE_DENIED_DOMAINS);
  }

  get capabilityEnabled(): boolean {
    return this.enabled;
  }

  async check(
    subscriptionUrl: string,
    kind: LeadFeedKind
  ): Promise<LeadFeedCheckResultV1> {
    if (!this.enabled) return { disabled: true };
    const url = canonicalizeSourceUrl(subscriptionUrl);
    assertDomainAllowed(url, this.deniedDomains);

    try {
      const robots = await this.fetch.fetch(robotsUrlFor(url), 'ROBOTS');
      assertRobotsAllowed(robots.body, url);
    } catch (error) {
      // A site with no `robots.txt` (or one that 404s) has not denied
      // anything — `assertRobotsAllowed` only ever throws over a policy it
      // actually read. Every other failure — DNS, timeout, a 5xx — is real
      // and is left to fail the check the same way the main fetch below
      // would.
      if (!(error instanceof SourceRegistryError && error.code === 'REMOTE_4XX')) {
        throw error;
      }
    }

    const result = await this.fetch.fetch(url, kind);
    const payload = parseSourcePayload(kind, result.body, {
      contentType: result.contentType || '',
      charset: result.charset,
    });

    const items: LeadFeedItemV1[] = payload.evidence.map((evidence) => {
      const locator = (evidence.locator || {}) as Record<string, unknown>;
      const structured = evidence.structuredData as
        | { title?: unknown; publishedAt?: unknown }
        | undefined;
      const title = itemTitle(structured, evidence.excerpt, payload.title || url);
      const rawPublishedAt =
        typeof structured?.publishedAt === 'string' && structured.publishedAt
          ? new Date(structured.publishedAt)
          : null;
      const publishedAt =
        rawPublishedAt && !Number.isNaN(rawPublishedAt.getTime())
          ? rawPublishedAt
          : null;
      const identity =
        typeof locator.identity === 'string' && locator.identity.trim()
          ? locator.identity.trim()
          : fallbackIdentity(url, title, publishedAt);
      return {
        externalId: identity,
        title,
        excerpt: evidence.excerpt || null,
        sourceUrl: /^https?:\/\//iu.test(identity) ? identity : url,
        publishedAt,
      };
    });

    return { disabled: false, items };
  }
}
