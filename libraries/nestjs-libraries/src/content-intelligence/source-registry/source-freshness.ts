export type SourceFreshnessInput = {
  now: Date;
  cacheControl?: string;
  expires?: string;
  rssTtlMinutes?: number | null;
};

export type SourceFreshness = {
  storable: boolean;
  freshUntil: Date;
  nextFetchNotBefore: Date;
  mustRevalidate: boolean;
};

const DEFAULT_FRESHNESS_MS = 60 * 60 * 1_000;
const MAX_FRESHNESS_MS = 24 * 60 * 60 * 1_000;
const MAX_RSS_TTL_MINUTES = 24 * 60;

export function calculateSourceFreshness(
  input: SourceFreshnessInput
): SourceFreshness {
  const directives = new Map<string, string | true>();
  for (const raw of (input.cacheControl || '').split(',')) {
    const [name, value] = raw.trim().toLowerCase().split('=', 2);
    if (name)
      directives.set(
        name,
        value === undefined ? true : value.replace(/^"|"$/gu, '')
      );
  }
  const storable = !directives.has('no-store');
  const mustRevalidate =
    directives.has('no-cache') ||
    directives.has('must-revalidate') ||
    directives.get('max-age') === '0';
  let freshnessMs = DEFAULT_FRESHNESS_MS;
  const maxAge = directives.get('max-age');
  if (typeof maxAge === 'string' && /^\d+$/u.test(maxAge)) {
    freshnessMs = Math.min(Number(maxAge) * 1_000, MAX_FRESHNESS_MS);
  } else if (input.expires && Number.isFinite(Date.parse(input.expires))) {
    const expiresMs = Date.parse(input.expires);
    freshnessMs = Math.max(
      0,
      Math.min(expiresMs - input.now.getTime(), MAX_FRESHNESS_MS)
    );
  } else if (Number.isFinite(input.rssTtlMinutes)) {
    freshnessMs =
      Math.max(0, Math.min(Number(input.rssTtlMinutes), MAX_RSS_TTL_MINUTES)) *
      60 *
      1_000;
  }
  if (mustRevalidate) freshnessMs = 0;
  const freshUntil = new Date(input.now.getTime() + freshnessMs);
  return {
    storable,
    freshUntil,
    nextFetchNotBefore: freshUntil,
    mustRevalidate,
  };
}
