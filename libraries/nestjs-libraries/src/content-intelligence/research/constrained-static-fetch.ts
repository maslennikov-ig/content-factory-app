import dns from 'node:dns/promises';
import net from 'node:net';
import { ssrfSafeDispatcher } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { isPublicGlobalAddress } from '../source-registry/network-policy';

/**
 * Small research fetch broker. URL validation is kept here for callers that
 * only need a decision; the network path additionally resolves every hop,
 * rejects any private answer and follows redirects manually through the pinned
 * SSRF dispatcher. The caller may inject a resolver for deterministic tests.
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

export type ResearchDnsResolver = (
  hostname: string
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

export const resolveResearchHostname: ResearchDnsResolver = async (hostname) => {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
  if (
    !addresses.length ||
    addresses.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) || !isPublicGlobalAddress(address)
    )
  ) {
    throw new Error('RESEARCH_FETCH_DNS_UNSAFE');
  }
  return addresses;
};

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
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  if (!host || host.length > 253) return { allowed: false, code: 'hostname_invalid' };
  if (net.isIP(host) || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) return { allowed: false, code: 'ip_literal_target' };
  const labels = host.split('.');
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/iu.test(label) && label.length <= 63)) return { allowed: false, code: 'hostname_invalid' };
  if (labels.length < 2 || host.toLowerCase().endsWith('.local')) return { allowed: false, code: 'hostname_not_public_suffix' };
  return { allowed: true, url };
}

export async function constrainedResearchFetch<T>(input: {
  url: string;
  fetcher: (url: string, init?: Record<string, unknown>) => Promise<T>;
  resolver?: ResearchDnsResolver;
  maxRedirects?: number;
}): Promise<T> {
  const checked = validateResearchFetchUrl(input.url);
  // Equality, not truthiness: the backend compiles without strictNullChecks,
  // where truthiness does not narrow a discriminated union.
  if (checked.allowed === false) {
    throw new Error(`RESEARCH_FETCH_${checked.code.toUpperCase()}`);
  }

  /*
   * Test and recorded-response callers inject a fetcher and deliberately do
   * not perform DNS. The production default (`globalThis.fetch`) takes the
   * full path below; an injected resolver opts into the same path without
   * making tests depend on the network.
   */
  const networkPath =
    input.resolver !== undefined ||
    (input.fetcher as unknown) === (globalThis.fetch as unknown);
  if (!networkPath) return input.fetcher(checked.url.toString(), { method: 'GET' });

  const resolver = input.resolver || resolveResearchHostname;
  const maxRedirects = Math.max(0, input.maxRedirects ?? 5);
  let current = checked.url;
  const visited = new Set<string>();
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const currentCheck = validateResearchFetchUrl(current.toString());
    if (currentCheck.allowed === false) {
      throw new Error(`RESEARCH_FETCH_${currentCheck.code.toUpperCase()}`);
    }
    const host = currentCheck.url.hostname.replace(/^\[|\]$/gu, '');
    if (!net.isIP(host)) {
      let addresses: Array<{ address: string; family: 4 | 6 }>;
      try {
        addresses = await resolver(host);
      } catch {
        throw new Error('RESEARCH_FETCH_DNS_UNSAFE');
      }
      if (!addresses.length || addresses.some(({ address }) => !isPublicGlobalAddress(address))) {
        throw new Error('RESEARCH_FETCH_DNS_UNSAFE');
      }
    } else if (!isPublicGlobalAddress(host)) {
      throw new Error('RESEARCH_FETCH_DNS_UNSAFE');
    }
    const canonical = currentCheck.url.toString();
    if (visited.has(canonical)) throw new Error('RESEARCH_FETCH_REDIRECT_UNSAFE');
    visited.add(canonical);
    const response = await input.fetcher(canonical, {
      method: 'GET',
      redirect: 'manual',
      // The dispatcher performs a second DNS validation at connect time. The
      // explicit resolver above is still required so redirects are rejected
      // before a request is attempted; the two checks fail closed together.
      dispatcher: ssrfSafeDispatcher,
    });
    const status = Number((response as any)?.status);
    if (!(status >= 300 && status < 400)) return response;
    if (hop === maxRedirects) throw new Error('RESEARCH_FETCH_REDIRECT_UNSAFE');
    const location = (response as any)?.headers?.get?.('location');
    if (!location) throw new Error('RESEARCH_FETCH_REDIRECT_UNSAFE');
    try {
      current = new URL(location, canonical);
    } catch {
      throw new Error('RESEARCH_FETCH_REDIRECT_UNSAFE');
    }
  }
  throw new Error('RESEARCH_FETCH_REDIRECT_UNSAFE');
}
