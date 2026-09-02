/**
 * The tab list, on its own, without `'use client'` above it.
 *
 * It used to live in `content-section.screen.tsx`, which is a client module,
 * and that is fine for everything that imports it from another client module.
 * The section's route is a server component, and a value imported across that
 * boundary is not the value — React hands the server a client reference, so
 * `CONTENT_TABS.includes` came back as «is not a function» and the whole
 * section crashed on `/content?tab=brief`.
 *
 * Found on the running stand on 02.09.2026, with `tsc` clean and every suite
 * green: a type checker sees an array, and only the browser sees the proxy.
 * So the list lives here, where both sides may read it, and the screen
 * re-exports it for the client callers that already name it.
 */
import type { ContentIntelligenceSection } from './content-intelligence.view';

export type ContentTab =
  | 'avatars'
  | 'leads'
  | ContentIntelligenceSection
  | 'materials'
  | 'brief';

/** In the order the strip shows them. See the screen's own note for why each. */
export const CONTENT_TABS: readonly ContentTab[] = [
  'avatars',
  'leads',
  'brief',
  'materials',
  'provenance',
];

/**
 * What the address bar is allowed to name. `archive` is not a tab any more —
 * it is a view inside «Материалы» — but the address survives it, and an
 * unknown value opens the section rather than failing.
 */
export const resolveContentTab = (
  value: unknown
): ContentTab | 'archive' | undefined => {
  const tab = Array.isArray(value) ? value[0] : value;
  if (typeof tab !== 'string') return undefined;
  if (tab === 'archive') return 'archive';
  return (CONTENT_TABS as readonly string[]).includes(tab)
    ? (tab as ContentTab)
    : undefined;
};
