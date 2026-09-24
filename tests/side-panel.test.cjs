'use strict';
/**
 * `SidePanel` (`97dq.71`, thirteenth walk overall note): drag or arrow-key the
 * inner border, hide into a rail on its own edge, drag past the minimum to
 * hide, and remember width and hidden state per panel — without trusting
 * `localStorage` to exist or to hold what we wrote.
 */
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/content' });
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no PointerEvent; a MouseEvent carries clientX, which is all the
// handle reads.
if (!dom.window.PointerEvent) {
  dom.window.PointerEvent = class PointerEvent extends dom.window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  };
}
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { SidePanel, clampWidth } = loadWithMocks('apps/frontend/src/components/ui/side-panel.tsx');
const h = React.createElement;
const COPY = { resize: 'Ширина панели', hide: 'Скрыть настройки', show: 'Показать настройки' };
const KEY = 'cf.side-panel.v1.test-panel';

const mount = (props = {}) =>
  render(
    h(
      SidePanel,
      { id: 'test-panel', side: 'end', label: 'Настройки поста', copy: COPY, defaultWidth: 400, ...props },
      h('p', null, 'settings body')
    )
  );
const handle = () => screen.getByRole('separator', { name: 'Ширина панели' });
const stored = () => JSON.parse(window.localStorage.getItem(KEY));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

test('the inner border is a focusable separator with its value; arrows resize within 280–560', () => {
  mount();
  const separator = handle();
  expect(separator.getAttribute('tabindex')).toBe('0');
  expect(separator.getAttribute('aria-orientation')).toBe('vertical');
  expect(separator.getAttribute('aria-valuenow')).toBe('400');
  expect(separator.getAttribute('aria-valuemin')).toBe('280');
  expect(separator.getAttribute('aria-valuemax')).toBe('560');
  // A right-hand panel grows when its border moves left.
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator.getAttribute('aria-valuenow')).toBe('416');
  fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
  expect(separator.getAttribute('aria-valuenow')).toBe('352');
  fireEvent.keyDown(separator, { key: 'End' });
  expect(separator.getAttribute('aria-valuenow')).toBe('560');
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator.getAttribute('aria-valuenow')).toBe('560');
  fireEvent.keyDown(separator, { key: 'Home' });
  expect(separator.getAttribute('aria-valuenow')).toBe('280');
  expect(stored()).toEqual({ width: 280, hidden: false });
});

test('a left-hand panel grows to the right', () => {
  mount({ side: 'start', defaultWidth: 300 });
  fireEvent.keyDown(handle(), { key: 'ArrowRight' });
  expect(handle().getAttribute('aria-valuenow')).toBe('316');
});

test('the hide button leaves a rail with the way back; both states persist', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  const show = screen.getByRole('button', { name: 'Показать настройки' });
  expect(show.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('[data-side-panel-hidden]').getAttribute('data-side-panel-hidden')).toBe('true');
  // The rail keeps the handle (`97dq.84`): it reports the rail's width.
  expect(handle().getAttribute('aria-valuenow')).toBe('40');
  expect(handle().getAttribute('data-side-panel-handle-hidden')).toBe('true');
  expect(stored()).toEqual({ width: 400, hidden: true });
  cleanup();
  // A new page reads the memory.
  mount();
  expect(screen.getByRole('button', { name: 'Показать настройки' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Показать настройки' }));
  expect(screen.getByText('settings body')).toBeTruthy();
  expect(handle().getAttribute('aria-valuenow')).toBe('400');
  expect(stored().hidden).toBe(false);
});

test('dragging resizes; dragging past the minimum hides and keeps the last good width', () => {
  mount();
  const separator = handle();
  fireEvent.pointerDown(separator, { clientX: 500, button: 0 });
  fireEvent.pointerMove(separator, { clientX: 460 });
  expect(separator.getAttribute('aria-valuenow')).toBe('440');
  fireEvent.pointerUp(separator, { clientX: 460 });
  expect(stored()).toEqual({ width: 440, hidden: false });

  const again = handle();
  fireEvent.pointerDown(again, { clientX: 500, button: 0 });
  fireEvent.pointerMove(again, { clientX: 760 });
  // Clamped at the minimum while the pointer is still down…
  expect(again.getAttribute('aria-valuenow')).toBe('280');
  fireEvent.pointerUp(again, { clientX: 760 });
  // …and hidden on release, the width it had before the drag kept.
  expect(screen.getByRole('button', { name: 'Показать настройки' })).toBeTruthy();
  expect(stored()).toEqual({ width: 440, hidden: true });
});

test('a stored width outside the bounds is clamped; broken or missing storage is survived', () => {
  window.localStorage.setItem(KEY, JSON.stringify({ width: 9000, hidden: false }));
  mount();
  expect(handle().getAttribute('aria-valuenow')).toBe('560');
  cleanup();
  window.localStorage.setItem(KEY, '{not json');
  mount();
  expect(handle().getAttribute('aria-valuenow')).toBe('400');
  cleanup();
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
    expect(screen.getByRole('button', { name: 'Показать настройки' })).toBeTruthy();
  } finally {
    window.localStorage.setItem = original;
  }
  expect(clampWidth(100, 280, 560)).toBe(280);
});

test('controlled: the owner keeps the hidden state; a custom rail replaces the button; no hide button when asked', () => {
  const changes = [];
  const view = render(
    h(
      SidePanel,
      {
        id: 'navigation',
        side: 'start',
        breakpoint: 'none',
        label: 'Панель навигации',
        copy: COPY,
        defaultWidth: 248,
        minWidth: 200,
        maxWidth: 360,
        railWidth: 72,
        collapsed: false,
        onCollapsedChange: (next) => changes.push(next),
        showHideButton: false,
        rail: h('nav', { 'aria-label': 'icon rail' }),
      },
      h('nav', { 'aria-label': 'full rail' })
    )
  );
  expect(screen.queryByRole('button', { name: 'Скрыть настройки' })).toBeNull();
  const separator = handle();
  fireEvent.pointerDown(separator, { clientX: 248, button: 0 });
  fireEvent.pointerMove(separator, { clientX: 100 });
  fireEvent.pointerUp(separator, { clientX: 100 });
  expect(changes).toEqual([true]);
  // Controlled: nothing changes until the owner says so, and only the width is stored.
  expect(screen.getByRole('navigation', { name: 'full rail' })).toBeTruthy();
  expect(JSON.parse(window.localStorage.getItem('cf.side-panel.v1.navigation'))).toEqual({ width: 248 });
  view.rerender(
    h(
      SidePanel,
      {
        id: 'navigation',
        side: 'start',
        breakpoint: 'none',
        label: 'Панель навигации',
        copy: COPY,
        railWidth: 72,
        collapsed: true,
        showHideButton: false,
        rail: h('nav', { 'aria-label': 'icon rail' }),
      },
      h('nav', { 'aria-label': 'full rail' })
    )
  );
  expect(screen.getByRole('navigation', { name: 'icon rail' })).toBeTruthy();
  expect(document.querySelector('[data-side-panel]').style.getPropertyValue('--cf-side-panel-width')).toBe('72px');
});

test('reduced motion and dragging turn the width transition off; the main column keeps its reserve', () => {
  mount({ reserveMain: 592 });
  const root = document.querySelector('[data-side-panel]');
  expect(root.className).toContain('motion-reduce:transition-none');
  expect(root.style.getPropertyValue('--cf-side-panel-width')).toBe(
    'clamp(280px, calc(100% - 592px), 400px)'
  );
  act(() => {
    fireEvent.pointerDown(handle(), { clientX: 10, button: 0 });
  });
  expect(root.className).not.toContain('transition-[width]');
});

test('wired where the walk asked: the piece settings panel on the right, the navigation on the left', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const tab = read('apps/frontend/src/components/content-intelligence/pieces/piece-channel-tab.tsx');
  expect(tab).toMatch(/<SidePanel\s+id="piece-channel-settings"\s+side="end"/);
  expect(tab).toContain('reserveMain={592}');
  const nav = read('apps/frontend/src/components/new-layout/sidebar.tsx');
  expect(nav).toMatch(/<SidePanel\s+id="navigation"\s+side="start"/);
  // Collapsing by drag and by the chevron is one state, kept in one cookie.
  expect(nav).toContain("setCollapsedCookie(hidden ? 'collapsed' : 'open')");
  expect(read('apps/frontend/src/app/global.scss')).toContain('.cf-sidebar [data-side-panel-handle]');
});

/* Second review, item 7. */
test('a lost pointer capture ends the drag where it was and never hides the panel', () => {
  mount();
  const separator = handle();
  fireEvent.pointerDown(separator, { clientX: 500, button: 0 });
  fireEvent.pointerMove(separator, { clientX: 760 });
  expect(document.querySelector('[data-side-panel]').className).not.toContain('transition-[width]');
  // The browser takes the pointer away (a context menu, a window switch).
  fireEvent(separator, new window.Event('lostpointercapture', { bubbles: true }));
  expect(screen.queryByRole('button', { name: 'Показать настройки' })).toBeNull();
  expect(document.querySelector('[data-side-panel]').className).toContain('transition-[width]');
  // A later move is not a drag any more.
  fireEvent.pointerMove(handle(), { clientX: 300 });
  expect(handle().getAttribute('aria-valuenow')).toBe('280');
  fireEvent.pointerUp(handle(), { clientX: 300 });
  expect(screen.queryByRole('button', { name: 'Показать настройки' })).toBeNull();
});

test('hiding mid-drag ends the drag: nothing moves after the panel is gone', () => {
  mount();
  const separator = handle();
  fireEvent.pointerDown(separator, { clientX: 500, button: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  fireEvent.click(screen.getByRole('button', { name: 'Показать настройки' }));
  fireEvent.pointerMove(handle(), { clientX: 100 });
  expect(handle().getAttribute('aria-valuenow')).toBe('400');
});

test('the handle reports and steps from the width on screen when the reserve squeezes it', () => {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const width = this.hasAttribute('data-side-panel') ? 320 : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 };
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ width: 520, hidden: false }));
    mount({ reserveMain: 592 });
    act(() => {
      window.dispatchEvent(new window.Event('resize'));
    });
    const separator = handle();
    // 520 chosen, 320 drawn: a screen reader hears what is seen.
    expect(separator.getAttribute('aria-valuenow')).toBe('320');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator.getAttribute('aria-valuenow')).toBe('320');
    expect(stored().width).toBe(336);
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = original;
  }
});

test('no width transition before the stored width is read', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const markup = renderToStaticMarkup(
    h(SidePanel, { id: 'ssr', side: 'end', label: 'x', copy: COPY }, 'body')
  );
  expect(markup).toContain('data-side-panel="ssr"');
  expect(markup).not.toContain('transition-[width]');
});

/* `97dq.84`, fourteenth walk, E1: the collapsed rail drops no handle. */
test('dragging the hidden rail’s handle outwards opens the panel and goes on sizing it; a short drag does nothing', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  const separator = handle();
  // A right-hand panel grows towards the start: pointer to the left.
  fireEvent.pointerDown(separator, { clientX: 1000, button: 0 });
  fireEvent.pointerMove(separator, { clientX: 990 });
  expect(document.querySelector('[data-side-panel]').getAttribute('data-side-panel-hidden')).toBe('true');
  fireEvent.pointerMove(separator, { clientX: 640 });
  expect(document.querySelector('[data-side-panel]').getAttribute('data-side-panel-hidden')).toBe('false');
  expect(handle().getAttribute('aria-valuenow')).toBe('400');
  fireEvent.pointerMove(handle(), { clientX: 800 });
  // 40 + 200 is under the minimum: clamped, and the release does not hide it again.
  expect(handle().getAttribute('aria-valuenow')).toBe('280');
  fireEvent.pointerUp(handle(), { clientX: 800 });
  expect(stored()).toEqual({ width: 280, hidden: false });
  expect(screen.getByText('settings body')).toBeTruthy();
});

test('the hidden rail’s handle opens from the keyboard towards the middle, and only that way', () => {
  mount({ side: 'start' });
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
  fireEvent.keyDown(handle(), { key: 'Home' });
  expect(stored().hidden).toBe(true);
  fireEvent.keyDown(handle(), { key: 'ArrowRight' });
  expect(stored()).toEqual({ width: 400, hidden: false });
  expect(handle().getAttribute('aria-valuenow')).toBe('400');
});

test('the navigation rail stays put: stretched over the viewport-tall shell, footer pinned under a scrolling list', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const nav = fs.readFileSync(
    path.resolve(__dirname, '..', 'apps/frontend/src/components/new-layout/sidebar.tsx'),
    'utf8'
  );
  const frame = nav.match(/data-sidebar-frame="true"\s+className="([^"]+)"/);
  expect(frame).not.toBeNull();
  // Review of 97dq.81-85, P2-3: the shell is one viewport tall, not the rail;
  // the laid-out check is `tests/app-shell.layout.test.cjs`.
  for (const token of ['self-stretch', 'min-h-0'])
    expect(frame[1].split(' ')).toContain(token);
  expect(frame[1].split(' ')).not.toContain('h-[100dvh]');
  expect(nav).toMatch(/className="flex-1 min-h-0 overflow-y-auto/);
  expect(nav).toMatch(/data-sidebar-footer="true"\s+className="shrink-0 /);
});

/* Review of 97dq.81-85, P3-8. */
test('the hidden rail’s handle sits inside the rail, not over the neighbouring column', () => {
  const tokens = () => handle().className.split(/\s+/);
  mount({ side: 'end' });
  // Shown: the handle straddles the border into the main column, as before.
  expect(tokens()).toContain('-start-[20px]');
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  expect(tokens()).toContain('start-0');
  expect(tokens().some((token) => token.startsWith('-start-') || token.startsWith('-end-'))).toBe(false);
  cleanup();
  window.localStorage.clear();
  mount({ side: 'start' });
  expect(tokens()).toContain('-end-[8px]');
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть настройки' }));
  expect(tokens()).toContain('end-0');
  expect(tokens().some((token) => token.startsWith('-start-') || token.startsWith('-end-'))).toBe(false);
});

test('a controlled rail dragged open asks its owner once per drag', () => {
  const changes = [];
  render(
    h(
      SidePanel,
      {
        id: 'navigation',
        side: 'start',
        breakpoint: 'none',
        label: 'Панель навигации',
        copy: COPY,
        railWidth: 72,
        collapsed: true,
        onCollapsedChange: (hidden) => changes.push(hidden),
        showHideButton: false,
        rail: h('nav', { 'aria-label': 'icon rail' }),
      },
      h('nav', { 'aria-label': 'full rail' })
    )
  );
  const separator = handle();
  fireEvent.pointerDown(separator, { clientX: 72, button: 0 });
  for (const x of [200, 220, 240, 260]) fireEvent.pointerMove(separator, { clientX: x });
  fireEvent.pointerUp(separator, { clientX: 260 });
  expect(changes).toEqual([false]);
});
