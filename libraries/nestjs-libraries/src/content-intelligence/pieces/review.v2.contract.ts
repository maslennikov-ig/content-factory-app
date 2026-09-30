import type {
  AdaptationReviewSnapshot,
  AdaptationReviewSource,
} from './adaptation-review.contract';
import { startsSentence } from '../text-quality/repeated-wording';
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
const stitchParts = (left: string, right: string): [string, string] => {
  let side = brokenSide(left.at(-1), right[0]);
  while (side) {
    if (side === 'left') left = left.slice(0, -1);
    else right = right.slice(1);
    side = brokenSide(left.at(-1), right[0]);
  }
  return [left, right];
};

const stitch = (left: string, right: string, wasWhole: boolean): string =>
  wasWhole ? stitchParts(left, right).join('') : left + right;

/** Знак после слова внутри предложения: запятая слабее всех. */
const PAUSE = /^[,;:]$/u;
/** Знак, который сильнее запятой и остаётся на стыке. */
const STRONGER = /^[.;:!?…]$/u;

/**
 * Вырезанное вводное слово уносит с собой и свои запятые (`kcxz.31`, D4).
 *
 * Живой стенд 27.09.2026: из «и это, безусловно, открывает» правка убрала
 * «безусловно» и оставила «и это,, открывает». На стыке, который сломала
 * правка, две запятые — пара вокруг вырезанного слова, уходят обе; запятая
 * после «;» или «:» уходит; запятая, «;» или «:» перед более сильным знаком
 * («правы, безусловно.») уходит, сильный остаётся. Стык, сломанный до
 * правки, не трогается.
 */
const stitchRemoval = (left: string, right: string, wasWhole: boolean): string => {
  if (!wasWhole) return left + right;
  let [head, tail] = stitchParts(left, right);
  const mark = head.at(-1);
  const next = tail[0];
  if (mark === undefined || next === undefined || !PAUSE.test(mark)) return head + tail;
  if (mark === ',' && next === ',') {
    head = head.slice(0, -1);
    tail = tail.slice(1);
  } else if (next === ',') {
    tail = tail.slice(1);
  } else if (STRONGER.test(next)) {
    head = head.slice(0, -1);
  } else {
    return head + tail;
  }
  return stitchParts(head, tail).join('');
};

/** Строка до отрывка пуста: перед ним только начало текста или строки. */
const LINE_HEAD_GAP = /(?:^|\n)[ \t\u00A0]*$/u;
/** Строка после отрывка пуста: за ним только конец строки или текста. */
const LINE_TAIL_GAP = /^[ \t\u00A0]*(?:\n|$)/u;
/** Разрыв перед строкой: переносы и пробелы пустых строк, но не хвост прошлой. */
const HEAD_BREAK = /(?:\n[ \t\u00A0]*)*[ \t\u00A0]*$/u;
/** Разрыв после строки: переносы и пустые строки, но не отступ следующей. */
const TAIL_BREAK = /^[ \t\u00A0]*(?:\n(?:[ \t\u00A0]*(?=\n|$))?)*/u;
const newlines = (gap: string) => gap.split('\n').length - 1;

/**
 * Удаление, которое забрало строку целиком, забирает и её перенос
 * (`kcxz.35`, F7).
 *
 * Живой прогон 27.09.2026: правка «Переписать…» удалила последний абзац, и
 * пост кончился на `.\n\n` — пустой абзац, которого автор не писал. Посреди
 * текста то же удаление оставило бы четыре переноса подряд вместо двух.
 *
 * Если отрывок занимал строку целиком, стык сшивается одним разрывом —
 * большим из двух, что стояли по его сторонам, чтобы граница абзаца не
 * стала переносом строки. Удалённый первый блок уносит разрыв после себя,
 * удалённый последний — разрыв перед собой; хвост, которым текст кончался
 * (например, один `\n`), остаётся. Отрывок не на всю строку — `null`, и
 * стык чинит `stitchRemoval`.
 */
const removeLines = (before: string, after: string): string | null => {
  if (!LINE_HEAD_GAP.test(before) || !LINE_TAIL_GAP.test(after)) return null;
  const headGap = before.match(HEAD_BREAK)?.[0] ?? '';
  const tailGap = after.match(TAIL_BREAK)?.[0] ?? '';
  const head = before.slice(0, before.length - headGap.length);
  const tail = after.slice(tailGap.length);
  if (!head) return tail;
  if (!tail) return head + tailGap;
  return head + '\n'.repeat(Math.max(newlines(headGap), newlines(tailGap))) + tail;
};

/** Разрыв строк внутри отрывка: переносы вместе с пустыми строками между ними. */
const BREAK_RUN = /\n(?:[ \t\u00A0]*\n)*/gu;

/**
 * Удаление, которое забрало вместе с отрывком и разрыв абзаца, этот разрыв
 * оставляет (`kcxz.47`, прогон W6 P3-C).
 *
 * Живой стенд 29.09.2026: «сделай короче» убрало отрывок «Для меня у
 * встречи должна быть заранее понятная цель.\n\n» — последнее предложение
 * абзаца вместе с переносами за ним, — и заключительный вопрос приклеился к
 * первому абзацу. Если в отрывке был перенос, а по обе его стороны в тех же
 * строках остаётся текст, шов — самый длинный разрыв из отрывка, и остаток
 * начинается с заглавной. Абзацы, которые автор разделил, удаление не
 * склеивает. `null` — в отрывке переноса нет или одна из сторон пуста.
 */
const removeKeepingBreak = (
  before: string,
  removed: string,
  after: string
): string | null => {
  const runs = removed.match(BREAK_RUN);
  if (!runs) return null;
  const head = before.replace(/[ \t\u00A0]+$/u, '');
  const tail = after.replace(/^[ \t\u00A0]+/u, '');
  if (!head || head.endsWith('\n') || !tail || tail.startsWith('\n')) return null;
  const breaks = Math.max(...runs.map(newlines));
  return head + '\n'.repeat(breaks) + capitalised(tail);
};

/**
 * Что осталось на шве от вырезанного начала предложения: пробелы и одна
 * запятая или тире с пробелами после.
 */
const SEAM_LEAD = /^[ \t\u00A0]*(?:(?:,|[—–]|-(?=[ \t\u00A0]))[ \t\u00A0]*)?/u;
/** Открывающие кавычки и скобки перед первой буквой. */
const OPENING = /^[«"“„'(\[]*/u;

/** Первая буква — заглавная; слово вида «iPhone» не трогается. */
const capitalised = (text: string): string => {
  const lead = text.match(OPENING)?.[0] ?? '';
  const char = text.slice(lead.length).match(/^\p{L}/u)?.[0];
  if (!char || char === char.toUpperCase() || char !== char.toLowerCase()) return text;
  const next = text.slice(lead.length + char.length).match(/^\p{L}/u)?.[0];
  if (next && next !== next.toLowerCase()) return text;
  return lead + char.toUpperCase() + text.slice(lead.length + char.length);
};

/**
 * Вырезанное начало предложения (`kcxz.38`, R3).
 *
 * Живой стенд 27.09.2026: правка убрала «В современном быстро меняющемся
 * мире», и предложение началось со строчной — «такие короткие записи…». Если
 * отрывок стоял в начале предложения (начало текста, строки или после
 * «.!?…» и пробела), а за ним в той же строке продолжается текст, со шва
 * снимаются оставшиеся запятая или тире, и первая буква остатка становится
 * заглавной. `null` — отрывок не в начале предложения или за ним ничего нет.
 */
const removeSentenceHead = (
  before: string,
  after: string,
  wasWhole: boolean
): string | null => {
  if (!startsSentence(before)) return null;
  const rest = after.slice(after.match(SEAM_LEAD)?.[0].length ?? 0);
  if (!rest || rest[0] === '\n' || rest[0] === '\r') return null;
  return stitchRemoval(before, capitalised(rest), wasWhole);
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
  if (!replacement) {
    const lines = removeLines(before, after);
    if (lines !== null) return lines;
    const kept = removeKeepingBreak(before, text.slice(start, end), after);
    if (kept !== null) return kept;
    const head = removeSentenceHead(before, after, headWhole && tailWhole);
    if (head !== null) return head;
    return stitchRemoval(before, after, headWhole && tailWhole);
  }
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
