/** URL-only, versioned storage contract. Safe to share with the browser. */
export type LeadSourceRef = {
  url: string;
  canonicalUrl: string | null;
  primaryStatus: 'UNKNOWN' | 'VERIFIED_PRIMARY';
};
export type LeadAttribution = {
  fromUrl: string;
  targetUrl: string;
  state: 'CLAIMED_UNVERIFIED';
};
export type LeadSourceRefsV1 = {
  version: 1;
  sources: LeadSourceRef[];
  attributions: LeadAttribution[];
  truncated: boolean;
};
export const SOURCE_REF_CAP = 50;
export function safeLeadUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    /[\s\u0000-\u001f\u007f]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
/** Only the confirmed CryptoRank republication route, never its whole domain. */
export function isKnownLeadReprint(value: unknown): boolean {
  if (!safeLeadUrl(value)) return false;
  const url = new URL(value);
  return (url.hostname === 'cryptorank.io' || url.hostname === 'www.cryptorank.io') &&
    url.pathname.startsWith('/news/feed/');
}

const keys = (
  value: unknown,
  expected: string[]
): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
export function readLeadSourceRefs(value: unknown): LeadSourceRefsV1 | null {
  if (
    !keys(value, ['version', 'sources', 'attributions', 'truncated']) ||
    value.version !== 1 ||
    typeof value.truncated !== 'boolean' ||
    !Array.isArray(value.sources) ||
    !value.sources.length ||
    value.sources.length > SOURCE_REF_CAP ||
    !Array.isArray(value.attributions) ||
    value.attributions.length > SOURCE_REF_CAP
  )
    return null;
  if (
    !value.sources.every(
      (s) =>
        keys(s, ['url', 'canonicalUrl', 'primaryStatus']) &&
        safeLeadUrl(s.url) &&
        (s.canonicalUrl === null || safeLeadUrl(s.canonicalUrl)) &&
        typeof s.primaryStatus === 'string' &&
        ['UNKNOWN', 'VERIFIED_PRIMARY'].includes(s.primaryStatus)
    )
  )
    return null;
  const found = new Set(value.sources.map((s) => s.url));
  if (
    !value.attributions.every(
      (a) =>
        keys(a, ['fromUrl', 'targetUrl', 'state']) &&
        safeLeadUrl(a.fromUrl) &&
        safeLeadUrl(a.targetUrl) &&
        found.has(a.fromUrl) &&
        a.state === 'CLAIMED_UNVERIFIED'
    )
  )
    return null;
  if (
    new Set(value.sources.map((s) => s.canonicalUrl || s.url)).size !==
      value.sources.length ||
    new Set(value.attributions.map((a) => `${a.fromUrl}\n${a.targetUrl}`))
      .size !== value.attributions.length
  )
    return null;
  // Return independent values: neither API consumers nor cached candidates own storage.
  return {
    version: 1,
    sources: value.sources.map((s) => ({ ...s })),
    attributions: value.attributions.map((a) => ({ ...a })),
    truncated: value.truncated,
  };
}
export function assertLeadSourceRefs(value: unknown): LeadSourceRefsV1 {
  const parsed = readLeadSourceRefs(value);
  if (!parsed) throw new Error('INVALID_LEAD_SOURCE_REFS');
  return parsed;
}
export function mergeLeadSourceRefs(
  ...values: LeadSourceRefsV1[]
): LeadSourceRefsV1 {
  const rawKeys = new Map<string, string>();
  const sources = new Map<string, LeadSourceRef>();
  const attributions = new Map<string, LeadAttribution>();
  for (const value of values) {
    const parsed = assertLeadSourceRefs(value);
    for (const s of parsed.sources) {
      const key = s.canonicalUrl || s.url;
      rawKeys.set(s.url, key);
      const old = sources.get(key);
      if (!old || s.primaryStatus === 'VERIFIED_PRIMARY')
        sources.set(key, { ...s });
    }
    for (const a of parsed.attributions)
      attributions.set(`${a.fromUrl}\n${a.targetUrl}`, { ...a });
  }
  // Existing found URLs must never disappear on a repeat. Refuse overflow so the
  // transaction preserves the earlier card rather than silently losing sources.
  if (sources.size > SOURCE_REF_CAP)
    throw new Error('LEAD_SOURCE_REFS_CAP_REACHED');
  const sorted = [...sources.values()].sort((a, b) =>
    a.url < b.url ? -1 : a.url > b.url ? 1 : 0
  );
  const mapped = [...attributions.values()].map((a) => ({
    ...a,
    fromUrl: sources.get(rawKeys.get(a.fromUrl) || a.fromUrl)?.url || a.fromUrl,
  }));
  const unique = new Map(
    mapped.map((a) => [`${a.fromUrl}\n${a.targetUrl}`, a])
  );
  const attrs = [...unique.values()].sort((a, b) =>
    `${a.fromUrl}\n${a.targetUrl}`.localeCompare(
      `${b.fromUrl}\n${b.targetUrl}`,
      'en'
    )
  );
  return assertLeadSourceRefs({
    version: 1,
    sources: sorted,
    attributions: attrs.slice(0, SOURCE_REF_CAP),
    truncated: values.some((v) => v.truncated) || attrs.length > SOURCE_REF_CAP,
  });
}
