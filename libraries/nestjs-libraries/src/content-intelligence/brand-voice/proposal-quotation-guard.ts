/** New V2 reduce output only; never a repair of a historical stored proposal. */
type Field = {
  field?: string;
  text?: string;
  observationRefs?: readonly string[];
};
type GroundedQuote = { ref?: string; field?: string; quote?: string };

// Existing assist.contract field limit, measured in UTF-16 by Zod.
const FIELD_LIMIT = 600;
const ABBREVIATIONS = new Set(['prof', 'approx', 'проф', 'корп', 'сост']);

/** A conservative sentence stop outside angle quotes; uncertain stops abstain. */
const completeStop = (text: string, at: number): boolean => {
  if (!/^(?:\s+\p{Lu}|$)/u.test(text.slice(at + 1))) return false;
  if (text[at] === '!' || text[at] === '?') return true;
  if (text[at] !== '.' || text[at - 1] === '.') return false;
  if (text[at - 1] === '»') return true;
  // Short tokens/initials/capitalized names may be abbreviations (г. Москва,
  // т.е., Dr. Smith). URLs/decimals have no following whitespace at their dot.
  const word = /(?:^|[^\p{L}])(\p{Ll}{4,})$/u.exec(text.slice(0, at))?.[1];
  return !!word && !ABBREVIATIONS.has(word);
};

/** A unique literal excerpt starting at a word boundary, with content left. */
const supportedExcerpt = (
  fragment: string,
  refs: ReadonlySet<string>,
  observations: readonly GroundedQuote[]
): boolean => {
  let match: { quote: string; at: number } | undefined;
  for (const one of observations) {
    if (
      !refs.has(one.ref) ||
      one.field !== 'TONE' ||
      typeof one.quote !== 'string' ||
      !/[.!?…]$/u.test(one.quote)
    )
      continue;
    const quote = one.quote;
    for (
      let at = quote.indexOf(fragment);
      at >= 0;
      at = quote.indexOf(fragment, at + 1)
    ) {
      const previous = Array.from(quote.slice(0, at)).pop() ?? '';
      // Do not start an excerpt inside a word/identifier or joined compound.
      if (/[\p{L}\p{N}\p{M}_'’\p{Pd}]/u.test(previous)) continue;
      // Repeated positions/observations are ambiguous even if only one has
      // enough text left; never choose a continuation from competing matches.
      if (match) return false;
      match = { quote, at };
    }
  }
  if (!match) return false;
  const remaining = match.quote.slice(match.at + fragment.length);
  if (/^\p{L}/u.test(remaining)) return true; // Existing inside-word case.
  // A whole-word cutoff needs remaining prose, not just its closing stop.
  // Three letters conservatively exclude short/numeric-only continuations.
  return (
    /^[^\p{L}\p{N}\p{M}_'’\p{Pd}]/u.test(remaining) &&
    /\p{L}{3,}/u.test(remaining)
  );
};

/**
 * Omit a source-confirmed cut quotation and its unfinished final sentence.
 * Return only an exact complete prefix, or no field; never invent its ending.
 * The admitted observation list is supplied after the existing critic pass.
 */
export function omitIncompleteToneQuotation<T extends Field>(
  field: T,
  observations: readonly GroundedQuote[]
): T | null {
  const text = field.text;
  if (
    typeof text !== 'string' ||
    field.field !== 'TONE' ||
    text.length < 2 ||
    text.length > FIELD_LIMIT
  )
    return field;
  // This guard handles the observed angle-quote form, not ambiguous mixed
  // quotation conventions or apostrophes in ordinary prose.
  if (/[“”"„]/u.test(text)) return field;
  const open: number[] = [];
  let complete = 0;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '«') open.push(at);
    else if (text[at] === '»') {
      if (!open.length) return field;
      open.pop();
    }
    if (!open.length && /[.!?]/u.test(text[at]) && completeStop(text, at))
      complete = at + 1;
  }
  if (open.length !== 1) return field;
  const fragment = text.slice(open[0] + 1);
  if (fragment.length < 8 || !/\p{L}$/u.test(fragment)) return field;
  const refs = new Set(field.observationRefs ?? []);
  const supported = supportedExcerpt(fragment, refs, observations);
  if (!supported) return field;
  const prefix = text.slice(0, complete).trimEnd();
  return prefix.length >= 2 ? { ...field, text: prefix } : null;
}

const BOUNDARY_ABBREVIATIONS = new Set([
  ...ABBREVIATIONS,
  'incl',
  'dept',
  'assoc',
  'напр',
  'наприм',
  'соотв',
  'сокр',
  'акад',
  'табл',
  'млрд',
  'проч',
]);

/**
 * New V2 output policy for ordinary unfinished prose at the existing limit.
 * This does not diagnose a lexical/provider cutoff: deliberately unpunctuated
 * near-limit prose may lose its last sentence. Ambiguous boundaries abstain.
 * Only an exact prior prefix survives; no ending or quotation is completed.
 */
export function omitIncompleteBoundaryProse<T extends Field>(
  field: T,
  observations: readonly GroundedQuote[]
): T | null {
  const raw = field.text;
  if (
    typeof raw !== 'string' ||
    (field.field !== 'TONE' && field.field !== 'TOPICS') ||
    raw.length > FIELD_LIMIT
  )
    return field;
  const text = raw.trimEnd();
  if (
    text.length < FIELD_LIMIT - 1 ||
    !/\p{L}\p{M}*$/u.test(text) ||
    !/^\s*\p{Lu}/u.test(text)
  )
    return field;
  const refs = new Set(field.observationRefs ?? []);
  if (
    !observations.some(
      (one) => refs.has(one.ref) && one.field === field.field
    )
  )
    return field;
  // Unsupported quotation/markup, format controls, broken surrogates, URLs
  // and punctuation runs cannot certify an ordinary prose sentence.
  if (
    /[“”"„'‘’‹›()[\]{}<>/\\@…\p{Cs}\p{Cf}]/u.test(text) ||
    text.includes(String.fromCharCode(96)) ||
    /[.!?]{2,}/u.test(text)
  )
    return field;
  let quoted = false;
  let complete = 0;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '«') {
      if (quoted) return field;
      quoted = true;
    } else if (text[at] === '»') {
      if (!quoted) return field;
      quoted = false;
    }
    if (quoted) continue;
    // A capitalized continuation after a comma/colon/semicolon is ambiguous;
    // it is never promoted to a sentence stop.
    if (
      /[,;:]/u.test(text[at]) &&
      /^\s+\p{Lu}/u.test(text.slice(at + 1))
    )
      return field;
    if (!/[.!?]/u.test(text[at])) continue;
    if (!completeStop(text, at)) return field;
    if (text[at - 1] === '»') {
      if (/[.!?]/u.test(text[at - 2])) return field;
    } else {
      const word = /[\p{L}\p{M}\p{N}_\p{Pd}]+$/u.exec(
        text.slice(0, at)
      )?.[0];
      if (
        !word ||
        !(text[at] === '.' ? /^\p{Ll}{4,}$/u : /^\p{L}+$/u).test(word) ||
        BOUNDARY_ABBREVIATIONS.has(word)
      )
        return field;
    }
    complete = at + 1;
  }
  if (quoted) return field;
  const tail = text.slice(complete).trimStart();
  if (
    !/^\p{Lu}/u.test(tail) ||
    !/^[\p{L}\p{M}\p{N}\s,;:\p{Pd}]+$/u.test(tail)
  )
    return field;
  return complete >= 2 ? { ...field, text: raw.slice(0, complete) } : null;
}
