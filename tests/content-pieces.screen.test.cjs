'use strict';

/**
 * Таблица заготовок: что она показывает и о чём молчит.
 *
 * `content-factory-next-tu3k.9.9` (Z5). Экраны рисуют и ничего не просят,
 * поэтому здесь нет ни одного стаба сети: всё приходит пропсами, а решения
 * без документа проверяются прямо на функциях адаптера.
 *
 * Проверяется то, что легче всего сделать неправильно:
 *
 *  - полоса площадок — ровно колонки ответа, ни одной выдуманной;
 *  - шесть состояний клетки плюс седьмое, «пока не знаем»: строка без клеток
 *    не смеет читаться как «ещё нет» поверх существующих постов;
 *  - пустая клетка ничего не требует, а клетка без канала объясняет себя до
 *    нажатия, а не отказом после;
 *  - фильтр «Ещё нет в…» оставляет строки без адаптации на площадке — и не
 *    захватывает те, про которые продукт просто ничего не знает;
 *  - кнопка входа называет то, что сейчас произойдёт: без каналов будет
 *    только заготовка, и обещать текст она не вправе.
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

const { cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { PiecesScreen } = loadTypeScriptModule(`${base}/pieces/pieces.screen.tsx`);
const { IntakeScreen } = loadTypeScriptModule(`${base}/intake/intake.screen.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces/pieces.adapter.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const fixture = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/pieces.fixture.ts'
);

const withLanguage = (language, element) =>
  React.createElement(variables.VariableContextComponent, { language }, element);

// `useT` внутри полей формы ждёт словари i18next: без них падал бы не экран,
// а его ожидание. Тот же приём, что в `tests/content-section.route.test.cjs`.
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

/** Клетка «нет канала» и клетка «пока не знаем» в фикстуре есть не везде. */
const ROWS = [
  ...fixture.PIECE_FIXTURE_ROWS,
  {
    ...fixture.PIECE_FIXTURE_ROWS[0],
    id: 'piece-99',
    code: 'cnt-99',
    title: 'Строка с площадкой без канала',
    cells: [
      { platform: 'telegram', state: 'no_channel' },
      { platform: 'vk', state: 'none' },
      { platform: 'wordpress', state: 'none' },
      { platform: 'linkedin', state: 'none' },
    ],
  },
];

const drawTable = (props = {}) =>
  render(
    withLanguage(
      'ru',
      React.createElement(PiecesScreen, {
        locale: 'ru',
        state: 'default',
        rows: ROWS,
        columns: fixture.PIECES_FIXTURE_COLUMNS,
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

describe('the platform strip is the answer, and nothing else', () => {
  test('one column per platform of the response, in its order', () => {
    drawTable();
    const heads = [...document.querySelectorAll('[data-piece-column]')].map(
      (head) => head.getAttribute('data-piece-column')
    );
    expect(heads).toEqual(
      fixture.PIECES_FIXTURE_COLUMNS.map((column) => column.platform)
    );
  });

  test('platforms beyond the shown ones fold into «ещё N» instead of vanishing', () => {
    drawTable({
      columns: fixture.PIECES_FIXTURE_COLUMNS.slice(0, 2),
      restColumns: fixture.PIECES_FIXTURE_COLUMNS.slice(2),
    });
    expect(document.querySelector('[data-piece-column-rest]').textContent).toBe(
      'ещё 2'
    );
  });
});

describe('the cell says which of seven states it is in', () => {
  const stateOf = (code, platform) => {
    const row = document.querySelector(`[data-piece-row="${code}"]`);
    return row
      .querySelector(`[data-piece-cell="${platform}"]`)
      .getAttribute('data-piece-cell-state');
  };

  test('six states of a real answer, each with its own word', () => {
    drawTable();

    expect(stateOf('cnt-12', 'telegram')).toBe('published');
    expect(stateOf('cnt-12', 'vk')).toBe('queued');
    expect(stateOf('cnt-12', 'wordpress')).toBe('draft');
    expect(stateOf('cnt-12', 'linkedin')).toBe('none');
    expect(stateOf('cnt-11', 'wordpress')).toBe('error');
    expect(stateOf('cnt-99', 'telegram')).toBe('no_channel');

    const published = document
      .querySelector('[data-piece-row="cnt-12"]')
      .querySelector('[data-piece-cell="telegram"]');
    expect(published.textContent).toContain('опубликовано');
    // Три канала одной площадки: клетка несёт лучшее состояние и счёт
    // остальных, а не четыре колонки Telegram.
    expect(
      document.querySelector('[data-piece-cell-more="telegram"]').textContent
    ).toBe('ещё 2');
  });

  test('a row with no cells says «пока не знаем», never «ещё нет»', () => {
    drawTable();
    // `cnt-04` пришла без `cells`: публикацию ещё не прочитали.
    expect(stateOf('cnt-04', 'telegram')).toBe('unknown');
    const cell = document
      .querySelector('[data-piece-row="cnt-04"]')
      .querySelector('[data-piece-cell="telegram"]');
    expect(cell.textContent).toContain('пока не знаем');
    expect(cell.textContent).not.toContain('ещё нет');
    expect(cell.disabled).toBe(true);
  });

  test('an empty cell asks for nothing, and a channelless one explains itself first', () => {
    drawTable();
    const empty = document
      .querySelector('[data-piece-row="cnt-12"]')
      .querySelector('[data-piece-cell="linkedin"]');
    expect(empty.textContent).toContain('ещё нет');
    expect(empty.disabled).toBe(false);
    // Пунктир — единственная разница: ни тревожного цвета, ни счётчика.
    expect(empty.className).toContain('border-dashed');
    expect(document.body.textContent).not.toMatch(/заполнено \d+ из \d+/);

    const noChannel = document
      .querySelector('[data-piece-row="cnt-99"]')
      .querySelector('[data-piece-cell="telegram"]');
    expect(noChannel.disabled).toBe(true);
    expect(noChannel.getAttribute('title')).toBe(
      'Подключите канал, чтобы писать сюда'
    );
  });

  test('a piece with no substance says so under its title', () => {
    drawTable();
    const row = document.querySelector('[data-piece-row="cnt-07"]');
    expect(row.querySelector('[data-piece-origin]').textContent).toContain(
      'суть не выделена'
    );
  });
});

describe('«Ещё нет в…» keeps the rows that platform has nothing on', () => {
  test('a row with an adaptation there is filtered out, and an unknown one too', () => {
    const kept = adapter
      .filterPieces(ROWS, {
        ...adapter.emptyPiecesFilters,
        missingOn: 'linkedin',
      })
      .map((row) => row.code);

    // `cnt-12` и `cnt-11` не писали в LinkedIn — они остаются. `cnt-07` там
    // опубликована. `cnt-04` пришла без клеток: «ещё нет» про неё — не факт,
    // а догадка, и фильтр её не забирает.
    expect(kept).toEqual(['cnt-12', 'cnt-11', 'cnt-99']);
  });

  test('the state filter keeps rows that have at least one adaptation in it', () => {
    const kept = adapter
      .filterPieces(ROWS, { ...adapter.emptyPiecesFilters, state: 'error' })
      .map((row) => row.code);
    expect(kept).toEqual(['cnt-11']);
  });
});

describe('the intake button names what will happen', () => {
  const CHANNELS = [
    {
      id: 'int-tg',
      name: 'Мой канал',
      identifier: 'telegram',
      picture: '',
      disabled: false,
      inBetweenSteps: false,
    },
  ];

  const drawIntake = (props = {}) =>
    render(
      withLanguage(
        'ru',
        React.createElement(IntakeScreen, {
          locale: 'ru',
          state: 'idle',
          input: 'Мысль про дедлайны',
          inputKind: null,
          detectedLink: false,
          channels: CHANNELS,
          selectedIds: [],
          language: 'ru',
          step: null,
          questions: [],
          brief: null,
          overrides: {},
          draftText: null,
          blocked: null,
          restrictedReason: 'ИИ пока недоступен',
          roundsSpent: false,
          slopKey: 'k',
          onInputChange: noop,
          onToggleChannel: noop,
          onLanguageChange: noop,
          onWrite: noop,
          onCancel: noop,
          onAnswer: noop,
          onOverride: noop,
          onKindChange: noop,
          onRevertOverrides: noop,
          onRebuild: noop,
          onOpenEditor: noop,
          onOpenWritingProfile: noop,
          onRetry: noop,
          writingProfileStored: {},
          ...props,
        })
      )
    );

  test('with no channel it promises a piece and nothing more', () => {
    drawIntake();
    const button = screen.getByRole('button', { name: 'Сделать заготовку' });
    expect(button.getAttribute('data-intake-action')).toBe('piece');
    // Канал перестал быть обязательным: без него кнопка работает.
    expect(button.disabled).toBe(false);
  });

  test('with one channel it names the channel it will write for', () => {
    drawIntake({ selectedIds: ['int-tg'] });
    const button = screen.getByRole('button', {
      name: 'Сделать и написать для «Мой канал»',
    });
    expect(button.getAttribute('data-intake-action')).toBe('piece-and-write');
  });

  test('the saved piece is announced with its code and a way in', () => {
    drawIntake({ piece: { pieceId: 'piece-12', code: 'cnt-12' }, onOpenPiece: noop });
    const line = document.querySelector('[data-intake-piece="cnt-12"]');
    expect(line.getAttribute('role')).toBe('status');
    expect(line.textContent).toContain('Заготовка сохранена — cnt-12');
    expect(screen.getByRole('button', { name: 'Открыть заготовку' })).toBeTruthy();
  });
});
