'use strict';

/**
 * Вход «Профиль» — такая же строка навигации, как остальные.
 *
 * Рецензия приёмки fn33 03.09.2026 нашла три вещи в одной строке: «Профиль»
 * был собран отдельной ссылкой на геометрии подвала, а не через `MenuItem`,
 * так что у него не было ни значка, ни отметки текущей страницы; в свёрнутой
 * рейке вместо значка стоял текстовый символ «●»; `aria-label` повторял тот же
 * текст, который и так виден рядом.
 *
 * Заодно здесь держится то, что владелец сказал 04.09.2026: в левом нижнем
 * углу должно стоять имя из профиля, а адрес — под ним. Пока имени нет,
 * подпись выводится из адреса, но она одна на весь продукт.
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

const SIDEBAR = 'apps/frontend/src/components/new-layout/sidebar.tsx';

let collapsed = 'open';
let account = { email: 'maslennikov.ig@example.com', name: 'Игорь' };

const mocks = () => ({
  'react-use-cookie': {
    __esModule: true,
    default: () => [
      collapsed,
      (next) => {
        collapsed = next;
      },
    ],
  },
  'next/link': {
    __esModule: true,
    default: ({ children, href, ...rest }) =>
      React.createElement('a', { href, ...rest }, children),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => account,
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ billingEnabled: false }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
  '@contentfactory/frontend/components/layout/top.menu': {
    filterMenu: (items) => items,
    useMenuItem: () => ({ workMenu: [], adminMenu: [], secondaryMenu: [] }),
  },
  // Записывает, что через него прошло: вопрос этого набора — идёт ли
  // «Профиль» через общую строку меню, а не как выглядит сама строка.
  '@contentfactory/frontend/components/new-layout/menu-item': {
    MenuItem: ({ label, icon, path, collapsed: isCollapsed }) =>
      React.createElement(
        'a',
        {
          href: path,
          'data-menu-item': label,
          'data-collapsed': String(Boolean(isCollapsed)),
        },
        icon
      ),
  },
  '@contentfactory/frontend/components/ui/brand/wordmark': {
    Wordmark: () => null,
  },
  '@contentfactory/frontend/components/layout/logout.component': {
    LogoutComponent: ({ className }) =>
      React.createElement(
        'button',
        { type: 'button', 'aria-label': 'Log out', className },
        null
      ),
  },
});

const { Sidebar } = loadWithMocks(SIDEBAR, mocks());

const draw = () =>
  render(
    React.createElement(Sidebar, { mobileOpen: false, onCloseMobile: () => {} })
  );

const profileRow = () => document.querySelector('[data-menu-item="Profile"]');

afterEach(cleanup);
beforeEach(() => {
  collapsed = 'open';
  account = { email: 'maslennikov.ig@example.com', name: 'Игорь' };
});

describe('«Профиль» — строка меню, а не самодельная ссылка', () => {
  it('идёт через MenuItem и ведёт в настройки профиля', () => {
    draw();

    expect(profileRow()).not.toBeNull();
    expect(profileRow().getAttribute('href')).toBe('/settings?tab=profile');
  });

  it('несёт значок, а не текстовый символ', () => {
    draw();

    expect(profileRow().querySelector('.cf-avatar')).not.toBeNull();
    expect(document.body.textContent).not.toContain('●');
  });

  it('в свёрнутой рейке символа тоже нет', () => {
    collapsed = 'collapsed';
    draw();

    expect(profileRow().getAttribute('data-collapsed')).toBe('true');
    expect(document.body.textContent).not.toContain('●');
  });

  it('имя не повторяется в aria-label поверх видимой подписи', () => {
    draw();

    // `MenuItem` сам держит доступное имя строки: подпись видна, дублировать
    // её отдельным `aria-label` нечем.
    expect(profileRow().getAttribute('aria-label')).toBeNull();
  });
});

describe('левый нижний угол называет человека', () => {
  it('показывает имя из профиля, адрес — под ним', () => {
    draw();

    const identity = document.querySelector('.cf-account-name');
    expect(identity).not.toBeNull();
    expect(identity.textContent).toBe('Игорь');
    expect(document.querySelector('.cf-account-email').textContent).toBe(
      'maslennikov.ig@example.com'
    );
  });

  it('без имени в профиле — прежняя подстановка из адреса', () => {
    account = { email: 'maslennikov.ig@example.com', name: null };
    draw();

    expect(document.querySelector('.cf-account-name').textContent).toBe(
      'Maslennikov'
    );
  });
});
