/**
 * One password rule, sixteen sentences, no second copy of the numbers.
 *
 * `password_policy_hint` and `password_policy_error` spelled "7–64" out by
 * hand in all sixteen locale files while the code enforced `PASSWORD_POLICY`.
 * Changing the policy would have left sixteen translations quietly claiming
 * the old rule, and nothing would have said so (content-factory-next-fn33.10).
 * The strings interpolate now, and this refuses a hand-typed number in any
 * script — Bengali `৭` is a digit as much as `7` is.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);
const POLICY_KEYS = ['password_policy_hint', 'password_policy_error'];
const ANY_DIGIT = /\p{Nd}/u;

const { PASSWORD_POLICY, PASSWORD_POLICY_RANGE, PASSWORD_POLICY_ERROR_MESSAGE } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/auth/password.policy.ts'
  );

const surfaces = [
  'apps/frontend/src/components/auth/register.tsx',
  'apps/frontend/src/components/auth/forgot-return.tsx',
  'apps/frontend/src/components/public-saas/email-first-signup.tsx',
  'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
];

describe('the password policy numbers live in one place', () => {
  test('the interpolation values are the policy itself', () => {
    expect(PASSWORD_POLICY_RANGE).toEqual({
      min: PASSWORD_POLICY.minLength,
      max: PASSWORD_POLICY.maxLength,
    });
  });

  test('no locale writes the range by hand', () => {
    const locales = fs
      .readdirSync(localesDir)
      .filter((locale) =>
        fs.existsSync(path.join(localesDir, locale, 'translation.json'))
      );

    expect(locales).toHaveLength(16);

    const offenders = {};
    for (const locale of locales) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(localesDir, locale, 'translation.json'), 'utf8')
      );
      for (const key of POLICY_KEYS) {
        const value = messages[key];
        const problems = [];
        if (typeof value !== 'string' || !value.trim()) {
          problems.push('missing');
        } else {
          if (!value.includes('{{min}}')) problems.push('no {{min}}');
          if (!value.includes('{{max}}')) problems.push('no {{max}}');
          if (ANY_DIGIT.test(value.replace(/\{\{\w+\}\}/g, ''))) {
            problems.push('a digit written by hand');
          }
        }
        if (problems.length) offenders[`${locale}.${key}`] = problems;
      }
    }

    expect(offenders).toEqual({});
  });

  test('every screen that shows the rule passes the numbers to it', () => {
    for (const surface of surfaces) {
      const source = fs.readFileSync(path.join(root, surface), 'utf8');
      for (const key of POLICY_KEYS) {
        expect(source).toMatch(
          new RegExp(`'${key}',[\\s\\S]{0,200}?PASSWORD_POLICY_RANGE`)
        );
      }
      // A literal range in the English default is the same drift one file
      // further in.
      expect(source).not.toMatch(/Use \d+[–-]\d+ characters/);
    }
  });

  // The backend answers a refused password in English, and the frontend
  // recognises that exact sentence to swap in the translated one. It is the
  // third copy of the same two numbers.
  test('the English message the server sends states the same range', () => {
    expect(PASSWORD_POLICY_ERROR_MESSAGE).toContain(
      `${PASSWORD_POLICY.minLength} to ${PASSWORD_POLICY.maxLength}`
    );
  });
});
