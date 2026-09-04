'use strict';

/**
 * Какая строка навигации горит, когда адрес несёт параметр.
 *
 * `MenuItem` сравнивал `usePathname()` с полным путём строки, а путь
 * «Профиля» — `/settings?tab=profile`. Строки запроса в `usePathname()` нет,
 * поэтому «Профиль» не подсвечивался никогда, зато на вкладке профиля горели
 * «Настройки»: их путь `/settings` — начало текущего адреса. Найдено рецензией
 * 04.09.2026.
 *
 * Правило: путь сравнивается до `?`, а если строка сама называет `tab`, то
 * совпасть должен и он. Так `/settings?tab=profile` зажигает только «Профиль»,
 * а `/settings` без параметра и с любым другим `tab` — только «Настройки».
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

const { cleanup, render } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

/** Адрес, который «браузер» показывает набору. */
let here = { path: '/settings', query: '' };

const { MenuItem } = loadWithMocks(
  'apps/frontend/src/components/new-layout/menu-item.tsx',
  {
    'next/navigation': {
      usePathname: () => here.path,
      useSearchParams: () => new URLSearchParams(here.query),
    },
    'next/link': {
      __esModule: true,
      // `prefetch` — свойство роутера Next, а не атрибут DOM: узел его не
      // принимает, и React жалуется на весь набор разом.
      default: ({ children, href, prefetch, ...rest }) =>
        React.createElement('a', { href, ...rest }, children),
    },
  }
);

const draw = (path) =>
  render(
    React.createElement(MenuItem, {
      label: 'row',
      icon: null,
      path,
      collapsed: false,
    })
  );

const current = () => document.querySelector('[aria-current="page"]') !== null;

afterEach(cleanup);

describe('строка с параметром tab', () => {
  it('горит на своём tab', () => {
    here = { path: '/settings', query: 'tab=profile' };
    draw('/settings?tab=profile');

    expect(current()).toBe(true);
  });

  it('не горит на чужом tab', () => {
    here = { path: '/settings', query: 'tab=teams' };
    draw('/settings?tab=profile');

    expect(current()).toBe(false);
  });

  it('не горит на том же пути без параметра', () => {
    here = { path: '/settings', query: '' };
    draw('/settings?tab=profile');

    expect(current()).toBe(false);
  });
});

describe('строка без параметра', () => {
  it('горит на своём пути без параметров', () => {
    here = { path: '/settings', query: '' };
    draw('/settings');

    expect(current()).toBe(true);
  });

  it('уступает строке, которая назвала этот tab', () => {
    here = { path: '/settings', query: 'tab=profile' };
    draw('/settings');

    expect(current()).toBe(false);
  });

  it('остаётся собой на чужом tab того же раздела', () => {
    here = { path: '/settings', query: 'tab=teams' };
    draw('/settings');

    expect(current()).toBe(true);
  });

  it('по-прежнему горит на вложенном адресе', () => {
    here = { path: '/launches/123', query: '' };
    draw('/launches');

    expect(current()).toBe(true);
  });

  it('внешняя ссылка и «#» не горят никогда', () => {
    here = { path: '/settings', query: '' };
    draw('#');
    expect(current()).toBe(false);
    cleanup();
    draw('https://example.invalid/settings');
    expect(current()).toBe(false);
  });
});
