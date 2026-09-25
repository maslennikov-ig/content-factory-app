export const contentLanguages = ['en', 'ru'] as const;

export type ContentLanguage = (typeof contentLanguages)[number];

export const contentLanguageNames: Record<ContentLanguage, string> = {
  en: 'English',
  ru: 'Russian',
};

/**
 * The English name of any locale a prompt may be written for — the two
 * content languages by `contentLanguageNames`, a brand-voice locale beyond
 * them by the runtime's own table. Prompts are English (`97dq.97`) and name
 * the output language with this; an unknown code is returned as it is.
 */
export const languageNameOf = (locale: string): string => {
  if (locale in contentLanguageNames) {
    return contentLanguageNames[locale as ContentLanguage];
  }
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
};

export const contentLanguageInstruction = (language: ContentLanguage) =>
  'Write every human-readable part of the post in ' +
  contentLanguageNames[language] +
  '.';

export const defaultContentLanguageForIntegrations = (
  integrations: Array<{ contentLanguage?: string }>,
  current: ContentLanguage
): ContentLanguage => {
  const languages = new Set(
    integrations
      .map(({ contentLanguage }) => contentLanguage)
      .filter(
        (contentLanguage): contentLanguage is ContentLanguage =>
          contentLanguage === 'en' || contentLanguage === 'ru'
      )
  );
  return languages.size === 1 ? [...languages][0] : current;
};

const containsCyrillic = (value: string) => /[А-ЯЁа-яё]/.test(value);

/**
 * Keep existing custom vocabulary in the matching script and add the product
 * defaults. This lets Russian channels learn from their own history without
 * mixing English labels into the classifier.
 */
export const localizedVocabulary = (
  existing: string[],
  defaults: readonly string[],
  language: ContentLanguage
) =>
  Array.from(
    new Set([
      ...existing.filter((value) =>
        language === 'ru' ? containsCyrillic(value) : !containsCyrillic(value)
      ),
      ...defaults,
    ])
  );
