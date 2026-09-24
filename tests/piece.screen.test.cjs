'use strict';

/**
 * Рабочее место заготовки — вариант A десятого захода (`97dq.37`).
 *
 * Владелец 22.09.2026: «мне однозначно нравится вариант А». Страница — одно
 * рабочее место с вкладками: «Суть», потом по вкладке на канал, значок
 * вкладки — клетка состояния. Всё до публикации — во вкладке канала, окно
 * «Создать пост» со страницы не открывается.
 *
 * Экраны рисуют и ничего не просят, поэтому здесь нет ни одного стаба сети:
 * всё приходит пропсами. Сеть — в `content-pieces.container.test.cjs`.
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
require('./helpers/tiptap-jsdom.cjs').prepareTipTap(dom);

const {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { PieceScreen } = loadTypeScriptModule(`${base}/pieces/piece.screen.tsx`);
const { PieceCoreTab } = loadTypeScriptModule(
  `${base}/pieces/piece-core-tab.tsx`
);
const { PieceChannelTab, deadlineWords } = loadTypeScriptModule(
  `${base}/pieces/piece-channel-tab.tsx`
);
const { PostOptionsPanel } = loadTypeScriptModule(
  `${base}/pieces/post-options.panel.tsx`
);
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

const CORE = {
  text: 'Суть заготовки одной строкой.',
  writtenBy: 'model',
  authorNumbers: true,
  slop: null,
  personText: 'Мы сократили неделю до четырёх дней.',
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

const adaptation = (overrides = {}) => ({
  id: 'adaptation-1',
  pieceId: 'piece-1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'tg-main',
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

const TARGETS = [
  {
    platform: 'telegram',
    name: 'Telegram',
    kinds: ['post'],
    channels: [
      { id: 'tg-main', name: 'AiDevTeam', providerIdentifier: 'telegram' },
      { id: 'tg-notes', name: 'Заметки', providerIdentifier: 'telegram' },
    ],
    available: true,
  },
  {
    platform: 'vk',
    name: 'VK',
    kinds: ['post'],
    channels: [{ id: 'vk-1', name: 'Мой паблик', providerIdentifier: 'vk' }],
    available: true,
  },
  {
    platform: 'instagram',
    name: 'Instagram',
    kinds: ['caption'],
    channels: [],
    available: false,
  },
];

const detailOf = (adaptations = [adaptation()], core = CORE) =>
  adapter.readPieceDetail({
    state: 'default',
    piece: {
      id: 'piece-1',
      code: 'cnt-1',
      title: 'Исландский эксперимент',
      format: 'post',
      date: '22.09.26',
      createdAt: '2026-09-22T09:00:00Z',
      excerpt: ['Суть заготовки'],
      coreExtracted: true,
      origin: 'thought',
      slopVerdict: 'clean',
      archivedAt: null,
    },
    core,
    legacyBody: null,
    adaptations,
    targets: TARGETS,
    later: [],
  });

const wrap = (element) =>
  render(
    React.createElement(
      variables.VariableContextComponent,
      { language: 'ru' },
      element
    )
  );

const coreTab = (detail, props = {}) =>
  React.createElement(PieceCoreTab, {
    locale: 'ru',
    detail,
    channels: adapter.workspaceChannels(detail),
    unavailable: detail.targets.filter(
      (target) => !target.available || target.channels.length === 0
    ),
    canWrite: true,
    busy: false,
    factSelectable: true,
    onFactSelect: async () => undefined,
    onOpenChannel: noop,
    onAdaptChannel: noop,
    ...props,
  });

const channelTabProps = (channel, props = {}) => ({
  locale: 'ru',
  channel,
  platformLabel: 'Telegram',
  adaptation: channel.adaptations[0] ?? null,
  canWrite: true,
  adapting: false,
  adaptingLabel: 'Адаптируем…',
  body: channel.adaptations[0]?.body ?? '',
  onBodyChange: noop,
  saveState: 'idle',
  savedAt: null,
  onRetrySave: noop,
  maxLength: 4096,
  image: null,
  onPickImage: noop,
  onRemoveImage: noop,
  postOptions: adapter.DEFAULT_POST_OPTIONS,
  avatars: [],
  onPostOptionsChange: noop,
  postPlan: { value: null, channel: 'reserve', onChange: noop },
  onSaveSettings: noop,
  onSaveForChannel: noop,
  onRewriteAndRemember: noop,
  when: React.createElement('span', { 'data-when': 'true' }, '19:30'),
  scheduleBusy: null,
  calendarHref: '/launches',
  onSelectAdaptation: noop,
  onAdapt: noop,
  onCancelAdapt: noop,
  onSchedule: noop,
  onPublishNow: noop,
  onUnschedule: noop,
  ...props,
});

const drawPage = ({ detail = detailOf(), tab = 'core', ...props } = {}) =>
  wrap(
    React.createElement(PieceScreen, {
      locale: 'ru',
      state: 'default',
      detail,
      channels: adapter.workspaceChannels(detail),
      tab,
      canWrite: true,
      busy: false,
      coreTab: coreTab(detail),
      renderChannelTab: (channel) =>
        React.createElement(PieceChannelTab, channelTabProps(channel)),
      onTabChange: noop,
      onArchive: noop,
      onDelete: noop,
      onRetry: noop,
      ...props,
    })
  );

const drawChannel = (props = {}, adaptations = [adaptation()]) => {
  const detail = detailOf(adaptations);
  const channel = adapter
    .workspaceChannels(detail)
    .find((one) => one.id === 'tg-main');
  return wrap(
    React.createElement(PieceChannelTab, channelTabProps(channel, props))
  );
};

/* ---------------------------------------------------------------------- */

describe('the page is one workspace with tabs', () => {
  test('«Суть» first, then one tab per channel with its state cell', () => {
    drawPage();
    const list = screen.getByRole('tablist', { name: 'Суть и каналы' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Суть',
      'Telegram · AiDevTeam',
      'ВКонтакте · Мой паблик',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    // Состояние — та же клетка, что в таблице заготовок, и слово в имени.
    expect(tabs[1].getAttribute('data-piece-tab-state')).toBe('draft');
    expect(tabs[1].getAttribute('aria-label')).toBe(
      'Telegram · AiDevTeam: черновик'
    );
    expect(tabs[2].getAttribute('data-piece-tab-state')).toBe('none');
  });

  test('«Ещё канал» holds the other channels of a platform and opens their tab', () => {
    const onTabChange = jest.fn();
    drawPage({ onTabChange });
    const more = document.querySelector('[data-workspace-menu="more-channels"]');
    expect(more).not.toBeNull();
    fireEvent.click(within(more).getByRole('button', { name: /Ещё канал/ }));
    const item = screen.getByRole('menuitem', { name: /Telegram · Заметки/ });
    fireEvent.click(item);
    expect(onTabChange).toHaveBeenCalledWith('tg-notes');
  });

  test('without extra channels there is no «Ещё канал»', () => {
    const detail = adapter.readPieceDetail({
      ...detailOf(),
      targets: TARGETS.map((target) =>
        target.platform === 'telegram'
          ? { ...target, channels: target.channels.slice(0, 1) }
          : target
      ),
    });
    drawPage({ detail });
    expect(
      document.querySelector('[data-workspace-menu="more-channels"]')
    ).toBeNull();
  });

  test('the chosen tab comes from the address and a click asks to change it', () => {
    const onTabChange = jest.fn();
    drawPage({ tab: 'tg-main', onTabChange });
    expect(
      screen.getByRole('tab', { name: /Telegram · AiDevTeam/ }).getAttribute('aria-selected')
    ).toBe('true');
    expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Суть' }));
    expect(onTabChange).toHaveBeenCalledWith('core');
  });

  test('an unknown tab in the address falls back to «Суть»', () => {
    drawPage({ tab: 'deleted-channel' });
    expect(
      screen.getByRole('tab', { name: 'Суть' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(document.querySelector('[data-piece-core]')).not.toBeNull();
  });

  test('the header keeps a quiet way to a new piece and back to the list', () => {
    drawPage();
    const link = screen.getByRole('link', { name: 'Новая заготовка' });
    expect(link.getAttribute('href')).toBe(adapter.NEW_PIECE_PATH);
    expect(link.className).not.toContain('bg-cf-accent');
    expect(screen.getByRole('link', { name: 'Все заготовки' })).toBeTruthy();
  });
});

describe('«Суть»', () => {
  test('«Что вы прислали» is folded and shows the input verbatim when opened', () => {
    drawPage();
    const toggle = screen.getByRole('button', { name: /Что вы прислали/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('свой текст');
    expect(toggle.textContent).toContain('как есть, до правок');
    fireEvent.click(toggle);
    expect(
      document.querySelector('[data-piece-sent-text="person"]').textContent
    ).toBe('Мы сократили неделю до четырёх дней.');
  });

  test('«Куда дальше» has one row per channel: open a written one, adapt an empty one', () => {
    const onOpenChannel = jest.fn();
    const onAdaptChannel = jest.fn();
    const detail = detailOf();
    drawPage({
      detail,
      coreTab: coreTab(detail, { onOpenChannel, onAdaptChannel }),
    });
    const rows = document.querySelectorAll('[data-piece-next]');
    expect(Array.from(rows).map((row) => row.getAttribute('data-piece-next'))).toEqual([
      'tg-main',
      'tg-notes',
      'vk-1',
    ]);
    expect(rows[0].textContent).toContain('черновик · 1 вариант');
    fireEvent.click(
      screen.getByRole('button', { name: 'Открыть · Telegram · AiDevTeam' })
    );
    expect(onOpenChannel).toHaveBeenCalledWith('tg-main');
    fireEvent.click(
      screen.getByRole('button', { name: 'Адаптировать · ВКонтакте · Мой паблик' })
    );
    expect(onAdaptChannel).toHaveBeenCalledWith('vk-1');
  });

  test('on a phone the channel name and its state word stack instead of sharing a line with the button', () => {
    // Стенд 22.09.2026, 390 px: имя канала в одной строке с «черновик · 1
    // вариант» и кнопкой сжималось до слова на строку и налезало на слово
    // состояния. Имя и слово — одна колонка до `sm`, строка — с `sm`.
    drawPage();
    for (const row of document.querySelectorAll(
      '[data-piece-next], [data-piece-next-unavailable]'
    )) {
      const caption = row.querySelector('.cf-caption');
      const pair = caption.parentElement;
      expect(pair.parentElement).toBe(row);
      expect(pair.className).toContain('flex-col');
      expect(pair.className).toContain('sm:flex-row');
      expect(pair.className).toContain('flex-1');
      expect(pair.firstElementChild.className).toContain('cf-body-sm');
    }
  });

  test('the page actions wrap inside the line instead of running off a phone screen', () => {
    // Стенд 22.09.2026, 390 px: группа «Все заготовки · Новая заготовка · В
    // архив · Удалить» не сжималась (`shrink-0` без предела ширины), и
    // «Удалить» уходило за край экрана.
    drawPage();
    const group = document.querySelector('[data-piece-archive]').parentElement;
    expect(group.className).toContain('max-w-full');
    expect(group.className).toContain('flex-wrap');
  });

  test('the old table, the separate list and raw platform keys are gone', () => {
    drawPage();
    expect(document.body.textContent).not.toContain('Куда адаптировать');
    expect(screen.queryByRole('button', { name: 'Посмотреть' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/telegram ·/);
    expect(document.body.textContent).not.toContain('готово');
    expect(document.querySelector('details')).toBeNull();
  });

  test('a platform without a channel says so and leads to the channels', () => {
    drawPage();
    const row = document.querySelector('[data-piece-next-unavailable="instagram"]');
    expect(row.textContent).toContain('нет канала');
    expect(within(row).getByRole('link').getAttribute('href')).toBe('/channels');
  });

  test('«Что мы поняли» shows a handed-over decision marked «решили мы» (`97dq.56`)', () => {
    const detail = detailOf([adaptation()], {
      ...CORE,
      brief: {
        ...CORE.brief,
        thesis: 'Общая доска снимает вопросы о статусе',
        position: 'Текст держится на том, что доска видна всем',
        origins: { thesis: 'input', position: 'model' },
      },
      questions: {
        round: 1,
        items: [],
        answered: [
          { field: 'position', text: 'Текст держится на том, что доска видна всем', origin: 'model', answeredAt: '2026-09-23T12:57:39.184Z' },
          { field: 'facts', key: 'ask-1', question: 'Как выглядела конкретная ситуация?', text: 'Без конкретного эпизода: текст объясняет механизм.', origin: 'model', answeredAt: '2026-09-23T12:57:39.184Z' },
          { field: 'facts', key: 'ask-2', question: 'Как было до доски?', text: 'У каждого был свой задачник.', origin: 'person', answeredAt: '2026-09-23T12:57:39.184Z' },
          { field: 'facts', key: 'ask-3', question: 'Что вы изменили?', text: '', origin: 'model', answeredAt: '2026-09-23T12:57:39.184Z' },
        ],
      },
    });
    wrap(coreTab(detail));

    const receipt = document.querySelector('[data-piece-receipt="true"]');
    const position = receipt.querySelector('[data-brief-decision="model"]');
    expect(position.textContent).toContain('Текст держится на том, что доска видна всем');
    expect(position.textContent).toContain('· решили мы');
    // Поле из текста человека подписано как прежде.
    expect(receipt.textContent).toContain('· из вашего текста');

    const decisions = document.querySelectorAll('[data-piece-decision]');
    expect([...decisions].map((row) => row.getAttribute('data-piece-decision'))).toEqual(['ask-1']);
    expect(decisions[0].textContent).toContain('Как выглядела конкретная ситуация?');
    expect(decisions[0].textContent).toContain('Без конкретного эпизода: текст объясняет механизм.');
    expect(decisions[0].textContent).toContain('· решили мы');
    expect(document.querySelector('[data-piece-decisions="true"]').textContent).toContain('Решили за вас');
  });

  test('«Опоры текста» sit in the right column, folded, and do not promise to change a text', () => {
    drawPage();
    const sources = document.querySelector('[data-piece-sources="true"]');
    expect(sources.textContent).toContain('Опоры текста · 1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Подсказка: опоры текста' })
    );
    expect(screen.getByRole('tooltip').textContent).toContain(
      'Уже написанный текст галочка не меняет.'
    );
    expect(document.querySelector('[data-piece-facts]').closest('[hidden]')).not.toBeNull();
  });
});

describe('the channel tab with an adaptation', () => {
  // `97dq.46`: «Показать разметку» ушла, правят текст в «Редактировать» —
  // поле TipTap, где жирное остаётся жирным, а наверх уходит хранимая форма.
  const openEditor = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return screen.getByRole('textbox', { name: 'Текст поста для Telegram' });
  };

  test('the text reads as it will be published, and editing keeps it that way', async () => {
    drawChannel();
    const article = document.querySelector('[data-intake-draft="true"]');
    expect(article.querySelector('strong').textContent).toBe(
      'Я не занимаю сторону'
    );
    expect(article.textContent).not.toContain('**');
    expect(screen.queryByRole('button', { name: /разметк/i })).toBeNull();
    const field = await openEditor();
    expect(field.getAttribute('contenteditable')).toBe('true');
    expect(field.querySelector('strong').textContent).toBe(
      'Я не занимаю сторону'
    );
    expect(field.textContent).not.toContain('**');
  });

  test('a hand edit goes up, and the counter counts what the reader sees', async () => {
    const onBodyChange = jest.fn();
    drawChannel({ onBodyChange });
    const counter = document.querySelector('[data-editor-counter]');
    // Звёздочки выделения в счёт не идут.
    const visible =
      'Сейчас спор начинается с вывода.\n\nЯ не занимаю сторону и хочу разобраться.'
        .length;
    expect(counter.textContent).toBe(`${visible} из 4096 знаков`);
    const field = await openEditor();
    await act(async () => {
      field.editor.commands.setContent('<p>Новый текст</p>');
    });
    expect(onBodyChange).toHaveBeenLastCalledWith('Новый текст');
  });

  test('«Ж» wraps the selection in the stored bold marker', async () => {
    const onBodyChange = jest.fn();
    drawChannel({ onBodyChange, body: 'один два три' });
    const field = await openEditor();
    await act(async () => {
      field.editor.commands.setTextSelection({ from: 6, to: 9 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
    expect(onBodyChange).toHaveBeenLastCalledWith('один **два** три');
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    expect(
      screen.queryByRole('textbox', { name: 'Текст поста для Telegram' })
    ).toBeNull();
  });

  test('versions are a segmented choice, newest selected', () => {
    const onSelectAdaptation = jest.fn();
    drawChannel({ onSelectAdaptation }, [
      adaptation({ id: 'old', createdAt: '2026-09-18T09:00:00Z' }),
      adaptation({ id: 'new', createdAt: '2026-09-18T10:00:00Z' }),
    ]);
    const group = screen.getByRole('radiogroup', { name: 'Варианты текста' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((one) => one.textContent)).toEqual([
      'Вариант 1',
      'Вариант 2',
    ]);
    expect(options[1].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(options[0]);
    expect(onSelectAdaptation).toHaveBeenCalledWith('old');
  });

  test('«было N → стало M» stays beside the quality line after an accepted review', () => {
    drawChannel({ slopChange: { slopBefore: 2, slopAfter: 0 } });
    expect(
      document.querySelector('[data-adaptation-slop-change="adaptation-1"]')
        .textContent
    ).toBe('Штампов по каталогу: было 2 → стало 0');
  });

  test('«Для этого поста» is always open, with the channel card fields, and hides the avatar with one avatar', () => {
    const onPostOptionsChange = jest.fn();
    drawChannel({
      onPostOptionsChange,
      avatars: [{ id: 'a1', label: 'Игорь' }],
    });
    const panel = document.querySelector('[data-post-options]');
    expect(panel.getAttribute('data-post-options')).toBe('panel');
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull();
    expect(document.body.textContent).not.toContain('Кто говорит');
    for (const name of ['Длина', 'Хэштеги', 'Ссылки', 'Призыв'])
      expect(screen.getByLabelText(name).tagName).toBe('SELECT');
    // Эмодзи — бегунок «до N» (`97dq.61`), а не выбор из слов.
    expect(screen.getByLabelText('Эмодзи').getAttribute('type')).toBe('range');
    fireEvent.change(screen.getByLabelText('Длина'), {
      target: { value: 'short' },
    });
    expect(onPostOptionsChange).toHaveBeenCalledWith({
      ...adapter.DEFAULT_POST_OPTIONS,
      length: 'short',
    });
  });

  test('«на ты / на вы» is gone from «Для этого поста» (97dq.45)', () => {
    drawChannel();
    expect(document.body.textContent).not.toContain('Обращение');
    expect(screen.queryByRole('radiogroup', { name: 'Обращение' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'на «вы»' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Как в аватаре' })).toBeNull();
    expect(adapter.DEFAULT_POST_OPTIONS).not.toHaveProperty('addressForm');
  });

  test('with several avatars «Кто говорит» is a choice, and rewriting with the options makes a new version', () => {
    const onAdapt = jest.fn();
    const onRewriteAndRemember = jest.fn();
    drawChannel({
      onAdapt,
      onRewriteAndRemember,
      postOptions: { ...adapter.DEFAULT_POST_OPTIONS, length: 'short' },
      avatars: [
        { id: 'a1', label: 'Игорь' },
        { id: 'a2', label: 'Студия' },
      ],
    });
    expect(screen.getByLabelText('Кто говорит').tagName).toBe('SELECT');
    fireEvent.click(screen.getByRole('button', { name: 'Переписать по настройкам' }));
    expect(onAdapt).toHaveBeenCalledWith('post');
    // «Переписать по настройкам» — одна кнопка с меню (`97dq.70`, B2).
    fireEvent.click(screen.getByRole('button', { name: 'Другие способы переписать' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Переписать и запомнить для канала/ })
    );
    expect(onRewriteAndRemember).toHaveBeenCalledTimes(1);
  });

  test('«Как увидят в Telegram» replaces the text with the full preview (97dq.48)', () => {
    drawChannel(
      { image: { id: 'm1', path: '/media/one.png' } },
      [adaptation({ body: 'Первый абзац.\n\n'.repeat(12) + '**Жирное** в конце.' })]
    );
    // Окошка предпросмотра в боковой колонке больше нет.
    expect(document.querySelector('[data-piece-preview]')).toBeNull();
    expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();
    const view = screen.getByRole('radiogroup', { name: 'Текст или как увидят' });
    fireEvent.click(
      within(view).getByRole('radio', { name: 'Как увидят в Telegram' })
    );
    const preview = document.querySelector('[data-piece-preview="adaptation-1"]');
    expect(preview).not.toBeNull();
    expect(document.querySelector('[data-adaptation-editor]')).toBeNull();
    // Текст целиком и картинка без обрезки.
    expect(preview.innerHTML).not.toContain('line-clamp');
    expect(preview.textContent).toContain('Жирное в конце.');
    expect(preview.querySelector('strong, b')).not.toBeNull();
    const image = preview.querySelector('[data-piece-preview-image]');
    expect(image.getAttribute('src')).toBe('/media/one.png');
    expect(image.className).not.toContain('object-cover');
    expect(preview.closest('aside')).toBeNull();
    fireEvent.click(within(view).getByRole('radio', { name: 'Текст' }));
    expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();
  });

  test('the plan row sits right under the text actions; the text column has no delete (97dq.78)', () => {
    drawChannel({
      actionRow: React.createElement('div', { 'data-action-row': 'true' }, 'Убрать следы'),
    });
    const bar = document.querySelector('[data-schedule-bar]');
    const actions = document.querySelector('[data-action-row]');
    // Сразу под рядом «Убрать следы · Проверить факты · Переписать».
    expect(actions.nextElementSibling).toBe(bar);
    expect(bar.closest('aside')).toBeNull();
    expect(bar.getAttribute('data-plan-row')).toBe('off');
    expect(bar.textContent).toContain('Черновик');
    const send = bar.querySelector('[data-schedule-send]');
    expect(send.textContent).toContain('Когда');
    expect(send.querySelector('[data-when="true"]')).not.toBeNull();
    expect(send.querySelector('[data-schedule-action="schedule"]')).not.toBeNull();
    // Удаление ушло в строку заголовка страницы (`97dq.78`).
    expect(document.querySelectorAll('[data-piece-delete-adaptation]')).toHaveLength(0);
    // «Как пишем в …» больше не открывается со вкладки.
    expect(document.querySelector('[data-piece-channel-profile]')).toBeNull();
  });

  test('a reserved post reads «В плане на … · бронь» and is confirmed, not scheduled again (97dq.70)', () => {
    const onSchedule = jest.fn();
    const onDropPlan = jest.fn();
    drawChannel({ onSchedule, onDropPlan }, [
      adaptation({
        plan: {
          status: 'reserved',
          date: '2026-09-24T15:00:00.000Z',
          autopilot: false,
          current: true,
        },
      }),
    ]);
    const bar = document.querySelector('[data-schedule-bar]');
    expect(bar.getAttribute('data-plan-row')).toBe('reserved');
    expect(bar.querySelector('[data-plan-row-label]').textContent).toMatch(
      /^В плане на 24\.09 \d\d:00 · бронь$/
    );
    expect(screen.queryByRole('button', { name: 'Запланировать' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Другие действия с бронью' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Снять из плана/ }));
    expect(onDropPlan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Другие действия с бронью' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Сменить время/ }));
    expect(bar.querySelector('[data-plan-row-edit] [data-when="true"]')).not.toBeNull();
  });

  test('an autopilot post reads as already queued, with «Изменить время» (97dq.70)', () => {
    const onMove = jest.fn();
    drawChannel({ onMove }, [
      adaptation({
        state: 'queued',
        date: '2026-09-24T15:00:00.000Z',
        plan: {
          status: 'queued',
          date: '2026-09-24T15:00:00.000Z',
          autopilot: true,
          current: true,
        },
      }),
    ]);
    const bar = document.querySelector('[data-schedule-bar]');
    expect(bar.getAttribute('data-plan-row')).toBe('queued');
    expect(bar.querySelector('[data-plan-row-label]').textContent).toMatch(
      /^В очереди на 24\.09 \d\d:00$/
    );
    expect(bar.querySelector('[data-schedule-plan="autopilot"]').textContent).toBe('автопилот');
    expect(screen.queryByRole('button', { name: 'Запланировать' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить время' }));
    fireEvent.click(screen.getByRole('button', { name: 'Перенести' }));
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  test('one «Удалить» in the page title row, right of «В архив»: the adaptation on a channel tab (97dq.78)', () => {
    const onConfirm = jest.fn();
    const onDelete = jest.fn();
    drawPage({ tab: 'tg-main', onDelete, channelDelete: { onConfirm } });
    const archive = document.querySelector('[data-piece-archive="true"]');
    const button = document.querySelector('[data-piece-delete-adaptation="true"]');
    expect(document.querySelectorAll('[data-piece-delete-adaptation]')).toHaveLength(1);
    expect(document.querySelector('[data-piece-delete]')).toBeNull();
    // Та же строка, справа от «В архив».
    expect(button.parentElement).toBe(archive.parentElement);
    expect(archive.compareDocumentPosition(button) & 4).toBe(4);
    // Общий `ConfirmButton` (`97dq.39`): обе подписи в одной клетке, видна одна.
    expect(button.textContent).toContain('Удалить');
    expect(button.getAttribute('data-confirm-armed')).toBe('false');
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.getAttribute('data-confirm-armed')).toBe('true');
    expect(button.textContent).toContain('Удалить эту адаптацию?');
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('an armed delete does not travel to another tab, and each names what it deletes (review 97dq.78, P3-5)', () => {
    const onDelete = jest.fn();
    const onConfirm = jest.fn();
    const view = drawPage({ tab: 'tg-main', onDelete, channelDelete: { id: 'adaptation-1', onConfirm } });
    const armed = document.querySelector('[data-piece-delete-adaptation="true"]');
    fireEvent.click(armed);
    expect(armed.textContent).toContain('Удалить эту адаптацию?');
    const detail = detailOf();
    view.rerender(
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(PieceScreen, {
          locale: 'ru',
          state: 'default',
          detail,
          channels: adapter.workspaceChannels(detail),
          tab: 'core',
          canWrite: true,
          busy: false,
          coreTab: coreTab(detail),
          renderChannelTab: () => null,
          onTabChange: noop,
          onArchive: noop,
          onDelete,
          onRetry: noop,
          channelDelete: { id: 'adaptation-1', onConfirm },
        })
      )
    );
    const piece = document.querySelector('[data-piece-delete="true"]');
    expect(piece.getAttribute('data-confirm-armed')).toBe('false');
    fireEvent.click(piece);
    expect(onDelete).not.toHaveBeenCalled();
    expect(piece.textContent).toContain('Удалить всю заготовку?');
  });

  test('on «Суть» the same place deletes the piece; a channel tab with nothing to delete has no button', () => {
    drawPage({ tab: 'core', channelDelete: { onConfirm: noop } });
    expect(document.querySelector('[data-piece-delete="true"]')).not.toBeNull();
    expect(document.querySelector('[data-piece-delete-adaptation]')).toBeNull();
    cleanup();
    drawPage({ tab: 'tg-main', channelDelete: null });
    expect(document.querySelector('[data-piece-delete]')).toBeNull();
    expect(document.querySelector('[data-piece-delete-adaptation]')).toBeNull();
  });

  test('«Запланировать» is the primary action and «Опубликовать сейчас» waits in its menu', () => {
    const onSchedule = jest.fn();
    const onPublishNow = jest.fn();
    drawChannel({ onSchedule, onPublishNow });
    expect(document.querySelector('[data-when="true"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Запланировать' }));
    expect(onSchedule).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Другие способы отправить' })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Опубликовать сейчас/ }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);
  });

  test('a queued post with its slot ahead is editable, with the deadline under the editor (97dq.80)', () => {
    const slot = new Date(Date.now() + 3 * 60 * 60 * 1000);
    slot.setSeconds(0, 0);
    drawChannel({ actionRow: React.createElement('div', { 'data-action-row': 'true' }) }, [
      adaptation({ state: 'queued', date: slot.toISOString() }),
    ]);
    expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();
    const until = document.querySelector('[data-queued-edit-until]');
    const deadline = new Date(slot.getTime() - 60_000);
    expect(until.textContent).toBe(
      `Правки уйдут в пост, если сохранить до ${deadlineWords(deadline, 'ru')}`
    );
    // Проверки и перепись — у черновика; очередь правится руками.
    expect(document.querySelector('[data-action-row]')).toBeNull();
    // Время не тронуто: пост остаётся в очереди.
    expect(document.querySelector('[data-schedule-bar]').getAttribute('data-plan-row')).not.toBe('off');
  });

  test('a refused save says the server’s words, not a generic retry (97dq.80)', () => {
    drawChannel({ saveState: 'failed', saveError: 'Пост уже уходит в канал или вышел — эту правку сохранить нельзя.' });
    expect(screen.getByRole('alert').textContent).toContain('Пост уже уходит в канал или вышел');
  });

  test('a queued post has «Сохранить в пост», enabled only with unsaved edits (review 97dq.80, P2-2)', () => {
    const slot = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const onSaveQueued = jest.fn();
    drawChannel({ onSaveQueued }, [adaptation({ state: 'queued', date: slot })]);
    const save = () => document.querySelector('[data-queued-save]');
    expect(save().textContent).toBe('Сохранить в пост');
    expect(save().disabled).toBe(true);
    // Автосохранения нет, поэтому и «Черновик сохраняется сам» не пишется.
    expect(document.body.textContent).not.toContain('сохраняется сам');
    cleanup();
    drawChannel({ onSaveQueued, unsaved: true, body: 'Новый текст.' }, [
      adaptation({ state: 'queued', date: slot }),
    ]);
    expect(document.querySelector('[data-autosave]').textContent).toBe(
      'Правки ещё не в посте: они уйдут в канал только после «Сохранить в пост».'
    );
    fireEvent.click(save());
    expect(onSaveQueued).toHaveBeenCalledTimes(1);
  });

  test('the open tab locks itself when the deadline passes and shows what is in the post (review 97dq.80, P3-2, P2-4)', () => {
    jest.useFakeTimers();
    try {
      const slot = new Date(Date.now() + 61_000 + 2_000).toISOString();
      drawChannel({ unsaved: true, body: 'Несохранённая правка.' }, [
        adaptation({ state: 'queued', date: slot, body: 'Текст в посте.' }),
      ]);
      expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();
      act(() => {
        jest.advanceTimersByTime(3_100);
      });
      expect(document.querySelector('[data-adaptation-editor]')).toBeNull();
      expect(document.querySelector('[data-queued-save]')).toBeNull();
      expect(document.querySelector('[data-queued-edit-missed]').textContent).toBe(
        'Правки не успели в пост: он уже уходит в канал с прежним текстом.'
      );
      expect(document.body.textContent).toContain('Текст в посте.');
      expect(document.body.textContent).not.toContain('Несохранённая правка.');
    } finally {
      jest.useRealTimers();
    }
  });

  test('the deadline names the day when it is not today (review 97dq.80, P3-2)', () => {
    const now = new Date(2026, 8, 24, 12, 0);
    expect(deadlineWords(new Date(2026, 8, 24, 18, 59), 'ru', now)).toBe('18:59');
    expect(deadlineWords(new Date(2026, 8, 25, 9, 5), 'ru', now)).toBe('пт 25.09 09:05');
    expect(deadlineWords(new Date(2026, 8, 25, 9, 5), 'en', now)).toBe('Fri 25.09 09:05');
  });

  test('a closing refusal offers no retry; a queued post never gets «Попробовать снова» (review 97dq.80, P2-4)', () => {
    drawChannel({ saveState: 'failed', saveError: 'Пост уже уходит.', canRetrySave: false });
    expect(screen.queryByRole('button', { name: 'Попробовать снова' })).toBeNull();
    cleanup();
    drawChannel({ saveState: 'failed', saveError: 'Сеть.' });
    expect(screen.getByRole('button', { name: 'Попробовать снова' })).toBeTruthy();
    cleanup();
    drawChannel({ saveState: 'failed', saveError: 'Длинно.' }, [
      adaptation({ state: 'queued', date: new Date(Date.now() + 3 * 3600_000).toISOString() }),
    ]);
    expect(screen.queryByRole('button', { name: 'Попробовать снова' })).toBeNull();
  });

  test('the settings panel header holds the title, the saved stamp and the hide button (97dq.78)', () => {
    drawChannel({ settingsSaveState: 'saved', settingsSavedAt: '19:04' });
    const header = document.querySelector('[data-post-options="panel"]');
    expect(header.textContent).toContain('Настройки поста');
    expect(header.querySelector('[data-post-options-saved]').textContent).toBe('Сохранено · 19:04');
    const hide = header.querySelector('[data-side-panel-hide="true"]');
    expect(hide).not.toBeNull();
    expect(hide.getAttribute('aria-label')).toBe('Скрыть настройки');
    // Одна кнопка «Скрыть», и она в шапке, а не отдельной строкой над карточкой.
    expect(document.querySelectorAll('[data-side-panel-hide]')).toHaveLength(1);
    fireEvent.click(hide);
    expect(
      document.querySelector('[data-side-panel="piece-channel-settings"]').getAttribute('data-side-panel-hidden')
    ).toBe('true');
  });

  test('a channel tab without a text: settings open, their primary is «Адаптировать» (97dq.78)', () => {
    const onAdapt = jest.fn();
    drawChannel({ onAdapt }, []);
    const primary = document.querySelector('[data-post-options-rewrite="adapt"]');
    expect(primary.textContent).toBe('Адаптировать');
    fireEvent.click(primary);
    expect(onAdapt).toHaveBeenCalledWith('post');
    expect(screen.getByLabelText('Длина').tagName).toBe('SELECT');
  });

  test('a queued post whose slot is near or past is read-only and opens in the calendar from its menu', () => {
    const onOpenCalendar = jest.fn();
    drawChannel(
      { calendarHref: '/launches?startDate=2026-09-23', onOpenCalendar },
      [adaptation({ state: 'queued', date: '2026-09-23T07:00:00.000Z' })]
    );
    expect(document.querySelector('[data-adaptation-editor]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Запланировать' })).toBeNull();
    expect(document.body.textContent).toContain('В очереди на 23.09');
    fireEvent.click(
      screen.getByRole('button', { name: 'Другие действия с постом в очереди' })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Открыть в календаре/ }));
    expect(onOpenCalendar).toHaveBeenCalledWith('/launches?startDate=2026-09-23');
  });

  test('a published post cannot be deleted from here', () => {
    drawChannel({}, [adaptation({ state: 'published', date: '2026-09-20T07:00:00.000Z' })]);
    expect(document.querySelector('[data-piece-delete-adaptation]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Открыть в календаре' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Снять с расписания' })).toBeNull();
  });

  test('a queued post goes back to draft only through «Снять с расписания»', () => {
    const onUnschedule = jest.fn();
    drawChannel({ onUnschedule }, [
      adaptation({ state: 'queued', date: '2026-09-23T07:00:00.000Z' }),
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Другие действия с постом в очереди' })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: /Снять с расписания/ }));
    expect(onUnschedule).toHaveBeenCalledTimes(1);
  });
});

describe('«Для этого поста» is always open and compact (97dq.48)', () => {
  /*
    Одиннадцатый заход: «кнопка „Изменить“ — зачем она нужна… хотелось бы
    какой-то компактности». Вариант A: те же поля, что в карточке канала,
    значение канала приглушённым с подписью «как в канале» под названием
    поля (двенадцатый заход: «как в канале · …» в выборе обрезалось),
    изменённое — рамкой, сверху
    счёт изменений. Панель управляемая, поэтому здесь она живёт со своим
    состоянием, как в контейнере.
  */
  const CHANNEL = {
    version: 'channel-writing-profile/v2',
    lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
    emojiLevel: 'few',
    linkPolicy: 'end',
    hashtagPolicy: 'none',
    ctaKind: 'question',
    formatPreference: 'auto',
    notes: null,
  };
  const Harness = ({
    onRewrite,
    onSaveForChannel = noop,
    channelSaveState = 'idle',
    rewritePending = false,
  }) => {
    const [options, setOptions] = React.useState(adapter.DEFAULT_POST_OPTIONS);
    return React.createElement(PostOptionsPanel, {
      locale: 'ru',
      options,
      baseline: adapter.postBaselineOf(CHANNEL),
      avatars: [],
      onChange: setOptions,
      onRewrite,
      onRewriteAndRemember: noop,
      rewritePending,
      onSaveForPost: noop,
      onSaveForChannel,
      channelSaveState,
      saveState: 'saved',
      savedAt: '19:04',
    });
  };
  const select = (name) => screen.getByLabelText(name);
  const shown = (name) => {
    const node = select(name);
    return node.options[node.selectedIndex].textContent;
  };
  const counted = () =>
    document.querySelector('[data-post-options-count]')?.textContent ?? null;
  const emojiRow = () => document.querySelector('[data-post-option="emoji"]');
  const emojiReadout = () =>
    emojiRow().querySelector('[data-emoji-readout]').textContent;

  test('every field starts «как в канале» with the channel value, muted, and nothing to rewrite', () => {
    wrap(React.createElement(Harness, { onRewrite: noop }));
    expect(shown('Длина')).toBe('500–1000');
    // Старое «мало» канала стоит на делении «до 3», и там же серая отметка.
    expect(emojiReadout()).toBe('до 3');
    // «до 3» стоит в строке подписи, а не своей строкой под ней (`97dq.83`).
    const labelRow = emojiRow().querySelector('[data-emoji-label-row]');
    expect(labelRow.contains(emojiRow().querySelector('[data-emoji-readout]'))).toBe(true);
    expect(labelRow.textContent).toContain('Эмодзи');
    expect(labelRow.querySelector('[data-post-option-hint="emoji"]').textContent).toBe('как в канале');
    // «Эмодзи (?)» — ползунок — «до N» одной строкой, ползунок между ними;
    // столбцом — только поле уже 520 px (`97dq.92`, ревью F5).
    const cells = [...labelRow.children].map((cell) =>
      ['data-emoji-label-cell', 'data-emoji-track-cell', 'data-emoji-readout-cell'].find((name) =>
        cell.hasAttribute(name)
      )
    );
    expect(cells).toEqual(['data-emoji-label-cell', 'data-emoji-readout-cell', 'data-emoji-track-cell']);
    expect(emojiRow().querySelector('[data-emoji-slider]').className).toContain('[container-type:inline-size]');
    expect(labelRow.className).toContain(
      '[@container(min-width:520px)]:grid-cols-[fit-content(40%)_minmax(0,1fr)_fit-content(30%)]'
    );
    const track = labelRow.querySelector('[data-emoji-track-cell]');
    expect(track.className).toContain('[@container(min-width:520px)]:col-start-2');
    expect(track.className).toContain('[@container(min-width:520px)]:row-start-1');
    expect(track.contains(select('Эмодзи'))).toBe(true);
    expect(track.querySelector('[data-emoji-divisions]')).toBeTruthy();
    expect(labelRow.querySelector('[data-emoji-readout-cell]').className).toContain(
      '[@container(min-width:520px)]:col-start-3'
    );
    expect(select('Эмодзи').value).toBe('2');
    expect(
      emojiRow().querySelector('[data-emoji-channel-mark]').getAttribute('data-emoji-channel-mark')
    ).toBe('max3');
    expect(shown('Хэштеги')).toBe('без хэштегов');
    expect(shown('Ссылки')).toBe('не больше одной, в конце');
    expect(shown('Призыв')).toBe('вопрос читателю');
    for (const name of ['Длина', 'Эмодзи', 'Хэштеги', 'Ссылки', 'Призыв']) {
      const hint = document.getElementById(
        select(name).getAttribute('aria-describedby').split(' ')[0]
      );
      expect(hint.textContent).toBe('как в канале');
    }
    expect(select('Длина').className).toContain('text-cf-ink-muted');
    expect(counted()).toBeNull();
    expect(screen.getByRole('button', { name: 'Переписать по настройкам' }).disabled).toBe(true);
    // «Сбросить» внизу больше нет: «Вернуть как в канале» — в меню (`97dq.78`).
    expect(screen.queryByRole('button', { name: 'Сбросить' })).toBeNull();
    // Автосохранение поста говорит, когда легло (`97dq.70`), — в шапке панели.
    const saved = document.querySelector('[data-post-options-saved]');
    expect(saved.textContent).toBe('Сохранено · 19:04');
    expect(saved.parentElement.getAttribute('data-post-options')).toBe('panel');
    expect(screen.getByRole('heading', { name: 'Настройки поста' })).toBeTruthy();
  });

  test('«Ссылки» reads as in the channel card: a ceiling, and no invented URLs (97dq.58)', () => {
    wrap(React.createElement(Harness, { onRewrite: noop }));
    expect(
      Array.from(select('Ссылки').options).map((option) => option.textContent)
    ).toEqual(['без ссылок', 'не больше одной, в конце', 'можно внутри текста', 'выберем сами']);
    const note = document.querySelector('[data-post-option-note="links"]');
    expect(note.textContent).toBe(
      'Ссылку берём из вашего текста или найденных источников — новых адресов не придумываем.'
    );
    expect(select('Ссылки').getAttribute('aria-describedby')).toContain(note.id);
  });

  test('a change is marked, counted and rewrites; the channel value is not a change', () => {
    const onRewrite = jest.fn();
    wrap(React.createElement(Harness, { onRewrite }));
    fireEvent.change(select('Длина'), { target: { value: 'short' } });
    fireEvent.change(select('Призыв'), { target: { value: 'none' } });
    expect(shown('Длина')).toBe('короче · до 500');
    expect(select('Длина').getAttribute('data-post-option-changed')).toBe('true');
    expect(select('Длина').className).toContain('border-cf-signature');
    expect(select('Длина').className).not.toContain('text-cf-ink-muted');
    expect(select('Длина').getAttribute('aria-describedby')).toBeNull();
    expect(emojiRow().getAttribute('data-post-option-changed')).toBe('false');
    expect(counted()).toBe('2 изменения');
    fireEvent.click(screen.getByRole('button', { name: 'Переписать по настройкам' }));
    expect(onRewrite).toHaveBeenCalledTimes(1);
    // Ручка на другом делении — изменение: число, рамка цветом, «в канале: до 3».
    fireEvent.change(select('Эмодзи'), { target: { value: '4' } });
    expect(emojiReadout()).toBe('до 10');
    expect(emojiRow().getAttribute('data-post-option-changed')).toBe('true');
    expect(emojiRow().querySelector('[data-emoji-channel-note]').textContent).toBe(
      'в канале: до 3'
    );
    expect(counted()).toBe('3 изменения');
    // Вернуть ручку на деление канала — вернуться к «как в канале», даже если
    // канал хранит старое слово «мало».
    fireEvent.change(select('Эмодзи'), { target: { value: '2' } });
    expect(select('Эмодзи').value).toBe('2');
    expect(emojiRow().getAttribute('data-post-option-changed')).toBe('false');
    expect(select('Эмодзи').getAttribute('aria-describedby')).not.toBeNull();
    expect(counted()).toBe('2 изменения');
  });

  test('every parameter has a «?» with one line of its own (twelfth-wave canvas)', () => {
    wrap(
      React.createElement(PostOptionsPanel, {
        locale: 'ru',
        options: adapter.DEFAULT_POST_OPTIONS,
        baseline: adapter.postBaselineOf(CHANNEL),
        avatars: [
          { id: 'a1', label: 'Игорь' },
          { id: 'a2', label: 'Команда' },
        ],
        onChange: noop,
      })
    );
    for (const name of ['Кто говорит', 'Длина', 'Эмодзи', 'Хэштеги', 'Ссылки', 'Призыв', 'Пожелание']) {
      const hint = screen.getByRole('button', { name: `Подсказка: ${name}` });
      expect(hint.getAttribute('data-hint-trigger')).toBe('true');
      // «?» стоит рядом с подписью, а не внутри неё: в имя поля он не входит.
      expect(hint.closest('label')).toBeNull();
    }
  });

  test('«Вернуть как в канале» in the rewrite menu returns every field to the channel (97dq.78)', () => {
    wrap(React.createElement(Harness, { onRewrite: noop }));
    fireEvent.change(select('Ссылки'), { target: { value: 'none' } });
    fireEvent.change(screen.getByLabelText('Пожелание'), {
      target: { value: 'начни с вопроса' },
    });
    expect(counted()).toBe('2 изменения');
    fireEvent.click(screen.getByRole('button', { name: 'Другие способы переписать' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Вернуть как в канале/ }));
    expect(select('Ссылки').value).toBe('end');
    expect(select('Ссылки').getAttribute('data-post-option-changed')).toBe('false');
    expect(screen.getByLabelText('Пожелание').value).toBe('');
    expect(counted()).toBeNull();
  });

  test('the one rewrite button stands above the fields and is on while the text is older than the settings (97dq.78)', () => {
    wrap(React.createElement(Harness, { onRewrite: noop, rewritePending: true }));
    const rewrite = screen.getByRole('button', { name: 'Переписать по настройкам' });
    // Настройки новее текста — переписать можно и без счёта изменений.
    expect(counted()).toBeNull();
    expect(rewrite.disabled).toBe(false);
    const fields = document.querySelector('fieldset');
    expect(rewrite.compareDocumentPosition(fields) & 4).toBe(4);
  });

  test('before the first text the primary is «Адаптировать» (97dq.78)', () => {
    const onRewrite = jest.fn();
    wrap(
      React.createElement(PostOptionsPanel, {
        locale: 'ru',
        options: adapter.DEFAULT_POST_OPTIONS,
        baseline: adapter.postBaselineOf(CHANNEL),
        avatars: [],
        onChange: noop,
        primary: 'adapt',
        onRewrite,
        onRewriteAndRemember: noop,
      })
    );
    expect(screen.queryByRole('button', { name: 'Переписать по настройкам' })).toBeNull();
    const adapt = screen.getByRole('button', { name: 'Адаптировать' });
    expect(adapt.disabled).toBe(false);
    fireEvent.click(adapt);
    expect(onRewrite).toHaveBeenCalledTimes(1);
  });

  test('a wish alone rewrites; «применится при переписывании» stays beside the button while the text is older', () => {
    wrap(React.createElement(Harness, { onRewrite: noop, rewritePending: true }));
    fireEvent.change(screen.getByLabelText('Пожелание'), {
      target: { value: 'начни с вопроса' },
    });
    expect(counted()).toBe('1 изменение');
    expect(screen.getByRole('button', { name: 'Переписать по настройкам' }).disabled).toBe(false);
    expect(document.querySelector('[data-post-options-pending]').textContent).toBe(
      'применится при переписывании'
    );
  });

  test('«Сохранить для поста» is the main half; «Сохранить для канала» waits in its menu and says so', () => {
    const onSaveForChannel = jest.fn();
    const view = wrap(React.createElement(Harness, { onRewrite: noop, onSaveForChannel }));
    fireEvent.change(select('Длина'), { target: { value: 'long' } });
    expect(shown('Длина')).toBe('длиннее · до 1500');
    expect(screen.getByRole('button', { name: 'Сохранить для поста' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Где ещё сохранить' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Сохранить для канала/ }));
    expect(onSaveForChannel).toHaveBeenCalledTimes(1);
    view.rerender(
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(Harness, { onRewrite: noop, channelSaveState: 'saved' })
      )
    );
    expect(screen.getByRole('status').textContent).toContain('Сохранено для канала');
  });

  test('«План» is the first field, starts «как в канале», and a change goes out at once (97dq.70)', () => {
    const onPlan = jest.fn();
    wrap(
      React.createElement(PostOptionsPanel, {
        locale: 'ru',
        options: adapter.DEFAULT_POST_OPTIONS,
        baseline: adapter.postBaselineOf(CHANNEL),
        avatars: [],
        onChange: noop,
        plan: { value: null, channel: 'reserve', onChange: onPlan },
      })
    );
    const plan = select('План');
    const first = document.querySelector('[data-post-option]');
    expect(first).toBe(plan);
    expect(shown('План')).toBe('Бронь');
    expect(plan.className).toContain('text-cf-ink-muted');
    expect(
      document.getElementById(plan.getAttribute('aria-describedby').split(' ')[0]).textContent
    ).toBe('как в канале');
    expect(document.querySelector('[data-post-option-note="plan"]').textContent).toContain(
      'Подтвердить'
    );
    fireEvent.change(plan, { target: { value: 'autopilot' } });
    expect(onPlan).toHaveBeenCalledWith('autopilot');
    // Значение канала — это «как в канале», а не свой режим поста.
    fireEvent.change(plan, { target: { value: 'reserve' } });
    expect(onPlan).toHaveBeenLastCalledWith(null);
    expect(
      screen.getByRole('button', { name: 'Подсказка: План' }).getAttribute('data-hint-trigger')
    ).toBe('true');
  });
});

describe('the channel tab without an adaptation', () => {
  const emptyChannel = () => {
    const detail = detailOf([]);
    return adapter.workspaceChannels(detail).find((one) => one.id === 'vk-1');
  };

  test('one primary action names the platform', () => {
    const onAdapt = jest.fn();
    const channel = emptyChannel();
    wrap(
      React.createElement(
        PieceChannelTab,
        channelTabProps(channel, { platformLabel: 'VK', onAdapt })
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Адаптировать для VK' }));
    expect(onAdapt).toHaveBeenCalledWith('post');
    expect(document.querySelector('[data-schedule-bar]')).toBeNull();
  });

  test('a question from the stream takes the place of the button', () => {
    const channel = emptyChannel();
    wrap(
      React.createElement(
        PieceChannelTab,
        channelTabProps(channel, {
          platformLabel: 'VK',
          questionsSlot: React.createElement('div', { 'data-question': 'takeaway' }),
        })
      )
    );
    expect(document.querySelector('[data-question="takeaway"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Адаптировать для VK' })).toBeNull();
  });
});

describe('the wire the workspace shapes (pieces.adapter)', () => {
  test('tabs: written channels, the first of each platform and the open one', () => {
    const channels = adapter.workspaceChannels(detailOf());
    expect(adapter.workspaceTabs(channels, 'core').more.map((one) => one.id)).toEqual([
      'tg-notes',
    ]);
    expect(adapter.workspaceTabs(channels, 'tg-notes').more).toEqual([]);
    expect(adapter.tabOfPlatform(channels, 'vk')).toBe('vk-1');
    expect(adapter.pieceTabPath('piece 1', 'tg-main')).toBe(
      '/content/pieces/piece%201?tab=tg-main'
    );
    expect(adapter.pieceTabPath('piece-1', 'core')).toBe('/content/pieces/piece-1');
  });

  test('«Для этого поста» sends only what differs from the channel', () => {
    expect(adapter.adaptOverrides(adapter.DEFAULT_POST_OPTIONS)).toBeUndefined();
    expect(
      adapter.adaptOverrides({
        ...adapter.DEFAULT_POST_OPTIONS,
        length: 'long',
        emoji: 'none',
        hashtags: 'end_1_3',
        links: 'inline',
        cta: 'subscribe',
        brandProfileId: 'a2',
        wish: '  начни с вопроса ',
      })
    ).toEqual({
      lengthPolicy: 'range',
      lengthRange: { idealMin: 800, idealMax: 1500, hardMax: 1500 },
      emojiLevel: 'none',
      hashtagPolicy: 'end_1_3',
      linkPolicy: 'inline',
      ctaKind: 'subscribe',
      brandProfileId: 'a2',
      wish: 'начни с вопроса',
    });
    // Значение канала — не переопределение; «решает модель» — `auto`.
    const baseline = adapter.postBaselineOf({
      version: 'channel-writing-profile/v2',
      lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
      emojiLevel: 'few',
      linkPolicy: 'end',
      hashtagPolicy: 'none',
      ctaKind: 'question',
      formatPreference: 'auto',
      notes: null,
    });
    expect(
      adapter.adaptOverrides(
        { ...adapter.DEFAULT_POST_OPTIONS, length: 'ideal', emoji: 'few' },
        baseline
      )
    ).toBeUndefined();
    expect(
      adapter.adaptOverrides(
        { ...adapter.DEFAULT_POST_OPTIONS, length: 'auto' },
        baseline
      )
    ).toEqual({ lengthPolicy: 'auto' });
    expect(
      adapter.buildAdaptPayload({
        integrationId: 'tg-main',
        kind: 'post',
        overrides: { length: 'shorter' },
      })
    ).toEqual({ integrationId: 'tg-main', kind: 'post', overrides: { length: 'shorter' } });
  });

  test('schedule, patch and remember bodies', () => {
    expect(adapter.buildSchedulePayload({ now: true })).toEqual({ now: true });
    expect(
      adapter.buildSchedulePayload({ date: new Date('2026-09-23T07:00:00.000Z') })
    ).toEqual({ date: '2026-09-23T07:00:00.000Z' });
    expect(adapter.buildAdaptationPatch({ body: 'x' })).toEqual({ body: 'x' });
    expect(adapter.buildAdaptationPatch({ image: null })).toEqual({ image: null });
    const remembered = adapter.rememberedProfilePayload(
      {
        version: 'channel-writing-profile/v2',
        lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
        emojiLevel: 'few',
        linkPolicy: 'end',
        hashtagPolicy: 'none',
        ctaKind: 'question',
        formatPreference: 'auto',
        notes: null,
      },
      {
        ...adapter.DEFAULT_POST_OPTIONS,
        length: 'short',
        cta: 'none',
        brandProfileId: 'a1',
      }
    );
    expect(remembered).toMatchObject({
      lengthPolicy: 'range',
      length: { idealMin: 200, idealMax: 500, hardMax: 500 },
      brandProfileId: 'a1',
      // «Как в канале» уходит как было, выбранное — как выбрано.
      emojiLevel: 'few',
      ctaKind: 'none',
    });
    // Сохранённое раньше обращение карточки назад не уходит (97dq.45).
    expect(remembered).not.toHaveProperty('addressForm');
  });

  test('«Что вы прислали» reads the server field and falls back to the core', () => {
    expect(adapter.readSentText('Дословно', null)).toEqual({
      text: 'Дословно',
      kind: 'person',
      at: null,
    });
    expect(
      adapter.readSentText(null, {
        brief: { inputKind: 'foreign_post' },
        sourceText: 'Чужой пост',
      }).kind
    ).toBe('source');
  });

  test('bold toggles on and off around the selection', () => {
    expect(adapter.toggleBold('один два', 5, 8)).toEqual({
      text: 'один **два**',
      start: 7,
      end: 10,
    });
    expect(adapter.toggleBold('один **два**', 7, 10).text).toBe('один два');
    expect(adapter.visibleLength('**аб** в')).toBe(4);
  });
});
