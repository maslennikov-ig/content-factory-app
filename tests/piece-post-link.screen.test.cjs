'use strict';

/**
 * Links and editing on screen (`content-factory-next-97dq.75`).
 *
 * The fixed question «Какую ссылку поставить в пост?» with «Без ссылки» or an
 * address; «Ссылка для поста» in the post settings, prefilled from that
 * answer and saved as a post override; the core edited in place with
 * autosave; «Дописать материал» with an explicit «Пересобрать суть». Every
 * new parameter carries its «?», and the words are equal in RU and EN.
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

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence';
const { PostLinkQuestion } = loadTypeScriptModule(`${base}/intake/post-link.question.tsx`);
const { PostOptionsPanel } = loadTypeScriptModule(`${base}/pieces/post-options.panel.tsx`);
const { PieceCoreTab } = loadTypeScriptModule(`${base}/pieces/piece-core-tab.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces/pieces.adapter.ts`);
const { intakeCopy } = loadTypeScriptModule(`${base}/intake/intake.copy.ts`);
const { piecesCopy } = loadTypeScriptModule(`${base}/pieces/pieces.copy.ts`);
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
const wrap = (element) =>
  render(
    React.createElement(variables.VariableContextComponent, { language: 'ru' }, element)
  );
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

describe('the words are equal in both languages', () => {
  const KEYS = {
    intake: [
      'postLinkQuestion',
      'postLinkQuestionHint',
      'postLinkNone',
      'postLinkOwn',
      'postLinkInvalid',
      'postLinkSave',
    ],
    pieces: [
      'postLinkLabel',
      'postLinkHint',
      'coreEdit',
      'coreEditHint',
      'materialTitle',
      'materialHint',
      'coreRebuild',
      'coreRebuildHint',
    ],
  };
  test.each(KEYS.intake)('intake %s exists in RU and EN', (key) => {
    expect(typeof intakeCopy.ru[key]).toBe('string');
    expect(typeof intakeCopy.en[key]).toBe('string');
    expect(intakeCopy.en[key]).not.toBe(intakeCopy.ru[key]);
  });
  test.each(KEYS.pieces)('pieces %s exists in RU and EN', (key) => {
    expect(typeof piecesCopy.ru[key]).toBe('string');
    expect(typeof piecesCopy.en[key]).toBe('string');
  });
  test('the question is the owner’s wording', () => {
    expect(intakeCopy.ru.postLinkQuestion).toBe('Какую ссылку поставить в пост?');
    expect(intakeCopy.ru.postLinkNone).toBe('Без ссылки');
  });
});

describe('«Какую ссылку поставить в пост?»', () => {
  test('an address is validated as http(s), then saved; the «?» explains why it is asked', async () => {
    const answers = [];
    wrap(
      React.createElement(PostLinkQuestion, {
        locale: 'ru',
        onAnswer: async (url) => {
          answers.push(url);
          return true;
        },
      })
    );
    expect(screen.getByText('Какую ссылку поставить в пост?')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Подсказка: Какую ссылку поставить в пост?' })
    ).toBeTruthy();
    const field = screen.getByLabelText('Адрес ссылки');
    fireEvent.change(field, { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить ответ' }));
    await flush();
    expect(answers).toEqual([]);
    expect(screen.getByText(intakeCopy.ru.postLinkInvalid)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'example.com/offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить ответ' }));
    await flush();
    expect(answers).toEqual(['https://example.com/offer']);
  });

  test('«Без ссылки» is an answer, and switching back and forth is changing one’s mind, not a save', async () => {
    const answers = [];
    wrap(
      React.createElement(PostLinkQuestion, {
        locale: 'ru',
        onAnswer: async (url) => {
          answers.push(url);
          return true;
        },
      })
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Без ссылки' }));
    expect(screen.queryByLabelText('Адрес ссылки')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Вставить ссылку' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Без ссылки' }));
    expect(answers).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить ответ' }));
    await flush();
    expect(answers).toEqual([null]);
  });

  test('reopened to change an answer: it starts from the answer and can be left as it was', () => {
    let kept = 0;
    wrap(
      React.createElement(PostLinkQuestion, {
        locale: 'en',
        initial: { url: 'https://example.com' },
        onAnswer: async () => true,
        onKeep: () => {
          kept += 1;
        },
      })
    );
    expect(screen.getByLabelText('Link address').value).toBe('https://example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Keep it as it was' }));
    expect(kept).toBe(1);
  });
});

describe('«Ссылка для поста» in the post settings', () => {
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
  const Harness = ({ pieceLink, seen, start = adapter.DEFAULT_POST_OPTIONS }) => {
    const [options, setOptions] = React.useState(start);
    return React.createElement(PostOptionsPanel, {
      locale: 'ru',
      options,
      baseline: adapter.postBaselineOf(CHANNEL),
      pieceLink,
      avatars: [],
      onChange: (next) => {
        seen.push(next);
        setOptions(next);
      },
      onRewrite: noop,
    });
  };

  test('prefilled from the piece’s answer, muted «как в заготовке», with its «?»', () => {
    const seen = [];
    wrap(React.createElement(Harness, { pieceLink: { url: 'https://piece.example/a' }, seen }));
    const field = screen.getByLabelText('Ссылка для поста');
    expect(field.value).toBe('https://piece.example/a');
    expect(screen.getByText('как в заготовке')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подсказка: Ссылка для поста' })).toBeTruthy();
    expect(seen).toEqual([]);
  });

  test('an edited address becomes the post’s own link and counts as a change to rewrite with', () => {
    const seen = [];
    wrap(React.createElement(Harness, { pieceLink: { url: 'https://piece.example/a' }, seen }));
    const field = screen.getByLabelText('Ссылка для поста');
    fireEvent.change(field, { target: { value: 'https://post.example/b' } });
    expect(seen[seen.length - 1].link).toBe('https://post.example/b');
    expect(document.querySelector('[data-post-option="link"]').getAttribute('data-post-option-changed')).toBe('true');
    const rewrite = document.querySelector('[data-post-options-rewrite]');
    expect(rewrite.disabled).toBe(false);
    expect(adapter.adaptOverrides(seen[seen.length - 1], adapter.postBaselineOf(CHANNEL)).postLink).toBe(
      'https://post.example/b'
    );
    // «Как в заготовке» goes back to the answer.
    fireEvent.click(screen.getByRole('button', { name: 'Как в заготовке' }));
    expect(seen[seen.length - 1].link).toBe('');
    expect(field.value).toBe('https://piece.example/a');
  });

  test('a half-typed address is not saved; «Без ссылки» is `none`', () => {
    const seen = [];
    wrap(React.createElement(Harness, { pieceLink: { url: 'https://piece.example/a' }, seen }));
    const field = screen.getByLabelText('Ссылка для поста');
    fireEvent.change(field, { target: { value: 'https://' } });
    expect(seen).toEqual([]);
    expect(screen.getByText(intakeCopy.ru.postLinkInvalid)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Без ссылки' }));
    expect(seen[seen.length - 1].link).toBe('none');
    expect(screen.getByText('без ссылки в этом посте')).toBeTruthy();
  });

  test('the link travels on the existing settings path and is cleaned there', () => {
    const payload = adapter.buildPostSettingsPayload({
      options: { ...adapter.DEFAULT_POST_OPTIONS, link: 'javascript:1' },
    });
    expect(payload.options.link).toBe('');
    expect(adapter.readPostOptions({ link: 'none' }).link).toBe('none');
    expect(adapter.postChangeCount({ ...adapter.DEFAULT_POST_OPTIONS, link: 'none' })).toBe(1);
  });
});

describe('the core on the «Суть» tab', () => {
  const detail = (core) =>
    adapter.readPieceDetail({
      state: 'default',
      piece: {
        id: 'piece-1',
        code: 'cnt-1',
        title: 'Заготовка',
        format: 'post',
        date: '24.09.26',
        createdAt: '2026-09-24T08:00:00Z',
        excerpt: ['Суть'],
        coreExtracted: true,
        origin: 'thought',
        slopVerdict: 'clean',
        archivedAt: null,
      },
      core,
      legacyBody: null,
      adaptations: [],
      targets: [],
      later: [],
      linkQuestion: true,
    });
  const CORE = {
    text: 'Суть заготовки.',
    writtenBy: 'model',
    authorNumbers: true,
    slop: null,
    personText: 'Слова автора.',
    brief: { inputKind: 'thought', format: 'auto', facts: [], origins: {}, ungrounded: [] },
    answers: [],
  };
  const tab = (core, props = {}) =>
    wrap(
      React.createElement(PieceCoreTab, {
        locale: 'ru',
        detail: detail(core),
        channels: [],
        unavailable: [],
        canWrite: true,
        busy: false,
        factSelectable: false,
        onOpenChannel: noop,
        onAdaptChannel: noop,
        ...props,
      })
    );

  test('the reader knows the question is open and the answer reads with its origin', () => {
    expect(detail(CORE).linkQuestion).toBe(true);
    const changes = [];
    tab(
      { ...CORE, postLink: { url: 'https://example.com/x', origin: 'author', answeredAt: '2026-09-24T08:00:00Z' } },
      { onChangeLink: () => changes.push(1) }
    );
    const row = document.querySelector('[data-piece-post-link]');
    expect(row.getAttribute('data-piece-post-link')).toBe('url');
    expect(row.textContent).toContain('example.com');
    expect(row.textContent).toContain('ваш ответ');
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(changes).toEqual([1]);
  });

  test('«Править суть» edits in place and autosaves as the new core against the text it replaces', async () => {
    const saves = [];
    tab(CORE, {
      onCoreSave: async (next, expected) => {
        saves.push([next, expected]);
        return true;
      },
      onMaterialAdd: async () => true,
      onCoreRebuild: async () => null,
    });
    expect(screen.getByRole('button', { name: 'Подсказка: Править суть' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Править суть' }));
    const field = screen.getByLabelText('Текст сути');
    expect(field.value).toBe('Суть заготовки.');
    fireEvent.change(field, { target: { value: 'Суть заготовки, дописанная мной.' } });
    expect(saves).toEqual([]);
    await flush(1_100);
    expect(saves).toEqual([['Суть заготовки, дописанная мной.', 'Суть заготовки.']]);
    expect(document.querySelector('[data-piece-core-saved]').getAttribute('data-piece-core-saved')).toBe('saved');
    fireEvent.change(field, { target: { value: 'Вторая правка.' } });
    await flush(1_100);
    // The next save replaces what was saved, not what the page loaded.
    expect(saves[1]).toEqual(['Вторая правка.', 'Суть заготовки, дописанная мной.']);
  });

  test('«Дописать материал» adds without a rebuild; «Пересобрать суть» appears only while material waits', async () => {
    const added = [];
    let rebuilds = 0;
    const handlers = {
      onCoreSave: async () => true,
      onMaterialAdd: async (text) => {
        added.push(text);
        return true;
      },
      onCoreRebuild: async () => {
        rebuilds += 1;
        return null;
      },
    };
    const view = tab(CORE, handlers);
    expect(screen.getByRole('button', { name: 'Подсказка: Дописать материал' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Пересобрать суть' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Дописать материал'), {
      target: { value: 'Клиент звонил в пятницу.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить к материалу' }));
    await flush();
    expect(added).toEqual(['Клиент звонил в пятницу.']);
    expect(rebuilds).toBe(0);
    view.unmount();

    tab({ ...CORE, materialPending: true, addedMaterial: [{ text: 'x', addedAt: '' }] }, handlers);
    expect(screen.getByText('Суть ещё не учитывает дописанное.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Подсказка: Пересобрать суть' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Пересобрать суть' }));
    await flush();
    expect(rebuilds).toBe(1);
  });

  test('without the right to write there is nothing to edit', () => {
    tab(CORE, { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Править суть' })).toBeNull();
    expect(screen.queryByLabelText('Дописать материал')).toBeNull();
  });
});
