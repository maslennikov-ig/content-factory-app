/**
 * The window that opens when the server refuses by role, in the language the
 * person is reading.
 *
 * `content-factory-next-fn33.64`. On the live walkthrough of 04.09.2026 an
 * editor pressed Save on a feed and got a modal that was English end to end —
 * title «Not allowed», the server's English sentence, and a «Close» button —
 * in an otherwise Russian product.
 *
 * The backend cannot fix its own half. `SubscriptionExceptionFilter` answers an
 * API: it has no browser language, no i18next runtime, and its sentence is also
 * what an API client reads. So the translation lives on the screen, keyed by
 * the English sentence the filter sends. That makes one hazard: reword the
 * filter and the screen quietly goes back to English. This test is the thread
 * between the two files.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const filter = read('apps/backend/src/services/auth/permissions/subscription.exception.ts');
const screen = read('apps/frontend/src/components/layout/layout.context.tsx');

/** The two refusals that are about a role rather than a plan limit. */
const ROLE_REFUSALS = [
  'This action is available to organization administrators only. Ask an administrator of your organization to do it for you.',
  'This action is available to organization editors and administrators only. Ask an editor or administrator of your organization to do it for you.',
  'You are not allowed to perform this action.',
];

const LOCALES = [
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

const KEYS = [
  'role_refusal_title',
  'role_refusal_admin_only',
  'role_refusal_editor_only',
  'role_refusal_generic',
  // The button. It already existed; the dialog simply stopped hard-coding it.
  'close',
];

test('the screen knows every role refusal the filter can send', () => {
  for (const sentence of ROLE_REFUSALS) {
    expect(filter).toContain(sentence);
    expect(screen).toContain(sentence);
  }
});

test('nothing in the refusal dialog is written in English by hand', () => {
  const dialog = screen.slice(
    screen.indexOf('const known = BACKEND_REFUSALS[refusal];'),
    screen.indexOf('onlyApprove: true')
  );

  expect(dialog).toContain("i18next.t('role_refusal_title'");
  expect(dialog).toContain("i18next.t('close'");
  expect(dialog).toContain('i18next.t(known.key, known.fallback)');
  // The refusal the server sent is still shown when it is one this table does
  // not know: an unreadable refusal beats no refusal.
  expect(dialog).toContain(': refusal');
});

test.each(LOCALES)('%s carries every key the dialog reads', (locale) => {
  const bundle = JSON.parse(
    read(
      `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
    )
  );

  for (const key of KEYS) {
    expect(typeof bundle[key]).toBe('string');
    expect(bundle[key].trim()).not.toBe('');
  }
});
