'use strict';
/**
 * Many channels at one time (`content-factory-next-97dq.59`, canvas C2 A,
 * owner pick 23.09.2026).
 *
 * Day: one time is a group — «N каналов» and the channel marks above when two
 * posts and more stand at it, then one row per channel post (mark, name,
 * state pill, start of the text, piece code); past five rows the rest folds
 * into «ещё N»; the dashed row under them adds a post and names the channels
 * still free. Week: one card per time with a band segment per channel and the
 * marks; a click opens the rows. Month: marks and times, no text.
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
const { render, screen, fireEvent, cleanup } = require('@testing-library/react');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const h = React.createElement;
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const plan = loadWithMocks(
  'apps/frontend/src/components/launches/calendar-plan.ts',
  {}
);

afterEach(cleanup);

describe('the plan state of a calendar row', () => {
  test.each([
    [{ state: 'QUEUE', plan: 'autopilot' }, 'queued'],
    [{ state: 'QUEUE', plan: null }, 'queued'],
    [{ state: 'DRAFT', plan: 'reserve' }, 'reserved'],
    // Autopilot refused by the platform stays a reserve (`97dq.57`).
    [{ state: 'DRAFT', plan: 'autopilot' }, 'reserved'],
    [{ state: 'DRAFT', plan: 'draft' }, 'draft'],
    [{ state: 'DRAFT' }, 'draft'],
    [{ state: 'PUBLISHED', plan: 'reserve' }, 'published'],
    [{ state: 'ERROR' }, 'error'],
  ])('%o reads %s', (post, expected) => {
    expect(plan.planStateOf(post)).toBe(expected);
  });

  test('only a queued autopilot post is marked «автопилот»', () => {
    expect(plan.isAutopilot({ state: 'QUEUE', plan: 'autopilot' })).toBe(true);
    expect(plan.isAutopilot({ state: 'DRAFT', plan: 'autopilot' })).toBe(false);
  });
});

describe('grouping and collapse', () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({
    id: `p${index}`,
    integration: { id: `c${index % 6}`, name: `Channel ${index % 6}` },
  }));

  test('five rows show, the rest fold into «ещё N»; expanded shows all', () => {
    expect(plan.collapseRows(rows.slice(0, 5), false)).toEqual({
      shown: rows.slice(0, 5),
      hidden: 0,
      collapsible: false,
    });
    const folded = plan.collapseRows(rows, false);
    expect(folded.shown).toHaveLength(5);
    expect(folded.hidden).toBe(2);
    expect(folded.collapsible).toBe(true);
    expect(plan.collapseRows(rows, true).shown).toHaveLength(7);
  });

  test('channels once each, and the free ones are the slot owners without a row', () => {
    expect(plan.channelsOf(rows).map((one) => one.id)).toEqual([
      'c0', 'c1', 'c2', 'c3', 'c4', 'c5',
    ]);
    expect(
      plan
        .freeChannelsAt(
          [{ id: 'c1' }, { id: 'x' }, { id: 'y' }],
          rows.slice(0, 2)
        )
        .map((one) => one.id)
    ).toEqual(['x', 'y']);
  });

  test('rows split by their exact time, earliest first', () => {
    const groups = plan.groupRowsByTime(
      [{ t: '09:40' }, { t: '09:20' }, { t: '09:40' }],
      (row) => row.t
    );
    expect(groups.map((group) => [group.time, group.rows.length])).toEqual([
      ['09:20', 1],
      ['09:40', 2],
    ]);
    expect(plan.timesOf([{ t: '14:10' }, { t: '09:20' }, { t: '14:10' }], (row) => row.t)).toEqual([
      '09:20',
      '14:10',
    ]);
  });
});

/* -------------------------------------------------------------------------
 * The calendar cell itself, rendered with its context.
 * ---------------------------------------------------------------------- */

const at = (time) => dayjs(`2030-09-24T${time}:00`);
// A channel schedule holds minutes after UTC midnight; the calendar turns
// them into local time, so the fixture writes the local time back as UTC.
const minuteOf = (time) => {
  const moment = at(time).utc();
  return moment.hour() * 60 + moment.minute();
};
const channel = (index, times = []) => ({
  id: `c${index}`,
  name: `Channel ${index}`,
  picture: '',
  identifier: 'telegram',
  type: 'social',
  editor: 'normal',
  disabled: false,
  time: times.map((time) => ({ time: minuteOf(time) })),
});
const STATES = [
  ['DRAFT', 'reserve'],
  ['QUEUE', 'autopilot'],
  ['DRAFT', null],
  ['PUBLISHED', null],
  ['QUEUE', null],
  ['DRAFT', 'reserve'],
  ['QUEUE', null],
];
const post = (index, time, channelIndex = index) => ({
  id: `p${index}`,
  group: `g${index}`,
  content: `<p>Text of post ${index}</p>`,
  publishDate: at(time).toISOString(),
  state: STATES[index % STATES.length][0],
  plan: STATES[index % STATES.length][1],
  integration: { id: `c${channelIndex}`, name: `Channel ${channelIndex}`, picture: '' },
  piece: { id: `piece${index}`, code: `cnt-3${index}`, title: `Piece ${index}` },
  tags: [],
});

let context;
const CalendarContext = React.createContext(null);
const loadCalendar = () =>
  loadWithMocks('apps/frontend/src/components/launches/calendar.tsx', {
    '@contentfactory/frontend/components/launches/calendar.context': {
      CalendarContext,
      useCalendar: () => React.useContext(CalendarContext),
    },
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ openModal: () => {}, closeAll: () => {} }),
    },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async () => ({ ok: true, json: async () => ({}) }),
    },
    'react-dnd': {
      useDrag: () => [{ opacity: 1 }, () => {}],
      useDrop: () => [{ canDrop: false }, () => {}],
    },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: () => {} }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ role: 'ADMIN' }),
    },
    '@mantine/hooks': {
      useInterval: () => ({ start: () => {}, stop: () => {} }),
    },
    '@contentfactory/frontend/components/launches/statistics': {
      StatisticsModal: () => null,
    },
    '@contentfactory/frontend/components/launches/missing-release.modal': {
      MissingReleaseModal: () => null,
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) => fallback || key,
    },
    '@contentfactory/frontend/components/new-launch/compose.modal': {
      useOpenPostEditor: () => async () => {},
    },
    '@contentfactory/frontend/components/launches/creation.method.badge': {
      CreationMethodBadge: () => null,
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: async () => false },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ disableXAnalytics: false }),
    },
    '@contentfactory/react/translation/use-interface-language': {
      useInterfaceLanguage: () => 'ru',
    },
    './adaptation-picker': { useAdaptationPicker: () => () => {} },
    './helpers/isuscitizen.utils': { isUSCitizen: () => false },
    '@contentfactory/frontend/components/preview/post.preview.dialog': {
      PostPreviewDialog: () => null,
    },
  });

let Calendar;
beforeAll(() => {
  Calendar = loadCalendar();
});

const mountCell = ({ display, posts, integrations, date }) => {
  context = {
    integrations,
    posts,
    display,
    changeDate: () => {},
    reloadCalendarView: () => {},
    loading: false,
    setFilters: () => {},
    customer: null,
    editorialStage: null,
  };
  return render(
    h(
      CalendarContext.Provider,
      { value: context },
      h(Calendar.CalendarColumn, { getDate: date })
    )
  );
};

describe('day: one time is a group of channel rows', () => {
  test('two posts and more get «N каналов» and marks, one row per channel, with state and piece code', () => {
    const integrations = [0, 1, 2].map((index) => channel(index, ['09:20']));
    mountCell({
      display: 'day',
      posts: [post(0, '09:20'), post(1, '09:20')],
      integrations,
      date: at('09:20'),
    });
    const head = document.querySelector('[data-calendar-group-head]');
    expect(head.textContent).toContain('2 канала');
    const rows = [...document.querySelectorAll('[data-calendar-row="channel"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Channel 0');
    expect(rows[0].querySelector('[data-plan-state]').getAttribute('data-plan-state')).toBe('reserved');
    expect(rows[0].querySelector('[data-plan-state]').textContent).toBe('в плане');
    expect(rows[0].querySelector('[data-plan-state]').className).toContain('border-dashed');
    expect(rows[0].textContent).toContain('Text of post 0');
    expect(rows[0].textContent).toContain('cnt-30');
    expect(rows[1].querySelector('[data-plan-state]').textContent).toBe('в очереди');
    expect(rows[1].querySelector('[data-calendar-autopilot]').textContent).toBe('автопилот');
    // Channel 2 still has 09:20 free: the add row says so and adds for it.
    const add = document.querySelector('[data-calendar-slot="row"]');
    expect(add.textContent).toContain('Добавить пост на 09:20');
    expect(add.textContent).toContain('ещё свободно у 1 канала');
    expect(head.textContent).not.toContain('свободно: нет');
  });

  test('a single post has no group head', () => {
    mountCell({
      display: 'day',
      posts: [post(0, '09:20')],
      integrations: [channel(0, ['09:20'])],
      date: at('09:20'),
    });
    expect(document.querySelector('[data-calendar-group-head]')).toBeNull();
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(1);
    // Every channel of the slot is taken: the slimmer «Ещё пост на …».
    expect(document.querySelector('[data-calendar-slot="slim"]').textContent).toContain(
      'Ещё пост на 09:20'
    );
  });

  test('more than five rows fold into «ещё N» and unfold on click; «свободно: нет» when every slot is taken', () => {
    const integrations = [0, 1, 2, 3, 4, 5, 6].map((index) => channel(index, ['09:20']));
    mountCell({
      display: 'day',
      posts: [0, 1, 2, 3, 4, 5, 6].map((index) => post(index, '09:20')),
      integrations,
      date: at('09:20'),
    });
    expect(document.querySelector('[data-calendar-group-head]').textContent).toContain('7 каналов');
    expect(document.querySelector('[data-calendar-group-head]').textContent).toContain('свободно: нет');
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(5);
    const more = screen.getByRole('button', { name: 'ещё 2' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/Show more/)).toBeNull();
    fireEvent.click(more);
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: 'свернуть' }));
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(5);
  });

  test('an empty slot keeps «+ Добавить пост на ЧЧ:ММ» with its channels', () => {
    mountCell({
      display: 'day',
      posts: [],
      integrations: [channel(0, ['19:00']), channel(1, ['19:00'])],
      date: at('19:00'),
    });
    const add = document.querySelector('[data-calendar-slot="row"]');
    expect(add.textContent).toContain('Добавить пост на 19:00');
    expect(add.textContent).toContain('слоты каналов · Channel 0, Channel 1');
  });
});

describe('week: one card per time, a click opens the rows', () => {
  test('two channels at one time are one card with a band segment each; the list opens and closes', () => {
    mountCell({
      display: 'week',
      posts: [post(0, '09:20'), post(1, '09:20'), post(2, '09:20'), post(3, '09:50', 3)],
      integrations: [0, 1, 2, 3].map((index) => channel(index)),
      date: at('09:00'),
    });
    const group = document.querySelector('[data-calendar-week-group]');
    expect(group.getAttribute('data-calendar-week-group')).toBe('3');
    expect(group.textContent).toContain('09:20');
    expect(group.textContent).toContain('3 кан.');
    expect(
      [...group.querySelectorAll('[data-plan-band]')].map((one) => one.getAttribute('data-plan-band'))
    ).toEqual(['reserved', 'queued', 'draft']);
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(0);
    fireEvent.click(group);
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelectorAll('[data-calendar-row="channel"]')).toHaveLength(0);
    // The 09:50 post stands alone and keeps the ordinary card.
    expect(document.querySelectorAll('[data-calendar-week-group]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Text of post 3');
  });
});

describe('month: marks and times, no text', () => {
  test('the cell lists the times and opens the day', () => {
    let opened = null;
    const view = mountCell({
      display: 'month',
      posts: [post(0, '09:20'), post(1, '14:10'), post(2, '09:20')],
      integrations: [0, 1, 2].map((index) => channel(index)),
      date: at('09:00').endOf('day'),
    });
    context.setFilters = (filters) => {
      opened = filters;
    };
    view.rerender(
      h(CalendarContext.Provider, { value: { ...context } }, h(Calendar.CalendarColumn, { getDate: at('09:00').endOf('day') }))
    );
    const summary = document.querySelector('[data-calendar-month-summary]');
    expect(summary.textContent).toContain('09:20 · 14:10');
    expect(document.body.textContent).not.toContain('Text of post');
    expect(summary.getAttribute('aria-label')).toContain('3 канала');
    fireEvent.click(summary);
    expect(opened).toMatchObject({ display: 'day', startDate: '2030-09-24' });
  });
});

describe('the words and the hint', () => {
  test('the chip carries a «?» with its hint, and in the header the legend too (existing Hint, 97dq.82)', () => {
    const source = read('apps/frontend/src/components/launches/plan-ahead.tsx');
    expect(source).toContain("import { Hint } from '@contentfactory/react/layout/hint';");
    expect(source).toContain('<Hint label={copy.aheadHintLabel}>{copy.aheadHint}</Hint>');
    expect(source).toContain('<Hint label={copy.aheadLegendHintLabel}>');
    const filters = read('apps/frontend/src/components/launches/filters.tsx');
    expect(filters).toMatch(/<PlanAheadChip[\s\S]*?withLegend/);
    expect(filters).not.toContain('PlanLegend');
  });
});

describe('list: every row says its delivery state', () => {
  /*
   * Live walk 25.09.2026, P3-10. The list row's pill fell back from the stage
   * to the tag names to «Черновик»; a post confirmed into the queue had
   * neither stage nor tag and lost its only chip. It now carries the same
   * plan state word as the channel rows, and a stage beside it when one is set.
   */
  const mountList = (posts) => {
    context = {
      integrations: [channel(0, ['09:00'])],
      listPosts: posts,
      listState: 'all',
      listSearched: '',
      loading: false,
    };
    return render(
      h(CalendarContext.Provider, { value: context }, h(Calendar.ListView))
    );
  };
  const one = (patch) => ({ ...post(0, '09:00'), ...patch });

  test.each([
    [{ state: 'DRAFT', plan: 'reserve' }, 'reserved', 'в плане'],
    [{ state: 'QUEUE', plan: 'reserve' }, 'queued', 'в очереди'],
    [{ state: 'DRAFT', plan: null }, 'draft', 'черновик'],
    [{ state: 'PUBLISHED', plan: null }, 'published', 'вышел'],
  ])('%o shows «%s»', (patch, state, word) => {
    mountList([one(patch)]);
    const pills = document.querySelectorAll('[data-plan-state]');
    expect(pills).toHaveLength(1);
    expect(pills[0].getAttribute('data-plan-state')).toBe(state);
    expect(pills[0].textContent).toBe(word);
  });

  test('a stage set by a person stays beside the state', () => {
    mountList([one({ state: 'QUEUE', plan: null, editorialStage: 'REVIEW' })]);
    expect(document.querySelector('[data-plan-state]').textContent).toBe('в очереди');
    expect(document.body.textContent).toContain('Проверка');
  });
});
