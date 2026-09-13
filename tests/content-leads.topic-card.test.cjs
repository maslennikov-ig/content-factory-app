'use strict';

/**
 * `content-factory-next-75xn.7` on the screen: the second way to start
 * watching something.
 *
 * The empty state used to offer one live card — «Лента сайта» — and one
 * switched-off one. A person who knows *what* they want to follow but not
 * whose feed carries it had nothing to press. The topic card is that door,
 * and this suite pins the three things it must get right: it opens the create
 * dialog on the topic kind (a topic field, not an address one), it sends the
 * kind and the topic and no half-typed address, and a saved topic row reads
 * as the topic a person typed rather than as the `topic://` key the server
 * derived from it.
 *
 * The last test is about a different switch, not a different feature:
 * `LEAD_TOPIC_CHECK_ENABLED` and `LEAD_FEED_CHECK_ENABLED` are independent on
 * the server, so a screen reading one of them would disable a live button on
 * one row while offering a dead one on the other.
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

const { act, cleanup, render, screen } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const leads = loadTypeScriptModule(
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx'
);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const TOPIC_ROW = {
  id: 'sub-topic',
  kind: 'TOPIC',
  displayName: 'Регулирование ИИ',
  // What the server actually stores: the derived key, which nobody typed.
  canonicalUrl: 'topic://регулирование ии в европе',
  query: 'Регулирование ИИ в Европе',
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 0,
  acceptedThisMonth: 0,
  linkedAutoPost: null,
};

const FEED_ROW = {
  id: 'sub-feed',
  kind: 'RSS',
  displayName: 'Хабр',
  canonicalUrl: 'https://habr.com/ru/rss/all/all/',
  query: null,
  checkIntervalMinutes: 1440,
  state: 'ACTIVE',
  lastCheckedAt: null,
  lastErrorCode: null,
  leadsThisMonth: 0,
  acceptedThisMonth: 0,
  linkedAutoPost: null,
};

const calls = [];

const serve = ({ subscriptions = [], feedCheck = true, topicCheck = true }) => {
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : null });
    if (url === '/content-intelligence/leads/subscriptions' && method === 'GET') {
      return ok({ subscriptions, capabilities: { feedCheck, topicCheck } });
    }
    if (url === '/content-intelligence/leads/queue?status=NEW') {
      return ok({ leads: [] });
    }
    if (url === '/content-intelligence/leads/subscriptions/linkable-autoposts') {
      return ok({ autoPosts: [] });
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

const typeInto = async (name, value) => {
  const field = document.querySelector(`input[name="${name}"]`);
  expect(field).toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value'
  ).set;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};

afterEach(() => {
  cleanup();
  calls.length = 0;
  delete global.fetch;
});

describe('the topic card on the empty screen', () => {
  test('it is offered beside the feed card and opens the dialog on the topic field', async () => {
    serve({ subscriptions: [] });
    await renderTab();

    expect(document.body.textContent).toContain('Тема');
    await act(async () => {
      screen.getByRole('button', { name: 'Указать тему' }).click();
    });

    // The topic field, and not the address field the feed card opens.
    expect(document.querySelector('input[name="query"]')).toBeTruthy();
    expect(document.querySelector('input[name="canonicalUrl"]')).toBeNull();
    expect(document.body.textContent).toContain('30 дней');
  });

  test('the feed card still opens on the address field', async () => {
    serve({ subscriptions: [] });
    await renderTab();

    await act(async () => {
      screen.getByRole('button', { name: 'Указать ленту' }).click();
    });

    expect(document.querySelector('input[name="canonicalUrl"]')).toBeTruthy();
    expect(document.querySelector('input[name="query"]')).toBeNull();
  });

  test('saving a topic sends the kind and the topic, and no address at all', async () => {
    serve({ subscriptions: [] });
    await renderTab();
    await act(async () => {
      screen.getByRole('button', { name: 'Указать тему' }).click();
    });

    await typeInto('displayName', 'Регулирование ИИ');
    await typeInto('query', 'Регулирование ИИ в Европе');
    await act(async () => {
      screen.getByRole('button', { name: 'Сохранить' }).click();
    });
    await act(async () => {});

    const created = calls.find(
      (call) =>
        call.method === 'POST' &&
        call.url === '/content-intelligence/leads/subscriptions'
    );
    expect(created).toBeTruthy();
    expect(created.body.kind).toBe('TOPIC');
    expect(created.body.query).toBe('Регулирование ИИ в Европе');
    expect(created.body).not.toHaveProperty('canonicalUrl');
  });
});

describe('a topic row in the list', () => {
  test('it reads as the topic, never as the topic:// key', async () => {
    serve({ subscriptions: [TOPIC_ROW] });
    await renderTab();

    expect(document.body.textContent).toContain('Регулирование ИИ в Европе');
    expect(document.body.textContent).not.toContain('topic://');
  });

  test('with topics off its check is disabled while a feed row stays live', async () => {
    serve({
      subscriptions: [TOPIC_ROW, FEED_ROW],
      feedCheck: true,
      topicCheck: false,
    });
    await renderTab();

    const buttons = screen.getAllByRole('button', { name: 'Проверить сейчас' });
    expect(buttons).toHaveLength(2);
    const [topicCheck, feedCheck] = buttons;
    expect(topicCheck.disabled).toBe(true);
    expect(feedCheck.disabled).toBe(false);
    // And the screen says why, rather than letting a person find out by
    // pressing: the same sentence the banner above the list carries.
    expect(document.body.textContent).toContain('Проверка тем выключена');
  });
});
