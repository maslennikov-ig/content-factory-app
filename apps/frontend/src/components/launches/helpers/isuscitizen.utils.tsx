import i18next from 'i18next';

/**
 * Which clock and which date order this reader uses.
 *
 * Two questions, one stored answer, and until `content-factory-next-fn33.87`
 * one guess underneath it. The guess read `navigator.language`: a person with
 * the product in Russian, on a browser installed in English, was told his post
 * was scheduled for «09/04/2026 01:51 PM» — an American date order and a
 * twelve-hour clock, neither of which he had asked for anywhere.
 *
 * The stored preference still wins, because «12 часов (AM/PM)» in the settings
 * is an answer a person gave. Below it the interface language decides: the
 * language somebody chose in this product is a statement about how they want
 * to be written to, and the browser's own locale is at best a hint about the
 * machine. American conventions therefore need both — an English interface and
 * an `en-US` browser — instead of the browser alone.
 */
const interfaceLanguage = () => i18next.resolvedLanguage || '';

const browserLanguage = () => {
  if (typeof navigator === 'undefined') return '';
  return navigator.language || navigator.languages?.[0] || '';
};

export const isUSCitizen = () => {
  const stored =
    typeof localStorage === 'undefined' ? null : localStorage.getItem('isUS');
  if (stored) return stored === 'US';
  return (
    interfaceLanguage().startsWith('en') &&
    browserLanguage().startsWith('en-US')
  );
};

/**
 * A date and a time in the reader's own notation.
 *
 * `Intl` rather than a pair of hand-written format strings: the product speaks
 * sixteen languages and `DD/MM/YYYY` is right in none of the ones that write
 * `04.09.2026`. The twelve-hour clock stays a separate decision, because it is
 * a stored preference and not a property of the language.
 *
 * The language is the interface's. Falling back to the platform's default
 * would put the browser's notation back under a product the person set to
 * Russian, which is the whole of `content-factory-next-fn33.87`.
 */
export const formatDateTimeForReader = (value: Date): string => {
  const language = interfaceLanguage() || 'en';
  try {
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: isUSCitizen(),
    }).format(value);
  } catch {
    // An unknown tag is not worth an empty field: the ISO-ish shape is at
    // least unambiguous, which is more than a blank line says.
    const pad = (part: number) => String(part).padStart(2, '0');
    return (
      `${pad(value.getDate())}.${pad(value.getMonth() + 1)}.` +
      `${value.getFullYear()} ${pad(value.getHours())}:${pad(
        value.getMinutes()
      )}`
    );
  }
};
