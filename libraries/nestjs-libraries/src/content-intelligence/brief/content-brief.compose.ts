/**
 * The draft a finished brief turns into.
 *
 * It is assembled, not generated. Every sentence in it is one the author
 * already wrote in the brief, in the order a piece of writing wants them:
 * the claim, what the author thinks about it, what it rests on with the
 * sources visible, and the objection it has to survive. No model is called
 * here — a paid call to dress up sentences the author has already written
 * would add fluency and nothing else, and the fluency is the part that hides
 * an empty piece.
 *
 * A fact carried from the workspace's memory is printed without its id: the
 * id is how the server checked it, not something a reader needs.
 */

import type { Brief } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate';
import { truncateChars } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/text-truncate';

export type ComposeLanguage = 'ru' | 'en';

const LABELS = {
  ru: { facts: 'На чём это стоит', source: 'источник', against: 'С чем можно не согласиться' },
  en: { facts: 'What it rests on', source: 'source', against: 'What somebody could disagree with' },
} as const;

const escape = (value: string) =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

const paragraph = (value?: string | null) =>
  value && value.trim() ? `<p>${escape(value.trim())}</p>` : '';

/**
 * The post body, in the HTML the editor and the providers already speak.
 */
export function composeBriefDraft(
  brief: Brief,
  language: ComposeLanguage
): string {
  const label = LABELS[language];
  const facts = (brief.facts || []).filter((fact) => fact.statement?.trim());

  const items = facts.map((fact) => {
    const url = fact.sourceUrl?.trim();
    const source = url ? ` (${label.source}: ${escape(url)})` : '';
    return `<li>${escape(fact.statement.trim())}${source}</li>`;
  });

  return [
    paragraph(brief.thesis),
    paragraph(brief.position),
    items.length ? `<p>${label.facts}:</p><ul>${items.join('')}</ul>` : '',
    paragraph(
      brief.disagreement?.trim()
        ? `${label.against}: ${brief.disagreement.trim()}`
        : ''
    ),
  ]
    .filter(Boolean)
    .join('');
}

/**
 * The name a piece carries in the library.
 *
 * The thesis, because that is the one sentence the brief refuses to be written
 * without — the library's rows are read side by side, and a row named after
 * the goal («рассказать о тарифах») would be indistinguishable from every
 * other row named after the same goal. Trimmed at a word boundary rather than
 * mid-word: the column is 120 characters wide on screen and a cut word reads
 * as a bug, which is exactly what `vme.21.7` was.
 */
export function briefTitle(brief: Brief, language: ComposeLanguage): string {
  const source = (brief.thesis || brief.goal || '').replace(/\s+/gu, ' ').trim();
  if (!source) return language === 'ru' ? 'Материал без названия' : 'Untitled piece';
  if (source.length <= 120) return source;
  const cut = truncateChars(source, 120);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
