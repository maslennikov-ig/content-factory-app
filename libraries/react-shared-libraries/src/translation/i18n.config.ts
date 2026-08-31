export const fallbackLng = 'en';
export const languages = [
  fallbackLng,
  'he',
  'ru',
  'zh',
  'fr',
  'es',
  'pt',
  'de',
  'it',
  'ja',
  'ko',
  'ar',
  'tr',
  'vi',
  'bn',
  'ka_ge',
];

const asBcp47 = (language: string) => {
  const [primary, ...subtags] = language.split(/[-_]/);
  return [
    primary.toLowerCase(),
    ...subtags.map((subtag) =>
      subtag.length === 2 ? subtag.toUpperCase() : subtag
    ),
  ].join('-');
};

/** BCP-47 forms used only at the HTTP Accept-Language boundary. */
export const languageTags = languages.map(asBcp47);

/**
 * The shipped locale id for an HTTP language tag, or nothing when this product
 * does not ship that language. Callers that need a language either way use
 * `languageFromBcp47`; callers deciding whether the browser asked for anything
 * at all need to tell a real match from the fallback.
 */
export const matchLanguageTag = (language?: string | null) => {
  const tag = language ? asBcp47(language).toLowerCase() : '';
  return languages.find(
    (candidate) => asBcp47(candidate).toLowerCase() === tag
  );
};

/** Convert an HTTP language tag back to the stable locale id used by i18next. */
export const languageFromBcp47 = (language?: string | null) =>
  matchLanguageTag(language) || fallbackLng;

export const defaultNS = 'translation';
export const cookieName = 'i18next';
export const headerName = 'x-i18next-current-language';

/** The languages this product ships that are written right to left. */
export const rtlLanguages = ['he', 'ar'];

export const languageDirection = (language: string) =>
  rtlLanguages.includes(language) ? 'rtl' : 'ltr';
