import countries from 'i18n-iso-countries';
import countriesEn from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(countriesEn);

/**
 * The locale ids this product ships are not BCP-47: `ka_ge` uses an
 * underscore, which `Intl` rejects outright. Splitting on both separators
 * keeps the region available for the flag.
 */
export const localeParts = (languageCode: string) => {
  const [primary, ...subtags] = languageCode.split(/[-_]/);
  return { primary: primary.toLowerCase(), region: subtags[0]?.toUpperCase() };
};

/**
 * A language code is not a country code. Left to guess, `bn` reads as Brunei
 * rather than Bangladesh, so the multi-region ones and the plainly wrong ones
 * are stated.
 */
const flagOverrides: Record<string, string> = {
  en: 'GB',
  es: 'ES',
  ar: 'SA',
  zh: 'CN',
  he: 'IL',
  ja: 'JP',
  ko: 'KR',
  vi: 'VN',
  bn: 'BD',
};

export const getCountryCodeForFlag = (languageCode: string) => {
  const { primary, region } = localeParts(languageCode);

  // A region the locale states itself beats anything we could infer: `ka_ge`
  // is Georgian as written in Georgia, and GE is the flag for it.
  if (region && countries.getName(region, 'en')) {
    return region;
  }

  if (flagOverrides[primary]) {
    return flagOverrides[primary];
  }

  // For most language codes that match their primary country
  // Examples: fr->FR, it->IT, de->DE, etc.
  return primary.toUpperCase();
};

/**
 * The name of every shipped language, written the way that language writes it.
 *
 * `content-factory-next-fn33.116`. This used to be `Intl.DisplayNames`, and
 * `Intl.DisplayNames` answers with whatever locale data the runtime happens to
 * carry. Asked for Georgian in its own words, a build without Georgian data
 * does not fail — it quietly falls back, so the list came out as `Georgian` on
 * the server and `грузинский` in a browser whose default was Russian: a picker
 * of native names with two impostors in it, and the one reader who most needs
 * to find their language is the one who cannot.
 *
 * Sixteen names is a list, not a database. Written out, it is the same in every
 * runtime, identical on the server and in the browser — which also means the
 * picker cannot cause a hydration mismatch — and it is reviewable by anyone who
 * reads one of these languages. A seventeenth language added to `i18n.config`
 * without a name here is caught by `tests/language-menu.guard.test.cjs`.
 *
 * Written as labels: these appear in a list, where every entry is a name rather
 * than a word in a sentence, so `Русский` and `Français` carry the capital that
 * `Intl`'s prose form (`русский`, `français`) drops.
 */
const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  ar: 'العربية',
  bn: 'বাংলা',
  de: 'Deutsch',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  he: 'עברית',
  it: 'Italiano',
  ja: '日本語',
  ka: 'ქართული',
  ko: '한국어',
  pt: 'Português',
  ru: 'Русский',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  zh: '中文',
};

/**
 * The language's own name in its own script.
 *
 * The table is the answer. `Intl` remains only as the fallback for a code that
 * reaches here without an entry — a language the product does not ship, from a
 * cookie or a profile — where a guessed name still beats a bare code. `Intl`
 * takes BCP-47 only: handed `ka_ge` it throws a RangeError, so the tag is
 * reduced to its primary subtag first.
 */
export const getLanguageName = (languageCode: string) => {
  const { primary } = localeParts(languageCode);
  if (NATIVE_LANGUAGE_NAMES[primary]) {
    return NATIVE_LANGUAGE_NAMES[primary];
  }
  try {
    const displayNames = new Intl.DisplayNames([primary], {
      type: 'language',
    });
    return displayNames.of(primary) || primary;
  } catch (error) {
    // The runtime does not know this language: its own code is still better
    // than an empty cell.
    return primary;
  }
};

/**
 * The same name, guaranteed to be in label form.
 *
 * The shipped names are already written as labels, so for them this returns
 * them unchanged. It still earns its place for a name that came from `Intl`:
 * `Intl` follows each language's own prose convention, so Russian returns
 * `русский` and French `français`. That is correct inside a sentence and wrong
 * in a picker, where every entry is a label and one lowercase initial among
 * capitals reads as a defect.
 *
 * The case is taken in the language's own rules — Turkish `i` uppercases to
 * `İ`, not `I` — which means the tag has to be reduced to its primary subtag
 * first: handed `ka_ge`, `toLocaleUpperCase` throws, and on a server render
 * that is a 500 rather than a wrong letter. Scripts without letter case pass
 * through untouched.
 */
export const getLanguageLabel = (languageCode: string) => {
  const name = getLanguageName(languageCode);
  const { primary } = localeParts(languageCode);
  try {
    return name.charAt(0).toLocaleUpperCase(primary) + name.slice(1);
  } catch {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
};
