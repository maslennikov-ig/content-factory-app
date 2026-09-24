'use strict';
/**
 * The plan ahead in the calendar header and in «Производство», and the
 * content transitions (`content-factory-next-97dq.59`; counts, not a streak,
 * since `97dq.73` — the thirteenth walk could not read «0 дней впереди»).
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
  version: 'plan-ahead/v2',
  today: '2026-09-24',
  timeZone: 'Europe/Moscow',
  horizon: 60,
  days: 4,
  until: '2026-09-27',
  emptyFrom: '2026-09-28',
  reserved: 2,
  queued: 3,
  planned: 5,
  planUntil: '2026-09-29',
  published7d: 6,
  daysWithPosts: 5,
  strip: Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 8, 24 + index)).toISOString().slice(0, 10),
    filled: index < 4 || index === 5,
    reserved: index === 0 ? 1 : index === 5 ? 1 : 0,
    queued: index > 0 && index < 4 ? 1 : 0,
    published: index === 0 ? 1 : 0,
  })),
  channels: [
    { integrationId: 'tg', name: 'AiDevTeam', days: 4, until: '2026-09-27', emptyFrom: '2026-09-28', reserved: 2, queued: 3, planned: 5, planUntil: '2026-09-29', published7d: 6 },
    { integrationId: 'vk', name: 'Сообщество AiDev', days: 0, until: null, emptyFrom: '2026-09-24', reserved: 0, queued: 0, planned: 0, planUntil: null, published7d: 0 },
  ],
};
const weekdayOf = (y, m, d) =>
  new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace('.', '');

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
        // SWR asks nothing for a null key.
        if (key) void reload();
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

  test('the words count posts: «В плане 5 постов · до вт 29.09», per channel «N постов · до DD.MM» or «пусто»', () => {
    expect(ahead.aheadLabel(AHEAD, 'ru')).toBe(`В плане 5 постов · до ${weekdayOf(2026, 9, 29)} 29.09`);
    expect(ahead.aheadLabel({ ...AHEAD, planned: 3 }, 'ru')).toMatch(/^В плане 3 поста · до /);
    expect(ahead.aheadLabel({ ...AHEAD, planned: 1 }, 'ru')).toMatch(/^В плане 1 пост · до /);
    expect(ahead.aheadLabel({ planned: 0, planUntil: null }, 'ru')).toBe('План пуст');
    expect(ahead.aheadLabel({ planned: 0, planUntil: null }, 'en')).toBe('Plan is empty');
    expect(ahead.aheadChannelLine(AHEAD.channels[0], 'ru')).toBe('5 постов · до 29.09');
    expect(ahead.aheadChannelLine(AHEAD.channels[1], 'ru')).toBe('пусто');
    expect(ahead.aheadChannelLine({ planned: 1, planUntil: '2026-09-24' }, 'en')).toBe('1 post · until 24.09');
  });

  test('the chip opens the channel list on hover and closes on Escape; the «?» explains the count', async () => {
    render(
      h(ahead.PlanAheadChip, {
        locale: 'ru',
        integrationIds: ['tg', 'vk'],
        timeZone: 'Europe/Moscow',
      })
    );
    const chip = await screen.findByRole('button', { name: /В плане 5 постов/ });
    expect(requests[0]).toContain('/analytics/ahead?integrationIds=tg%2Cvk');
    expect(screen.getByRole('button', { name: 'Подсказка: план впереди' })).toBeTruthy();
    expect(document.querySelector('[data-plan-ahead-channels]')).toBeNull();
    fireEvent.mouseEnter(chip.parentElement);
    const list = document.querySelector('[data-plan-ahead-channels]');
    expect(list.textContent).toContain('AiDevTeam5 постов · до 29.09');
    expect(list.textContent).toContain('Сообщество AiDevпусто');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-plan-ahead-channels]')).toBeNull();
    // Keyboard: focus opens it too.
    fireEvent.focus(chip);
    expect(document.querySelector('[data-plan-ahead-channels]')).not.toBeNull();
  });

  test('a press on the legend bubble keeps the channel list open; a press elsewhere closes it (fourteenth walk review, P3-4)', async () => {
    render(
      h(ahead.PlanAheadChip, {
        locale: 'ru',
        integrationIds: ['tg', 'vk'],
        timeZone: 'Europe/Moscow',
        withLegend: true,
      })
    );
    const chip = await screen.findByRole('button', { name: /В плане 5 постов/ });
    fireEvent.mouseEnter(chip.parentElement);
    expect(document.querySelector('[data-plan-ahead-channels]')).not.toBeNull();
    // The legend's bubble is portalled into <body>, outside the holder.
    fireEvent.focus(screen.getByRole('button', { name: /^Подсказка: план впереди/ }));
    const bubble = screen.getByRole('tooltip');
    expect(chip.parentElement.contains(bubble)).toBe(false);
    expect(bubble.getAttribute('data-hint-portal')).toBeTruthy();
    fireEvent.mouseDown(bubble.firstChild || bubble);
    expect(document.querySelector('[data-plan-ahead-channels]')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(document.querySelector('[data-plan-ahead-channels]')).toBeNull();
  });

  test('a failed count says so quietly and keeps its place', async () => {
    answer = { ok: false, json: async () => ({}) };
    render(h(ahead.PlanAheadChip, { locale: 'ru', integrationIds: ['tg'], timeZone: 'UTC' }));
    await screen.findByText('Не удалось посчитать план впереди.');
    expect(document.querySelector('[data-plan-ahead="error"]')).not.toBeNull();
  });

  test('no channel in view asks nothing and reads «План пуст», not the whole organisation (second review, item 4)', async () => {
    render(h(ahead.PlanAheadChip, { locale: 'ru', integrationIds: [], timeZone: 'UTC' }));
    await act(async () => {});
    expect(requests).toEqual([]);
    const chip = screen.getByRole('button', { name: 'План пуст' });
    expect(chip.className).toContain('border-dashed');
  });

  test('an empty plan still shows the chip, dashed, with «План пуст»', async () => {
    answer = { ok: true, json: async () => ({ ...AHEAD, planned: 0, reserved: 0, queued: 0, planUntil: null }) };
    render(h(ahead.PlanAheadChip, { locale: 'ru', integrationIds: ['tg'], timeZone: 'UTC' }));
    const chip = await screen.findByRole('button', { name: 'План пуст' });
    expect(chip.className).toContain('border-dashed');
    expect(document.querySelector('[data-plan-ahead="0"]')).not.toBeNull();
  });

  test('Производство: four numbers, a 14-day strip with counts and a legend, a table per channel, every card with «?»', async () => {
    render(h(ahead.PlanAheadOverview, { locale: 'ru', timeZone: 'UTC' }));
    await screen.findByText('Постов впереди');
    const metric = (name) => document.querySelector(`[data-plan-ahead-metric="${name}"]`).textContent;
    expect(metric('planned')).toContain('5');
    expect(metric('planned')).toContain('в плане 2 · в очереди 3');
    expect(metric('days')).toContain('5 из 14');
    expect(metric('until')).toContain('29.09');
    expect(metric('empty')).toContain('28.09');
    const strip = document.querySelector('[data-plan-ahead-strip]');
    expect(strip.children).toHaveLength(14);
    expect([...strip.children].map((day) => day.getAttribute('data-count')).slice(0, 6)).toEqual(['2', '1', '1', '1', '0', '1']);
    expect(strip.children[0].textContent).toContain('24.09');
    expect(document.querySelector('[data-plan-ahead-legend]').textContent).toContain('пусто — постов нет');
    const rows = [...document.querySelectorAll('[data-plan-ahead-table] tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent)
    );
    expect(rows[0].slice(0, 4)).toEqual(['AiDevTeam', '2', '3', '6']);
    expect(rows[1].slice(0, 5)).toEqual(['Сообщество AiDev', '0', '0', '0', '—']);
    for (const name of [
      'Подсказка: план впереди',
      'Подсказка: постов впереди',
      'Подсказка: дней с постами из ближайших 14',
      'Подсказка: план до',
      'Подсказка: первый пустой день',
      'Подсказка: ближайшие 14 дней',
      'Подсказка: по каналам',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    // The streak words are gone.
    expect(document.body.textContent).not.toMatch(/впереди \d+ д|закрашено/);
  });

  test('Производство: a failed count offers a working retry', async () => {
    answer = { ok: false, json: async () => ({}) };
    render(h(ahead.PlanAheadOverview, { locale: 'en', timeZone: 'UTC' }));
    await screen.findByText('Could not count the plan ahead.');
    answer = { ok: true, json: async () => AHEAD };
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    await screen.findByText('Posts ahead');
    expect(requests).toHaveLength(2);
  });

  test('the legend lives under the chip «?»: the count, the four states and what they mean (97dq.82)', async () => {
    render(
      h(ahead.PlanAheadChip, { locale: 'ru', integrationIds: ['tg'], timeZone: 'UTC', withLegend: true })
    );
    await screen.findByRole('button', { name: /В плане 5 постов/ });
    // No standalone legend on the surface: it is the tooltip's text.
    expect(document.querySelector('[data-plan-legend]')).toBeNull();
    const trigger = screen.getByRole('button', {
      name: 'Подсказка: план впереди и состояния постов',
    });
    fireEvent.focus(trigger);
    const tip = screen.getByRole('tooltip');
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id);
    expect(
      [...tip.querySelectorAll('[data-plan-state]')].map((pill) => pill.textContent)
    ).toEqual(['в плане', 'в очереди', 'черновик', 'вышел']);
    expect(tip.textContent).toContain('Сколько постов стоит впереди');
    expect(tip.textContent).toContain('Состояния постов в календаре');
    expect(tip.textContent).toContain('«в очереди» — выйдет сам в своё время');
  });

  test('the legend stays reachable while the count loads or fails', async () => {
    answer = { ok: false, json: async () => ({}) };
    render(
      h(ahead.PlanAheadChip, { locale: 'en', integrationIds: ['tg'], timeZone: 'UTC', withLegend: true })
    );
    await screen.findByText('Could not count the plan ahead.');
    expect(
      screen.getByRole('button', { name: 'Hint: the plan ahead and post states' })
    ).toBeTruthy();
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

describe('containsIncludingHints (hint-portal.ts)', () => {
  const { containsIncludingHints } = loadWithMocks(
    'libraries/react-shared-libraries/src/layout/hint-portal.ts',
    {}
  );
  test('a bubble counts as inside only for holders that contain its anchor', () => {
    document.body.innerHTML =
      '<div id="holder"><span data-hint-anchor=":r1:"></span></div>' +
      '<div id="other"></div>' +
      '<span data-hint-portal=":r1:"><b id="in-bubble">x</b></span>' +
      '<span data-hint-portal=":r9:"><b id="foreign">y</b></span>';
    const holder = document.getElementById('holder');
    const inBubble = document.getElementById('in-bubble');
    expect(containsIncludingHints(holder, inBubble)).toBe(true);
    expect(containsIncludingHints(holder, inBubble.firstChild)).toBe(true);
    expect(containsIncludingHints(document.getElementById('other'), inBubble)).toBe(false);
    expect(containsIncludingHints(holder, document.getElementById('foreign'))).toBe(false);
    expect(containsIncludingHints(holder, document.body)).toBe(false);
    expect(containsIncludingHints(null, inBubble)).toBe(false);
    document.body.innerHTML = '';
  });
});
