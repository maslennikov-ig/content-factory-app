const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('profile discovery', () => {
  test('the signed shell exposes a direct Profile entry', () => {
    const sidebar = read('apps/frontend/src/components/new-layout/sidebar.tsx');

    expect(sidebar).toContain('href="/settings?tab=profile"');
    expect(sidebar).toContain("t('profile', 'Profile')");
  });

  test('the Profile tab names the section and keeps account actions together', () => {
    const settings = read(
      'apps/frontend/src/components/layout/settings.component.tsx'
    );

    expect(settings).toContain("tab: 'profile'");
    expect(settings).toContain('aria-labelledby="profile-heading"');
    expect(settings).toContain("form.register('fullname')");
    expect(settings).toContain('picture?.path');
    expect(settings).toContain('href="/settings?tab=sign_in_methods"');
    expect(settings).toContain("t('change_password', 'Change Password')");
    expect(settings).toContain(
      "<Button type=\"submit\">{t('save', 'Save')}</Button>"
    );
  });

  test('Profile is translated in every shipped locale', () => {
    const localesRoot = path.join(
      root,
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const locales = fs
      .readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(locales).toHaveLength(16);
    for (const locale of locales) {
      const translation = JSON.parse(
        fs.readFileSync(
          path.join(localesRoot, locale, 'translation.json'),
          'utf8'
        )
      );
      expect(translation.profile).toEqual(expect.any(String));
      expect(translation.profile.trim()).not.toBe('');
    }
  });
});
