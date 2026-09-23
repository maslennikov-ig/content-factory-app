'use strict';
/**
 * «Впереди N дней» in the calendar header and the content transitions
 * (`content-factory-next-97dq.59`, owner pick 23.09.2026).
 */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
afterEach(cleanup);

const AHEAD = {
  version: 'plan-ahead/v1',
  today: '2026-09-24',
  timeZone: 'Europe/Moscow',
  horizon: 60,
  days: 4,
  until: '2026-09-27',
  emptyFrom: '2026-09-28',
  strip: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    filled: index < 4,
  })),
  channels: [
    { integrationId: 'tg', name: 'AiDevTeam', days: 4, until: '2026-09-27', emptyFrom: '2026-09-28' },
    { integrationId: 'vk', name: 'Сообщество AiDev', days: 0, until: null, emptyFrom: '2026-09-24' },
  ],
};

let requests;
let answer;
const mocks = {
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async (url) => {
      requests.push(url);
      return answer;
    },
  },
  swr: {
    __esModule: true,
    default: (key, load) => {
      const [state, setState] = React.useState({ isLoading: true });
      const reload = () =>
        load()
          .then((data) => setState({ data, isLoading: false }))
          .catch((error) => setState({ error, isLoading: false }));
      React.useEffect(() => {
        void reload();
      }, [key]);
      return { ...state, mutate: reload };
    },
  },
};
const ahead = loadWithMocks('apps/frontend/src/components/launches/plan-ahead.tsx', mocks);

beforeEach(() => {
  requests = [];
  answer = { ok: true, json: async () => AHEAD };
});

describe('«впереди N дней» in the calendar header', () => {
  test('the URL carries the selected channels, sorted, and the reader’s zone', () => {
    expect(ahead.planAheadUrl(['vk', 'tg'], 'Europe/Moscow')).toBe(
      '/analytics/ahead?integrationIds=tg%2Cvk&timeZone=Europe%2FMoscow'
    );
    expect(ahead.planAheadUrl([], '')).toBe('/analytics/ahead');
  });

  test('the words: «впереди 4 дня · до вс 27.09», per channel «N дней · до DD.MM» or «пусто с DD.MM»', () => {
    const weekday = new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2026, 8, 27)))
      .replace('.', '');
    expect(ahead.aheadLabel(AHEAD, 'ru')).toBe(`впереди 4 дня · до ${weekday} 27.09`);
    expect(ahead.aheadLabel({ days: 0, until: null, emptyFrom: '2026-09-24' }, 'ru')).toBe(
      'впереди пусто'
    );
    expect(ahead.aheadChannelLine(AHEAD.channels[0], 'ru')).toBe('4 дня · до 27.09');
    expect(ahead.aheadChannelLine(AHEAD.channels[1], 'ru')).toBe('пусто с 24.09');
    expect(ahead.aheadChannelLine({ days: 1, until: '2026-09-24', emptyFrom: '2026-09-25' }, 'en')).toBe(
      '1 day · until 24.09'
    );
  });

  test('the chip opens the channel list on hover and closes on Escape; the «?» explains the count', async () => {
    render(
      h(ahead.PlanAheadChip, {
        locale: 'ru',
        integrationIds: ['tg', 'vk'],
        timeZone: 'Europe/Moscow',
      })
    );
    const chip = await screen.findByRole('button', { name: /впереди 4 дня/ });
    expect(requests[0]).toContain('/analytics/ahead?integrationIds=tg%2Cvk');
    expect(screen.getByRole('button', { name: 'Подсказка: впереди дней' })).toBeTruthy();
    expect(document.querySelector('[data-plan-ahead-channels]')).toBeNull();
    fireEvent.mouseEnter(chip.parentElement);
    const list = document.querySelector('[data-plan-ahead-channels]');
    expect(list.textContent).toContain('AiDevTeam4 дня · до 27.09');
    expect(list.textContent).toContain('Сообщество AiDevпусто с 24.09');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-plan-ahead-channels]')).toBeNull();
    // Keyboard: focus opens it too.
    fireEvent.focus(chip);
    expect(document.querySelector('[data-plan-ahead-channels]')).not.toBeNull();
  });

  test('a failed count says so quietly and keeps its place', async () => {
    answer = { ok: false, json: async () => ({}) };
    render(h(ahead.PlanAheadChip, { locale: 'ru', integrationIds: [], timeZone: 'UTC' }));
    await screen.findByText('Не удалось посчитать, на сколько дней вперёд есть план.');
    expect(document.querySelector('[data-plan-ahead="error"]')).not.toBeNull();
  });

  test('the analytics card: the number, «дня впереди», a 14-day strip', async () => {
    render(h(ahead.PlanAheadCard, { locale: 'ru', timeZone: 'UTC' }));
    await screen.findByText('4');
    const strip = document.querySelector('[data-plan-ahead-strip]');
    expect(strip.children).toHaveLength(14);
    expect([...strip.children].filter((day) => day.getAttribute('data-filled') === 'true')).toHaveLength(4);
    expect(document.body.textContent).toContain('дня впереди');
    expect(screen.getByRole('button', { name: 'Подсказка: впереди дней' })).toBeTruthy();
  });

  test('the legend shows the four states with a «?»', () => {
    render(h(ahead.PlanLegend, { locale: 'ru' }));
    expect(
      [...document.querySelectorAll('[data-plan-state]')].map((pill) => pill.textContent)
    ).toEqual(['в плане', 'в очереди', 'черновик', 'вышел']);
    expect(screen.getByRole('button', { name: 'Подсказка: состояния постов' })).toBeTruthy();
  });
});

describe('content transitions', () => {
  const { useEnterMotion } = loadWithMocks('apps/frontend/src/components/ui/enter-motion.ts', {});

  test('the first render does not animate; a new key puts the class back; the end of the animation removes it', () => {
    const Probe = ({ page }) => {
      const ref = useEnterMotion(page);
      return h('main', { ref, 'data-testid': 'main' }, page);
    };
    const view = render(h(Probe, { page: '/launches' }));
    const main = screen.getByTestId('main');
    expect(main.className).toBe('');
    view.rerender(h(Probe, { page: '/content' }));
    expect(main.className).toBe('cf-page-enter');
    // Same node: the page's own state survives the fade.
    expect(screen.getByTestId('main')).toBe(main);
    act(() => {
      main.dispatchEvent(new dom.window.Event('animationend'));
    });
    expect(main.className).toBe('');
  });

  test('CSS only: 180ms page and 150ms tab, ease-out, 4px rise, off under reduced motion', () => {
    const styles = read('apps/frontend/src/app/global.scss');
    expect(styles).toMatch(/@keyframes cf-enter \{\s*from \{\s*opacity: 0;\s*transform: translateY\(4px\);/);
    expect(styles).toMatch(/\.cf-page-enter \{\s*animation: cf-enter 180ms ease-out;/);
    expect(styles).toMatch(/\.cf-tab-enter \{\s*animation: cf-enter 150ms ease-out;/);
    const reduced = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.cf-page-enter,\s*\.cf-tab-enter \{\s*animation: none;/);
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(deps).filter((name) => /framer-motion|react-spring|gsap/.test(name))).toEqual([]);
  });

  test('only the content moves: the main area on a route change, the panel on a piece tab switch', () => {
    const layout = read('apps/frontend/src/components/new-layout/layout.component.tsx');
    expect(layout).toContain('const mainMotion = useEnterMotion<HTMLElement>(usePathname());');
    expect(layout).toMatch(/<main\s+ref=\{mainMotion\}\s+id="cf-main"/);
    const piece = read('apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx');
    expect(piece).toContain("useEnterMotion<HTMLDivElement>(tab, 'cf-tab-enter')");
    expect(piece).toMatch(/<TabPanel\s+ref=\{panelMotion\}/);
    expect(read('DESIGN.md')).toContain('`.cf-page-enter`');
  });
});
