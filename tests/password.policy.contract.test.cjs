const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const policyPath =
  'libraries/nestjs-libraries/src/dtos/auth/password.policy.ts';
const { isPasswordPolicyCompliant } = loadTypeScriptModule(policyPath);

const Provider = { LOCAL: 'LOCAL', GOOGLE: 'GOOGLE' };
const { CreateOrgUserDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts',
  { '@prisma/client': { Provider } },
  {
    sources: {
      './password.policy': policyPath,
      './starter-template':
        'libraries/nestjs-libraries/src/dtos/auth/starter-template.ts',
    },
  }
);
const { ForgotReturnPasswordDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/auth/forgot-return.password.dto.ts',
  {
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'reset-token',
    },
  },
  { sources: { './password.policy': policyPath } }
);
const { LinkUserIdentityDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/users/link-user-identity.dto.ts',
  { '@prisma/client': { Provider } },
  { sources: { '../auth/password.policy': policyPath } }
);

const registration = (password) =>
  Object.assign(new CreateOrgUserDto(), {
    email: 'owner@example.com',
    password,
    provider: Provider.LOCAL,
    providerToken: '',
  });

const reset = (password) =>
  Object.assign(new ForgotReturnPasswordDto(), {
    password,
    repeatPassword: password,
    token: 'reset-token',
  });

const localIdentity = (password) =>
  Object.assign(new LinkUserIdentityDto(), {
    provider: Provider.LOCAL,
    email: 'owner@example.com',
    password,
  });

describe('password policy', () => {
  test.each([
    ['six characters', 'A1!abc'],
    ['seven characters without a symbol', 'Abcdef1'],
    ['more than sixty-four characters', `A1!${'a'.repeat(62)}`],
  ])('%s is refused', async (_caseName, password) => {
    expect(isPasswordPolicyCompliant(password)).toBe(false);
    await expect(validate(registration(password))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ])
    );
    await expect(validate(reset(password))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ])
    );
    await expect(validate(localIdentity(password))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'password' }),
      ])
    );
  });

  test('a seven-character Unicode letter, digit and symbol password passes', async () => {
    const password = 'Ж1!abcd';
    expect(isPasswordPolicyCompliant(password)).toBe(true);
    await expect(validate(registration(password))).resolves.toHaveLength(0);
    await expect(validate(reset(password))).resolves.toHaveLength(0);
    await expect(validate(localIdentity(password))).resolves.toHaveLength(0);
  });

  test('sixty-four Unicode code points remain valid above 72 UTF-8 bytes', async () => {
    const password = `Ж1!${'я'.repeat(61)}`;
    expect(Array.from(password)).toHaveLength(64);
    expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(72);
    expect(isPasswordPolicyCompliant(password)).toBe(true);
    await expect(validate(registration(password))).resolves.toHaveLength(0);
    await expect(validate(reset(password))).resolves.toHaveLength(0);
    await expect(validate(localIdentity(password))).resolves.toHaveLength(0);
  });

  test('the Settings backend DTO adopts the shared LOCAL password policy', () => {
    const source = read(
      'libraries/nestjs-libraries/src/dtos/users/link-user-identity.dto.ts'
    );

    expect(source).toContain('password.policy');
    expect(source).not.toMatch(/MinLength\(6\)|MaxLength\(128\)/);
  });

  test('registration delegates password length entirely to the shared policy', () => {
    const source = read(
      'libraries/nestjs-libraries/src/dtos/auth/create.org.user.dto.ts'
    );

    expect(source).not.toMatch(/@MinLength\(3\)\s*@localPasswordPolicy/);
  });

  test('all four frontend password surfaces import the one policy and no old minimum remains', () => {
    const surfaces = [
      'apps/frontend/src/components/auth/register.tsx',
      'apps/frontend/src/components/auth/forgot-return.tsx',
      'apps/frontend/src/components/public-saas/email-first-signup.tsx',
      'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
    ];

    for (const file of surfaces) {
      const source = read(file);
      expect(source).toContain('password.policy');
      expect(source).toContain('password_policy_error');
      expect(source).not.toMatch(
        /minLength=\{12\}|password\.length < 6|MinLength\(12\)|12\.\.64/
      );
    }
  });

  test('all sixteen locales explain the one password policy', () => {
    const locales = fs
      .readdirSync(
        path.join(
          root,
          'libraries/react-shared-libraries/src/translation/locales'
        )
      )
      .map((locale) =>
        path.join(
          root,
          'libraries/react-shared-libraries/src/translation/locales',
          locale,
          'translation.json'
        )
      );

    expect(locales).toHaveLength(16);
    for (const locale of locales) {
      const translation = JSON.parse(fs.readFileSync(locale, 'utf8'));
      expect(translation.password_policy_hint).toBeTruthy();
      expect(translation.password_policy_error).toBeTruthy();
      expect(translation.password_minimum_six_characters).toBeUndefined();
      expect(translation.use_six_characters).toBeUndefined();
    }
  });
});
