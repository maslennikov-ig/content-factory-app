import {
  failureNotice,
  jsonReader,
  readFailure,
  screenState,
  type MaterialFailure,
} from '../brand-voice/voice-materials.adapter';

/**
 * «Найдено поиском» — the third way to ground a claim, and until now the only
 * one a person could not reach.
 *
 * The producer has existed since 01.09.2026: `POST
 * /content-intelligence/sources/search-evidence` turns one accepted result
 * into a frozen excerpt with its link and the date it was read, exactly what
 * the owner asked for. The audit of 02.09.2026 found that no file under
 * `apps/frontend` called it — the door was cut and locked from the other
 * side. There was also nothing to accept: web research answered only to the
 * copilot's own tool list and to autopost, both of which pour the result
 * straight into a draft.
 *
 * So two doors are used from here, in the order a person works:
 * `/sources/search` asks the question, `/sources/search-evidence` accepts one
 * answer. Neither creates a `ContentSource`, neither schedules anything, and
 * nothing is fetched from the page — the excerpt is what the search provider
 * returned, kept as it was read.
 *
 * The refusal reading is borrowed rather than rewritten, the same borrowing
 * `content-facts.adapter.ts` makes: all of this answers on one controller
 * behind one `aiCreate` policy, and a second table of what a 403 means is how
 * two halves of one panel start disagreeing about it.
 */

export { failureNotice, jsonReader, readFailure, screenState };
export type SearchFailure = MaterialFailure;

export const SEARCH_API = '/content-intelligence/sources/search';
export const SEARCH_EVIDENCE_API =
  '/content-intelligence/sources/search-evidence';

/** Matches `AcceptSearchResultEvidenceDto`'s `provider`. */
export type SearchProviderName = 'tavily' | 'openrouter' | 'mixed';

export type SearchResultRow = {
  url: string;
  title: string | null;
  excerpt: string;
  publishedAt: string | null;
  provider: SearchProviderName;
};

export type SearchAnswer = {
  summary: string;
  provider: SearchProviderName;
  results: readonly SearchResultRow[];
};

/**
 * What the accepting door gave back, carried to the fact form so the person
 * writes their claim once instead of retyping what they just read.
 */
export type AcceptedEvidence = {
  evidenceId: string;
  url: string;
  title: string | null;
  excerpt: string;
  retrievedAt: string | null;
  freshUntil: string | null;
};

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const asOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

const asProvider = (value: unknown): SearchProviderName =>
  value === 'tavily' || value === 'openrouter' || value === 'mixed'
    ? value
    : 'mixed';

/**
 * A row with no link or no excerpt cannot become evidence — the accepting door
 * refuses both — so it is dropped here rather than offered with a button that
 * would fail. The provider is free to answer with less than it promised, and
 * a screen that trusts a contract it did not enforce is a screen that shows an
 * empty card with an «Accept» button on it.
 */
export function readSearchAnswer(body: unknown): SearchAnswer | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const rows = Array.isArray(record.results) ? record.results : [];
  return {
    summary: asString(record.summary),
    provider: asProvider(record.provider),
    results: rows
      .map((row) => {
        const one = (row ?? {}) as Record<string, unknown>;
        return {
          url: asString(one.url).trim(),
          title: asOptionalString(one.title),
          excerpt: asString(one.excerpt).trim(),
          publishedAt: asOptionalString(one.publishedAt),
          provider: asProvider(one.provider),
        };
      })
      .filter((row) => row.url && row.excerpt),
  };
}

export function buildAcceptPayload(row: SearchResultRow) {
  return {
    url: row.url,
    ...(row.title ? { title: row.title } : {}),
    excerpt: row.excerpt,
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    provider: row.provider,
  };
}

export function readAcceptedEvidence(
  body: unknown,
  row: SearchResultRow
): AcceptedEvidence | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const evidenceId = asString(record.evidenceId).trim();
  if (!evidenceId) return null;
  return {
    evidenceId,
    url: asString(record.url).trim() || row.url,
    title: asOptionalString(record.title) ?? row.title,
    excerpt: asString(record.excerpt).trim() || row.excerpt,
    retrievedAt: asOptionalString(record.retrievedAt),
    freshUntil: asOptionalString(record.freshUntil),
  };
}

/**
 * The claim key a found excerpt starts with.
 *
 * `CreateContentFactDto` insists on «тема|атрибут», and a person who just
 * pressed «взять» has not thought about a key yet. The host of the page is a
 * real, human topic and it is the one thing the excerpt reliably carries, so
 * the suggestion is `<host>|<a word from the title>` — a starting point they
 * edit, never a value saved behind their back. Nothing is guessed about the
 * claim itself.
 */
export function suggestClaimKey(row: {
  url: string;
  title: string | null;
}): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

  let host = '';
  try {
    host = new URL(row.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  const topic = slug(host.split('.')[0] || 'source') || 'source';
  const attribute = slug((row.title || '').split(/\s+/).slice(0, 3).join(' '));
  return `${topic}|${attribute || 'claim'}`;
}
