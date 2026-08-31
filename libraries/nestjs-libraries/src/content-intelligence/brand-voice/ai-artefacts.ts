/**
 * Traces a model left in a text someone pasted in as their own writing.
 *
 * A sample carrying `citeturn0search1` was not written by the person whose
 * manner we are measuring, and letting it into the corpus teaches the profile
 * a machine's habits. The markers are the ones the donor product collected;
 * the idea is reused, the code is written here.
 *
 * The masking matters more than the patterns. An article explaining how to
 * spot AI output quotes every one of these markers, and a naive scan would
 * reject the article for containing the words it is about. Code blocks and
 * quoted spans are blanked before the scan, so a marker only counts where the
 * text is using it rather than talking about it.
 */

const MARKERS: { id: string; pattern: RegExp }[] = [
  { id: 'oaicite', pattern: /oaicite/i },
  { id: 'citeturn', pattern: /cite\s*turn\d/i },
  { id: 'utm-chatgpt', pattern: /utm_source=chatgpt\.com/i },
  // The dagger citation marker: `【12†source】`.
  { id: 'dagger-citation', pattern: /【\s*\d+\s*†/ },
  { id: 'think-tag', pattern: /<\/?think>/i },
  { id: 'contentReference', pattern: /contentReference/i },
];

/** Fenced and inline code, then quoted spans. Order matters: fences first. */
export function maskQuotedAndCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => ' '.repeat(block.length))
    .replace(/`[^`\n]*`/g, (span) => ' '.repeat(span.length))
    .replace(/«[^»]*»/gu, (span) => ' '.repeat(span.length))
    .replace(/"[^"\n]*"/g, (span) => ' '.repeat(span.length))
    .replace(/^\s*>.*$/gm, (line) => ' '.repeat(line.length));
}

export type ArtefactFinding = { id: string; index: number };

export function findAiArtefacts(text: string): ArtefactFinding[] {
  const masked = maskQuotedAndCode(text);
  return MARKERS.flatMap(({ id, pattern }) => {
    const match = pattern.exec(masked);
    return match ? [{ id, index: match.index }] : [];
  });
}

export const hasAiArtefacts = (text: string): boolean =>
  findAiArtefacts(text).length > 0;

export { MARKERS as AI_ARTEFACT_MARKERS };
