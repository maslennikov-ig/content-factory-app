const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * The backend's own catalog (`libraries/nestjs-libraries/src/locale`),
 * exercised on its own — no NestJS service in front of it. It has to prove
 * three things: it lists the same sixteen locales the frontend ships, every
 * key it carries actually has all sixteen filled in (nobody quietly typed
 * eleven and moved on), and an unknown locale or key never throws.
 */
const {
  BACKEND_LOCALES,
  BACKEND_FALLBACK_LOCALE,
  resolveBackendLocale,
  translateBackendString,
} = loadTypeScriptModule('libraries/nestjs-libraries/src/locale/backend-strings.ts');

const { languages: frontendLanguages } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18n.config.ts'
);

const CATALOG_KEYS = [
  'content_workflow_tag_plan',
  'content_workflow_tag_draft',
  'content_workflow_tag_review',
  'content_workflow_tag_schedule',
  'email_activate_account_subject',
  'email_activate_account_body',
  'email_reset_password_subject',
  'email_reset_password_body',
  'email_confirm_identity_subject',
  'email_confirm_identity_body',
  'email_login_changed_subject',
  'email_login_changed_body',
  'email_footer_notification_preferences',
];

test('the backend locale list is exactly the sixteen the frontend ships, same order', () => {
  expect(BACKEND_LOCALES).toEqual(frontendLanguages);
  expect(BACKEND_LOCALES).toHaveLength(16);
});

test('the fallback locale is English', () => {
  expect(BACKEND_FALLBACK_LOCALE).toBe('en');
});

describe('resolveBackendLocale never leaves a caller without a shipped locale', () => {
  test.each([
    ['a shipped locale', 'ru', 'ru'],
    ['undefined', undefined, 'en'],
    ['null', null, 'en'],
    ['empty string', '', 'en'],
    ['a locale this deployment does not ship', 'xx-not-real', 'en'],
    ['a non-string value', 42, 'en'],
    ['an object', { language: 'ru' }, 'en'],
  ])('%s resolves to %s', (_label, input, expected) => {
    expect(resolveBackendLocale(input)).toBe(expected);
  });
});

test('every catalog key carries all sixteen shipped locales, none left out', () => {
  const missing = [];
  for (const key of CATALOG_KEYS) {
    for (const locale of BACKEND_LOCALES) {
      const value = translateBackendString(key, locale);
      if (typeof value !== 'string' || !value.trim()) {
        missing.push(`${key}/${locale}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test('interpolates {{token}} placeholders and leaves an unknown token untouched', () => {
  const withLink = translateBackendString('email_activate_account_body', 'en', {
    link: 'https://example.test/activate',
  });
  expect(withLink).toBe(
    'Click <a href="https://example.test/activate">here</a> to activate your account'
  );

  const withoutParams = translateBackendString('content_workflow_tag_plan', 'en');
  expect(withoutParams).toBe('Plan');
});

test('multiple placeholders in one template all resolve', () => {
  const body = translateBackendString('email_confirm_identity_body', 'en', {
    link: 'https://example.test/confirm',
    minutes: 20,
  });
  expect(body).toContain('https://example.test/confirm');
  expect(body).toContain('20 minutes');
});

test('Russian and English carry different text for the same key, not a copy-pasted English string', () => {
  const en = translateBackendString('email_activate_account_subject', 'en');
  const ru = translateBackendString('email_activate_account_subject', 'ru');
  expect(ru).not.toBe(en);
  // Written in Cyrillic, not just "not equal to the English string" by accident.
  expect(ru).toMatch(/[А-яЁё]/);
});

test('the four content-workflow tag names are Cyrillic in Russian and distinct from each other', () => {
  const names = [
    'content_workflow_tag_plan',
    'content_workflow_tag_draft',
    'content_workflow_tag_review',
    'content_workflow_tag_schedule',
  ].map((key) => translateBackendString(key, 'ru'));

  expect(names).toEqual(['План', 'Черновик', 'Проверка', 'Расписание']);
  expect(new Set(names).size).toBe(4);
});
