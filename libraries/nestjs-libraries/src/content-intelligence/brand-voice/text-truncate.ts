/**
 * Cutting text to a length without cutting a character in half.
 *
 * `String.prototype.slice` counts UTF-16 code units, and every emoji outside
 * the BMP is two of them. A cut that lands between the two leaves a lone
 * surrogate: a string JavaScript will happily carry and Postgres will not
 * accept — Prisma answers `unexpected end of hex escape` and the whole write
 * fails. A real Telegram channel export hit this on its 141st post, where the
 * 80-character title boundary fell inside a «🧩», and the 500 took all 155
 * posts with it (`content-factory-next-vme.21.14`).
 *
 * Code points, not grapheme clusters: cutting «👩‍💻» into «👩» is a smaller
 * wrong than refusing to cut at all, and both halves are valid text. The
 * trailing joiner is dropped, because a zero-width joiner with nothing after
 * it renders as a stray box.
 */
const ZERO_WIDTH_JOINER = '‍';
const VARIATION_SELECTORS = /[︀-️]$/u;

export function truncateChars(value: string, limit: number): string {
  if (limit <= 0) return '';
  // Fast path: no surrogate pair can be involved when the string is short
  // enough that no cut happens at all.
  if (value.length <= limit) return value;

  const points = Array.from(value);
  if (points.length <= limit) return value;

  let cut = points.slice(0, limit).join('');
  while (cut.endsWith(ZERO_WIDTH_JOINER)) {
    cut = cut.slice(0, -ZERO_WIDTH_JOINER.length);
  }
  return cut.replace(VARIATION_SELECTORS, '');
}
