import { load } from 'cheerio';

function normalizedUrl(raw: string): string | null {
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
/** Verify complete targets, not prefixes or a misleading anchor's display text. */
export function publicationContainsExactUrl(content: string, target: string): boolean {
  const expected = normalizedUrl(target);
  if (!expected || !content || content.length > 2_000_000) return false;
  const $ = load(content);
  const found = new Set<string>();
  $('a[href]').each((_index, element) => { const url = normalizedUrl($(element).attr('href') ?? ''); if (url) found.add(url); });
  $('a,script,style,pre,code').remove();
  const text = $.root().text();
  // Explicit Markdown targets have a delimiter; ordinary visible URLs need an exact complete token.
  for (const match of text.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/giu)) {
    const url = normalizedUrl(match[1]); if (url) found.add(url);
  }
  for (const raw of text.match(/https?:\/\/[^\s<>"'`]+/giu) ?? []) {
    const url = normalizedUrl(raw); if (url) found.add(url);
  }
  return found.has(expected);
}
