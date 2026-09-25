'use strict';

/**
 * The empty /channels leads with Telegram (`2q28.24`, walk s0 item 22).
 *
 * The wall showed thirty-plus platforms — Discord, Slack, Nostr, Lemmy, Whop —
 * with Telegram, the one relevant option for a blogger with one channel, as
 * one tile among them. With `featured` the picker puts that platform first
 * with its own primary action, the same connect flow as its tile, and folds
 * every other band under «Другие площадки».
 */

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/channels',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, cleanup, fireEvent, screen, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;

const requests = [];
const fetchMock = async (url) => {
  requests.push(url);
  // A refusal keeps jsdom from navigating; the request is what is checked.
  return { ok: true, json: async () => ({ err: true }) };
};

const { AddProviderComponent } = loadWithMocks(
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  {
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: jest.fn(), closeAll: jest.fn() }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchMock },
    'next/navigation': { useRouter: () => ({ push: jest.fn() }) },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ isGeneral: true, extensionId: '' }),
    },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
    '@contentfactory/frontend/components/launches/web3/web3.list': { web3List: [] },
    '@contentfactory/frontend/components/launches/helpers/use.integration.list': {
      useIntegrationList: () => ({ data: [] }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN' }),
    },
    '@contentfactory/frontend/components/launches/helpers/top.title.component': {
      TopTitle: () => null,
    },
    '@contentfactory/frontend/components/launches/channel-rail': {
      RAIL_CONTROL_GAP: '',
      railActionClass: () => '',
    },
  }
);

const provider = (identifier, name) => ({
  identifier,
  name,
  isExternal: false,
  isWeb3: false,
});
const social = [
  provider('discord', 'Discord'),
  provider('telegram', 'Telegram'),
  provider('slack', 'Slack'),
  provider('x', 'X'),
  provider('nostr', 'Nostr'),
];
const featured = {
  identifier: 'telegram',
  title: 'Telegram-канал',
  description: 'Подключите свой канал: посты будут выходить в нём по вашему расписанию.',
  action: 'Подключить Telegram',
  othersLabel: 'Другие площадки',
};

afterEach(() => {
  cleanup();
  requests.length = 0;
});

test('Telegram leads with its own action; the rest waits folded under «Другие площадки»', async () => {
  render(h(AddProviderComponent, { social, article: [], invite: false, featured }));

  const lead = document.querySelector('[data-provider-featured="telegram"]');
  expect(lead).not.toBeNull();
  expect(lead.textContent).toContain('Telegram-канал');
  const connect = screen.getByRole('button', { name: 'Подключить Telegram' });

  const toggle = screen.getByRole('button', { name: 'Другие площадки' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  const region = document.getElementById(toggle.getAttribute('aria-controls'));
  expect(region.hidden).toBe(true);
  // Telegram is not repeated among the others.
  expect(region.textContent).not.toContain('Telegram');
  expect(region.textContent).toContain('Discord');
  // The lead comes before the fold in the document.
  expect(
    lead.compareDocumentPosition(toggle) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(region.hidden).toBe(false);

  // The same connect flow as the tile: ask the server for Telegram's address.
  await act(async () => {
    fireEvent.click(connect);
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatch(/^\/integrations\/social\/telegram(\?|$)/);
});

test('without `featured` the picker is the plain wall it was', () => {
  render(h(AddProviderComponent, { social, article: [], invite: false }));
  expect(document.querySelector('[data-provider-featured]')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Другие площадки' })).toBeNull();
  expect(document.body.textContent).toContain('Telegram');
});
