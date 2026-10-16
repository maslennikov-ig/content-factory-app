const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localesRoot = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);
const i18nConfigPath = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/i18n.config.ts'
);

const shippedLocales = [
  'en',
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
const rtlLocales = ['he', 'ar'];
const assistantChromeKeys = [
  'assistant_navigation_group',
  'assistant_sections',
  'assistant_artifacts',
  'assistant_workspace',
  'assistant_hide',
  'assistant_expand',
  'assistant_collapse',
  'assistant_restore',
  'assistant_chat',
  'assistant_material',
  'assistant_open_in_section',
  'assistant_discuss',
  'assistant_in_context',
  'assistant_remove_context',
  'assistant_new_artifact',
  'assistant_workspace_empty',
  'assistant_workspace_search',
  'assistant_working',
  'assistant_stopped',
  'assistant_reconcile',
  'assistant_context_unavailable',
  'assistant_unsaved',
  'assistant_manual_edits',
  'assistant_resize',
  'assistant_period',
  'assistant_current_object',
  'assistant_select',
  'assistant_interrupted_note',
  'assistant_period_empty',
  'assistant_period_clarify',
  'assistant_period_gaps',
  'assistant_avatars',
  'assistant_pieces',
  'assistant_artifact_search',
  'assistant_artifacts_empty',
  'assistant_no_results',
  'assistant_access_restricted',
  'assistant_unknown_result',
  'assistant_ideas',
  'assistant_facts',
];
const assistantTitles = {
  en: 'AI assistant',
  he: 'עוזר בינה מלאכותית',
  ru: 'ИИ-помощник',
  zh: 'AI 助手',
  fr: 'Assistant IA',
  es: 'Asistente de IA',
  pt: 'Assistente de IA',
  de: 'KI-Assistent',
  it: 'Assistente IA',
  ja: 'AIアシスタント',
  ko: 'AI 도우미',
  ar: 'مساعد الذكاء الاصطناعي',
  tr: 'Yapay zekâ asistanı',
  vi: 'Trợ lý AI',
  bn: 'এআই সহকারী',
  ka_ge: 'AI ასისტენტი',
};

function readConfiguredLocales() {
  const config = fs.readFileSync(i18nConfigPath, 'utf8');
  const fallback = config.match(/export const fallbackLng = '([^']+)'/)?.[1];
  const languagesBlock = config.match(
    /export const languages = \[([\s\S]*?)\];/
  )?.[1];
  const rtlBlock = config.match(
    /export const rtlLanguages = \[([\s\S]*?)\];/
  )?.[1];

  expect(fallback).toBeTruthy();
  expect(languagesBlock).toBeTruthy();
  expect(rtlBlock).toBeTruthy();

  const languages = languagesBlock
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (token === 'fallbackLng') return fallback;
      const locale = token.match(/^'([^']+)'$/)?.[1];
      expect(locale).toBeTruthy();
      return locale;
    });

  return {
    languages,
    rtlLanguages: [...rtlBlock.matchAll(/'([^']+)'/g)].map(([, locale]) => locale),
  };
}

test('assistant navigation, picker, period, and recovery copy cover all shipped locales, including RTL', () => {
  const configured = readConfiguredLocales();
  expect(configured.languages).toEqual(shippedLocales);
  expect(configured.rtlLanguages).toEqual(rtlLocales);

  const localeDirectories = fs
    .readdirSync(localesRoot, { withFileTypes: true })
    .filter((entry) =>
      fs.existsSync(path.join(localesRoot, entry.name, 'translation.json'))
    )
    .map((entry) => entry.name)
    .sort();
  expect(localeDirectories).toEqual([...shippedLocales].sort());

  for (const locale of shippedLocales) {
    const translation = JSON.parse(
      fs.readFileSync(
        path.join(localesRoot, locale, 'translation.json'),
        'utf8'
      )
    );

    expect(translation.agent).toBe(assistantTitles[locale]);
    for (const key of assistantChromeKeys) {
      expect(typeof translation[key]).toBe('string');
      expect(translation[key].trim()).toBeTruthy();
    }

    expect(translation.agent_ai_unavailable_title).not.toBe(
      'The agent cannot answer yet'
    );
    expect(translation.agent_checking_ai).not.toBe('Checking whether AI is connected…');
  }

  const english = JSON.parse(
    fs.readFileSync(path.join(localesRoot, 'en', 'translation.json'), 'utf8')
  );
  const russian = JSON.parse(
    fs.readFileSync(path.join(localesRoot, 'ru', 'translation.json'), 'utf8')
  );
  expect(
    english.assistant_interrupted_note,
  ).toBe('The displayed reply was interrupted. Check the saved result before continuing.');
  expect(
    russian.assistant_interrupted_note,
  ).toBe('Ответ прерван. Проверьте сохранённый результат перед продолжением.');
  expect(english.assistant_unknown_result).toBe(
    'The reply was interrupted before the conversation ID arrived. Check conversation history: the action may have been saved. You can start a new conversation.'
  );
  expect(russian.assistant_unknown_result).toBe(
    'Ответ прерван до получения номера разговора. Проверьте историю: действие могло сохраниться. Можно начать новый разговор.'
  );
});
