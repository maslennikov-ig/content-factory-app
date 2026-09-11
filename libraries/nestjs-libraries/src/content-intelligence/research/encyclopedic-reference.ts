import { createHash } from 'node:crypto';
import {
  constrainedResearchFetch,
  resolveResearchHostname,
  type ResearchDnsResolver,
} from './constrained-static-fetch';

export const ENCYCLOPEDIC_REFERENCE_POLICY_VERSION = 'ci_encyclopedic_v1' as const;
export type EncyclopedicProvider = 'wikipedia' | 'wikidata';
export type EncyclopedicResult = {
  url: string;
  title: string;
  /** Discovery hint only; callers must acquire page bytes before citing it. */
  nonCitableSnippet?: string;
  provider: EncyclopedicProvider;
};
export type EncyclopedicLookupResult = {
  provider: EncyclopedicProvider;
  results: EncyclopedicResult[];
  requestedAt: string;
  queryHash: string;
  policyVersion: typeof ENCYCLOPEDIC_REFERENCE_POLICY_VERSION;
};

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const validLocale = (value: string) => /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/iu.test(value.trim());

/** Keyless Wikipedia/Wikidata lane. It sends only the explicit public entity name. */
export async function lookupEncyclopedicReferences(input: {
  entityName: string;
  locales?: readonly string[];
  fetchImpl?: typeof fetch;
  resolver?: ResearchDnsResolver;
  signal?: AbortSignal;
}): Promise<EncyclopedicLookupResult> {
  const entityName = input.entityName.trim().slice(0, 300);
  if (!entityName) throw new Error('ENCYCLOPEDIC_ENTITY_REQUIRED');
  const locales = (input.locales?.length ? input.locales : ['en']).filter(validLocale);
  const fetchImpl = input.fetchImpl ?? fetch;
  const results: EncyclopedicResult[] = [];
  const seen = new Set<string>();
  const requestedAt = new Date().toISOString();
  for (const locale of locales) {
    const host = `${locale.toLowerCase()}.wikipedia.org`;
    const endpoint = `https://${host}/w/rest.php/v1/search/page?q=${encodeURIComponent(entityName)}&limit=1`;
    try {
      const response = await constrainedResearchFetch({
        url: endpoint,
        resolver: input.resolver || (input.fetchImpl ? undefined : resolveResearchHostname),
        fetcher: (url, init) =>
          fetchImpl(url, {
            ...(init as RequestInit),
            headers: { Accept: 'application/json', 'User-Agent': 'content-factory-research/1.0' },
            signal: input.signal,
          }),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as { pages?: Array<{ key?: unknown; title?: unknown; description?: unknown }> };
      const page = Array.isArray(body.pages) ? body.pages[0] : undefined;
      if (typeof page?.key !== 'string' || !page.key) continue;
      const url = `https://${host}/wiki/${encodeURIComponent(page.key)}`;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({
        url,
        title: typeof page.title === 'string' && page.title.trim() ? page.title.trim().slice(0, 500) : entityName,
        ...(typeof page.description === 'string' && page.description.trim() ? { nonCitableSnippet: page.description.trim().slice(0, 1000) } : {}),
        provider: 'wikipedia',
      });
    } catch {
      // One edition being unavailable does not hide the others.
    }
  }
  return {
    provider: 'wikipedia',
    results,
    requestedAt,
    queryHash: hash(`${entityName}\0${locales.join(',')}`),
    policyVersion: ENCYCLOPEDIC_REFERENCE_POLICY_VERSION,
  };
}

/** Keyless Wikidata entity lookup, kept separate from article discovery. */
export async function lookupWikidataReferences(input: {
  entityName: string;
  locale?: string;
  fetchImpl?: typeof fetch;
  resolver?: ResearchDnsResolver;
  signal?: AbortSignal;
}): Promise<EncyclopedicLookupResult> {
  const entityName = input.entityName.trim().slice(0, 300);
  if (!entityName) throw new Error('ENCYCLOPEDIC_ENTITY_REQUIRED');
  const language = validLocale(input.locale || 'en') ? (input.locale || 'en').toLowerCase() : 'en';
  const endpoint = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(entityName)}&language=${encodeURIComponent(language)}&format=json&limit=1`;
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await constrainedResearchFetch({
    url: endpoint,
    resolver: input.resolver || (input.fetchImpl ? undefined : resolveResearchHostname),
    fetcher: (url, init) =>
      fetchImpl(url, {
        ...(init as RequestInit),
        headers: { Accept: 'application/json', 'User-Agent': 'content-factory-research/1.0' },
        signal: input.signal,
      }),
  });
  const results: EncyclopedicResult[] = [];
  if (response.ok) {
    const body = (await response.json()) as { search?: Array<{ id?: unknown; label?: unknown; description?: unknown }> };
    const entity = Array.isArray(body.search) ? body.search[0] : undefined;
    if (typeof entity?.id === 'string' && /^Q\d+$/u.test(entity.id)) {
      results.push({
        url: `https://www.wikidata.org/wiki/${entity.id}`,
        title: typeof entity.label === 'string' && entity.label.trim() ? entity.label.trim().slice(0, 500) : entityName,
        ...(typeof entity.description === 'string' && entity.description.trim() ? { nonCitableSnippet: entity.description.trim().slice(0, 1000) } : {}),
        provider: 'wikidata',
      });
    }
  }
  return {
    provider: 'wikidata',
    results,
    requestedAt: new Date().toISOString(),
    queryHash: hash(`${entityName}\0${language}\0wikidata`),
    policyVersion: ENCYCLOPEDIC_REFERENCE_POLICY_VERSION,
  };
}
