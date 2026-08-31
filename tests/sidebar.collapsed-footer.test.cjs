'use strict';

/**
 * The way back out of a collapsed rail.
 *
 * A 72px rail leaves 48px between its paddings, and the footer put two
 * controls in it side by side: the logout button — 18px glyph inside 10px
 * padding either side — and the 32px collapse toggle, with an 8px gap. Seventy
 * eight into forty eight. They squashed, and the logout glyph is `→|`, which
 * is also the "expand this panel" glyph in every other product. So a person
 * who collapsed the rail reached for the arrow that looked like the way back
 * and was asked whether they wanted to sign out.
 *
 * Reported by the owner on 2026-08-25, in those words: «есть кнопка её
 * свернуть, но как будто бы нет кнопки её развернуть… визуально кнопка
 * развернуть есть — но она является кнопкой выхода».
 *
 * What is held here is the rule and not the pixels: while the rail is
 * collapsed the two controls are on separate rows, the expander comes first,
 * and it is drawn as a control rather than as a quiet glyph. The expanded rail
 * keeps the row it had.
 */

const path = require('node:path');
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

const { cleanup, render, screen } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SIDEBAR = 'apps/frontend/src/components/new-layout/sidebar.tsx';

/** The cookie the rail keeps its state in, driven by the test. */
let collapsed = 'open';

const mocks = () => ({
  'react-use-cookie': {
    __esModule: true,
    default: () => [collapsed, (next) => { collapsed = next; }],
  },
  'next/link': {
    __esModule: true,
    default: ({ children, href, ...rest }) =>
      React.createElement('a', { href, ...rest }, children),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ email: 'owner@example.com' }),
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
  '@contentfactory/frontend/components/new-layout/menu-item': {
    MenuItem: () => null,
  },
  '@contentfactory/frontend/components/ui/brand/wordmark': {
    Wordmark: () => null,
  },
  // The real one opens a confirmation dialog and reaches for a fetch. What
  // this suite is about is where it sits, so it is replaced by a button
  // carrying the same accessible name.
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

const footer = () => document.querySelector('.cf-account');
const toggle = () => document.querySelector('.cf-collapse-toggle');

afterEach(cleanup);

describe('свёрнутый рельс: выход и разворот — два разных элемента', () => {
  beforeEach(() => {
    collapsed = 'collapsed';
  });

  it('кнопки стоят друг под другом, а не в 48 пикселях рядом', () => {
    draw();

    const classes = footer().className;
    expect(classes).toContain('flex-col');
    expect(classes).not.toContain('flex-row');
  });

  it('разворот идёт первым: под курсором не должно быть выхода', () => {
    draw();

    // `flex-col-reverse` ставит последнего в разметке первым на экране, и
    // порядок в разметке остаётся порядком обхода с клавиатуры: сначала
    // выход, потом разворот — то же, что было.
    expect(footer().className).toContain('flex-col-reverse');
    const controls = [...footer().querySelectorAll('button')];
    expect(controls[controls.length - 1]).toBe(toggle());
  });

  it('разворот нарисован как элемент управления, а не как значок', () => {
    draw();

    // `secondary` — единственный вариант кнопки с видимой рамкой. Без подписи
    // рамка и есть то, чем элемент говорит, что на него можно нажать.
    expect(toggle().className).toContain('border-cf-border-control');
    expect(toggle().className).toContain('w-full');
  });

  it('у разворота своё имя, отличное от выхода', () => {
    draw();

    expect(screen.getByLabelText('Expand navigation')).toBe(toggle());
    expect(screen.getByLabelText('Log out')).not.toBe(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('развёрнутый рельс сохраняет прежнюю строку', () => {
  beforeEach(() => {
    collapsed = 'open';
  });

  it('выход и сворачивание стоят в одну строку', () => {
    draw();

    expect(footer().className).toContain('flex-row');
    expect(footer().className).toContain('justify-between');
  });

  it('сворачивание названо сворачиванием', () => {
    draw();

    expect(screen.getByLabelText('Collapse navigation')).toBe(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
});

void path;
