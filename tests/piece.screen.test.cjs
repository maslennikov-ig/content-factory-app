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
const { PieceChannelTab } = loadTypeScriptModule(
  `${base}/pieces/piece-channel-tab.tsx`
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
  rememberState: 'idle',
  onRemember: noop,
  when: React.createElement('span', { 'data-when': 'true' }, '19:30'),
  scheduleBusy: null,
  calendarHref: '/launches',
  onSelectAdaptation: noop,
  onAdapt: noop,
  onCancelAdapt: noop,
  onSchedule: noop,
  onPublishNow: noop,
  onUnschedule: noop,
  onDelete: noop,
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
  test('the text reads as it will be published, and the markup is one press away', () => {
    drawChannel();
    const article = document.querySelector('[data-intake-draft="true"]');
    expect(article.querySelector('strong').textContent).toBe(
      'Я не занимаю сторону'
    );
    expect(article.textContent).not.toContain('**');
    fireEvent.click(screen.getByRole('button', { name: 'Показать разметку' }));
    const field = screen.getByRole('textbox', {
      name: 'Текст поста для Telegram',
    });
    expect(field.value).toContain('**Я не занимаю сторону**');
  });

  test('a hand edit goes up, and the counter counts what the reader sees', () => {
    const onBodyChange = jest.fn();
    drawChannel({ onBodyChange });
    const counter = document.querySelector('[data-editor-counter]');
    // Звёздочки выделения в счёт не идут.
    const visible =
      'Сейчас спор начинается с вывода.\n\nЯ не занимаю сторону и хочу разобраться.'
        .length;
    expect(counter.textContent).toBe(`${visible} из 4096 знаков`);
    fireEvent.click(screen.getByRole('button', { name: 'Показать разметку' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Текст поста для Telegram' }),
      { target: { value: 'Новый текст' } }
    );
    expect(onBodyChange).toHaveBeenCalledWith('Новый текст');
  });

  test('«Ж» wraps the selection in the stored bold marker', () => {
    const onBodyChange = jest.fn();
    drawChannel({ onBodyChange, body: 'один два три' });
    fireEvent.click(screen.getByRole('button', { name: 'Показать разметку' }));
    const field = screen.getByRole('textbox', {
      name: 'Текст поста для Telegram',
    });
    field.setSelectionRange(5, 8);
    fireEvent.select(field);
    fireEvent.click(screen.getByRole('button', { name: 'Жирный' }));
    expect(onBodyChange).toHaveBeenCalledWith('один **два** три');
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

  test('«Для этого поста» is a summary until changed, and hides the avatar with one avatar', () => {
    const onPostOptionsChange = jest.fn();
    drawChannel({
      onPostOptionsChange,
      avatars: [{ id: 'a1', label: 'Игорь' }],
    });
    const panel = document.querySelector('[data-post-options]');
    expect(panel.getAttribute('data-post-options')).toBe('summary');
    expect(document.body.textContent).not.toContain('Кто говорит');
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    fireEvent.click(screen.getByRole('radio', { name: 'на «вы»' }));
    expect(onPostOptionsChange).toHaveBeenCalledWith({
      ...adapter.DEFAULT_POST_OPTIONS,
      addressForm: 'vy',
    });
  });

  test('with several avatars «Кто говорит» is a choice, and rewriting with the options makes a new version', () => {
    const onAdapt = jest.fn();
    const onRemember = jest.fn();
    drawChannel({
      onAdapt,
      onRemember,
      postOptions: { ...adapter.DEFAULT_POST_OPTIONS, length: 'shorter' },
      avatars: [
        { id: 'a1', label: 'Игорь' },
        { id: 'a2', label: 'Студия' },
      ],
    });
    expect(screen.getByRole('combobox')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Переписать с этим' }));
    expect(onAdapt).toHaveBeenCalledWith('post');
    fireEvent.click(screen.getByRole('button', { name: 'Запомнить для канала' }));
    expect(onRemember).toHaveBeenCalledTimes(1);
  });

  test('the adaptation is deleted only on the second press', () => {
    const onDelete = jest.fn();
    drawChannel({ onDelete });
    const button = document.querySelector('[data-piece-delete-adaptation="true"]');
    // Общий `ConfirmButton` (`97dq.39`): обе подписи в одной клетке, видна одна.
    expect(button.textContent).toContain('Удалить адаптацию');
    expect(button.getAttribute('data-confirm-armed')).toBe('false');
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    expect(button.getAttribute('data-confirm-armed')).toBe('true');
    expect(button.textContent).toContain('Удалить насовсем?');
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
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

  test('a queued post is read-only and opens in the calendar', () => {
    drawChannel(
      { calendarHref: '/launches?startDate=2026-09-23' },
      [adaptation({ state: 'queued', date: '2026-09-23T07:00:00.000Z' })]
    );
    expect(document.querySelector('[data-adaptation-editor]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Запланировать' })).toBeNull();
    const link = screen.getByRole('link', { name: 'Открыть в календаре' });
    expect(link.getAttribute('href')).toBe('/launches?startDate=2026-09-23');
    expect(document.body.textContent).toContain('запланировано');
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
    fireEvent.click(screen.getByRole('button', { name: 'Снять с расписания' }));
    expect(onUnschedule).toHaveBeenCalledTimes(1);
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
        length: 'longer',
        addressForm: 'vy',
        brandProfileId: 'a2',
        wish: '  начни с вопроса ',
      })
    ).toEqual({
      length: 'longer',
      addressForm: 'vy',
      brandProfileId: 'a2',
      wish: 'начни с вопроса',
    });
    expect(
      adapter.buildAdaptPayload({
        integrationId: 'tg-main',
        kind: 'post',
        overrides: { addressForm: 'ty' },
      })
    ).toEqual({ integrationId: 'tg-main', kind: 'post', overrides: { addressForm: 'ty' } });
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
      { length: 'shorter', addressForm: 'vy', brandProfileId: 'a1', wish: '' }
    );
    expect(remembered).toMatchObject({
      lengthPolicy: 'range',
      length: { idealMin: 200, idealMax: 500, hardMax: 500 },
      addressForm: 'vy',
      brandProfileId: 'a1',
      emojiLevel: 'few',
    });
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
