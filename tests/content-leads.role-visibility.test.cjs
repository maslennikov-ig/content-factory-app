'use strict';

/**
 * «Откуда идеи» under a role, and the calendar cell that reached around a
 * hidden button (content-factory-next-fn33.63, content-factory-next-fn33.67).
 *
 * Both are the same defect in two places: a door that answers `403` to
 * everyone but an administrator, with a live control in front of it. On the
 * live walkthrough of 04.09.2026 an editor filled in «Название» and «Адрес
 * ленты (RSS)», pressed «Сохранить» and lost the lot to a refusal that only
 * arrived then — while «Указать канал» beside it was correctly disabled, so
 * one screen contradicted itself. In the calendar, a workspace with no
 * channel opened the whole provider catalogue from an empty cell, the same
 * modal `AddProviderButton` already hides from a member.
 *
 * `docs/product/roles-matrix.md` records both doors; this guard holds the
 * navigation honest about them.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
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

const { act, cleanup, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const LEADS = 'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx';
const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';

const leads = loadTypeScriptModule(LEADS);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const SUBSCRIPTION = {
  id: 'sub-1',
  kind: 'RSS',
  displayName: 'Хабр — всё подряд',
  canonicalUrl: 'https://habr.com/ru/rss/all/all/',
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 2,
  acceptedThisMonth: 1,
  linkedAutoPost: null,
};

// `content-factory-next-fn33.65`: the shared request helper hands the common
// refusal handler a copy of the response, so a fake answer has to be
// clonable the way a real `Response` is.
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const serve = (table) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const answer = table[`${method} ${url}`];
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer() : answer;
  };
};

const renderTab = async (role) => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role } },
          React.createElement(
            variables.VariableContextComponent,
            { language: 'ru' },
            React.createElement(leads.ContentLeadsTab)
          )
        )
      )
    );
  });
  await act(async () => {});
};

const withSubscriptions = () =>
  serve({
    'GET /content-intelligence/leads/subscriptions': ok({
      subscriptions: [SUBSCRIPTION],
      capabilities: { feedCheck: true },
    }),
    'GET /content-intelligence/leads/queue?status=NEW': ok({ leads: [] }),
  });

const withNothing = () =>
  serve({
    'GET /content-intelligence/leads/subscriptions': ok({
      subscriptions: [],
      capabilities: { feedCheck: true },
    }),
    'GET /content-intelligence/leads/queue?status=NEW': ok({ leads: [] }),
  });

afterEach(() => {
  cleanup();
  delete global.fetch;
});

describe('content-factory-next-fn33.63 — the feed doors are administrator doors, and the screen says so before the work', () => {
  test('an editor is told the section is read-only and is offered none of the three actions', async () => {
    withSubscriptions();
    await renderTab('EDITOR');

    expect(
      document.querySelector('[data-content-leads-read-only]')
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить подписку' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Проверить сейчас' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отписаться' })).toBeNull();
    // The list itself stays readable: reading who is watched is not an
    // administrator door.
    expect(document.body.textContent).toContain('Хабр — всё подряд');
  });

  test('an editor looking at an empty section still sees the explanation, with the button disabled rather than live', async () => {
    withNothing();
    await renderTab('EDITOR');

    const start = screen.getByRole('button', { name: 'Указать ленту' });
    // The button that opened a form the server refuses on save.
    expect(start.disabled).toBe(true);
    expect(
      document.querySelector('[data-content-leads-read-only]')
    ).not.toBeNull();
  });

  test('an administrator sees all three actions and no read-only note', async () => {
    withSubscriptions();
    await renderTab('ADMIN');

    expect(document.querySelector('[data-content-leads-read-only]')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Добавить подписку' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Отписаться' })).toBeTruthy();
  });

  test('the check is the shared role helper, not a second opinion about what an administrator is', () => {
    const source = fs.readFileSync(path.join(root, LEADS), 'utf8');
    expect(source).toContain('isOrganizationAdmin');
    expect(source).not.toMatch(/role\s*===\s*'ADMIN'/u);
  });
});

/**
 * content-factory-next-fn33.54. «за месяц: 2 поводов» — a number dropped
 * into a sentence with no choice of word form. Russian counts a thing three
 * ways and `plural` is the repository's one place that knows it.
 */
describe('content-factory-next-fn33.54 — counted things are declined, not concatenated', () => {
  test.each([
    [1, '1 повод'],
    [2, '2 повода'],
    [5, '5 поводов'],
    [11, '11 поводов'],
    [21, '21 повод'],
  ])('a subscription that brought %i reads «%s»', async (count, expected) => {
    serve({
      'GET /content-intelligence/leads/subscriptions': ok({
        subscriptions: [{ ...SUBSCRIPTION, leadsThisMonth: count }],
        capabilities: { feedCheck: true },
      }),
      'GET /content-intelligence/leads/queue?status=NEW': ok({ leads: [] }),
    });
    await renderTab('ADMIN');

    expect(document.body.textContent).toContain(`за месяц: ${expected}`);
  });

  test('the archive counts posts the same way', () => {
    const archive = loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/content-archive.container.tsx'
    );
    // The copy table is not exported; the source is what carries the rule,
    // and the shared helper is what the rule is.
    const source = fs.readFileSync(
      path.join(
        root,
        'apps/frontend/src/components/content-intelligence/content-archive.container.tsx'
      ),
      'utf8'
    );
    expect(archive).toBeTruthy();
    expect(source).not.toContain('`постов: ${n}`');
    expect(source).toMatch(/plural\(n, \['пост', 'поста', 'постов'\]\)/u);
  });
});

describe('content-factory-next-fn33.67 — an empty calendar cell does not reach around the hidden «Добавить канал»', () => {
  const source = fs.readFileSync(path.join(root, CALENDAR), 'utf8');

  test('the empty-cell click asks about the role before it opens the provider catalogue', () => {
    expect(source).toContain('isOrganizationAdmin');
    expect(source).toMatch(/canAddChannel\s*=\s*isOrganizationAdmin\(user\?\.role\)/u);
    // The catalogue is behind the role; the refusal is what a member gets.
    expect(source).toMatch(
      /integrations\.length[\s\S]{0,80}addModal[\s\S]{0,80}canAddChannel[\s\S]{0,80}addProvider[\s\S]{0,80}refuseAddChannel/u
    );
  });

  test('the refusal says who adds a channel, in a key every locale carries', () => {
    expect(source).toContain('add_channel_admin_only');
    const ru = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
        ),
        'utf8'
      )
    );
    expect(ru.add_channel_admin_only).toMatch(/администратор/u);
  });
});
