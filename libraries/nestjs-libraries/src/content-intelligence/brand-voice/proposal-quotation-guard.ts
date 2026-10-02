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
    text.length !== FIELD_LIMIT
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
  const supported = observations.some(
    (one) =>
      refs.has(one.ref) &&
      one.field === 'TONE' &&
      typeof one.quote === 'string' &&
      one.quote.startsWith(fragment) &&
      /^\p{L}/u.test(one.quote.slice(fragment.length)) &&
      /[.!?…]$/u.test(one.quote)
  );
  if (!supported) return field;
  const prefix = text.slice(0, complete).trimEnd();
  return prefix.length >= 2 ? { ...field, text: prefix } : null;
}
