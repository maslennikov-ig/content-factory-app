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
        end: emojiTail(original, start + c.excerpt.length),
        text: target === 'title' && variant ? variant : c.replacement,
      };
    })
    .sort((a, b) => a.start - b.start);
  if (edits.some((edit, i) => i > 0 && edits[i - 1].end > edit.start))
    throw new Error('Overlapping changes');
  let result = original;
  for (const edit of edits.reverse())
    result = spliceTidy(result, edit.start, edit.end, edit.text);
  if (!result.trim()) throw new Error('Empty result');
  return result;
}

/**
 * Хвост эмодзи-последовательности, который отрывок не назвал.
 *
 * Каталог ловит эмодзи по `\p{Extended_Pictographic}` — одной кодовой
 * точкой, а «⚙️» — это U+2699 и селектор U+FE0F. Правка, убравшая отрывок
 * «⚙», оставляла в посте невидимый U+FE0F, и за ним прятался пробел, который
 * `spliceTidy` уже не видел (живой стенд 22.09.2026, пятый проход). Если
 * отрывок кончается эмодзи, правка забирает и её продолжение: селектор,
 * модификатор тона кожи, знак клавиши и склейки ZWJ с следующим эмодзи.
 */
const EMOJI_END = /\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}\u20E3]*$/u;
const EMOJI_CONTINUATION =
  /^(?:[\uFE0F\u{1F3FB}-\u{1F3FF}\u20E3]|\u200D\p{Extended_Pictographic})+/u;
const emojiTail = (text: string, end: number): number => {
  if (!EMOJI_END.test(text.slice(Math.max(0, end - 4), end))) return end;
  const tail = text.slice(end).match(EMOJI_CONTINUATION);
  return tail ? end + tail[0].length : end;
};

/** Пробел внутри строки: обычный, неразрывный, узкий, табуляция. */
const GAP = /^[ \t\u00A0\u202F\u2009]$/u;
/** Знак, перед которым пробела не бывает. */
const CLOSER = /^[,.;:!?…)\]»”]$/u;

/**
 * Какая сторона шва лишняя: `left` — пробел слева стоит перед пробелом,
 * знаком, концом строки или текста; `right` — пробел справа открывает строку
 * или текст. `null` — шов цел.
 */
const brokenSide = (
  left: string | undefined,
  right: string | undefined
): 'left' | 'right' | null => {
  if (
    left !== undefined &&
    GAP.test(left) &&
    (right === undefined || right === '\n' || GAP.test(right) || CLOSER.test(right))
  )
    return 'left';
  if (right !== undefined && GAP.test(right) && (left === undefined || left === '\n'))
    return 'right';
  return null;
};

/**
 * Сшивает две части, снимая лишние пробелы на стыке — но только если стык
 * был цел до правки (`wasWhole`): свой двойной пробел автор оставляет себе.
 */
const stitch = (left: string, right: string, wasWhole: boolean): string => {
  if (!wasWhole) return left + right;
  let side = brokenSide(left.at(-1), right[0]);
  while (side) {
    if (side === 'left') left = left.slice(0, -1);
    else right = right.slice(1);
    side = brokenSide(left.at(-1), right[0]);
  }
  return left + right;
};

/**
 * Замена отрывка без следа на месте вырезанного слова.
 *
 * `content-factory-next-97dq.33`, десятый заход 22.09.2026: правка вырезала
 * «эффективнее» из «сотрудники эффективнее делегировали», и в посте осталось
 * «сотрудники  делегировали» — два пробела. Отрывок у модели — ровно слово,
 * а пробелы по обе стороны остаются тексту.
 *
 * Чинится только стык самой правки и только если его сломала правка: двойной
 * пробел, пробел перед знаком препинания, пробел в начале или в конце
 * строки, которых на этом месте до правки не было. Всё остальное — в том
 * числе двойной пробел, который автор поставил сам, — остаётся байт в байт.
 */
const spliceTidy = (
  text: string,
  start: number,
  end: number,
  replacement: string
): string => {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const headWhole = brokenSide(before.at(-1), text[start]) === null;
  const tailWhole = brokenSide(text[end - 1], after[0]) === null;
  if (!replacement) return stitch(before, after, headWhole && tailWhole);
  const joined = stitch(before, replacement, headWhole);
  return stitch(joined, after, tailWhole);
};

/** A separate title must never overwrite the first paragraph. */
export function syncEmbeddedTitle(text: string, previousTitle: string, title: string): string {
  const first = text.split('\n').find(line => line.trim());
  if (!first || first !== previousTitle || title === previousTitle) return text;
  const start = text.indexOf(first);
  return text.slice(0, start) + title + text.slice(start + first.length);
}
