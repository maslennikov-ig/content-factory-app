import { createHash } from 'node:crypto';
import { SourceRegistryError } from './errors';
import { canonicalizeSourceUrl } from './network-policy';

/**
 * `content-factory-next-lh5s`: the owner's own framing for this evidence kind
 * (Beads comment, 2026-09-01) — "there is an article, it is unlikely to be
 * updated; the only thing worth doing is keeping the link so we remember
 * where it came from." No `ContentSource` is created and nothing here is
 * scheduled for re-check; a search result becomes evidence exactly once, at
 * the moment a person accepts it, and stays that way until it expires or is
 * accepted again.
 *
 * A fixed window rather than a schedule says that plainly: the excerpt stays
 * usable for a long stretch without anyone re-checking it, and when it
 * finally lapses a human decides whether to accept it again — not a sync job
 * that does not exist for this kind. A year matches "unlikely to be updated"
 * better than the registry's short HTTP-freshness windows, while still
 * forcing a fact grounded on it to eventually be re-confirmed rather than
 * staying VERIFIED forever on a citation nobody has looked at again.
 */
export const SEARCH_PROVIDER_RESULT_FRESHNESS_MS = 365 * 24 * 60 * 60 * 1_000;

/** Matches the spec's per-capture bound (`content-source-registry-spec.md`). */
export const SEARCH_PROVIDER_RESULT_MAX_EXCERPT_CHARACTERS = 8_000;

export type WebResearchProvider = 'tavily' | 'openrouter' | 'mixed';

export type AcceptSearchResultInput = {
  organizationId: string;
  url: string;
  title?: string | null;
  excerpt: string;
  publishedAt?: string | Date | null;
  provider: WebResearchProvider;
  now: Date;
};

export type SearchProviderEvidencePayload = {
  organizationId: string;
  requestedCanonicalUrl: string;
  finalCanonicalUrl: string;
  normalizedTitle: string | null;
  excerpt: string;
  contentHash: string;
  publishedAt: Date | null;
  retrievalProvider: string;
  observedAt: Date;
  freshUntil: Date;
};

/**
 * Same character class `content-context.builder.ts`'s `cleanText` refuses
 * (C0 controls other than the ones `trim()` already handles, plus DEL), but
 * written as a numeric code-point check rather than a regex escape range so
 * nothing here depends on an escape sequence surviving verbatim.
 */
function isDisallowedControlCodePoint(code: number): boolean {
  return (
    code <= 0x08 ||
    code === 0x0b ||
    code === 0x0c ||
    (code >= 0x0e && code <= 0x1f) ||
    code === 0x7f
  );
}

function stripControlCharacters(value: string): string {
  let result = '';
  for (const char of value) {
    if (!isDisallowedControlCodePoint(char.codePointAt(0) ?? 0)) {
      result += char;
    }
  }
  return result;
}

function boundedExcerpt(value: string): string {
  return stripControlCharacters(value)
    .trim()
    .slice(0, SEARCH_PROVIDER_RESULT_MAX_EXCERPT_CHARACTERS);
}

function boundedTitle(value: string | null | undefined): string | null {
  const trimmed = stripControlCharacters(value || '').trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function parseOptionalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  // An invalid or malformed provider date stays null rather than corrupting
  // `publishedAt` — the same rule the RSS/Atom parser already applies.
  return Number.isFinite(date.getTime()) ? date : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Turns one accepted web-research result into the immutable snapshot+evidence
 * payload the repository persists. Pure and network-free: the URL is
 * canonicalized for storage/display only (HTTPS, no credentials, no
 * fragment) — this producer never fetches it, matching the registry spec's
 * "search remains a separate capability and never triggers a direct fetch".
 */
export function normalizeSearchResultAcceptance(
  input: AcceptSearchResultInput
): SearchProviderEvidencePayload {
  const canonicalUrl = canonicalizeSourceUrl(input.url);
  const excerpt = boundedExcerpt(input.excerpt);
  if (!excerpt) {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'An accepted search result needs an excerpt to become evidence',
      422
    );
  }
  return {
    organizationId: input.organizationId,
    requestedCanonicalUrl: canonicalUrl,
    finalCanonicalUrl: canonicalUrl,
    normalizedTitle: boundedTitle(input.title),
    excerpt,
    contentHash: sha256(`${canonicalUrl}|${excerpt}`),
    publishedAt: parseOptionalDate(input.publishedAt),
    retrievalProvider: `search-result-${input.provider}-v1`,
    observedAt: input.now,
    freshUntil: new Date(input.now.getTime() + SEARCH_PROVIDER_RESULT_FRESHNESS_MS),
  };
}
