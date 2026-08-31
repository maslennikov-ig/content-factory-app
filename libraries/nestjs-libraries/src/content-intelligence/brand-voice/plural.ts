/**
 * Russian counts a thing three ways, and a sentence that counts one is broken.
 *
 * In the library rather than in the frontend's `voice-copy.ts`, where it was
 * written first, because the server writes counted sentences too — the text
 * check's summary is one, and it said «2 шкал в коридоре» above the post form.
 * One rule, one place; the frontend re-exports this one.
 */
export function plural(
  count: number,
  forms: readonly [string, string, string]
): string {
  const tens = Math.abs(count) % 100;
  const ones = tens % 10;
  if (tens > 10 && tens < 20) return forms[2];
  if (ones > 1 && ones < 5) return forms[1];
  if (ones === 1) return forms[0];
  return forms[2];
}
