import type { LocalePack } from './locale-pack';

/**
 * Sentences, words and paragraphs.
 *
 * Dull, and the single most load-bearing file here: every one of the eight
 * scales divides by something this produces. A splitter that treats "т.е." as
 * two sentences shortens the mean, widens the spread and inflates the share of
 * very short phrases — three scales wrong from one wrong full stop.
 *
 * The rules are `docs/product/brand-voice-from-samples-spec.md` §3.2 and are
 * contract, not implementation detail.
 */

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Bullets a list line may begin with, including the numbered forms. */
const LIST_MARKER = /^\s*(?:[-–—•*]\s+|\d+[.)]\s+)/;

/** A dash used as a copula: spaced, mid-line, not a bullet and not a range. */
const SPACED_DASH = /(?<=\S)\s[–—]\s(?=\S)/u;

export type Sentence = {
  text: string;
  words: number;
  /** Index of the paragraph it came from, so an example can be located. */
  paragraph: number;
};

export type Paragraph = {
  text: string;
  lines: string[];
  isList: boolean;
};

export const countWords = (text: string): number =>
  (text.match(WORD) || []).length;

export const words = (text: string): string[] => text.match(WORD) || [];

/**
 * Paragraphs are separated by a blank line. A single newline does not break
 * one, except inside a list, where each line is its own item.
 */
export function splitParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      // Two or more marked lines make a list. One is a dash, not a bullet —
      // Russian prose starts a clause with a dash constantly.
      const marked = lines.filter((line) => LIST_MARKER.test(line)).length;
      return { text: block, lines, isList: marked >= 2 };
    });
}

const endsWithAbbreviation = (buffer: string, pack: LocalePack): boolean => {
  const tail = buffer.trimEnd().toLowerCase();
  return pack.abbreviationsBeforeName.some((abbreviation) => {
    if (!tail.endsWith(abbreviation)) return false;
    // The abbreviation has to be a whole word. Without this, `д.` matches the
    // tail of `млрд.` and "4,2 млрд. Это рекорд" becomes one sentence — the
    // shortest possible way to make three scales wrong at once.
    const before = tail[tail.length - abbreviation.length - 1];
    return before === undefined || !/[\p{L}\p{N}]/u.test(before);
  });
};

/**
 * A sentence ends at `.`, `!`, `?` or `…` followed by whitespace and something
 * that starts a new one — or at the end of a paragraph. Four things do not end
 * it: a full stop inside a number, one inside a known abbreviation, one inside
 * a domain or URL, and one inside an initial.
 */
export function splitSentences(text: string, pack: LocalePack): Sentence[] {
  const result: Sentence[] = [];

  splitParagraphs(text).forEach((paragraph, paragraphIndex) => {
    const sources = paragraph.isList ? paragraph.lines : [paragraph.text];

    for (const source of sources) {
      // A list item is one sentence whether or not it carries a full stop.
      if (paragraph.isList) {
        const stripped = source.replace(LIST_MARKER, '').trim();
        if (stripped) {
          result.push({
            text: stripped,
            words: countWords(stripped),
            paragraph: paragraphIndex,
          });
        }
        continue;
      }

      let buffer = '';
      for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        buffer += character;
        if (!'.!?…'.includes(character)) continue;

        const rest = source.slice(index + 1);
        // Swallow a run of terminators: "?!" and "..." end one sentence.
        const runLength = /^[.!?…]*/.exec(rest)?.[0].length ?? 0;
        buffer += rest.slice(0, runLength);
        const after = rest.slice(runLength);

        const isBoundary =
          after.length === 0 || /^\s+["'«(]?[\p{Lu}\p{N}]/u.test(after);
        if (!isBoundary) {
          index += runLength;
          continue;
        }
        // `4,2.` is a number; `2026.08` is a date; `example.com` is a domain.
        const digitsAround =
          /\d[.,]$/.test(buffer.trimEnd()) && /^\s*\d/.test(after);
        const insideUrl = /[\p{L}\p{N}]\.[\p{L}]{2,}$/u.test(
          buffer.trimEnd().replace(/[.!?…]+$/, '')
        )
          ? /^[\p{L}\p{N}/]/u.test(after.trimStart())
          : false;
        const initial = /(?:^|\s)\p{Lu}\.$/u.test(buffer.trimEnd());

        if (
          digitsAround ||
          insideUrl ||
          initial ||
          endsWithAbbreviation(buffer, pack)
        ) {
          index += runLength;
          continue;
        }

        const sentence = buffer.trim();
        if (sentence) {
          result.push({
            text: sentence,
            words: countWords(sentence),
            paragraph: paragraphIndex,
          });
        }
        buffer = '';
        index += runLength;
      }

      const tail = buffer.trim();
      if (tail) {
        result.push({
          text: tail,
          words: countWords(tail),
          paragraph: paragraphIndex,
        });
      }
    }
  });

  return result.filter((sentence) => sentence.words > 0);
}

/** Quoted spans, excluded where a scale must not count someone else's speech. */
export const stripQuotes = (text: string): string =>
  text.replace(/«[^»]*»/gu, ' ').replace(/"[^"]*"/gu, ' ');

export const hasSpacedDash = (sentence: string): boolean => {
  if (LIST_MARKER.test(sentence)) return false;
  // A range — "2014 — 2018" — is not a copula.
  const withoutRanges = sentence.replace(/\d+\s*[–—]\s*\d+/gu, ' ');
  return SPACED_DASH.test(withoutRanges);
};

export { LIST_MARKER, SPACED_DASH, WORD };
