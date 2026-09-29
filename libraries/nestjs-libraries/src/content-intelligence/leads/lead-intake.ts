/**
 * What a lead becomes at the intake, decided once (`content-factory-next-kcxz.23`).
 *
 * Importless on purpose: the «Откуда идеи» screen (`leadToIntakePrefill` in
 * `intake.adapter.ts`), the chat's `piece.create` and the intake service all
 * read these two functions, so «Взять в работу» writes the same piece whether
 * a click or a sentence took the lead — and a suite can load the file without
 * standing Nest up around it.
 */

export type LeadForIntake = {
  title: string;
  excerpt?: string | null;
  sourceUrl?: string | null;
};

/**
 * The first text of the intake. Title and excerpt are glued into one text,
 * because the intake takes one text; the address goes on its own line last,
 * so the server sees it and takes the page as the source. Until 06.09.2026
 * «Взять в работу» opened an empty eight-field brief instead.
 */
export function leadIntakeText(lead: LeadForIntake): string {
  const parts = [String(lead.title ?? '').trim()];
  if (lead.excerpt && lead.excerpt.trim()) parts.push(lead.excerpt.trim());
  if (lead.sourceUrl && lead.sourceUrl.trim()) parts.push(lead.sourceUrl.trim());
  return parts.filter(Boolean).join('\n\n');
}

/**
 * The line «источник» a piece keeps (`PieceLeadSourceV1`,
 * `content-factory-next-75xn.8`): the lead's address and title as the server
 * stores them, never as a client said them. A lead without an address gives
 * no line.
 */
export function pieceLeadSource(
  leadId: string,
  lead: { sourceUrl?: unknown; title?: unknown } | null | undefined
): { leadId: string; url: string; title?: string } | null {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const url = text(lead?.sourceUrl);
  if (!leadId || !url) return null;
  const title = text(lead?.title);
  return { leadId, url, ...(title ? { title } : {}) };
}
