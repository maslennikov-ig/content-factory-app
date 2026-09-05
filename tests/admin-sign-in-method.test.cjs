'use strict';

/**
 * `content-factory-next-fn33.124`. The «Method» column of the administrator's
 * account list printed `row.providerName` as it arrived — a Prisma enum value,
 * so a Russian table carried thirty-four rows of `LOCAL`, and a person who
 * signed in with Telegram would have shown up as `TELEGRAM`.
 *
 * The profile screen had solved this long before: `providerLabel` says «Почта
 * и пароль» for `LOCAL` and keeps the brands as brands. This guard holds both
 * screens to that one function, so the enum cannot leak back into either.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const label = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/provider-label.ts'
);
const admin = loadTypeScriptModule(
  'apps/frontend/src/components/admin/admin-users.component.tsx'
);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const row = (providerName) => ({
  id: `id-${providerName.toLowerCase()}`,
  email: `${providerName.toLowerCase()}@cf-dev.local`,
  name: 'Иван Петров',
  activated: true,
  blockedAt: null,
  isSuperAdmin: false,
  providerName,
  createdAt: '2026-09-01T10:00:00.000Z',
  lastOnline: '2026-09-01T10:00:00.000Z',
  organizations: [],
});

const renderList = async (rows) => {
  await act(async () => {
    render(
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(admin.AdminUsersView, {
          allowed: true,
          status: 'all',
          searchInput: '',
          page: 0,
          data: {
            users: rows,
            pending: 0,
            total: rows.length,
            matching: rows.length,
            approvalRequired: true,
          },
          onStatusChange: () => {},
          onSearchInputChange: () => {},
          onApplySearch: () => {},
          onRetry: () => {},
          onAction: () => {},
          onPageChange: () => {},
        })
      )
    );
  });
  await act(async () => {});
};

afterEach(() => cleanup());

describe('providerLabel turns the enum into something a person reads', () => {
  const t = (key, fallback) =>
    key === 'email_and_password' ? 'Почта и пароль' : fallback;

  test('LOCAL is a description and is translated', () => {
    expect(label.providerLabel('LOCAL', undefined, t)).toBe('Почта и пароль');
  });

  test('brands stay brands in every locale', () => {
    expect(label.providerLabel('GOOGLE', undefined, t)).toBe('Google');
    expect(label.providerLabel('TELEGRAM', undefined, t)).toBe('Telegram');
    expect(label.providerLabel('GITHUB', undefined, t)).toBe('GitHub');
    expect(label.providerLabel('FARCASTER', undefined, t)).toBe('Farcaster');
    expect(label.providerLabel('WALLET', undefined, t)).toBe('Wallet');
  });

  test("a deployment's own single sign-on carries its name, and a translated term when it has none", () => {
    expect(label.providerLabel('GENERIC', 'Контур ID', t)).toBe('Контур ID');
    expect(
      label.providerLabel('GENERIC', undefined, (key, fallback) =>
        key === 'sign_in_method_sso' ? 'Единый вход' : fallback
      )
    ).toBe('Единый вход');
  });

  test('a provider nobody has named yet is shown rather than swallowed', () => {
    expect(label.providerLabel('SOMETHING_NEW', undefined, t)).toBe(
      'SOMETHING_NEW'
    );
  });
});

describe('content-factory-next-fn33.124 — the account list stops printing the enum', () => {
  // i18next has no bundle loaded in this harness, so what renders is the
  // English fallback each `t()` call carries. That is enough for the defect in
  // hand: the question is whether the enum value reaches the page at all.
  test('a password account reads words, not LOCAL', async () => {
    await renderList([row('LOCAL')]);
    expect(document.body.textContent).toContain('Email and password');
    expect(document.body.textContent).not.toContain('LOCAL');
  });

  test('Telegram and Google are named, and no shouted enum value survives', async () => {
    await renderList([row('TELEGRAM'), row('GOOGLE'), row('LOCAL')]);
    const text = document.body.textContent;
    expect(text).toContain('Telegram');
    expect(text).toContain('Google');
    for (const raw of ['LOCAL', 'TELEGRAM', 'GOOGLE', 'FARCASTER']) {
      expect(text).not.toContain(raw);
    }
  });
});
