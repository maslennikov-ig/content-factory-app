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
const { PieceQuestions } = loadTypeScriptModule(`${base}/pieces/piece-questions.tsx`);
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
      'postLinkSaving',
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
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(answers).toEqual([]);
    expect(screen.getByText(intakeCopy.ru.postLinkInvalid)).toBeTruthy();

    fireEvent.change(field, { target: { value: 'example.com/offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(answers).toEqual(['https://example.com/offer']);
  });

  test('«Текст ссылки» is optional, has its «?» and rides with the address (97dq.79)', async () => {
    const answers = [];
    wrap(
      React.createElement(PostLinkQuestion, {
        locale: 'ru',
        onAnswer: async (...args) => {
          answers.push(args);
          return true;
        },
      })
    );
    expect(screen.getByRole('button', { name: 'Подсказка: Текст ссылки' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Адрес ссылки'), {
      target: { value: 'https://example.com/offer' },
    });
    fireEvent.change(screen.getByLabelText('Текст ссылки'), {
      target: { value: '  наш прайс ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(answers).toEqual([['https://example.com/offer', 'наш прайс']]);
    expect(intakeCopy.en.postLinkText).toBe('Link text');
    expect(intakeCopy.ru.postLinkTextHint).toContain('2–5 слов');
    expect(intakeCopy.en.postLinkTextHint).toContain('2–5 meaningful words');
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
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
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

describe('one composition: the link question saves with the questions’ «Дальше» (97dq.89)', () => {
  const QUESTIONS = [
    { field: 'thesis', question: 'Что было до доски?', suggested: 'Много чата' },
    { field: 'facts', key: 'ask-1', question: 'Какой результат?', suggested: null },
  ];
  const draw = (overrides = {}) => {
    const calls = [];
    wrap(
      React.createElement(PieceQuestions, {
        locale: 'ru',
        questions: QUESTIONS,
        onAnswer: (given, decide) => calls.push(['answers', given, decide]),
        onSkip: () => calls.push(['skip']),
        link: {
          initial: null,
          onAnswer: async (...args) => {
            calls.push(['link', ...args]);
            return overrides.linkOk ?? true;
          },
        },
      })
    );
    return calls;
  };

  test('no «Сохранить ответ»; one «Дальше» writes the link first, then the answers', async () => {
    const calls = draw();
    expect(screen.queryByRole('button', { name: 'Сохранить ответ' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Дальше' })).toHaveLength(1);
    expect(document.querySelector('[data-piece-link-in-questions]')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Адрес ссылки'), {
      target: { value: 'https://example.com/kanban' },
    });
    fireEvent.change(screen.getByLabelText('Текст ссылки'), {
      target: { value: 'что такое канбан' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(calls.map((call) => call[0])).toEqual(['link', 'answers']);
    expect(calls[0].slice(1)).toEqual(['https://example.com/kanban', 'что такое канбан']);
  });

  test('an empty address leaves the link question open and the answers still go', async () => {
    const calls = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(calls.map((call) => call[0])).toEqual(['answers']);
  });

  test('a wrong address holds the step and is marked at the field', async () => {
    const calls = draw();
    fireEvent.change(screen.getByLabelText('Адрес ссылки'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(calls).toEqual([]);
    expect(screen.getByText(intakeCopy.ru.postLinkInvalid)).toBeTruthy();
  });

  test('a link that did not save stops the step with a plain message', async () => {
    const calls = draw({ linkOk: false });
    fireEvent.click(screen.getByRole('radio', { name: 'Без ссылки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(calls.map((call) => call[0])).toEqual(['link']);
    expect(calls[0].slice(1)).toEqual([null]);
    expect(screen.getByRole('alert').textContent).toBe(intakeCopy.ru.postLinkFailed);
  });
});

describe('the link question inside the questions card, review of 97dq.89 (F2, F7)', () => {
  const QUESTIONS = [
    { field: 'thesis', question: 'Что было до доски?', suggested: 'Много чата' },
    { field: 'facts', key: 'ask-1', question: 'Какой результат?', suggested: null },
  ];
  const Harness = ({ link, calls }) =>
    React.createElement(
      variables.VariableContextComponent,
      { language: 'ru' },
      React.createElement(PieceQuestions, {
        locale: 'ru',
        questions: QUESTIONS,
        onAnswer: (given) => calls.push(['answers', given.length]),
        onSkip: () => calls.push(['skip']),
        link,
      })
    );
  const linkOf = (calls, overrides = {}) => ({
    initial: null,
    onAnswer: async (...args) => {
      calls.push(['link', ...args]);
      return overrides.ok ?? true;
    },
    ...overrides.link,
  });

  test('reopened with «Изменить» while the questions are open: the fields start from the saved answer, and it can be kept', async () => {
    const calls = [];
    const view = render(React.createElement(Harness, { link: undefined, calls }));
    expect(document.querySelector('[data-piece-link-in-questions]')).toBeNull();
    const reopened = linkOf(calls, {
      link: {
        initial: { url: 'https://example.com/saved', text: 'наш прайс' },
        onKeep: () => calls.push(['keep']),
      },
    });
    view.rerender(React.createElement(Harness, { link: reopened, calls }));
    expect(screen.getByLabelText('Адрес ссылки').value).toBe('https://example.com/saved');
    expect(screen.getByLabelText('Текст ссылки').value).toBe('наш прайс');
    fireEvent.click(screen.getByRole('button', { name: intakeCopy.ru.postLinkKeep }));
    expect(calls).toEqual([['keep']]);
  });

  test('a saved «Без ссылки» reopens as «Без ссылки»; «Дальше» untouched closes it without a write', async () => {
    const calls = [];
    const view = render(React.createElement(Harness, { link: undefined, calls }));
    view.rerender(
      React.createElement(Harness, {
        link: linkOf(calls, {
          link: { initial: { url: null }, onKeep: () => calls.push(['keep']) },
        }),
        calls,
      })
    );
    expect(screen.getByRole('radio', { name: 'Без ссылки' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Адрес ссылки')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(calls.map((call) => call[0])).toEqual(['keep', 'answers']);
  });

  test('a newly saved answer refills the fields; closing the question drops what was typed', () => {
    const calls = [];
    const view = render(React.createElement(Harness, { link: linkOf(calls), calls }));
    fireEvent.change(screen.getByLabelText('Адрес ссылки'), { target: { value: 'half' } });
    view.rerender(React.createElement(Harness, { link: undefined, calls }));
    view.rerender(React.createElement(Harness, { link: linkOf(calls), calls }));
    expect(screen.getByLabelText('Адрес ссылки').value).toBe('');
  });

  test('«Решите всё за меня» leaves the piece as it is and does not write a typed link', async () => {
    const calls = [];
    render(React.createElement(Harness, { link: linkOf(calls), calls }));
    fireEvent.change(screen.getByLabelText('Адрес ссылки'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: piecesCopy.ru.answerDecideAll }));
    await flush();
    expect(calls).toEqual([['skip']]);
  });

  test('a wrong address takes the focus to the field', async () => {
    const calls = [];
    render(React.createElement(Harness, { link: linkOf(calls), calls }));
    const field = screen.getByLabelText('Адрес ссылки');
    fireEvent.change(field, { target: { value: 'javascript:alert(1)' } });
    field.blur();
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(document.activeElement).toBe(field);
    expect(calls).toEqual([]);
  });

  test('the save-failed message goes away once the link is edited', async () => {
    const calls = [];
    render(React.createElement(Harness, { link: linkOf(calls, { ok: false }), calls }));
    const field = screen.getByLabelText('Адрес ссылки');
    fireEvent.change(field, { target: { value: 'https://example.com/a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe(intakeCopy.ru.postLinkFailed);
    fireEvent.change(field, { target: { value: 'https://example.com/b' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the standalone question drops its save-failed message on edit too', async () => {
    wrap(
      React.createElement(PostLinkQuestion, { locale: 'ru', onAnswer: async () => false })
    );
    const field = screen.getByLabelText('Адрес ссылки');
    fireEvent.change(field, { target: { value: 'https://example.com/a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe(intakeCopy.ru.postLinkFailed);
    fireEvent.change(screen.getByLabelText('Текст ссылки'), { target: { value: 'прайс' } });
    expect(screen.queryByRole('alert')).toBeNull();
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
    // One icon with a tooltip goes back to the answer (`97dq.78`), and it
    // is there only while the field differs from the piece.
    const restore = screen.getByRole('button', { name: 'Вернуть ссылку из заготовки' });
    expect(restore.getAttribute('title')).toBe('Вернуть ссылку из заготовки');
    fireEvent.click(restore);
    expect(seen[seen.length - 1].link).toBe('');
    expect(field.value).toBe('https://piece.example/a');
    expect(screen.queryByRole('button', { name: 'Вернуть ссылку из заготовки' })).toBeNull();
  });

  test('a half-typed address is not saved; a cleared field is `none` (97dq.78)', () => {
    const seen = [];
    wrap(React.createElement(Harness, { pieceLink: { url: 'https://piece.example/a' }, seen }));
    // No «Без ссылки» / «Как в заготовке» buttons any more.
    expect(screen.queryByRole('button', { name: 'Без ссылки' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Как в заготовке' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Вернуть ссылку из заготовки' })).toBeNull();
    const field = screen.getByLabelText('Ссылка для поста');
    fireEvent.change(field, { target: { value: 'https://' } });
    expect(seen).toEqual([]);
    expect(screen.getByText(intakeCopy.ru.postLinkInvalid)).toBeTruthy();
    fireEvent.change(field, { target: { value: '' } });
    expect(seen[seen.length - 1].link).toBe('none');
    expect(screen.getByText('без ссылки в этом посте')).toBeTruthy();
    // The «?» says what an empty field means.
    expect(piecesCopy.ru.postLinkHint).toContain('Очистите поле — в этом посте ссылки не будет');
    expect(piecesCopy.en.postLinkHint).toContain('Clear the field — this post gets no link');
    // No address — nothing to put words on.
    expect(screen.queryByLabelText('Текст ссылки')).toBeNull();
  });

  test('«Текст ссылки» sits under the address, has its «?» and rides as an override (97dq.79)', () => {
    const seen = [];
    wrap(
      React.createElement(Harness, {
        pieceLink: { url: 'https://piece.example/a', text: 'наш прайс' },
        seen,
      })
    );
    const words = screen.getByLabelText('Текст ссылки');
    expect(words.getAttribute('placeholder')).toBe('наш прайс');
    expect(screen.getByRole('button', { name: 'Подсказка: Текст ссылки' })).toBeTruthy();
    fireEvent.change(words, { target: { value: 'цены  на [всё]' } });
    const last = seen[seen.length - 1];
    expect(last.link).toBe('');
    expect(last.linkText).toBe('цены на всё');
    const overrides = adapter.adaptOverrides(last, adapter.postBaselineOf(CHANNEL));
    expect(overrides.postLinkText).toBe('цены на всё');
    expect(overrides.postLink).toBeUndefined();
    // No link in the post — no words either.
    expect(
      adapter.adaptOverrides(
        { ...last, link: 'none' },
        adapter.postBaselineOf(CHANNEL)
      ).postLinkText
    ).toBeUndefined();
    expect(adapter.readPostOptions({}).linkText).toBe('');
    expect(
      adapter.buildPostSettingsPayload({ options: { ...last, linkText: ' a  b ' } }).options.linkText
    ).toBe('a b');
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

  test('«Версии сути»: newest first with author and time, text on demand, restore against the current core (97dq.85)', async () => {
    const restores = [];
    tab(
      {
        ...CORE,
        revisions: [
          { text: 'Первая суть.', writtenBy: 'model', replacedAt: '2026-09-24T08:00:00Z' },
          { text: 'Моя правка.', writtenBy: 'person', replacedAt: '2026-09-24T09:00:00Z' },
        ],
      },
      {
        onCoreSave: async () => true,
        onCoreRestore: async (...args) => {
          restores.push(args);
          return null;
        },
      }
    );
    const versions = document.querySelector('[data-piece-core-versions]');
    expect(versions.textContent).toContain('Версии сути');
    expect(versions.textContent).toContain('прежних: 2');
    expect(screen.getByRole('button', { name: 'Подсказка: Версии сути' })).toBeTruthy();
    fireEvent.click(document.querySelector('[data-piece-core-versions-toggle]'));
    const rows = [...document.querySelectorAll('[data-piece-core-version]')];
    expect(rows.map((row) => row.getAttribute('data-piece-core-version'))).toEqual(['1', '0']);
    expect(rows[0].textContent).toContain('вы');
    expect(rows[1].textContent).toContain('ИИ');
    expect(rows[1].textContent).toMatch(/была сутью до 24\.09 \d\d:00/);
    fireEvent.click(document.querySelector('[data-piece-core-version-show="0"]'));
    expect(document.querySelector('[data-piece-core-version-text="0"]').textContent).toBe('Первая суть.');
    expect(screen.getByRole('button', { name: 'Подсказка: Вернуть эту версию' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Вернуть эту версию' }));
    });
    expect(restores).toEqual([[0, '2026-09-24T08:00:00Z', 'Суть заготовки.']]);
  });

  const VERSIONED = {
    ...CORE,
    materialPending: true,
    addedMaterial: [{ text: 'x', addedAt: '2026-09-24T08:30:00Z' }],
    revisions: [{ text: 'Первая суть.', writtenBy: 'model', replacedAt: '2026-09-24T08:00:00Z' }],
  };
  const openVersion = () => {
    fireEvent.click(document.querySelector('[data-piece-core-versions-toggle]'));
    fireEvent.click(document.querySelector('[data-piece-core-version-show="0"]'));
    return screen.getByRole('button', { name: 'Вернуть эту версию' });
  };

  test('a refused restore says why beside the version and keeps it open (review of 97dq.81-85)', async () => {
    tab(VERSIONED, {
      onCoreSave: async () => true,
      onCoreRestore: async () => 'Этой версии больше нет.',
    });
    const restore = openVersion();
    await act(async () => {
      fireEvent.click(restore);
    });
    const row = document.querySelector('[data-piece-core-version="0"]');
    expect(row.querySelector('[role="alert"]').textContent).toBe('Этой версии больше нет.');
    expect(document.querySelector('[data-piece-core-version-text="0"]')).not.toBeNull();
  });

  test('versions are off while a rebuild runs, and back once it ends (P3-4)', async () => {
    let finish;
    const restores = [];
    tab(VERSIONED, {
      onCoreSave: async () => true,
      onMaterialAdd: async () => true,
      onCoreRebuild: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      onCoreRestore: async (...args) => {
        restores.push(args);
        return null;
      },
    });
    const restore = openVersion();
    expect(restore.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Пересобрать суть' }));
    });
    expect(screen.getByRole('button', { name: 'Вернуть эту версию' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть эту версию' }));
    expect(restores).toEqual([]);
    // The hand edit waits too: the rebuild would move the core under it.
    expect(screen.getByRole('button', { name: 'Править суть' }).disabled).toBe(true);
    await act(async () => {
      finish(null);
    });
    expect(screen.getByRole('button', { name: 'Вернуть эту версию' }).disabled).toBe(false);
  });

  test('an open hand edit turns the versions and the rebuild off, so no draft saves against a replaced text (P3-4)', async () => {
    tab(VERSIONED, {
      onCoreSave: async () => true,
      onMaterialAdd: async () => true,
      onCoreRebuild: async () => null,
      onCoreRestore: async () => null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Править суть' }));
    expect(openVersion().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Пересобрать суть' }).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Готово' }));
    });
    expect(screen.getByRole('button', { name: 'Вернуть эту версию' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Пересобрать суть' }).disabled).toBe(false);
  });

  test('the history hint names the real cap: the first text and the latest 19 (P3-3)', () => {
    expect(piecesCopy.ru.coreVersionsHint).toContain('самый первый текст и последние 19');
    expect(piecesCopy.en.coreVersionsHint).toContain('The very first text and the last 19');
    expect(piecesCopy.ru.coreVersionsHint).not.toContain('20');
    expect(piecesCopy.en.coreVersionsHint).not.toContain('20');
  });

  test('no versions yet: no block; RU and EN name it equally', () => {
    tab(CORE, { onCoreSave: async () => true });
    expect(document.querySelector('[data-piece-core-versions]')).toBeNull();
    for (const key of ['coreVersionsTitle', 'coreVersionsHint', 'coreVersionRestore', 'coreVersionRestoreHint', 'coreVersionByYou', 'coreVersionByAi']) {
      expect(typeof piecesCopy.ru[key]).toBe('string');
      expect(typeof piecesCopy.en[key]).toBe('string');
    }
  });

  test('without the right to write there is nothing to edit', () => {
    tab(CORE, { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Править суть' })).toBeNull();
    expect(screen.queryByLabelText('Дописать материал')).toBeNull();
  });
});
