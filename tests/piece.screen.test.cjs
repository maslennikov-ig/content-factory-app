'use strict';

/**
 * Страница заготовки после восьмого захода (`content-factory-next-97dq.4`).
 *
 * Четыре пробела прогона 18.09.2026, каждый — на своём месте страницы:
 *
 *  - тело адаптации читалось со звёздочками вместо выделения;
 *  - из заготовки некуда было уйти делать следующую;
 *  - подсказка «Опор текста» обещала, что галочка правит уже написанный текст;
 *  - принятая правка стирала след самой себя: строка качества обновлялась, а
 *    «было N → стало M» нигде не оставалось.
 *
 * Экран рисует и ничего не просит, поэтому здесь нет ни одного стаба сети:
 * всё приходит пропсами.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/content/pieces/piece-1',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { PieceScreen } = loadTypeScriptModule(`${base}/pieces/piece.screen.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces/pieces.adapter.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized)
    await new Promise((resolve) => i18n.on('initialized', resolve));
  await i18n.loadLanguages(['en', 'ru']);
});
afterEach(cleanup);

const noop = () => undefined;

const CORE_WITH_SOURCES = {
  text: 'Суть заготовки одной строкой.',
  writtenBy: 'model',
  authorNumbers: true,
  slop: null,
  brief: {
    inputKind: 'thought',
    format: 'post',
    facts: [
      {
        statement: 'Рынок вырос на 8%.',
        sourceUrl: 'https://example.com/market',
        factId: 'growth',
        origin: 'search',
        verified: true,
        selected: true,
        quote: 'Рынок вырос на 8%.',
      },
    ],
  },
};

const rawDetail = (adaptations, core) => ({
  state: 'ready',
  piece: {
    id: 'piece-1',
    code: 'cnt-1',
    title: 'Опасность ИИ',
    format: 'post',
    date: '2026-09-18',
    createdAt: '2026-09-18T09:00:00Z',
    excerpt: ['Суть заготовки'],
    coreExtracted: true,
    origin: 'thought',
    slopVerdict: 'clean',
    archivedAt: null,
  },
  core: core ?? {
    text: 'Суть заготовки одной строкой.',
    writtenBy: 'model',
    authorNumbers: true,
    slop: null,
  },
  legacyBody: null,
  adaptations,
  targets: [],
  later: [],
});

const adaptation = (overrides = {}) => ({
  id: 'adaptation-1',
  pieceId: 'piece-1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'channel-1',
  integrationName: 'AiDevTeam',
  title: null,
  body: 'Сейчас спор начинается с вывода.\n\n**Я не занимаю сторону** и хочу разобраться.',
  postId: 'post-1',
  mediaId: null,
  state: 'draft',
  date: null,
  url: null,
  createdAt: '2026-09-18T09:05:00Z',
  ...overrides,
});

const draw = (props = {}, adaptations = [adaptation()], core) =>
  render(
    React.createElement(
      variables.VariableContextComponent,
      { language: 'ru' },
      React.createElement(PieceScreen, {
        locale: 'ru',
        state: 'ready',
        detail: adapter.readPieceDetail(rawDetail(adaptations, core)),
        canWrite: true,
        busy: false,
        step: null,
        questions: [],
        draftText: null,
        adaptingChannel: null,
        onAdapt: noop,
        onArchive: noop,
        onAnswer: noop,
        onSkipInterview: noop,
        onCancel: noop,
        onOpenPost: noop,
        onDeleteAdaptation: noop,
        onOpenEditor: noop,
        onRetry: noop,
        ...props,
      })
    )
  );

/** Раскрытая строка адаптации: тело живёт под ней. */
const expand = () =>
  fireEvent.click(
    screen.getByRole('button', { name: /telegram · пост · AiDevTeam/ })
  );

describe('the adaptation body reads as the text that will be published', () => {
  test('stored bold is bold, and the stars are not on the screen', () => {
    draw();
    expand();
    const article = document.querySelector('[data-intake-draft="true"]');
    expect(article.querySelector('strong').textContent).toBe(
      'Я не занимаю сторону'
    );
    expect(article.textContent).not.toContain('**');
    expect(article.textContent).toContain('Сейчас спор начинается с вывода.');
  });

  test('the markup is one quiet button away and comes back whole', () => {
    draw();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Показать разметку' }));
    expect(document.querySelector('[data-intake-draft="true"]').textContent).toContain(
      '**Я не занимаю сторону**'
    );
  });

  test('the streaming draft is formatted by the same rule', () => {
    draw({ draftText: 'Пишем **прямо сейчас**.', draftAdaptationId: 'adaptation-1' });
    const article = document.querySelector('[data-piece-draft-id="adaptation-1"]');
    expect(article.querySelector('strong').textContent).toBe('прямо сейчас');
  });
});

describe('the page keeps what an accepted review did', () => {
  test('the catalog counts stay beside the refreshed quality line', () => {
    draw({
      reviewedSlop: { 'adaptation-1': { slopBefore: 2, slopAfter: 0 } },
    });
    expand();
    expect(
      document.querySelector('[data-adaptation-slop-change="adaptation-1"]')
        .textContent
    ).toBe('Штампов по каталогу: было 2 → стало 0');
  });

  test('without an accepted review the line is simply absent', () => {
    draw();
    expand();
    expect(document.querySelector('[data-adaptation-slop-change]')).toBeNull();
  });

  /*
    Проверки приезжают на каждой адаптации ответа заготовки. Адаптер их читает
    — и если перестанет, строка качества после перезагрузки замолчит, ничего
    при этом не сломав: молчание — её обычный исход.
  */
  test('the reader keeps the checks the server sends with every adaptation', () => {
    const detail = adapter.readPieceDetail(
      rawDetail([
        adaptation({
          checks: {
            slop: {
              verdict: 'review',
              findings: [{ ruleId: 'cliche', excerpt: 'в современном мире' }],
            },
            voice: { verdict: 'CLOSE' },
            antiCopy: { clean: true, runs: [] },
          },
        }),
      ])
    );
    expect(detail.adaptations[0].checks.slop.findings).toHaveLength(1);
    expect(detail.adaptations[0].checks.voice.verdict).toBe('CLOSE');
  });
});

describe('the action cluster and the hints tell the truth', () => {
  test('a third link leads to a new piece without competing with the page', () => {
    draw();
    const link = screen.getByRole('link', { name: 'Новая заготовка' });
    expect(link.getAttribute('href')).toBe(adapter.NEW_PIECE_PATH);
    // Quiet weight: no filled action paint on a navigation link.
    expect(link.className).not.toContain('bg-cf-accent');
    expect(screen.getByRole('link', { name: 'Все заготовки' })).toBeTruthy();
  });

  test('«Опоры текста» no longer promises to change a written text', () => {
    draw(
      { onFactSelect: async () => undefined },
      [adaptation()],
      CORE_WITH_SOURCES
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Подсказка: опоры текста' })
    );
    expect(screen.getByRole('tooltip').textContent).toContain(
      'Отмеченные строки идут в адаптации и в следующую переписку сути. Уже написанный текст галочка не меняет.'
    );
  });
});
