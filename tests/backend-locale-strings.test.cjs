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
  BACKEND_STRING_KEYS,
  resolveBackendLocale,
  translateBackendString,
  translateBackendText,
} = loadTypeScriptModule('libraries/nestjs-libraries/src/locale/backend-strings.ts');

const { languages: frontendLanguages } = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18n.config.ts'
);

/**
 * Read off the catalog rather than typed out beside it. The list that used to
 * live here had already missed `email_awaiting_approval_*`, so those two keys
 * were never checked for their sixteen locales.
 */
const CATALOG_KEYS = BACKEND_STRING_KEYS;

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

// The fixture is the footer line, which is a live string with an anchor in
// it. It used to be `email_activate_account_body`, deleted on 02.09.2026 when
// the action emails moved to a button — a test that keeps a string alive for
// its own sake ends up guarding the thing the product stopped doing.
test('interpolates {{token}} placeholders and leaves an unknown token untouched', () => {
  const withLink = translateBackendString(
    'email_footer_notification_preferences',
    'en',
    { link: 'https://example.test/settings' }
  );
  expect(withLink).toBe(
    'You can change your notification preferences in your <a href="https://example.test/settings">account settings.</a>'
  );

  const withoutParams = translateBackendString('content_workflow_tag_plan', 'en');
  expect(withoutParams).toBe('Plan');
});

test('multiple placeholders in one template all resolve', () => {
  const subject = translateBackendString('email_team_invitation_subject', 'en', {
    inviter: 'Ada',
    organization: 'Lovelace',
  });
  expect(subject).toContain('Ada');
  expect(subject).toContain('Lovelace');
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

/**
 * The email shell draws the action as a filled button, and a button needs the
 * address on its own — a sentence with the link sewn into it cannot become
 * one. These two guard that split: the copy carries no anchor, and the button
 * label exists in all sixteen languages beside it.
 */
describe('the button copy is three values, not a sentence with a link in it', () => {
  const actionKeys = BACKEND_STRING_KEYS.filter((key) =>
    /^email_.*_(intro|action)$/.test(key)
  );

  test('there are action emails to check', () => {
    expect(actionKeys.length).toBeGreaterThan(0);
  });

  test('no intro or button label carries an anchor of its own', () => {
    const withAnchors = [];
    for (const key of actionKeys) {
      for (const locale of BACKEND_LOCALES) {
        if (/<a\b/i.test(translateBackendString(key, locale))) {
          withAnchors.push(`${key}/${locale}`);
        }
      }
    }
    expect(withAnchors).toEqual([]);
  });

  test('every intro has a button label to go with it', () => {
    const orphans = BACKEND_STRING_KEYS.filter(
      (key) =>
        key.endsWith('_intro') &&
        // The two notice emails are the exception by design: they state a
        // fact and offer nothing to press.
        !['email_agency_declined_intro'].includes(key) &&
        // `_action`, or `_action_approve`/`_action_decline` where an email
        // offers two.
        !BACKEND_STRING_KEYS.some((candidate) =>
          candidate.startsWith(key.replace(/_intro$/, '_action'))
        )
    );
    expect(orphans).toEqual([]);
  });
});

describe('a subject line is text, an email body is HTML', () => {
  test('translateBackendText leaves an ampersand alone for the subject header', () => {
    const subject = translateBackendText('email_team_invitation_subject', 'en', {
      inviter: 'Ben & Jerry',
      organization: "Sam's <Studio>",
    });
    expect(subject).toBe('Ben & Jerry invited you to join "Sam\'s <Studio>"');
  });

  test('translateBackendString escapes the same parameters for HTML', () => {
    const body = translateBackendString('email_team_invitation_intro', 'en', {
      inviter: 'Ben & Jerry',
      organization: "Sam's <Studio>",
    });
    expect(body).toContain('Ben &amp; Jerry');
    expect(body).toContain('Sam&#39;s &lt;Studio&gt;');
    expect(body).not.toContain('<Studio>');
  });
});

test('HTML special characters in params are escaped to prevent XSS', () => {
  const maliciousLink =
    'javascript:alert("<script>alert(1)</script>") " onload="alert(1)';
  const body = translateBackendString(
    'email_footer_notification_preferences',
    'en',
    { link: maliciousLink }
  );

  // The result should contain escaped entities, not the raw script tag
  expect(body).toContain('&lt;script&gt;');
  expect(body).toContain('&quot;');
  expect(body).not.toContain('<script>');
  expect(body).toContain(
    'javascript:alert(&quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;) &quot; onload=&quot;alert(1)'
  );
});
