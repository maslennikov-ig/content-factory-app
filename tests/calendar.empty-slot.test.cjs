'use strict';
/**
 * The calendar's empty slot — one look in the day, the week and the month.
 *
 * `97dq.50`, direction A of the 23.09.2026 canvas. On the eleventh walk the
 * owner read the day view's empty slots as «непонятно, что это за пустые
 * квадратики»: they were add buttons drawn as the first four channel avatars,
 * greyed and at 30% opacity until hovered (screenshot B6_1). The slot now says
 * what it adds, on a dashed outline, and names its channels in words.
 */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/launches' });
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
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';

const { freeSlotsOn } = loadWithMocks(
  'apps/frontend/src/components/launches/calendar-slots.ts',
  {}
);
const { SlotButton, postLine } = loadWithMocks(
  'apps/frontend/src/components/launches/post-card.parts.tsx',
  {}
);
const { calendarPlanningCopy } = loadWithMocks(
  'apps/frontend/src/components/launches/calendar-planning.copy.ts',
  {}
);
const { pieceSlotPath, readPieceWhen } = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts',
  {}
);

afterEach(cleanup);

describe('free channel slots of a cell', () => {
  // Schedule minutes are local minutes here: the conversion is the caller's.
  const same = (minute) => minute;
  const channels = [
    { name: 'AiDevTeam', time: [{ time: 9 * 60 + 20 }, { time: 19 * 60 }] },
    { name: 'Группа', time: [{ time: 19 * 60 }] },
    { name: 'Выключен', disabled: true, time: [{ time: 12 * 60 }] },
  ];
  const day = dayjs('2030-09-24T00:00:00');

  test('a day lists every future slot once, with the channels that hold it', () => {
    const slots = freeSlotsOn({
      channels,
      day,
      now: dayjs('2030-09-24T08:00:00'),
      toLocalMinute: same,
    });
    expect(slots.map((slot) => slot.key)).toEqual(['09:20', '19:00']);
    expect(slots[1].channels).toEqual(['AiDevTeam', 'Группа']);
    expect(slots[0].at.format('YYYY-MM-DD HH:mm')).toBe('2030-09-24 09:20');
  });

  test('passed, occupied and other-hour slots are not offered', () => {
    expect(
      freeSlotsOn({
        channels,
        day,
        now: dayjs('2030-09-24T10:00:00'),
        toLocalMinute: same,
      }).map((slot) => slot.key)
    ).toEqual(['19:00']);
    expect(
      freeSlotsOn({
        channels,
        day,
        now: dayjs('2030-09-24T08:00:00'),
        toLocalMinute: same,
        taken: ['19:00'],
      }).map((slot) => slot.key)
    ).toEqual(['09:20']);
    expect(
      freeSlotsOn({
        channels,
        day,
        now: dayjs('2030-09-24T08:00:00'),
        toLocalMinute: same,
        hour: 9,
      }).map((slot) => slot.key)
    ).toEqual(['09:20']);
  });
});

describe('twelfth stand walk (23.09.2026)', () => {
  test('a slot of one channel carries its id, so the picker opens on it', () => {
    const slots = freeSlotsOn({
      channels: [
        { id: 'tg', name: 'Группа', time: [{ time: 9 * 60 + 20 }, { time: 19 * 60 }] },
        { id: 'vk', name: 'ВК', time: [{ time: 19 * 60 }] },
      ],
      day: dayjs('2030-09-24T00:00:00'),
      now: dayjs('2030-09-24T08:00:00'),
      toLocalMinute: (minute) => minute,
    });
    expect(slots.map((slot) => slot.channelIds)).toEqual([['tg'], ['tg', 'vk']]);
    const source = read(CALENDAR);
    expect(source).toContain('onClick={addAt(slot.at, slot.channelIds)}');
    expect(source).toContain(
      'openPicker(at, channelIds.length === 1 ? channelIds[0] : undefined)'
    );
  });

  test('the card line joins paragraphs with a space and the draft word is for a screen reader', () => {
    expect(postLine('<p>ноу-хау.</p><p>Для меня</p>')).toBe('ноу-хау. Для меня');
    expect(postLine('одна<br>строка\nи ещё')).toBe('одна строка и ещё');
    expect(postLine(null)).toBe('');
    const source = read(CALENDAR);
    expect(source).toContain(
      "<span className=\"sr-only\">{`${t('draft', 'Draft')}: `}</span>"
    );
    expect(source).not.toContain("{state === 'DRAFT' ? `${t('draft', 'Draft')}: ` : ''}");
  });

  test('on a phone the day row keeps its words and the caption yields', () => {
    render(
      React.createElement(SlotButton, {
        shape: 'row',
        label: 'Добавить пост на 09:20',
        caption: 'слот канала · AiDevTeam',
        onClick: () => {},
      })
    );
    const label = screen.getByText('Добавить пост на 09:20');
    expect(label.className).toContain('shrink-0');
    const caption = screen.getByText('слот канала · AiDevTeam');
    expect(caption.className).toMatch(/(^| )hidden( |$)/);
    expect(caption.className).toContain('sm:block');
  });
});

describe('SlotButton', () => {
  test('the day row says what it adds and names the channels, with no avatar', () => {
    let clicks = 0;
    const { container } = render(
      React.createElement(SlotButton, {
        shape: 'row',
        label: 'Добавить пост на 09:20',
        caption: 'слот канала · AiDevTeam',
        onClick: () => clicks++,
      })
    );
    const button = screen.getByRole('button', {
      name: /Добавить пост на 09:20/,
    });
    expect(button.textContent).toContain('слот канала · AiDevTeam');
    expect(button.className).toContain('border-dashed');
    expect(button.className).not.toMatch(/grayscale|opacity-30/);
    expect(container.querySelector('img')).toBeNull();
    fireEvent.click(button);
    expect(clicks).toBe(1);
  });

  test('the week chip keeps a short label and a full accessible name', () => {
    render(
      React.createElement(SlotButton, {
        shape: 'chip',
        label: '09:20',
        ariaLabel: 'Добавить пост на 09:20 · AiDevTeam',
        onClick: () => {},
      })
    );
    const chip = screen.getByRole('button', {
      name: 'Добавить пост на 09:20 · AiDevTeam',
    });
    expect(chip.textContent).toBe('09:20');
    expect(chip.getAttribute('data-calendar-slot')).toBe('chip');
  });
});

describe('the words of the slot', () => {
  test.each([
    [1, '1 слот'],
    [2, '2 слота'],
    [5, '5 слотов'],
    [11, '11 слотов'],
    [21, '21 слот'],
  ])('%i reads «%s»', (count, expected) => {
    expect(calendarPlanningCopy.ru.slots(count)).toBe(expected);
  });

  test('both languages carry every slot phrase', () => {
    for (const locale of ['ru', 'en']) {
      const copy = calendarPlanningCopy[locale];
      expect(copy.addPostAt('09:20')).toContain('09:20');
      expect(copy.morePostAt('14:10')).toContain('14:10');
      expect(copy.slotOf(2)).toBeTruthy();
      expect(copy.dayOtherTime).toBeTruthy();
    }
  });
});

describe('the calendar draws the slot, not the avatars', () => {
  const source = read(CALENDAR);

  test('day: time on the left, the row or «Ещё пост», and the hatch without a button in the past', () => {
    expect(source).toContain('[grid-template-columns:72px_minmax(0,1fr)]');
    expect(source).toContain('planningCopy.addPostAt(time)');
    expect(source).toContain('planningCopy.morePostAt(time)');
    expect(source).toMatch(/!isBeforeNow &&\s*\(postList\.length \?/u);
    expect(source).not.toMatch(/opacity-30 grayscale/);
    expect(source).not.toContain('integrations.slice(0, 4)');
  });

  test('week and month: channel times as chips, the month counts them and opens the day', () => {
    expect(source).toContain('freeSlotsOn(');
    expect(source).toContain('planningCopy.slots(freeSlots.length)');
    expect(source).toMatch(/display: 'day',/u);
  });

  test('one card in every grid: only the list view keeps the row', () => {
    expect(source).toContain('const wide = Boolean(props.row);');
    expect((source.match(/\brow\n/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(source).toContain('showTime\n');
  });
});

describe('the slot date reaches the piece channel tab', () => {
  test('the path carries the tab and the ISO moment', () => {
    const at = new Date('2030-09-24T16:00:00Z');
    expect(pieceSlotPath('p/1', 'ch1', at)).toBe(
      `/content/pieces/p%2F1?tab=ch1&when=${encodeURIComponent(at.toISOString())}`
    );
    expect(pieceSlotPath('p1', 'ch1', null)).toBe('/content/pieces/p1?tab=ch1');
  });

  test('a past or unreadable `when` is not a date', () => {
    const now = new Date('2030-09-24T12:00:00Z');
    expect(readPieceWhen('2030-09-24T16:00:00.000Z', now)?.toISOString()).toBe(
      '2030-09-24T16:00:00.000Z'
    );
    expect(readPieceWhen('2030-09-24T10:00:00.000Z', now)).toBeNull();
    expect(readPieceWhen('soon', now)).toBeNull();
    expect(readPieceWhen(undefined, now)).toBeNull();
  });

  test('the piece page passes `when` and the draft tab uses it before the free slot', () => {
    const page = read('apps/frontend/src/app/(app)/(site)/content/pieces/[id]/page.tsx');
    expect(page).toContain('initialWhen: when');
    const container = read(
      'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx'
    );
    expect(container).toMatch(
      /when\[adaptation\.id\]\) \?\?\s*\(channel\.id === slotWhen\.channel \? slotWhen\.at : null\) \?\?\s*slot\.data/u
    );
  });
});
