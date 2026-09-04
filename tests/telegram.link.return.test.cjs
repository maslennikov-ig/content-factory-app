const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const { IDENTITY_LINK_INTENT_KEY, identityLinkReturnUrl } =
  loadTypeScriptModule(
    'apps/frontend/src/components/auth/identity-link-return.ts'
  );

const intent = (overrides = {}) =>
  JSON.stringify({
    provider: 'TELEGRAM',
    redirectUri: 'https://app.example/settings',
    state: 'the-state',
    expiresAt: 2_000,
    ...overrides,
  });

const callback = '?provider=TELEGRAM&code=the-code&state=the-state';

describe('Telegram connection returning through the sign-in page', () => {
  test('sends a connection callback on to settings with its code and state', () => {
    expect(
      identityLinkReturnUrl({
        search: callback,
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBe('/settings?code=the-code&state=the-state');
  });

  test('leaves an ordinary sign-in callback alone', () => {
    // No tab of ours asked for a connection, so this is somebody signing in and
    // the page below the gate has to render.
    expect(
      identityLinkReturnUrl({ search: callback, rawIntent: null, now: 1_000 })
    ).toBeNull();
  });

  test.each([
    ['a note from another provider', intent({ provider: 'GOOGLE' })],
    ['an expired note', intent({ expiresAt: 500 })],
    ['a note from a different attempt', intent({ state: 'another-state' })],
    ['a note that is not JSON', 'not-json'],
  ])('refuses to carry a callback with %s', (_case, rawIntent) => {
    expect(
      identityLinkReturnUrl({ search: callback, rawIntent, now: 1_000 })
    ).toBeNull();
  });

  test('a callback without a code or a state goes nowhere', () => {
    expect(
      identityLinkReturnUrl({
        search: '?provider=TELEGRAM&state=the-state',
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBeNull();
    expect(
      identityLinkReturnUrl({
        search: '?provider=TELEGRAM&code=the-code',
        rawIntent: intent(),
        now: 1_000,
      })
    ).toBeNull();
  });

  test('the target is fixed, so a stored note cannot choose where to send anyone', () => {
    const url = identityLinkReturnUrl({
      search: callback,
      rawIntent: intent({ redirectUri: 'https://attacker.example/settings' }),
      now: 1_000,
    });

    expect(url).toBe('/settings?code=the-code&state=the-state');
    expect(url).not.toMatch(/attacker/);
  });

  test('settings and the sign-in page read one storage key', () => {
    // Two spellings of this string would break the connection silently, and
    // only for the person trying to connect an account.
    expect(IDENTITY_LINK_INTENT_KEY).toBe(
      'content-factory:identity-link-intent'
    );
    expect(
      read(
        'apps/frontend/src/components/settings/sign-in-methods.component.tsx'
      )
    ).toContain(
      "from '@contentfactory/frontend/components/auth/identity-link-return'"
    );
  });

  test('the sign-in page puts the gate in front of a Telegram callback', () => {
    const page = read('apps/frontend/src/app/(app)/auth/page.tsx');

    expect(page).toContain('TelegramLinkReturn');
    expect(page).toMatch(/TELEGRAM'\s*&&\s*searchParams\?\.code/);
  });

  test('the gate replaces the callback URL instead of stacking it', () => {
    const gate = read(
      'apps/frontend/src/components/auth/telegram.link.return.tsx'
    );

    // A spent code left in history is an error the back button can reach.
    expect(gate).toContain('window.location.replace(');
    expect(gate).not.toContain('window.location.assign(');
    // Settings claims the note; the gate only reads it.
    expect(gate).toContain('window.sessionStorage.getItem(');
    expect(gate).not.toContain('removeItem');
    expect(gate).toContain('telegram_link_returning_to_settings');
  });
});
