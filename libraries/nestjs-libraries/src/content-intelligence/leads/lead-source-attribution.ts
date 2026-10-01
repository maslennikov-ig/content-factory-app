import { load } from 'cheerio';
import {
  safeLeadUrl,
  SOURCE_REF_CAP,
  type LeadAttribution,
} from './lead-source-refs';
/** Only markup already fetched for dating. This module has no network port. */
export function pageAttributions(
  html: string | null,
  fromUrl: string
): { attributions: LeadAttribution[]; truncated: boolean } {
  if (!html || !safeLeadUrl(fromUrl))
    return { attributions: [], truncated: false };
  const bounded = html.slice(0, 256 * 1024);
  const $ = load(bounded);
  $('script,style,noscript,nav,header,footer').remove();
  const found = new Map<string, LeadAttribution>();
  $('a[href]').each((_index, element) => {
    const anchor = $(element);
    const label = anchor.text().replace(/\s+/gu, ' ').trim();
    let preceding = '';
    let previous = element.prev;
    let count = 0;
    while (previous && count++ < 4 && preceding.length < 120) {
      preceding = $(previous).text().slice(-120) + preceding;
      previous = previous.prev;
    }
    const prefix = preceding.replace(/\s+/gu, ' ').trim().slice(-120);
    // Explicit label, or a short attribution prefix preceding the anchor.
    if (
      !/^(?:source|original(?: source)?|источник|первоисточник)\s*:?$/iu.test(
        label
      ) &&
      !/(?:^|\s)(?:source|original source|источник|первоисточник)\s*:?$/iu.test(
        prefix
      )
    )
      return;
    const href = anchor.attr('href');
    if (!href || href.length > 2048) return;
    try {
      const targetUrl = new URL(href, fromUrl).toString();
      if (
        !safeLeadUrl(targetUrl) ||
        !targetUrl.startsWith('https://') ||
        targetUrl === fromUrl
      )
        return;
      found.set(targetUrl, { fromUrl, targetUrl, state: 'CLAIMED_UNVERIFIED' });
    } catch {
      /* Unusable claims are not links. */
    }
  });
  const attributions = [...found.values()].sort((a, b) =>
    a.targetUrl.localeCompare(b.targetUrl, 'en')
  );
  return {
    attributions: attributions.slice(0, SOURCE_REF_CAP),
    truncated:
      html.length > bounded.length || attributions.length > SOURCE_REF_CAP,
  };
}
