import { groupLeadStories } from './lead-story-cluster';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import {
  constrainedResearchFetch,
  resolveResearchHostname,
  validateResearchFetchUrl,
  type ResearchDnsResolver,
} from '../research/constrained-static-fetch';
import { decideResearchEgress } from '../research/competitive-intelligence-egress';
import { canonicalizeSourceUrl } from '../source-registry/network-policy';
import { assertDomainAllowed, parseDeniedDomains } from '../source-registry/source-access-policy';
import { parseSourcePayload } from '../source-registry/source-parser';
import type { LeadFeedCheckResultV1, LeadFeedItemV1 } from './lead-feed.gateway';

function communityStories(
  items: LeadFeedItemV1[],
  topic: string
): LeadFeedItemV1[] {
  const positions = new Map(
    items.map((item, index) => [item.sourceUrl, index])
  );
  return groupLeadStories(items, topic).sort(
    (a, b) =>
      Math.min(
        ...a.sourceRefsJson!.sources.map(
          (s) => positions.get(s.url) ?? Infinity
        )
      ) -
      Math.min(
        ...b.sourceRefsJson!.sources.map(
          (s) => positions.get(s.url) ?? Infinity
        )
      )
  );
}

/** Existing Redis singleton, injected by DatabaseModule; no socket-import side effects. */
export interface CommunityAdmissionStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
}

type Provider = 'hackernews' | 'github' | 'arxiv';
const PROVIDERS: readonly Provider[] = ['hackernews', 'github', 'arxiv'];
const MAX_ITEMS = 20;
const MAX_REQUESTS = 23; // HN list + 20 stories, GitHub page, arXiv metadata.
const MAX_BYTES = 2 * 1024 * 1024;
const RESPONSE_BYTES = 256 * 1024;
const GITHUB_RESPONSE_BYTES = 1024 * 1024;
const WALL_MS = 30_000;
const REQUEST_MS = 4_000;
const CACHE_MS = 15 * 60_000;
const CACHE_ENTRIES = 100;
// Largest representable Date timestamp, below Number.MAX_SAFE_INTEGER and
// Redis's signed 64-bit PX limit. Overflow means closed for the runtime's
// entire representable lifetime, rather than losing backoff in a failed SET.
const MAX_BACKOFF_AT = 8_640_000_000_000_000;
// arXiv's lease is deliberately longer than its >=3s minimum and the bounded
// connection lifetime. It prevents overlapping requests across our processes.
const LEASE_MS: Record<Provider, number> = { hackernews: WALL_MS + 1_000, github: 60_000, arxiv: WALL_MS + 1_000 };

type Options = {
  fetcher?: typeof globalThis.fetch;
  resolver?: ResearchDnsResolver;
  now?: () => Date;
  deniedDomains?: string[];
  requestMs?: number;
  wallMs?: number;
};
type Run = { organizationId: string; started: number; bytes: number; requests: number; wallMs: number };
type Candidate = LeadFeedItemV1 & { engagement: number; comments: number };
type CacheEntry = { expires: number; items: LeadFeedItemV1[] };

function deadline<T>(work: Promise<T>, milliseconds: number, abort?: AbortController): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { abort?.abort(); reject(new Error('COMMUNITY_TIMEOUT')); }, milliseconds);
    work.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
function words(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}
function text(value: unknown, cap = 2_000): string {
  // Bound raw untrusted metadata before any synchronous regex work. In
  // particular, repeated '<' without a closing '>' must never make the tag
  // cleaner scan a full provider field outside the request's AbortSignal.
  return typeof value === 'string' ? value.slice(0, cap).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, cap) : '';
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function switches(name: string): string[] {
  return (process.env[name] || '').split(',').map((value) => value.trim()).filter(Boolean);
}

/** Anonymous metadata only. Selection is deterministic; it never invokes a model. */
@Injectable()
export class CommunityTopicDiscoveryService {
  private readonly logger = new Logger('CommunityTopicDiscoveryService');
  private readonly cache = new Map<string, CacheEntry>();
  private readonly now: () => Date;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly resolver: ResearchDnsResolver;
  private readonly requestMs: number;
  private readonly wallMs: number;

  constructor(
    @Optional() private readonly store?: CommunityAdmissionStore,
    @Optional() private readonly options: Options = {}
  ) {
    this.now = options.now || (() => new Date());
    this.fetcher = options.fetcher || globalThis.fetch;
    // Always supply a resolver: wrapping fetch to add the AbortSignal must not
    // accidentally opt out of constrainedResearchFetch's production DNS path.
    this.resolver = options.resolver || resolveResearchHostname;
    this.requestMs = Math.max(1, Math.min(REQUEST_MS, options.requestMs ?? REQUEST_MS));
    this.wallMs = Math.max(1, Math.min(WALL_MS, options.wallMs ?? WALL_MS));
  }

  private deniedDomains(): string[] {
    return [...(this.options.deniedDomains || []), ...parseDeniedDomains(process.env.SOURCE_DENIED_DOMAINS)];
  }

  private policy(provider: Provider, run: Run): void {
    const decision = decideResearchEgress({
      organizationId: run.organizationId, providerId: provider, approvedProviderIds: PROVIDERS,
      globalKillSwitch: process.env.RESEARCH_GLOBAL_KILL_SWITCH === 'true',
      tenantKillSwitches: switches('RESEARCH_TENANT_KILL_SWITCHES'),
      providerKillSwitches: switches('RESEARCH_PROVIDER_KILL_SWITCHES'),
      budget: { maxSearchQueries: MAX_REQUESTS, maxAcceptedSources: MAX_ITEMS, maxResponseBytes: MAX_BYTES,
        maxWallClockMs: run.wallMs, maxProviderCostMicros: 1, maxConcurrency: 1 },
      // No paid operation exists; one positive micro-unit lets the existing
      // guard's >= threshold represent zero spent without denying free reads.
      spend: { searchQueries: run.requests, acceptedSources: 0, responseBytes: run.bytes,
        wallClockMs: Date.now() - run.started, providerCostMicros: 0, inFlight: 0 }, kind: 'search',
    });
    if (decision.allowed === false) throw new Error(`COMMUNITY_${decision.code.toUpperCase()}`);
  }

  private async admit(provider: Provider): Promise<void> {
    if (!this.store) throw new Error('COMMUNITY_SHARED_ADMISSION_UNAVAILABLE');
    const key = `lead-community:admission:v1:${provider}`;
    const backoff = await deadline(this.store.get(`${key}:backoff`), 1_000);
    if (backoff && (!Number.isFinite(Number(backoff)) || Number(backoff) > this.now().getTime())) throw new Error('COMMUNITY_BACKOFF');
    const admitted = await deadline(this.store.set(key, '1', 'PX', LEASE_MS[provider], 'NX'), 1_000);
    if (admitted !== 'OK') throw new Error('COMMUNITY_SHARED_PACING');
  }

  private async backoff(provider: Provider, response: Response): Promise<void> {
    const now = this.now().getTime();
    const retry = response.headers.get('retry-after');
    const retrySeconds = retry?.trim() && /^\d+$/u.test(retry.trim()) ? Number(retry) : NaN;
    const retryDate = retry && !Number.isFinite(retrySeconds) ? Date.parse(retry) : NaN;
    const resetValue = response.headers.get('x-ratelimit-reset');
    const reset = resetValue && /^\d+$/u.test(resetValue.trim()) ? Number(resetValue) * 1_000 : NaN;
    const saturate = (value: number) => Number.isNaN(value) ? 0 : Math.min(MAX_BACKOFF_AT, Math.max(0, value));
    const until = Math.max(Math.min(MAX_BACKOFF_AT, now + 60 * 60_000),
      saturate(now + retrySeconds * 1_000), saturate(retryDate), saturate(reset));
    // Fail closed: the already-held provider lease remains even if Redis fails.
    if (!this.store) throw new Error('COMMUNITY_SHARED_ADMISSION_UNAVAILABLE');
    const result = await deadline(this.store.set(`lead-community:admission:v1:${provider}:backoff`, String(until),
      'PX', Math.ceil(until - now)), 1_000);
    if (result !== 'OK') throw new Error('COMMUNITY_SHARED_ADMISSION_UNAVAILABLE');
  }

  private async request(provider: Provider, url: string, run: Run): Promise<Buffer> {
    const responseLimit = provider === 'github' ? GITHUB_RESPONSE_BYTES : RESPONSE_BYTES;
    this.policy(provider, run);
    assertDomainAllowed(url, this.deniedDomains());
    run.requests++;
    const abort = new AbortController();
    const remaining = Math.min(this.requestMs, run.wallMs - (Date.now() - run.started));
    if (remaining <= 0) throw new Error('COMMUNITY_BUDGET_WALL_CLOCK');
    let response: Response | undefined;
    try {
      return await deadline((async () => {
        response = await constrainedResearchFetch({ url, resolver: this.resolver, maxRedirects: 0,
          fetcher: async (address, init) => {
            const result = await this.fetcher(address, { ...init, signal: abort.signal,
              headers: { accept: provider === 'arxiv' ? 'application/atom+xml' : 'application/json',
                'user-agent': 'ContentFactoryCommunityDiscovery/1.0', 'accept-encoding': 'identity' } });
            // The constrained broker refuses redirects; dispose their stream too.
            if (result.status >= 300 && result.status < 400) await result.body?.cancel();
            return result;
          },
        });
        if (abort.signal.aborted) throw new Error('COMMUNITY_TIMEOUT');
        if (response.status === 403 || response.status === 429) {
          await this.backoff(provider, response);
          throw new Error('COMMUNITY_RATE_LIMITED');
        }
        if (response.status !== 200) throw new Error('COMMUNITY_REMOTE_STATUS');
        const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!(provider === 'arxiv' ? ['application/atom+xml', 'application/xml', 'text/xml'].includes(mime)
          : mime === 'application/json')) throw new Error('COMMUNITY_CONTENT_TYPE');
        // Reject compression instead of buffering an unbounded decompressed body.
        if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')
          throw new Error('COMMUNITY_CONTENT_ENCODING');
        let headerBytes = 0;
        response.headers.forEach((value, name) => { headerBytes += Buffer.byteLength(value) + Buffer.byteLength(name); });
        if (headerBytes > 32 * 1024 || Number(response.headers.get('content-length')) > responseLimit)
          throw new Error('COMMUNITY_RESPONSE_BYTES');
        if (!response.body) throw new Error('COMMUNITY_EMPTY_BODY');
        const reader = response.body.getReader();
        const cancel = () => { void reader.cancel().catch(() => undefined); };
        abort.signal.addEventListener('abort', cancel, { once: true });
        const chunks: Buffer[] = [];
        let bytes = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (abort.signal.aborted) throw new Error('COMMUNITY_TIMEOUT');
            if (next.done) break;
            const chunk = Buffer.from(next.value);
            bytes += chunk.length; run.bytes += chunk.length;
            if (bytes > responseLimit || run.bytes > MAX_BYTES) throw new Error('COMMUNITY_RESPONSE_BYTES');
            chunks.push(chunk);
          }
        } finally {
          abort.signal.removeEventListener('abort', cancel);
          await deadline(reader.cancel().catch(() => undefined), 100).catch(() => undefined);
        }
        return Buffer.concat(chunks);
      })(), remaining, abort);
    } finally {
      abort.abort();
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    }
  }

  private candidate(topic: string, value: { url: unknown; title: unknown; excerpt?: unknown; date: unknown },
    now: Date, windowDays: number): LeadFeedItemV1 | null {
    const title = text(value.title, 300);
    const excerpt = text(value.excerpt);
    if (!title || typeof value.url !== 'string' || (typeof value.date !== 'string' && typeof value.date !== 'number')) return null;
    const publishedAt = new Date(value.date);
    if (!Number.isFinite(publishedAt.getTime()) || publishedAt > now ||
      publishedAt.getTime() < now.getTime() - windowDays * 86_400_000) return null;
    const topics = words(topic).filter((word) => word.length >= 2);
    const content = words(`${title} ${excerpt}`);
    if (!topics.some((word) => content.some((other) => word === other ||
      (word.length >= 5 && other.length >= 5 && word.slice(0, 5) === other.slice(0, 5))))) return null;
    try {
      const sourceUrl = canonicalizeSourceUrl(value.url);
      if (validateResearchFetchUrl(sourceUrl).allowed === false) return null;
      assertDomainAllowed(sourceUrl, this.deniedDomains());
      return { externalId: sourceUrl, sourceUrl, title, excerpt: excerpt || null, publishedAt };
    } catch { return null; }
  }

  private async collect(provider: Provider, topic: string, now: Date, windowDays: number, run: Run): Promise<Candidate[]> {
    const rows: Candidate[] = [];
    if (provider === 'hackernews') {
      const ids = JSON.parse((await this.request(provider, 'https://hacker-news.firebaseio.com/v0/newstories.json', run)).toString('utf8'));
      if (!Array.isArray(ids)) throw new Error('COMMUNITY_PAYLOAD');
      for (const id of [...new Set(ids)].slice(0, MAX_ITEMS)) {
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) continue;
        try {
          const row = JSON.parse((await this.request(provider, `https://hacker-news.firebaseio.com/v0/item/${id}.json`, run)).toString('utf8'));
          if (!row || row.id !== id || row.type !== 'story' || row.deleted || row.dead || count(row.time) === null ||
            count(row.score) === null || count(row.descendants) === null) continue;
          const item = this.candidate(topic, { url: row.url || `https://news.ycombinator.com/item?id=${id}`,
            title: row.title, excerpt: row.text, date: row.time * 1_000 }, now, windowDays);
          if (item) rows.push({ ...item, engagement: row.score, comments: row.descendants,
            reason: { ru: `Hacker News: ${row.score} баллов, ${row.descendants} комментариев. Совпадение с темой по словам.`,
              en: `Hacker News: ${row.score} points, ${row.descendants} comments. Lexical topic match.` } });
        } catch (error) {
          this.diagnostic(provider, error);
          const code = error instanceof Error ? error.message : '';
          if (code === 'COMMUNITY_RATE_LIMITED' || code === 'COMMUNITY_TIMEOUT' || code.startsWith('COMMUNITY_BUDGET_') ||
            code.endsWith('_KILL_SWITCH') || code === 'COMMUNITY_SHARED_ADMISSION_UNAVAILABLE') break;
        }
      }
    } else if (provider === 'github') {
      // Strip query syntax supplied inside the topic: fixed public Issue filters
      // cannot be changed into a private/PR/authenticated query by punctuation.
      // Select within the same publication window and fields admitted below,
      // before comments sorting consumes the single bounded page. UTC day
      // bounds are inclusive; exact timestamps still filter partial days.
      const startDay = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
      const endDay = now.toISOString().slice(0, 10);
      const query = `${words(topic).join(' ')} is:issue is:public in:title,body created:${startDay}..${endDay}`;
      const url = new URL('https://api.github.com/search/issues');
      url.search = new URLSearchParams({ q: query, sort: 'comments', order: 'desc', per_page: String(MAX_ITEMS), page: '1' }).toString();
      const result = JSON.parse((await this.request(provider, url.toString(), run)).toString('utf8'));
      if (!Array.isArray(result?.items)) throw new Error('COMMUNITY_PAYLOAD');
      if (result.incomplete_results) this.logger.warn('Community github: incomplete_results');
      for (const row of result.items.slice(0, MAX_ITEMS)) {
        if (!row || row.pull_request || row.repository?.private === true || count(row.comments) === null) continue;
        if (typeof row.html_url !== 'string' || !/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/issues\/\d+(?:#.*)?$/u.test(row.html_url)) continue;
        const item = this.candidate(topic, { url: row.html_url, title: row.title, excerpt: row.body, date: row.created_at }, now, windowDays);
        if (item) rows.push({ ...item, engagement: row.comments, comments: row.comments,
          reason: { ru: `GitHub Issue: ${row.comments} комментариев. Совпадение с темой по словам.`,
            en: `GitHub Issue: ${row.comments} comments. Lexical topic match.` } });
      }
    } else {
      const url = new URL('https://export.arxiv.org/api/query');
      url.search = new URLSearchParams({ search_query: `all:"${words(topic).join(' ')}"`, start: '0', max_results: String(MAX_ITEMS),
        sortBy: 'submittedDate', sortOrder: 'descending' }).toString();
      const body = await this.request(provider, url.toString(), run);
      // Reuse the existing entity/depth/item/field preflight before extracting
      // published explicitly: an Atom updated timestamp is not publication.
      parseSourcePayload('RSS', body, { contentType: 'application/atom+xml' },
        { xmlItems: MAX_ITEMS, xmlDepth: 16, xmlFieldCharacters: 16_384, textCharacters: RESPONSE_BYTES });
      const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false,
        parseTagValue: false }).parse(body.toString('utf8'));
      const entries = parsed?.feed?.entry;
      for (const row of (Array.isArray(entries) ? entries : entries ? [entries] : []).slice(0, MAX_ITEMS)) {
        if (typeof row.id !== 'string') continue;
        const identity = row.id.replace(/^http:\/\/arxiv\.org\//u, 'https://arxiv.org/');
        if (!/^https:\/\/arxiv\.org\/abs\/(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/iu.test(identity)) continue;
        const item = this.candidate(topic, { url: identity, title: row.title, excerpt: row.summary, date: row.published }, now, windowDays);
        if (item) rows.push({ ...item, engagement: 0, comments: 0,
          reason: { ru: 'arXiv: метаданные публикации, совпадение с темой по словам. Вовлечённость неизвестна.',
            en: 'arXiv publication metadata; lexical topic match. Engagement is unknown.' } });
      }
    }
    return rows.sort((a, b) => (provider === 'arxiv' ? 0 : b.engagement - a.engagement || b.comments - a.comments) ||
      b.publishedAt!.getTime() - a.publishedAt!.getTime() || a.externalId.localeCompare(b.externalId, 'en'));
  }

  private diagnostic(provider: Provider, error: unknown): void {
    const message = error instanceof Error ? error.message : '';
    // Only static policy/status codes are logged; no topic, URL, response text,
    // headers, credentials or exception detail can escape through this channel.
    const safe = /^(?:COMMUNITY|RESEARCH_FETCH)_[A-Z_]+$/u.test(message) ? message : 'COMMUNITY_PROVIDER_FAILED';
    this.logger.warn(`Community ${provider}: ${safe}`);
  }

  async check(organizationId: string, topic: string, windowDays: number): Promise<LeadFeedCheckResultV1> {
    const subject = topic.trim();
    if (!subject || subject.length > 300 || !words(subject).length || !Number.isFinite(windowDays) || windowDays <= 0)
      return { disabled: false, items: [] };
    const now = this.now();
    const run: Run = { organizationId, started: Date.now(), bytes: 0, requests: 0, wallMs: this.wallMs };
    const active = PROVIDERS.filter((provider) => {
      try { this.policy(provider, run); return true; } catch (error) { this.diagnostic(provider, error); return false; }
    });
    if (!active.length) return { disabled: false, items: [] };
    const policyKey = `${active.join(',')}|${this.deniedDomains().sort().join(',')}`;
    const key = createHash('sha256').update(JSON.stringify([organizationId, subject, windowDays, policyKey])).digest('hex');
    for (const [id, entry] of this.cache) if (entry.expires <= now.getTime()) this.cache.delete(id);
    const cached = this.cache.get(key);
    if (cached) return { disabled: false, fromCache: true, items: communityStories(cached.items.filter((item) =>
      item.publishedAt && item.publishedAt <= now && item.publishedAt.getTime() >= now.getTime() - windowDays * 86_400_000)
      .map((item) => ({ ...item, publishedAt: new Date(item.publishedAt!), reason: item.reason ? { ...item.reason } : null })), subject) };
    const sets: Candidate[][] = [];
    let acquired = false;
    for (const provider of active) {
      try {
        this.policy(provider, run);
        await deadline(this.admit(provider), Math.max(1, run.wallMs - (Date.now() - run.started)));
        sets.push(await this.collect(provider, subject, now, windowDays, run));
        acquired = true;
      } catch (error) { this.diagnostic(provider, error); sets.push([]); }
    }
    const items: LeadFeedItemV1[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < MAX_ITEMS && items.length < MAX_ITEMS; index++) {
      for (const set of sets) {
        const row = set[index];
        if (!row || seen.has(row.externalId) || items.length >= MAX_ITEMS) continue;
        seen.add(row.externalId);
        const { engagement, comments, ...item } = row;
        items.push(item);
      }
    }
    if (acquired && this.cache.size >= CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    // Store independent values: the consumer cannot mutate dismissal identity.
    if (acquired) this.cache.set(key, { expires: now.getTime() + CACHE_MS, items: items.map((item) =>
      ({ ...item, publishedAt: new Date(item.publishedAt!), reason: item.reason ? { ...item.reason } : null })) });
    return { disabled: false, items: communityStories(items, subject) };
  }
}
