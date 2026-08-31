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
 * The language's own name in its own script. `Intl` takes BCP-47 only: handed
 * `ka_ge` it throws a RangeError, and the Georgian entry in the picker read
 * `ka_ge` instead of ქართული.
 */
export const getLanguageName = (languageCode: string) => {
  const { primary } = localeParts(languageCode);
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
 * The same name, as a label rather than as a word in a sentence.
 *
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
