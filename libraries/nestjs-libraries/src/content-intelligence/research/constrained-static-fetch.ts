/**
 * URL-shape guard used before the existing SourceFetchGateway. The gateway
 * performs DNS pinning, redirect revalidation and byte limits; this leaf keeps
 * the research contract explicit and is network-free.
 */
export type ResearchFetchDenialCode =
  | 'scheme_not_https'
  | 'port_not_443'
  | 'userinfo_present'
  | 'ip_literal_target'
  | 'hostname_invalid'
  | 'hostname_not_public_suffix';

export type ResearchFetchUrl =
  | { allowed: true; url: URL }
  | { allowed: false; code: ResearchFetchDenialCode };

export function validateResearchFetchUrl(value: string): ResearchFetchUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, code: 'hostname_invalid' };
  }
  if (url.protocol !== 'https:') return { allowed: false, code: 'scheme_not_https' };
  if (url.port && url.port !== '443') return { allowed: false, code: 'port_not_443' };
  if (url.username || url.password) return { allowed: false, code: 'userinfo_present' };
  const host = url.hostname;
  if (!host || host.length > 253) return { allowed: false, code: 'hostname_invalid' };
  if (host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return { allowed: false, code: 'ip_literal_target' };
  const labels = host.split('.');
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label) && label.length <= 63)) return { allowed: false, code: 'hostname_invalid' };
  if (labels.length < 2 || host.toLowerCase().endsWith('.local')) return { allowed: false, code: 'hostname_not_public_suffix' };
  return { allowed: true, url };
}

export async function constrainedResearchFetch<T>(input: {
  url: string;
  fetcher: (url: string, init?: { method: 'GET' }) => Promise<T>;
}): Promise<T> {
  const checked = validateResearchFetchUrl(input.url);
  if (checked.allowed) return input.fetcher(checked.url.toString(), { method: 'GET' });
  const { code } = checked as Extract<ResearchFetchUrl, { allowed: false }>;
  throw new Error(`RESEARCH_FETCH_${code.toUpperCase()}`);
}
