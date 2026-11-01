'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/current' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup, within } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
let pathname, collapsed, workMenu;
const mocks = {
  'next/navigation': { usePathname: () => pathname, useSearchParams: () => new URLSearchParams() },
  'next/link': { __esModule: true, default: ({ children, href, prefetch, onClick, ...rest }) => h('a', { href, ...rest, onClick: event => { event.preventDefault(); onClick?.(event); } }, children) },
  'react-use-cookie': { __esModule: true, default: () => [collapsed, () => {}] },
  '@contentfactory/frontend/components/layout/user.context': { useUser: () => ({ name: 'Local', email: 'local@example.invalid' }) },
  '@contentfactory/react/helpers/variable.context': { useVariables: () => ({ language: 'ru', billingEnabled: false }) },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key, fallback) => key === 'assistant_sections' ? 'Инструменты' : fallback },
  '@contentfactory/frontend/components/layout/top.menu': {
    filterMenu: (items) => items,
    useMenuItem: () => ({ assistantMenu: [], workMenu, secondaryMenu: [], adminMenu: [] }),
  },
  '@contentfactory/frontend/components/ui/brand/wordmark': { Wordmark: () => h('span', null, 'Content Factory') },
  '@contentfactory/frontend/components/layout/logout.component': { LogoutComponent: () => h('button', null, 'Log out') },
  '@contentfactory/frontend/components/ui/side-panel': { SidePanel: ({ children, rail, collapsed }) => h('aside', null, collapsed ? rail : children) },
};
const { Sidebar } = loadWithMocks('apps/frontend/src/components/new-layout/sidebar.tsx', mocks);
const draw = (props = {}) => render(h(Sidebar, { mobileOpen: false, onCloseMobile: () => {}, ...props }));
beforeEach(() => {
  pathname = '/agents/current'; collapsed = 'open';
  workMenu = [{ name: 'Контент', path: '/content', icon: null }, { name: 'Каналы', path: '/channels', icon: null }];
});
afterEach(cleanup);

test('chat starts with work links hidden behind one named disclosure; reopening keeps their destinations', () => {
  const view = draw();
  const toggle = view.getByRole('button', { name: 'Инструменты' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(view.queryByRole('link', { name: 'Контент' })).toBeNull();
  const region = document.getElementById(toggle.getAttribute('aria-controls'));
  expect(region.hidden).toBe(true);
  fireEvent.click(toggle);
  expect(view.getByRole('link', { name: 'Контент' }).getAttribute('href')).toBe('/content');
  expect(view.getByRole('link', { name: 'Каналы' }).getAttribute('href')).toBe('/channels');
  fireEvent.click(toggle);
  expect(region.hidden).toBe(true);
});

test.each(['/content', '/content/pieces/item', '/channels'])('an active work route %s reveals the current location and can still collapse', (route) => {
  pathname = route;
  const view = draw();
  const toggle = view.getByRole('button', { name: 'Инструменты' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(view.getByRole('link', { name: route.startsWith('/content') ? 'Контент' : 'Каналы' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  pathname = '/agents/current';
  view.rerender(h(Sidebar, { mobileOpen: false, onCloseMobile: () => {} }));
  expect(view.getByRole('button', { name: 'Инструменты' }).getAttribute('aria-expanded')).toBe('false');
});

test('the phone drawer has its own disclosure and links keep closing the drawer', () => {
  const onCloseMobile = jest.fn();
  const view = draw({ mobileOpen: true, onCloseMobile });
  const drawer = within(view.getByRole('dialog'));
  fireEvent.click(drawer.getByRole('button', { name: 'Инструменты' }));
  fireEvent.click(drawer.getByRole('link', { name: 'Каналы' }));
  expect(onCloseMobile).toHaveBeenCalledTimes(1);
});

test('the icon rail retains direct named work links without an unusable disclosure', () => {
  collapsed = 'collapsed';
  const view = draw();
  expect(view.queryByRole('button', { name: 'Инструменты' })).toBeNull();
  expect(view.getByRole('link', { name: 'Контент' }).getAttribute('href')).toBe('/content');
});

test('a fully filtered work group leaves no empty disclosure', () => {
  workMenu = [];
  expect(draw().queryByRole('button', { name: 'Инструменты' })).toBeNull();
});
