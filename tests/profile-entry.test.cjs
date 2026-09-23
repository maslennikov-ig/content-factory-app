const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('profile discovery', () => {
  test('the signed shell exposes a direct Profile entry', () => {
    const sidebar = read('apps/frontend/src/components/new-layout/sidebar.tsx');

    // The route, not the attribute that carries it: since 04.09.2026 the
    // entry is a `MenuItem` like every other navigation row, so the address
    // sits in `path` rather than in a hand-written `href`
    // (`content-factory-next-fn33.10`).
    expect(sidebar).toContain('"/settings?tab=profile"');
    expect(sidebar).toContain("t('profile', 'Profile')");
  });

  test('the Profile tab names the section and keeps account actions together', () => {
    const settings = read(
      'apps/frontend/src/components/layout/settings.component.tsx'
    );
    expect(settings).toContain("tab: 'profile'");
    expect(settings).toContain('<ProfileSettings getRef={getRef} />');

    // The tab itself lives in its own file since 23.09.2026 (97dq.51): one
    // column, the header, «О вас», «Язык и время», «Вход и пароль».
    const profile = read(
      'apps/frontend/src/components/settings/profile.component.tsx'
    );
    expect(profile).toContain('aria-labelledby="profile-heading"');
    expect(profile).toContain('max-w-[720px]');
    expect(profile).toContain("form.register('fullname')");
    expect(profile).toContain("form.register('lastName')");
    expect(profile).toContain('name="bio"');
    expect(profile).toContain('picture?.path');
    expect(profile).toContain('size={72}');
    // The row that replaced the bare «Сменить пароль» link names the methods
    // and leads to the tab that owns them.
    expect(profile).toContain('href="/settings?tab=sign_in_methods"');
    expect(profile).toContain("t('sign_in_methods', 'Sign-in methods')");
    expect(profile).toContain('useAccountLanguage()');
    // The profile saves itself through the shared `useAutosave` (97dq.58);
    // «Сохранить» stays for whoever wants to press it, and a busy button
    // keeps its width.
    expect(profile).toMatch(
      /<Button\s+type="submit"\s+loading=\{form\.formState\.isSubmitting\}/
    );
    expect(profile).toContain('useAutosave');
  });

  test('the profile header reads the person, the role and the workspace', () => {
    const profile = read(
      'apps/frontend/src/components/settings/profile.component.tsx'
    );
    expect(profile).toContain('useOrganizationRoleName()');
    expect(profile).toContain("'organizations'");
    expect(profile).toContain('words.memberSince(since)');
    expect(profile).toContain('formatLocalizedDate(user.createdAt');
  });

  test('the time zone goes to User.timezone as its offset in minutes', () => {
    const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
    const { offsetMinutes, timezoneLabel } = loadTypeScriptModule(
      'apps/frontend/src/components/settings/profile.component.tsx',
      {},
      {
        // Only the pure helper is under test; everything the screen draws
        // with is scenery.
        resolve: (request) =>
          request === 'dayjs' ||
          request.startsWith('dayjs/') ||
          request === 'timezones-list'
            ? undefined
            : {},
      }
    );

    expect(offsetMinutes('+03:00')).toBe(180);
    expect(offsetMinutes('+05:30')).toBe(330);
    expect(offsetMinutes('-09:30')).toBe(-570);
    expect(offsetMinutes('+00:00')).toBe(0);
    expect(offsetMinutes('')).toBeUndefined();
    expect(offsetMinutes(undefined)).toBeUndefined();

    // Twelfth stand walk: the select showed «Europe/Moscow (GMT+03:00)».
    const cities = { 'Europe/Moscow': 'Москва' };
    expect(timezoneLabel('Europe/Moscow', '+03:00', cities)).toBe('Москва, UTC+3');
    expect(timezoneLabel('Asia/Kolkata', '+05:30', cities)).toBe('Kolkata, UTC+5:30');
    expect(timezoneLabel('America/New_York', '-05:00', {})).toBe('New York, UTC−5');
    expect(timezoneLabel('Etc/Unknown', '', {})).toBe('Unknown');
  });

  test('the language and time selects stay inside the card at 390px', () => {
    const profile = read(
      'apps/frontend/src/components/settings/profile.component.tsx'
    );
    expect(profile).not.toContain('className="grid gap-[16px] sm:grid-cols-2"');
    expect(profile).toContain('grid grid-cols-1 gap-[16px] sm:grid-cols-2');
    expect(profile).toContain('timezoneLabel(');
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
