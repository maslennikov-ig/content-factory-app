const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const passwordConsumers = [
  'apps/frontend/src/components/auth/login.tsx',
  'apps/frontend/src/components/auth/register.tsx',
  'apps/frontend/src/components/auth/forgot-return.tsx',
  'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
  'apps/frontend/src/components/public-saas/email-first-signup.tsx',
];

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('PasswordInput adoption', () => {
  test.each(passwordConsumers)(
    '%s uses the shared password control',
    (file) => {
      const source = read(file);
      expect(source).toContain(
        "from '@contentfactory/react/form/password-input'"
      );
      const rawPasswordInput = /<Input\b[^>]*\btype=["']password["'][^>]*\/>/;
      expect(source).not.toMatch(rawPasswordInput);
      expect(source).toMatch(/<PasswordInput\b/);
    }
  );
});
