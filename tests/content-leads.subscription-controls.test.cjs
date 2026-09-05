'use strict';

/**
 * Two things «Откуда идеи» said with a control rather than with words.
 *
 * `content-factory-next-fn33.128`: with `LEAD_FEED_CHECK_ENABLED` off the
 * banner above the list already said checking is switched off on this server,
 * and «Проверить сейчас» was live anyway. Pressing it twice returned
 * `CHECK_DISABLED` twice. The card beside it had the honest shape — «Указать
 * канал» is disabled and labelled «выключено на этом сервере» — so one screen
 * contradicted itself about the same kind of fact.
 *
 * `content-factory-next-fn33.129`: unsubscribing asked with `window.confirm`,
 * the browser's own box, with buttons in the browser's language and none of
 * the product's type or colour — the only place in the interface that did.
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

const LEADS =
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx';

const leads = loadTypeScriptModule(LEADS);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);
// The same module instance the tab reaches through `deleteDialog`: the loader
// caches by path, and the product dialog is opened by an event rather than by
// rendering, so listening on the emitter is how a test sees the question.
const modal = loadTypeScriptModule(
  'apps/frontend/src/components/layout/new-modal.tsx'
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

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const calls = [];

const serve = (feedCheck) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push(`${method} ${url}`);
    if (url === '/content-intelligence/leads/subscriptions') {
      return ok({ subscriptions: [SUBSCRIPTION], capabilities: { feedCheck } });
    }
    if (url === '/content-intelligence/leads/queue?status=NEW') {
      return ok({ leads: [] });
    }
    return ok({});
  };
};

const renderTab = async () => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          userContext.UserContext.Provider,
          { value: { role: 'ADMIN' } },
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

afterEach(() => {
  cleanup();
  calls.length = 0;
  delete global.fetch;
});

describe('content-factory-next-fn33.128 — a button that cannot work does not look like one that can', () => {
  test('with feed checking off, «Проверить сейчас» is disabled and says why', async () => {
    serve(false);
    await renderTab();

    const check = screen.getByRole('button', { name: 'Проверить сейчас' });
    expect(check.disabled).toBe(true);
    // The same words the Telegram card uses for the same kind of fact.
    expect(document.body.textContent).toContain('выключено на этом сервере');
  });

  test('with feed checking on, the button is live', async () => {
    serve(true);
    await renderTab();

    const check = screen.getByRole('button', { name: 'Проверить сейчас' });
    expect(check.disabled).toBe(false);
  });

  test('«Отписаться» stays live with checking off — it is not what the flag is about', async () => {
    serve(false);
    await renderTab();

    expect(
      screen.getByRole('button', { name: 'Отписаться' }).disabled
    ).toBe(false);
  });
});

describe('content-factory-next-fn33.129 — unsubscribing asks in the product’s own window', () => {
  /**
   * Comments are stripped before the search: the line that replaced this call
   * explains what `window.confirm` did wrong, and a guard that cannot tell a
   * warning from the thing it warns about would forbid writing the reason
   * down.
   */
  const withoutComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  test('the section asks nothing through the browser’s confirm box', () => {
    const source = withoutComments(
      fs.readFileSync(path.join(root, LEADS), 'utf8')
    );
    expect(source).not.toMatch(/window\.confirm/);
  });

  test('no component of the «Контент» section reaches for window.confirm', () => {
    const directory = path.join(
      root,
      'apps/frontend/src/components/content-intelligence'
    );
    const offenders = fs
      .readdirSync(directory)
      .filter((name) => /\.tsx?$/.test(name))
      .filter((name) =>
        /window\.confirm|[^.\w]confirm\(/.test(
          withoutComments(fs.readFileSync(path.join(directory, name), 'utf8'))
        )
      );
    expect(offenders).toEqual([]);
  });

  test('pressing «Отписаться» asks through the product dialog, in Russian, and archives nothing until it is answered', async () => {
    serve(true);
    await renderTab();

    const asked = [];
    const stop = (payload) => asked.push(payload);
    modal.decisionModalEmitter.on('open', stop);

    try {
      await act(async () => {
        screen.getByRole('button', { name: 'Отписаться' }).click();
      });
      await act(async () => {});

      expect(asked).toHaveLength(1);
      // The sentence the browser box used to carry, plus buttons in the
      // interface language rather than the browser's «OK / Cancel».
      expect(asked[0].description).toContain(
        'Больше поводов от этой подписки не будет'
      );
      expect(asked[0].approveLabel).toBe('Да, отписаться');
      expect(asked[0].cancelLabel).toBe('Нет, отмена');
      expect(asked[0].title).toBe('Отписаться от ленты?');

      // Nothing was archived by the press itself.
      expect(calls.filter((call) => call.includes('/archive'))).toEqual([]);

      // «Нет» leaves the subscription alone.
      await act(async () => {
        asked[0].newRes(false);
      });
      await act(async () => {});
      expect(calls.filter((call) => call.includes('/archive'))).toEqual([]);
    } finally {
      modal.decisionModalEmitter.off('open', stop);
    }
  });

  test('answering «Да» is what actually archives the subscription', async () => {
    serve(true);
    await renderTab();

    const asked = [];
    const stop = (payload) => asked.push(payload);
    modal.decisionModalEmitter.on('open', stop);

    try {
      await act(async () => {
        screen.getByRole('button', { name: 'Отписаться' }).click();
      });
      await act(async () => {
        asked[0].newRes(true);
      });
      await act(async () => {});

      expect(calls).toContain(
        'POST /content-intelligence/leads/subscriptions/sub-1/archive'
      );
    } finally {
      modal.decisionModalEmitter.off('open', stop);
    }
  });
});
