'use strict';

/**
 * Клетка состояния в таблице заготовок: значок, цвет, подсказка и легенда.
 *
 * `content-factory-next-97dq.8`. Макет владельца от 18.09.2026 убрал слово
 * состояния из клетки и оставил там квадрат 28 × 28. Это выигрыш места и
 * риск сразу: если слово не вернётся ни в доступное имя, ни в подсказку, ни в
 * легенду, единственным носителем смысла останется цвет — ровно то, что
 * правила автора компонента запрещают.
 *
 * Поэтому здесь проверяется не вид, а то, чем состояние можно прочитать:
 *
 *  - у каждого из семи состояний свой значок и свой тон, и они не совпадают;
 *  - доступное имя называет площадку и слово состояния, а подсказка —
 *    площадку, момент и то, что случится по нажатию;
 *  - цифра в углу появляется только там, где каналов больше одного;
 *  - «ещё нет» ведёт в ту же дверь «Адаптировать», что и кнопка строки;
 *  - пара фильтров «Площадка» и «Состояние» отбирает строки одной фразой;
 *  - легенда несёт ту же клетку и её слово — и ничего не нажимает.
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

const { cleanup, render, screen, fireEvent } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { PiecesScreen } = loadTypeScriptModule(`${base}/pieces/pieces.screen.tsx`);
const cellModule = loadTypeScriptModule(`${base}/pieces/adaptation.cell.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces/pieces.adapter.ts`);
const { piecesCopy } = loadTypeScriptModule(`${base}/pieces/pieces.copy.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});
afterEach(cleanup);

const noop = () => undefined;

const COLUMNS = [
  { platform: 'telegram', name: 'Telegram', channels: 2, adaptations: 4 },
  { platform: 'vk', name: 'VK', channels: 1, adaptations: 2 },
];

/** Одна строка, у которой клетка Telegram — ровно то, что просит тест. */
const rowWith = (cell) => ({
  id: `piece-${cell.state}`,
  code: `cnt-${cell.state}`,
  title: 'Заготовка со значком',
  format: 'пост',
  date: '18.09',
  createdAt: '2026-09-18T09:00:00.000Z',
  excerpt: ['Суть.'],
  coreExtracted: true,
  origin: 'thought',
  slopVerdict: null,
  archivedAt: null,
  // Строка «пока не знаем» приходит без ключа `cells` вовсе.
  ...(cell.state === 'unknown'
    ? {}
    : { cells: [{ platform: 'telegram', ...cell }] }),
});

const draw = (props = {}) =>
  render(
    withLanguage(
      'ru',
      React.createElement(PiecesScreen, {
        locale: 'ru',
        state: 'default',
        rows: [],
        columns: COLUMNS,
        restColumns: [],
        filters: adapter.emptyPiecesFilters,
        expandedId: null,
        canWrite: true,
        columnsMenuOpen: false,
        chosenColumns: [],
        onFilterChange: noop,
        onToggleColumn: noop,
        onToggleColumnsMenu: noop,
        onExpand: noop,
        onOpenPiece: noop,
        onAdapt: noop,
        onOpenPost: noop,
        onNewPiece: noop,
        onRetry: noop,
        ...props,
      })
    )
  );

const withLanguage = (language, element) =>
  React.createElement(variables.VariableContextComponent, { language }, element);

const telegramCell = () =>
  document.querySelector('[data-piece-table] [data-piece-cell="telegram"]');

describe('each state carries its own icon, its own tone and its own word', () => {
  const TONE_CLASS = {
    published: 'text-cf-accent',
    queued: 'text-cf-info',
    draft: 'bg-cf-surface-subtle',
    error: 'text-cf-danger',
    none: 'border-dashed',
    no_channel: 'border-transparent',
    unknown: 'border-dotted',
  };

  test.each(adapter.readCellState ? cellModule.CELL_STATES_IN_ORDER : [])(
    '«%s» draws a glyph and a tone of its own',
    (state) => {
      draw({ rows: [rowWith({ state })] });
      const cell = telegramCell();
      const square = cell.querySelector('span');

      expect(cell.getAttribute('data-piece-cell-state')).toBe(state);
      expect(square.querySelector('svg')).not.toBeNull();
      expect(square.className).toContain(TONE_CLASS[state]);
      expect(cell.getAttribute('aria-label')).toBe(
        `Telegram: ${cellModule.stateWord(state, piecesCopy.ru)}`
      );
    }
  );

  test('no two states are drawn with the same glyph', () => {
    const shapes = new Set();
    for (const state of cellModule.CELL_STATES_IN_ORDER) {
      draw({ rows: [rowWith({ state })] });
      shapes.add(telegramCell().querySelector('svg').innerHTML);
      cleanup();
    }
    expect(shapes.size).toBe(cellModule.CELL_STATES_IN_ORDER.length);
  });

  test('the hint says the platform, the moment and what a press does', () => {
    draw({
      rows: [
        rowWith({
          state: 'queued',
          date: '2026-09-19T10:00:00.000Z',
          postId: 'post-1',
        }),
      ],
    });
    const hint = telegramCell().getAttribute('title');
    // Время клетка печатает местное — то же, что человек видит в календаре, —
    // поэтому ожидание считается тем же счётчиком, а не вписано числом.
    const [day, time] = cellModule
      .cellDate('queued', '2026-09-19T10:00:00.000Z')
      .split(' ');

    expect(hint.startsWith('Telegram.')).toBe(true);
    expect(hint).toContain(`Выйдет ${day} в ${time}.`);
    expect(hint).toContain('Нажмите, чтобы открыть адаптацию.');
    // Имени канала в ответе нет — и выдуманного имени в подсказке тоже.
    expect(hint).not.toContain('·');
  });

  test('a datum that did not arrive leaves its sentence out', () => {
    draw({ rows: [rowWith({ state: 'draft', date: null })] });
    const hint = telegramCell().getAttribute('title');
    expect(hint).toBe('Telegram. Нажмите, чтобы открыть адаптацию.');
  });
});

describe('the corner digit counts channels, and only when there are several', () => {
  test('one channel leaves the square empty of text', () => {
    draw({ rows: [rowWith({ state: 'published', more: 0 })] });
    expect(telegramCell().textContent.trim()).toBe('');
  });

  test('three channels put «3» in the corner and a sentence in the hint', () => {
    draw({ rows: [rowWith({ state: 'published', more: 2 })] });
    expect(telegramCell().textContent.trim()).toBe('3');
    expect(telegramCell().getAttribute('title')).toContain(
      '3 канала площадки.'
    );
  });
});

describe('«ещё нет» opens the adaptation door that already exists', () => {
  test('a press hands the piece and the platform to the same action', () => {
    const onAdapt = jest.fn();
    draw({ rows: [rowWith({ state: 'none' })], onAdapt });
    const cell = telegramCell();

    expect(cell.disabled).toBe(false);
    fireEvent.click(cell);
    expect(onAdapt).toHaveBeenCalledWith('piece-none', 'telegram');
  });

  test('a cell nothing can be done with is refused before the press', () => {
    const onAdapt = jest.fn();
    draw({ rows: [rowWith({ state: 'no_channel' })], onAdapt });
    fireEvent.click(telegramCell());
    expect(telegramCell().disabled).toBe(true);
    expect(onAdapt).not.toHaveBeenCalled();
  });

  test('a read-only workspace keeps the cell readable and starts nothing', () => {
    const onAdapt = jest.fn();
    draw({ rows: [rowWith({ state: 'none' })], canWrite: false, onAdapt });
    expect(telegramCell().disabled).toBe(true);
    expect(telegramCell().getAttribute('aria-label')).toContain('ещё нет');
  });
});

describe('the two filters ask one question between them', () => {
  test('«Площадка» offers every platform of the answer and nothing else', () => {
    draw();
    const chips = [
      ...document.querySelectorAll('[data-piece-filter-option^="platform:"]'),
    ].map((chip) => chip.getAttribute('data-piece-filter-option'));
    expect(chips).toEqual([
      'platform:ALL',
      'platform:telegram',
      'platform:vk',
    ]);
  });

  /*
    Пять состояний в фильтре, семь в легенде. «Нет канала» и «пока не знаем»
    спрашивать нечем: первое — свойство пространства, второе — временное
    незнание продукта, и строку по ним не выбирают. Читать их по-прежнему
    можно: они остались и в клетке, и в легенде.
  */
  test('«Состояние» offers «Любое», five states and the archive', () => {
    draw();
    const chips = [
      ...document.querySelectorAll('[data-piece-filter-option^="state:"]'),
    ].map((chip) => chip.textContent);
    expect(chips).toEqual([
      'Любое',
      'опубликовано',
      'запланировано',
      'черновик',
      'не ушло',
      'ещё нет',
      'в архиве',
    ]);
  });

  test('a state nobody can act on stays readable and unaskable', () => {
    draw({ rows: [rowWith({ state: 'no_channel' })] });
    for (const state of ['no_channel', 'unknown']) {
      expect(
        document.querySelector(`[data-piece-filter-option="state:${state}"]`)
      ).toBeNull();
      expect(
        document.querySelector(`[data-piece-legend-state="${state}"]`)
      ).not.toBeNull();
    }
  });

  test('choosing a chip reports the filter it changed', () => {
    const changes = [];
    draw({ onFilterChange: (key, value) => changes.push([key, value]) });

    fireEvent.click(
      document.querySelector('[data-piece-filter-option="platform:vk"]')
    );
    fireEvent.click(
      document.querySelector('[data-piece-filter-option="state:error"]')
    );
    expect(changes).toEqual([
      ['platform', 'vk'],
      ['state', 'error'],
    ]);
  });

  test('the pair filters the loaded rows, and the server is asked what it knows', () => {
    const rows = [
      rowWith({ state: 'published' }),
      rowWith({ state: 'none' }),
      rowWith({ state: 'unknown' }),
    ];
    const pick = (filters) =>
      adapter
        .filterPieces(rows, { ...adapter.emptyPiecesFilters, ...filters })
        .map((row) => row.code);

    // Площадка без состояния значит «здесь уже писали».
    expect(pick({ platform: 'telegram' })).toEqual(['cnt-published']);
    // Пара — одна фраза: на этой площадке в этом состоянии.
    expect(pick({ platform: 'telegram', state: 'none' })).toEqual(['cnt-none']);
    // Состояние без площадки значит «хоть где-нибудь».
    expect(pick({ state: 'published' })).toEqual(['cnt-published']);
    // Строку без клеток «ещё нет» не захватывает: это незнание, а не пустота.
    expect(pick({ state: 'none' })).toEqual(['cnt-none']);
    expect(pick({ state: 'unknown' })).toEqual(['cnt-unknown']);

    // Сервер знает ровно два вопроса из пары, и только они уходят в запрос.
    expect(
      adapter.piecesQuery({
        ...adapter.emptyPiecesFilters,
        platform: 'telegram',
        state: 'none',
      })
    ).toEqual({ missingOn: 'telegram' });
    expect(
      adapter.piecesQuery({ ...adapter.emptyPiecesFilters, state: 'error' })
    ).toEqual({ state: 'error' });
    expect(
      adapter.piecesQuery({
        ...adapter.emptyPiecesFilters,
        platform: 'telegram',
        state: 'error',
      })
    ).toEqual({});
  });
});

describe('a platform is named the way a person names it', () => {
  const RAW = [
    { platform: 'telegram', name: 'telegram', channels: 1, adaptations: 1 },
    { platform: 'vk', name: 'vk', channels: 1, adaptations: 1 },
    { platform: 'wordpress', name: 'wordpress', channels: 1, adaptations: 1 },
    { platform: 'site', name: 'site', channels: 1, adaptations: 1 },
    { platform: 'weirdnet', name: 'weirdnet', channels: 0, adaptations: 1 },
  ];

  test('the header, the chip, the hint and the accessible name share one dictionary', () => {
    draw({
      columns: RAW,
      rows: [
        {
          ...rowWith({ state: 'draft' }),
          cells: [{ platform: 'wordpress', state: 'draft' }],
        },
      ],
    });

    const headers = [...document.querySelectorAll('[data-piece-column]')].map(
      (head) => head.textContent
    );
    // `platformLabel` раздела знает продуктовые «Сайт» и «ВКонтакте»; общий
    // список назначений — «WordPress»; незнакомое имя возвращается как есть.
    expect(headers).toEqual([
      'Telegram',
      'ВКонтакте',
      'WordPress',
      'Сайт',
      'weirdnet',
    ]);

    expect(
      document.querySelector('[data-piece-filter-option="platform:wordpress"]')
        .textContent
    ).toBe('WordPress');

    const cell = document.querySelector(
      '[data-piece-table] [data-piece-cell="wordpress"]'
    );
    expect(cell.getAttribute('aria-label')).toBe('WordPress: черновик');
    expect(cell.getAttribute('title')).toContain('WordPress.');
  });

  test('the raw identifier is gone from the header row', () => {
    draw({ columns: RAW });
    for (const head of document.querySelectorAll('[data-piece-column]')) {
      const platform = head.getAttribute('data-piece-column');
      if (platform === 'weirdnet') continue;
      expect(head.textContent).not.toBe(platform);
    }
  });
});

describe('on a phone each filter stays one line', () => {
  test('the chips scroll sideways below the table screen and wrap above it', () => {
    draw();
    const scrollers = [
      ...document.querySelectorAll('[data-piece-filter-scroller]'),
    ];
    expect(scrollers).toHaveLength(2);

    for (const scroller of scrollers) {
      // Узко: одна строка, которая едет вбок.
      expect(scroller.className).toContain('flex-nowrap');
      expect(scroller.className).toContain('overflow-x-auto');
      // Широко: прежний переносящийся ряд, ничего не прокручивается.
      expect(scroller.className).toContain('table:flex-wrap');
      expect(scroller.className).toContain('table:overflow-visible');
      // Кольцо фокуса не обрезается прокруткой: 4 px отступа, снятые полем,
      // — ряд от этого не сдвигается.
      expect(scroller.className).toContain('py-[4px]');
      expect(scroller.className).toContain('-my-[4px]');
      // Только именованные экраны: произвольный вариант Tailwind здесь молча
      // не выпускает (`content-factory-next-m2eg.7`).
      expect(scroller.className).not.toMatch(/(min|max)-\[[^\]]+\]:/);
      // Фишка не сжимается, иначе «запланировано» переносится по слогам.
      for (const chip of scroller.querySelectorAll('[data-piece-filter-option]')) {
        expect(chip.className).toContain('flex-none');
      }
    }

    // Подпись над фишками на узком экране и рядом с ними на широком.
    const group = document.querySelector('[data-piece-filter="state"]');
    expect(group.className).toContain('flex-col');
    expect(group.className).toContain('table:flex-row');
  });
});

describe('the legend keeps the word visible without a hover', () => {
  test('every state of the cell stands under the table with its word', () => {
    draw({ rows: [rowWith({ state: 'published' })] });
    const legend = document.querySelector('[data-piece-legend]');
    const entries = [...legend.querySelectorAll('[data-piece-legend-state]')];

    expect(entries.map((one) => one.getAttribute('data-piece-legend-state'))).toEqual(
      [...cellModule.CELL_STATES_IN_ORDER]
    );
    expect(entries.map((one) => one.textContent)).toEqual(
      cellModule.CELL_STATES_IN_ORDER.map((state) =>
        cellModule.stateWord(state, piecesCopy.ru)
      )
    );
    // Тот же квадрат, что в таблице, и ни одной кнопки: это словарь.
    for (const entry of entries) {
      expect(entry.querySelector('svg')).not.toBeNull();
      expect(entry.querySelector('button')).toBeNull();
    }
  });

  test('the legend explains itself through the shared hint, not a paragraph', () => {
    draw({ rows: [rowWith({ state: 'published' })] });
    const hint = screen.getByRole('button', {
      name: 'Подсказка: состояния клеток',
    });
    expect(hint.dataset.hintTrigger).toBe('true');
    fireEvent.focus(hint);
    expect(document.querySelector('[role="tooltip"]').textContent).toContain(
      'значок и цвет вместе'
    );
  });
});
