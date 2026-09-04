/**
 * Passwords are measured in Unicode code points so an emoji is one character,
 * not two UTF-16 units. A letter is any Unicode letter, a digit is a Unicode
 * decimal digit, and a special character is Unicode punctuation or a symbol.
 */
export const PASSWORD_POLICY = {
  minLength: 7,
  maxLength: 64,
} as const;

/**
 * The same two numbers under the names the locale strings interpolate.
 *
 * Every translation used to spell "7–64" out by hand in sixteen files, so
 * changing the policy here would have left sixteen sentences quietly claiming
 * the old rule. The strings say `{{min}}` and `{{max}}` now, and this is the
 * one place that maps the policy onto those names.
 */
export const PASSWORD_POLICY_RANGE = {
  min: PASSWORD_POLICY.minLength,
  max: PASSWORD_POLICY.maxLength,
} as const;

export const PASSWORD_POLICY_ERROR_MESSAGE =
  'Password must contain 7 to 64 characters, including a letter, a number, and a special character.';

const unicodeLetter = /\p{L}/u;
const unicodeDecimalDigit = /\p{Nd}/u;
const unicodePunctuationOrSymbol = /[\p{P}\p{S}]/u;

export function isPasswordPolicyCompliant(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const length = Array.from(value).length;
  return (
    length >= PASSWORD_POLICY.minLength &&
    length <= PASSWORD_POLICY.maxLength &&
    unicodeLetter.test(value) &&
    unicodeDecimalDigit.test(value) &&
    unicodePunctuationOrSymbol.test(value)
  );
}
