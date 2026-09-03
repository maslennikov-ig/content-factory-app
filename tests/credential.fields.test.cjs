const fs = require('node:fs');
const path = require('node:path');

const read = (file) =>
  fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

/**
 * Two different secrets, two different fields, and the difference matters.
 *
 * An account password is a password: the manager may fill it, generate it and
 * save it, and every one of those is the behaviour the operator wants. A pasted
 * API key only looks like one. Typing it as a password hands it to the manager,
 * and no value of `autocomplete` takes it back — `off` is ignored on a password
 * field, so the manager offers the site login; `new-password` stops that but
 * announces that a password is being created here, so the browser offers to
 * generate one and then to save it. The first reading once filled the AI key
 * box with the operator's own login password, one unnoticed Save away from
 * being encrypted into the database as the model key; the second turned the box
 * into a password generator. The key field is therefore not a password field at
 * all — it is `secret`, an ordinary text field masked in CSS that the browser
 * has no reason to touch.
 */
const accountPasswordFields = [
  'apps/frontend/src/components/auth/register.tsx',
  'apps/frontend/src/components/auth/forgot-return.tsx',
  'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
  'apps/frontend/src/components/public-saas/email-first-signup.tsx',
];

const pastedCredentialFields = [
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
];

/** Every shared field element in the file, sliced to its closing tag. */
const inputs = (source) => {
  const elements = [];
  let from = source.search(/<(?:Input|PasswordInput)\b/);
  while (from !== -1) {
    const end = source.indexOf('/>', from);
    if (end === -1) break;
    elements.push(source.slice(from, end + 2));
    const next = source.slice(end + 2).search(/<(?:Input|PasswordInput)\b/);
    from = next === -1 ? -1 : end + 2 + next;
  }
  return elements;
};

const passwordInputs = (source) =>
  inputs(source).filter(
    (element) =>
      /^<PasswordInput\b/.test(element) || /type="password"/.test(element)
  );

describe('credential fields', () => {
  test.each(accountPasswordFields)(
    '%s sets a new account password and says so',
    (file) => {
      const fields = passwordInputs(read(file));

      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field).toContain('autoComplete="new-password"');
      }
    }
  );

  test('the login form still accepts the saved password', () => {
    const login = read('apps/frontend/src/components/auth/login.tsx');

    expect(passwordInputs(login).length).toBeGreaterThan(0);
    expect(login).not.toContain('autoComplete="new-password"');
  });

  test.each(pastedCredentialFields)(
    '%s carries no password field for the manager to claim',
    (file) => {
      const source = read(file);
      const secretFields = inputs(source).filter((element) =>
        /secret={true}/.test(element)
      );

      expect(passwordInputs(source)).toHaveLength(0);
      expect(source).not.toContain('autoComplete="new-password"');
      expect(secretFields.length).toBeGreaterThan(0);
    }
  );

  test('a secret field is masked without being a credential', () => {
    const input = read('libraries/react-shared-libraries/src/form/input.tsx');
    const global = read('apps/frontend/src/app/global.scss');

    expect(input).toContain("type: 'text'");
    expect(input).toContain("autoComplete: 'off'");
    expect(input).toContain('cf-secret-input');

    const rule = global.match(/\.cf-secret-input[\s\S]*?\n}/)?.[0];
    expect(rule).toBeDefined();
    expect(rule).toContain('-webkit-text-security: disc');
  });

  test('an autofilled field keeps the product surface in both themes', () => {
    const global = read('apps/frontend/src/app/global.scss');
    const rule = global.match(/input:-webkit-autofill[\s\S]*?\n}/)?.[0];

    expect(rule).toBeDefined();
    expect(rule).toContain('-webkit-text-fill-color: var(--cf-ink)');
    expect(rule).toContain('var(--cf-surface)');
    // The browser rule wins over an ordinary declaration.
    expect(rule).toMatch(/box-shadow:[^;]*!important/);
  });
});
