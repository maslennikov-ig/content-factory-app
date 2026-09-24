'use strict';

/**
 * The calendar header, direction A of the header canvas
 * (`content-factory-next-97dq.82`, owner pick 24.09.2026): two rows by
 * meaning. Row 1 — time and view; a 1px divider; row 2 — what is shown and
 * the main action. The legend row and «Все каналы →» are gone; the legend
 * lives under the plan chip's «?» (`calendar.plan-ahead-motion.test.cjs`).
 */

const React = require('react');
const dayjs = require('dayjs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { render, screen, cleanup, within } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
afterEach(cleanup);

let calendar;
let role;
const openPicker = jest.fn();

const { Filters } = loadWithMocks('apps/frontend/src/components/launches/filters.tsx', {
  '@contentfactory/frontend/components/launches/calendar.context': {
    useCalendar: () => calendar,
  },
  '@contentfactory/frontend/components/launches/select.customer': {
    SelectCustomer: () => h('span', { 'data-select-customer': 'true' }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback) => fallback,
  },
  '@contentfactory/react/translation/use-interface-language': {
    useInterfaceLanguage: () => 'ru',
  },
  '@contentfactory/frontend/components/layout/set.timezone': {
    getTimezone: () => 'UTC',
    newDayjs: (value) => dayjs(value),
  },
  '../layout/user.context': { useUser: () => ({ role }) },
  './adaptation-picker': { useAdaptationPicker: () => openPicker },
  './plan-ahead': {
    PlanAheadChip: (props) =>
      h('span', { 'data-plan-ahead-stub': 'true', 'data-with-legend': String(Boolean(props.withLegend)) }),
  },
  '@contentfactory/react/form/button-link': {
    ButtonLink: ({ href, children, variant, density, ...rest }) =>
      h('a', { href, 'data-variant': variant, ...rest }, children),
  },
});

const draw = (display = 'week', who = 'ADMIN') => {
  role = who;
  calendar = {
    display,
    startDate: '2026-09-21',
    endDate: '2026-09-27',
    customer: null,
    editorialStage: null,
    integrationId: null,
    integrations: [
      { id: 'tg', name: 'AiDevTeam', disabled: false },
      { id: 'vk', name: 'Мой паблик', disabled: false },
    ],
    posts: [],
    loading: false,
    listState: 'all',
    listPage: 0,
    listTotalPages: 3,
    setFilters: jest.fn(),
    setListState: jest.fn(),
    setListPage: jest.fn(),
  };
  return render(h(Filters));
};

const row = (name) => document.querySelector(`[data-calendar-header-row="${name}"]`);

describe('header A: two rows by meaning (97dq.82)', () => {
  test('row 1 is time and view; a divider; row 2 is filters, channels, plan and the action', () => {
    draw();
    const header = document.querySelector('[data-calendar-header="true"]');
    const children = [...header.children];
    expect(children).toEqual([row('time'), document.querySelector('[data-calendar-header-divider]'), row('filters')]);
    expect(children[1].className).toContain('h-px');
    expect(children[1].className).toContain('bg-cf-border');
    expect(children[1].getAttribute('aria-hidden')).toBe('true');

    const time = within(row('time'));
    expect(time.getByRole('button', { name: 'Назад' })).toBeTruthy();
    expect(time.getByRole('button', { name: 'Вперёд' })).toBeTruthy();
    expect(time.getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(row('time').querySelector('[aria-label="Период: день, неделя или месяц"]')).not.toBeNull();
    expect(row('time').querySelector('[aria-label="Вид: календарь или список"]')).not.toBeNull();

    const filters = row('filters');
    const order = [
      filters.querySelector('select[aria-label="Все каналы"]'),
      filters.querySelector('select[name="editorialStageFilter"]'),
      filters.querySelector('[data-select-customer]'),
      filters.querySelector('[data-calendar-channels-link]'),
      filters.querySelector('[data-plan-ahead-stub]'),
      within(filters).getByRole('button', { name: '+ Запланировать' }),
    ];
    for (const node of order) expect(node).not.toBeNull();
    for (let index = 1; index < order.length; index += 1)
      expect(order[index - 1].compareDocumentPosition(order[index]) & 4).toBe(4);

    const channels = filters.querySelector('[data-calendar-channels-link]');
    expect(channels.getAttribute('href')).toBe('/channels');
    expect(channels.getAttribute('data-variant')).toBe('quiet');
    expect(channels.textContent).toBe('Каналы');
    expect(channels.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(filters.querySelector('[data-plan-ahead-stub]').getAttribute('data-with-legend')).toBe('true');
  });

  test('«Все каналы →» and the legend row are gone; both rows wrap', () => {
    draw();
    expect(document.body.textContent).not.toContain('Все каналы →');
    expect(document.querySelector('[data-plan-legend]')).toBeNull();
    for (const name of ['time', 'filters']) expect(row(name).className).toContain('flex-wrap');
  });

  test('a viewer sees no «+ Запланировать»', () => {
    draw('week', 'VIEWER');
    expect(screen.queryByRole('button', { name: '+ Запланировать' })).toBeNull();
    expect(row('filters').querySelector('[data-calendar-channels-link]')).not.toBeNull();
  });

  test('the list keeps its page group and state strip in row 1, without the period', () => {
    draw('list');
    const time = row('time');
    expect(time.textContent).toContain('Page 1 of 3');
    expect(time.querySelector('[aria-label="Какие посты показать"]')).not.toBeNull();
    expect(time.querySelector('[aria-label="Период: день, неделя или месяц"]')).toBeNull();
    expect(time.querySelector('[aria-label="Вид: календарь или список"]')).not.toBeNull();
  });
});

describe('scrollbar S1 (97dq.82)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'apps/frontend/src/app/global.scss'), 'utf8');

  test('one thin themed bar: 8px, token thumb and hover, transparent track, both dialects', () => {
    expect(css).toMatch(/::-webkit-scrollbar \{\s*width: 8px;\s*height: 8px;/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb \{[^}]*background-color: var\(--cf-border-strong\)/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover \{\s*background-color: var\(--cf-border-control\)/);
    expect(css).toMatch(/::-webkit-scrollbar-track,\s*::-webkit-scrollbar-corner \{\s*background: transparent;/);
    expect(css).toMatch(/@supports not selector\(::-webkit-scrollbar\) \{[\s\S]*scrollbar-width: thin;[\s\S]*scrollbar-color: var\(--cf-border-strong\) transparent;/);
  });

  test('no component paints its own scrollbar colours over it', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|s?css)$/.test(entry.name)) {
          if (/\bscrollbar-(?:thumb|track)-/.test(fs.readFileSync(full, 'utf8')))
            offenders.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, 'apps/frontend/src'));
    expect(offenders).toEqual([]);
  });
});
