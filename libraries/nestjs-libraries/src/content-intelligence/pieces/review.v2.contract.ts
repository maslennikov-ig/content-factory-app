import type {
  AdaptationReviewSnapshot,
  AdaptationReviewSource,
} from './adaptation-review.contract';
export const REVIEW_VERSION = 'adaptation-review/v2' as const;
export type ReviewChange = {
  id: string;
  excerpt: string;
  replacement: string;
  ruleId?: string;
  why: string;
  basket: 'silent' | 'show' | 'ask';
  variants?: string[];
  sourceUrls?: string[];
  target?: 'title' | 'body';
};
export type ReviewV2 = {
  version: typeof REVIEW_VERSION;
  originalText: string;
  text: string;
  title: string;
  changes: ReviewChange[];
  verdict: 'clean' | 'review' | 'rewrite';
  summary: string;
  token: string;
  slopBefore: number;
  slopAfter: number;
  sources?: AdaptationReviewSource[];
};
export type ReviewSnapshotV2 = AdaptationReviewSnapshot & { adaptationTitle: string | null };
export type ReviewProposal = Omit<ReviewV2, 'token'> & {
  organizationId: string;
  pieceId: string;
  adaptationId?: string;
  expires: number;
  language: 'ru' | 'en';
  snapshot?: ReviewSnapshotV2;
  pieceSnapshot: { body: string; brief: unknown; title: string };
};
/** Apply only selected, validated changes against the original snapshot. Questions never mutate. */
export function applyReviewChanges(
  original: string,
  changes: ReviewChange[],
  ids: string[],
  target: 'body' | 'title' = 'body',
  variant?: string
): string {
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !changes.some((c) => c.id === id && c.basket !== 'ask'))
  )
    throw new Error('Invalid selected changes');
  const edits = changes
    .filter((c) => ids.includes(c.id) && (c.target ?? 'body') === target)
    .map((c) => {
      const start = original.indexOf(c.excerpt);
      if (
        !c.excerpt ||
        start < 0 ||
        original.indexOf(c.excerpt, start + c.excerpt.length) >= 0
      )
        throw new Error('Ambiguous excerpt');
      if (variant && target === 'title' && !c.variants?.includes(variant))
        throw new Error('Invalid title variant');
      return {
        start,
        end: start + c.excerpt.length,
        text: target === 'title' && variant ? variant : c.replacement,
      };
    })
    .sort((a, b) => a.start - b.start);
  if (edits.some((edit, i) => i > 0 && edits[i - 1].end > edit.start))
    throw new Error('Overlapping changes');
  let result = original;
  for (const edit of edits.reverse())
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  if (!result.trim()) throw new Error('Empty result');
  return result;
}

/** A separate title must never overwrite the first paragraph. */
export function syncEmbeddedTitle(text: string, previousTitle: string, title: string): string {
  const first = text.split('\n').find(line => line.trim());
  if (!first || first !== previousTitle || title === previousTitle) return text;
  const start = text.indexOf(first);
  return text.slice(0, start) + title + text.slice(start + first.length);
}
