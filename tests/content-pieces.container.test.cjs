'use strict';

/**
 * Страница заготовки как её видит сеть: стрим адаптации, вопросы и архив.
 *
 * `content-factory-next-tu3k.10`. До этого набора на `piece.container.tsx` не
 * было ни одного: экран проверялся пропсами, а чтение NDJSON, второй запрос с
 * ответами и перечитывание заготовки не проверялись ничем. Сервер здесь —
 * `pieces.fixture.ts`, поданная настоящим `ReadableStream` кусками, и разбивку
 * строк делает тот же модуль, что и в браузере.
 *
 * С десятого захода (`97dq.37`, вариант A) страница — рабочее место с
 * вкладками, и набор держит ещё и его двери:
 *
 *  - вкладка живёт в адресе (`?tab=`), старый `?adapt=<площадка>` ведёт во
 *    вкладку канала;
 *  - короткий путь `adapt-started` → `adaptation` → `done` показывает черновик
 *    во вкладке канала и перечитывает заготовку;
 *  - `questions` терминально — карточка показана, черновика нет, а ответ
 *    уходит вторым запросом; «Решите всё за меня» несёт `skipInterview`;
 *  - ручная правка уходит `PATCH`-ем после тишины, «Запланировать» и
 *    «Опубликовать сейчас» — дверью расписания, «Снять с расписания» —
 *    своей дверью, удаление адаптации — вторым нажатием;
 *  - «Для этого поста» уходит в `overrides`, «Запомнить для канала» — в
 *    профиль канала;
 *  - окно «Создать пост» не открывается ни одной веткой страницы
 *    (медиатека грузится по нажатию «картинка», в наборе её не поднять);
 *  - «В архив» и «Удалить» заготовки — как раньше.
 */

const React = require('react');
const { JSDOM, VirtualConsole } = require('jsdom');

/*
  Уходы со страницы записываются, а не случаются (как в `content-intake.flow`):
  `window.location` в jsdom неподделываем, а попытка навигации приходит сюда
  ошибкой окружения — набор считает именно попытки (удаление, `97dq.30`).
*/
const navigations = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (String(error?.message || '').includes('Not implemented: navigation')) {
    navigations.push(error.message);
    return;
  }
  console.error(error);
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole,
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
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
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const container = loadTypeScriptModule(`${base}/piece.container.tsx`);
const adapter = loadTypeScriptModule(`${base}/pieces.adapter.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);
const fixture = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/pieces.fixture.ts'
);
const routes = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts'
);
const avatarRoutes = loadTypeScriptModule(
  'apps/frontend/src/components/brand-voice/voice-avatars.adapter.ts'
).AVATAR_ROUTES;

/*
  Окно поста подменяется на уровне модуля модалок — тот же приём, что в
  `tests/content-intake.flow.test.cjs`: настоящее окно поста самое тяжёлое
  дерево приложения, и поднимать его ради страницы заготовки значило бы
  проверять редактор.
*/
const modalModule = loadTypeScriptModule(
  'apps/frontend/src/components/layout/new-modal.tsx'
);
/*
  Каждое открытие окна записывается: страница заготовки не открывает окно
  поста ни одной веткой (`97dq.37`), а единственное законное окно — медиатека
  у кнопки «картинка».
*/
const opened = [];
modalModule.useModals = () => ({
  openModal: (options) => {
    opened.push(options);
  },
  closeAll: () => undefined,
  closeById: () => undefined,
  closeCurrent: () => undefined,
});

const PIECE_ID = fixture.PIECE_FIXTURE_DETAIL.piece.id;
const DETAIL_URL = adapter.PIECES_API.detail(PIECE_ID);
const ADAPT_URL = adapter.PIECES_API.adapt(PIECE_ID);
const ARCHIVE_URL = adapter.PIECES_API.archive(PIECE_ID);
const ANSWER_URL = routes.PIECE_ROUTES.answer.path(PIECE_ID);

/**
 * Заготовка с открытым вопросом про факты.
 *
 * Тот самый вопрос, который на живом прогоне 07.09.2026 задавался по кругу на
 * экране входа (`content-factory-next-m2eg`). Теперь он приезжает в брифе
 * заготовки и живёт на её странице.
 */
const ASKED_DETAIL = {
  ...fixture.PIECE_FIXTURE_DETAIL,
  core: {
    ...fixture.PIECE_FIXTURE_DETAIL.core,
    questions: {
      round: 0,
      items: [
        {
          field: 'position',
          question: 'На чьей вы стороне?',
          suggested: 'Я выбираю договорённость с клиентом',
          options: [],
        },
      ],
      answered: [],
    },
  },
};

/* -------------------------------------------------------------------------
 * Сеть: ответы дверей и поток строк
 * ---------------------------------------------------------------------- */

/** Тело ответа, отдающее строки кусками — так, как их отдаёт сеть. */
const streamOf = (events, { chunkSize = 40 } = {}) => {
  const text = events.map((event) => `${JSON.stringify(event)}\n`).join('');
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (at >= bytes.length) return { done: true, value: undefined };
        const slice = bytes.slice(at, at + chunkSize);
        at += chunkSize;
        return { done: false, value: slice };
      },
    }),
  };
};

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const refused = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
  clone() {
    return this;
  },
});

/*
  Тело собирается заново на каждый ход: поток читается один раз, и второй ход,
  которому подсунули вычерпанное тело, увидел бы пустой ответ — а набор
  проверял бы свою же ошибку.
*/
const streamed = (events, options) => () => ({
  ok: true,
  status: 200,
  body: streamOf(events, options),
  json: async () => ({}),
  clone() {
    return this;
  },
});

let calls = [];
let adaptBodies = [];
let detailReads = 0;

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const call = {
      url,
      method,
      body: init.body ? JSON.parse(init.body) : undefined,
      signal: init.signal,
    };
    calls.push(call);
    const answer = table[`${method} ${url}`] ?? (String(url).endsWith('/writing-profile') ? ok({ profile: {} }) : undefined);
    if (!answer) throw new Error(`no stub for ${method} ${url}`);
    return typeof answer === 'function' ? answer(call) : answer;
  };
};

/** Дверь заготовки: считает перечитывания и умеет отвечать по-разному. */
const detailDoor = (...responses) => {
  detailReads = 0;
  return () => {
    const answer = responses[Math.min(detailReads, responses.length - 1)];
    detailReads += 1;
    return typeof answer === 'function' ? answer() : answer;
  };
};

/** Дверь адаптации: отвечает по очереди подготовленными стримами. */
const adaptDoor = (...runs) => {
  adaptBodies = [];
  let at = 0;
  return (call) => {
    adaptBodies.push(call.body);
    const run = runs[Math.min(at, runs.length - 1)];
    at += 1;
    return typeof run === 'function' ? run(call) : run;
  };
};

const table = ({ detail, adapt, archive, answer }) => ({
  'GET /integrations/list': ok({ integrations: [] }),
  [`GET ${avatarRoutes.list}`]: ok({ avatars: [] }),
  'GET /posts/find-slot/int-tg-main': ok({ date: '2026-10-01T09:00:00' }),
  [`GET ${DETAIL_URL}`]: detail ?? detailDoor(ok(fixture.PIECE_FIXTURE_DETAIL)),
  [`POST ${ADAPT_URL}`]: adapt ?? adaptDoor(streamed(fixture.PIECE_FIXTURE_ADAPT_STREAM)),
  ...(archive ? { [`POST ${ARCHIVE_URL}`]: archive } : {}),
  ...(answer ? { [`POST ${ANSWER_URL}`]: answer } : {}),
});

/* -------------------------------------------------------------------------
 * Экран
 * ---------------------------------------------------------------------- */

const panel = () => document.querySelector('[data-content-panel="piece"]');

/** Прокрутить очередь, пока условие не выполнится. */
const settle = async (until = () => true) => {
  for (let tick = 0; tick < 60; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (until()) return;
  }
};

const click = async (element, until) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle(until ?? (() => true));
};

const open = async (props = {}) => {
  const view = render(
    React.createElement(
      SWRConfig,
      { value: { provider: () => new Map(), dedupingInterval: 0 } },
      React.createElement(
        userContext.UserContext.Provider,
        { value: { role: 'ADMIN' } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru' },
          React.createElement(container.PieceContainer, { pieceId: PIECE_ID, ...props })
        )
      )
    )
  );
  await settle(
    () => panel() !== null && panel().getAttribute('data-piece-state') !== 'loading'
  );
  return view;
};

/** «Адаптировать» в строке «Куда дальше» и дождаться конца хода. */
/*
  «Адаптировать · …» в «Куда дальше» открывает вкладку и ничего не пишет
  (`97dq.78`); текст пишет главная кнопка вкладки.
*/
const openAdaptTab = async (name = 'Telegram · Мой канал') => {
  await click(screen.getByRole('button', { name: `Адаптировать · ${name}` }));
};

const adaptTo = async (name = 'Telegram · Мой канал') => {
  await openAdaptTab(name);
  await click(
    document.querySelector('[data-piece-adapt]'),
    () => panel().getAttribute('aria-busy') !== 'true'
  );
};

const wait = (ms) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/*
  Заготовка, где у главного Telegram-канала ещё нет текста: адаптация туда
  начинается из «Куда дальше». Остальные каналы — как в фикстуре.
*/
const WITHOUT_TG = {
  ...fixture.PIECE_FIXTURE_DETAIL,
  adaptations: fixture.PIECE_FIXTURE_DETAIL.adaptations.filter(
    (one) => one.integrationId !== 'int-tg-main'
  ),
};

/* Та же заготовка, где у Telegram — черновик: рабочее место канала. */
const WITH_DRAFT = {
  ...fixture.PIECE_FIXTURE_DETAIL,
  adaptations: fixture.PIECE_FIXTURE_DETAIL.adaptations.map((one) =>
    one.id === 'adaptation-12-tg'
      ? { ...one, state: 'draft', date: null, url: null }
      : one
  ),
};
const TG_DRAFT_ID = 'adaptation-12-tg';

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

afterEach(() => {
  cleanup();
  delete global.fetch;
  opened.length = 0;
  window.history.replaceState(null, '', '/');
});

/* ---------------------------------------------------------------------- */

describe('the tab lives in the address', () => {
  test('«Суть» by default; a tab from the address opens that channel', async () => {
    serve(table({ detail: detailDoor(ok(WITH_DRAFT)) }));
    await open({ initialTab: 'int-tg-main' });
    expect(panel().getAttribute('data-piece-tab')).toBe('int-tg-main');
    expect(document.querySelector('[data-adaptation-editor]')).not.toBeNull();

    await click(screen.getByRole('tab', { name: 'Суть' }));
    expect(panel().getAttribute('data-piece-tab')).toBe('core');
    expect(window.location.pathname).toBe(`/content/pieces/${PIECE_ID}`);
    expect(window.location.search).toBe('');

    await click(screen.getByRole('tab', { name: /ВКонтакте · Студия/ }));
    expect(window.location.search).toBe('?tab=int-vk');
  });

  test('the old `?adapt=<platform>` opens the first channel of that platform', async () => {
    serve(table({}));
    await open({ adaptPlatform: 'vk' });
    await settle(() => panel().getAttribute('data-piece-tab') === 'int-vk');
    expect(panel().getAttribute('data-piece-tab')).toBe('int-vk');
    expect(window.location.search).toBe('?tab=int-vk');
  });
});

describe('the short road: started, written, done', () => {
  test('the «Адаптировать · …» cell opens the tab and writes nothing; the post settings are open (97dq.78)', async () => {
    serve(table({ detail: detailDoor(ok(WITHOUT_TG)) }));
    await open();
    await openAdaptTab();
    expect(panel().getAttribute('data-piece-tab')).toBe('int-tg-main');
    expect(adaptBodies).toEqual([]);
    const primary = document.querySelector('[data-post-options-rewrite="adapt"]');
    expect(primary).not.toBeNull();
    expect(primary.textContent).toBe('Адаптировать');
    expect(primary.disabled).toBe(false);
    await click(primary, () => panel().getAttribute('aria-busy') !== 'true');
    expect(adaptBodies).toEqual([{ integrationId: 'int-tg-main', kind: 'post' }]);
  });

  test('the draft is shown in its channel tab and the piece is read again', async () => {
    serve(table({ detail: detailDoor(ok(WITHOUT_TG)) }));
    await open();
    expect(detailReads).toBe(1);

    await adaptTo();

    // Вкладка канала открыта, черновик — тот текст, что приехал событием.
    expect(panel().getAttribute('data-piece-tab')).toBe('int-tg-main');
    const draft = document.querySelector('[data-intake-draft]');
    expect(draft).not.toBeNull();
    expect(draft.textContent).toContain(
      fixture.PIECE_FIXTURE_ADAPTATIONS[0].body.slice(0, 24)
    );
    expect(detailReads).toBe(2);
    // Тело — то, что собирает контракт: без «Для этого поста» переопределений нет.
    expect(adaptBodies).toEqual([{ integrationId: 'int-tg-main', kind: 'post' }]);
    // И ни одного окна: ни поста, ни чего-то ещё.
    expect(opened).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * Строка качества: одна строка под текстом (решение владельца 07.09.2026).
 * ---------------------------------------------------------------------- */

/** Отчёт о штампах с заданными находками. */
const slopFound = (...excerpts) => ({
  version: 'slop-check/1.0.0',
  platform: 'core',
  locale: 'ru',
  truncated: false,
  verdict: 'review',
  findings: excerpts.map((excerpt, index) => ({
    ruleId: `rule-${index}`,
    severity: 'warn',
    start: index * 10,
    end: index * 10 + excerpt.length,
    excerpt,
    hint: { ru: 'Так пишет модель.', en: 'Model phrasing.' },
  })),
});

const qualitySegment = (name) =>
  document.querySelector(`[data-quality-segment="${name}"]`);

describe('строка качества под сутью и под адаптацией', () => {
  test('чистая суть не получает ни строки', async () => {
    serve(table({}));
    await open();
    expect(document.querySelector('[data-quality-line]')).toBeNull();
    expect(document.body.textContent).not.toContain('находок нет');
  });

  test('находки и недостающее своё число названы словом каждое', async () => {
    serve(
      table({
        detail: detailDoor(
          ok({
            ...fixture.PIECE_FIXTURE_DETAIL,
            core: {
              ...fixture.PIECE_FIXTURE_DETAIL.core,
              slop: slopFound('в современном мире', 'не секрет, что'),
              authorNumbers: false,
            },
          })
        ),
      })
    );
    await open();

    expect(qualitySegment('slop').textContent).toBe('Штампов: 2');
    expect(qualitySegment('gaps').textContent).toBe('Своих чисел нет');
    expect(document.querySelector('[data-slop-finding]')).toBeNull();
    await click(qualitySegment('slop'));
    expect(document.querySelectorAll('[data-slop-finding]').length).toBe(2);
  });

  test('проверки адаптации приезжают её событием и стоят под её текстом', async () => {
    const stream = fixture.PIECE_FIXTURE_ADAPT_STREAM.map((event) =>
      event.name === 'adaptation'
        ? {
            ...event,
            draftGaps: [
              { metric: 'carriesOwnMeasurement', authorShare: 54, authorOf: 153, example: null },
            ],
            checks: {
              antiCopy: {
                minWords: 8,
                retried: false,
                clean: false,
                runs: [{ text: 'слово в слово из источника', start: 0, end: 26 }],
              },
              slop: slopFound('в современном мире'),
              voice: { verdict: 'FAR' },
            },
          }
        : event
    );
    serve(
      table({
        detail: detailDoor(ok(WITHOUT_TG)),
        adapt: adaptDoor(streamed(stream)),
      })
    );
    await open();
    await adaptTo();

    expect(qualitySegment('slop').textContent).toBe('Штампов: 1');
    expect(qualitySegment('anti-copy').textContent).toBe('Чужих фраз: 1');
    expect(qualitySegment('voice').textContent).toBe('Не похоже на вас');
    expect(qualitySegment('gaps').textContent).toBe('Своих чисел нет');
    expect(screen.queryByRole('button', { name: 'Проверить на штампы' })).toBeNull();
  });
});

describe('questions are the whole answer of that run', () => {
  test('the card stands in the channel tab, and the answers go out in a second request', async () => {
    serve(
      table({
        detail: detailDoor(ok(WITHOUT_TG)),
        adapt: adaptDoor(
          streamed(fixture.PIECE_FIXTURE_ADAPT_QUESTIONS_STREAM),
          streamed(fixture.PIECE_FIXTURE_ADAPT_STREAM)
        ),
      })
    );
    await open();
    await adaptTo();

    const card = document.querySelector(
      '[data-piece-channel-questions="int-tg-main"] [data-piece-questions="true"]'
    );
    expect(card).not.toBeNull();
    expect(card.querySelectorAll('[data-piece-question]')).toHaveLength(
      fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS.length
    );
    expect(document.querySelector('[data-piece-draft-id]')).toBeNull();
    // Кнопки «Адаптировать для …» нет, пока открыт вопрос.
    expect(screen.queryByRole('button', { name: /Адаптировать для/ })).toBeNull();

    await click(
      within(card.querySelector('[data-piece-question="hook"]')).getByRole('radio', {
        name: 'Так и есть',
      })
    );
    await click(
      within(card.querySelector('[data-piece-question="cta"]')).getByRole('radio', {
        name: fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS[1].options[1],
      })
    );
    await click(within(card).getByRole('button', { name: 'Дальше' }), () =>
      adaptBodies.length === 2 ? panel().getAttribute('aria-busy') !== 'true' : false
    );

    expect(adaptBodies).toHaveLength(2);
    expect(adaptBodies[0].answers).toBeUndefined();
    expect(adaptBodies[1].answers).toEqual([
      {
        key: 'hook',
        text: fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS[0].suggested,
        origin: 'confirmed',
      },
      { key: 'cta', text: fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS[1].options[1], origin: 'confirmed' },
    ]);
    expect(adaptBodies[1].integrationId).toBe('int-tg-main');
    expect(adaptBodies[1].kind).toBe('post');
  });

  test('«Решите всё за меня» carries skipInterview, not empty answers', async () => {
    serve(
      table({
        detail: detailDoor(ok(WITHOUT_TG)),
        adapt: adaptDoor(
          streamed(fixture.PIECE_FIXTURE_ADAPT_QUESTIONS_STREAM),
          streamed(fixture.PIECE_FIXTURE_ADAPT_STREAM)
        ),
      })
    );
    await open();
    await adaptTo();

    await click(
      screen.getByRole('button', { name: 'Решите всё за меня' }),
      () => adaptBodies.length === 2
    );

    expect(adaptBodies[1]).toEqual({
      integrationId: 'int-tg-main',
      kind: 'post',
      skipInterview: true,
    });
  });
});

describe('a refusal is printed in the words the server sent', () => {
  test('the last line of the stream becomes the failure on the screen', async () => {
    serve(
      table({
        detail: detailDoor(ok(WITHOUT_TG)),
        adapt: adaptDoor(streamed(fixture.PIECE_FIXTURE_ADAPT_ERROR_STREAM)),
      })
    );
    await open();
    await adaptTo();

    expect(panel().getAttribute('data-piece-state')).toBe('error');
    const refusal = fixture.PIECE_FIXTURE_ADAPT_ERROR_STREAM.find(
      (event) => event.name === 'error'
    );
    expect(document.body.textContent).toContain(refusal.message);
    expect(document.querySelector('[data-piece-draft-id]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * Рабочее место канала: правка, расписание, удаление, «Для этого поста»
 * ---------------------------------------------------------------------- */

const ADAPTATION_URL = adapter.PIECES_API.adaptation(PIECE_ID, TG_DRAFT_ID);
const SCHEDULE_URL = adapter.PIECES_API.schedule(PIECE_ID, TG_DRAFT_ID);
const SETTINGS_URL = adapter.PIECES_API.postSettings(PIECE_ID, 'int-tg-main');

const workspace = async (extra = {}) => {
  serve({
    ...table({ detail: detailDoor(ok(WITH_DRAFT)) }),
    [`PATCH ${ADAPTATION_URL}`]: (call) =>
      ok({
        adaptation: {
          ...WITH_DRAFT.adaptations[0],
          ...(call.body.body ? { body: call.body.body } : {}),
        },
      }),
    [`POST ${SCHEDULE_URL}`]: ok({
      adaptation: { ...WITH_DRAFT.adaptations[0], state: 'queued' },
    }),
    // Настройки поста (`97dq.70`): дверь отвечает тем, что сохранила.
    [`PUT ${SETTINGS_URL}`]: (call) =>
      ok({
        settings: {
          options: { ...adapter.DEFAULT_POST_OPTIONS, ...(call.body.options ?? {}) },
          planMode: call.body.planMode ?? null,
          savedAt: '2026-09-24T07:05:00.000Z',
          textChangedAt: null,
        },
        adaptation: null,
      }),
    'PUT /integrations/int-tg-main/plan-mode': ok({ planMode: 'reserve' }),
    ...extra,
  });
  await open({ initialTab: 'int-tg-main' });
};

describe('the channel workspace talks to its own doors', () => {
  test('a hand edit is saved by PATCH after a pause, and nothing opens a window', async () => {
    await workspace();
    // `97dq.46`: правят в «Редактировать» — поле TipTap, а наверх и в PATCH
    // уходит хранимая форма с `**жирным**`.
    await click(screen.getByRole('button', { name: 'Редактировать' }), () =>
      document.querySelector('[data-editor-field="true"]') !== null
    );
    const field = screen.getByRole('textbox', { name: 'Текст поста для Telegram' });
    await act(async () => {
      field.editor.commands.setContent(
        '<p>Поправленный <strong>текст</strong>.</p>'
      );
    });
    // Тишина ещё не наступила — запроса нет.
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    await wait(900);
    await settle(() => calls.some((call) => call.method === 'PATCH'));
    const patched = calls.filter((call) => call.method === 'PATCH');
    expect(patched).toHaveLength(1);
    expect(patched[0].url).toBe(ADAPTATION_URL);
    expect(patched[0].body).toEqual({ body: 'Поправленный **текст**.' });
    await settle(
      () => document.querySelector('[data-autosave="saved"]') !== null
    );
    expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull();
    expect(opened).toEqual([]);
  });

  test('«Запланировать» sends the chosen moment through the schedule door', async () => {
    await workspace();
    await settle(() => calls.some((call) => call.url.startsWith('/posts/find-slot')));
    await click(screen.getByRole('button', { name: 'Запланировать' }), () =>
      calls.some((call) => call.url === SCHEDULE_URL)
    );
    const sent = calls.filter((call) => call.url === SCHEDULE_URL);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('POST');
    // Время по умолчанию — ближайшее свободное, как его выбирает календарь.
    expect(sent[0].body).toEqual({ date: '2026-10-01T09:00:00.000Z' });
    await settle(() => document.body.textContent.includes('Пост в расписании.'));
    expect(document.body.textContent).toContain('Пост в расписании.');
    expect(opened).toEqual([]);
  });

  test('«Опубликовать сейчас» waits in the menu and sends `now`', async () => {
    await workspace();
    await click(screen.getByRole('button', { name: 'Другие способы отправить' }));
    await click(screen.getByRole('menuitem', { name: /Опубликовать сейчас/ }), () =>
      calls.some((call) => call.url === SCHEDULE_URL)
    );
    expect(calls.find((call) => call.url === SCHEDULE_URL).body).toEqual({ now: true });
  });

  test('a refusal of the schedule door is printed in its words', async () => {
    await workspace({
      [`POST ${SCHEDULE_URL}`]: refused(422, {
        code: 'ADAPTATION_SCHEDULE_INVALID',
        message: 'Текст длиннее, чем примет «Мой канал».',
        subject: 'telegram',
      }),
    });
    await click(screen.getByRole('button', { name: 'Запланировать' }), () =>
      document.body.textContent.includes('Текст длиннее')
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'Текст длиннее, чем примет «Мой канал».'
    );
  });

  test('the adaptation is deleted on the second press only', async () => {
    const DELETE_URL = adapter.PIECES_API.deleteAdaptation(PIECE_ID, TG_DRAFT_ID);
    await workspace({ [`DELETE ${DELETE_URL}`]: ok({ deleted: true }) });
    const button = document.querySelector('[data-piece-delete-adaptation="true"]');
    await click(button);
    expect(button.getAttribute('data-confirm-armed')).toBe('true');
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(0);
    await click(button, () => calls.some((call) => call.method === 'DELETE'));
    const asked = calls.filter((call) => call.method === 'DELETE');
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe(DELETE_URL);
  });

  test('«Снять с расписания» asks its own door for a queued post', async () => {
    const UNSCHEDULE_URL = adapter.PIECES_API.unschedule(PIECE_ID, 'adaptation-12-vk');
    serve({
      ...table({}),
      [`POST ${UNSCHEDULE_URL}`]: ok({
        adaptation: { ...fixture.PIECE_FIXTURE_ADAPTATIONS[1], state: 'draft' },
      }),
    });
    await open({ initialTab: 'int-vk' });
    // Слот этого поста уже прошёл (`97dq.80`): поля правки нет.
    expect(document.querySelector('[data-adaptation-editor]')).toBeNull();
    // В очереди — «Изменить время», остальное в меню (`97dq.70`).
    expect(screen.getByRole('button', { name: 'Изменить время' })).toBeTruthy();
    await click(
      screen.getByRole('button', { name: 'Другие действия с постом в очереди' })
    );
    expect(screen.getByRole('menuitem', { name: /Открыть в календаре/ })).toBeTruthy();
    await click(screen.getByRole('menuitem', { name: /Снять с расписания/ }), () =>
      calls.some((call) => call.url === UNSCHEDULE_URL)
    );
    expect(calls.filter((call) => call.url === UNSCHEDULE_URL)[0].method).toBe('POST');
  });

  test('«Для этого поста» travels as overrides and «Переписать по настройкам» makes a new version', async () => {
    await workspace();
    // Панель раскрыта всегда (97dq.48): «Изменить» больше нет.
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Переписать по настройкам' }).disabled
    ).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Длина'), {
        target: { value: 'short' },
      });
      fireEvent.change(screen.getByLabelText('Призыв'), {
        target: { value: 'none' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Пожелание' }), {
        target: { value: 'начни с вопроса' },
      });
    });
    expect(document.body.textContent).toContain('3 изменения');
    await click(screen.getByRole('button', { name: 'Переписать по настройкам' }), () =>
      adaptBodies.length === 1 && panel().getAttribute('aria-busy') !== 'true'
    );
    // Длина — теми же числами, что пишет карточка канала.
    expect(adaptBodies[0]).toEqual({
      integrationId: 'int-tg-main',
      kind: 'post',
      overrides: {
        lengthPolicy: 'range',
        lengthRange: { idealMin: 200, idealMax: 500, hardMax: 500 },
        ctaKind: 'none',
        wish: 'начни с вопроса',
      },
    });
  });

  test('«Сохранить для канала» writes the choice into the channel profile', async () => {
    // Дверь профиля канала отвечает заглушкой набора на любой метод.
    await workspace();
    const profileCall = calls.find((call) => call.url.endsWith('/writing-profile'));
    expect(profileCall).toBeTruthy();
    await act(async () => {
      // Бегунок «до N» (`97dq.61`): деление 0 — «нет».
      fireEvent.change(screen.getByLabelText('Эмодзи'), {
        target: { value: '0' },
      });
    });
    await click(screen.getByRole('button', { name: 'Где ещё сохранить' }));
    await click(screen.getByRole('menuitem', { name: /Сохранить для канала/ }), () =>
      calls.some((call) => call.method === 'PUT' && call.url === profileCall.url)
    );
    const put = calls.find((call) => call.method === 'PUT' && call.url === profileCall.url);
    expect(put.body.emojiLevel).toBe('none');
    // «на ты / на вы» ушло из продукта (97dq.45): в карточку оно не пишется.
    expect(put.body).not.toHaveProperty('addressForm');
    await settle(() => document.body.textContent.includes('Сохранено для канала'));
    expect(document.body.textContent).toContain('Сохранено для канала');
    // Пост снова «как в канале»: его переопределения ушли в канал.
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    expect(calls.find((call) => call.url === SETTINGS_URL).body.options.emoji).toBe('channel');
  });

  test('a post setting saves itself as the post override, «Сохранено · ЧЧ:ММ» (97dq.70)', async () => {
    await workspace();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Длина'), { target: { value: 'short' } });
    });
    expect(calls.some((call) => call.url === SETTINGS_URL)).toBe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    const put = calls.find((call) => call.url === SETTINGS_URL);
    expect(put.method).toBe('PUT');
    expect(put.body.options.length).toBe('short');
    expect(put.body).not.toHaveProperty('planMode');
    await settle(() =>
      /Сохранено · \d\d:\d\d/.test(
        document.querySelector('[data-post-options-saved]').textContent
      )
    );
    // Текст написан раньше, чем поменялась длина.
    expect(document.querySelector('[data-post-options-pending]').textContent).toBe(
      'применится при переписывании'
    );
  });

  test('a plan change takes the pending options with it, in one request (review 97dq.70)', async () => {
    await workspace();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Длина'), { target: { value: 'short' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'autopilot' } });
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    // Тишина автосейва прошла — второго запроса с полями нет.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    const puts = calls.filter((call) => call.url === SETTINGS_URL);
    expect(puts).toHaveLength(1);
    expect(puts[0].body.planMode).toBe('autopilot');
    expect(puts[0].body.options.length).toBe('short');
  });

  test('the plan select waits for the answer before the next choice (review 97dq.70)', async () => {
    let answer;
    await workspace({
      [`PUT ${SETTINGS_URL}`]: () =>
        new Promise((resolve) => {
          answer = () =>
            resolve(ok({ settings: null, adaptation: null }));
        }),
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'autopilot' } });
    });
    await settle(() => typeof answer === 'function');
    expect(screen.getByLabelText('План').disabled).toBe(true);
    await act(async () => answer());
    await settle(() => !screen.getByLabelText('План').disabled);
    expect(screen.getByLabelText('План').disabled).toBe(false);
  });

  test('leaving the page sends the settings edit that was still waiting (review 97dq.70)', async () => {
    await workspace();
    const view = document.body;
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Призыв'), { target: { value: 'none' } });
    });
    expect(calls.some((call) => call.url === SETTINGS_URL)).toBe(false);
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const put = calls.find((call) => call.url === SETTINGS_URL);
    expect(put).toBeTruthy();
    expect(put.method).toBe('PUT');
    expect(put.body.options.cta).toBe('none');
    expect(view.querySelector('[data-post-options]')).toBeNull();
  });

  test('a failed plan save keeps the options it carried: they go out on leaving (second review, item 6)', async () => {
    await workspace({
      [`PUT ${SETTINGS_URL}`]: (call) =>
        call.body.planMode !== undefined
          ? refused(500, { message: 'не сохранилось' })
          : ok({ settings: null, adaptation: null }),
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Длина'), { target: { value: 'short' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'autopilot' } });
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    const failed = calls.filter((call) => call.url === SETTINGS_URL);
    expect(failed).toHaveLength(1);
    expect(failed[0].body).toMatchObject({ planMode: 'autopilot', options: { length: 'short' } });
    await settle(() => !screen.getByLabelText('План').disabled);
    // The length is still waiting, not dropped with the refused request.
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const flushed = calls.filter((call) => call.url === SETTINGS_URL).slice(1);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].body).not.toHaveProperty('planMode');
    expect(flushed[0].body.options.length).toBe('short');
  });

  test('the post «План» goes to its door at once and the page is read again (97dq.70)', async () => {
    await workspace();
    const reads = detailReads;
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'autopilot' } });
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    expect(calls.find((call) => call.url === SETTINGS_URL).body).toEqual({
      planMode: 'autopilot',
    });
    await settle(() => detailReads > reads);
    expect(detailReads).toBeGreaterThan(reads);
    // «Как пишем в …» со вкладки больше не открывается.
    expect(document.querySelector('[data-piece-channel-profile]')).toBeNull();
  });

  /*
    `content-factory-next-97dq.86`: prod 24.09.2026 — the channel was on
    «Автопилот», the post after «Бронь» kept `planMode: null` («как в
    канале») and stayed in the queue. The field sends `null` when the choice
    equals the channel mode the page shows; the page may show a mode the
    channel no longer has, so the container reads it again.
  */
  const OWN_AUTOPILOT = {
    ...WITH_DRAFT,
    channels: [
      {
        integrationId: 'int-tg-main',
        name: 'Основной канал',
        providerIdentifier: 'telegram',
        maxLength: 4096,
        cell: { platform: 'telegram', state: 'draft' },
        adaptationIds: [TG_DRAFT_ID],
        // What the page shows: a stale «Бронь».
        planMode: 'reserve',
        settings: {
          options: adapter.DEFAULT_POST_OPTIONS,
          planMode: 'autopilot',
          savedAt: '2026-09-24T07:00:00.000Z',
          textChangedAt: null,
        },
      },
    ],
  };
  const PLAN_MODE_URL = '/integrations/int-tg-main/plan-mode';
  /*
    Review W1 of the fifteenth walk, F10: the page no longer reads the
    channel mode before saving. It sends the mode it showed with «как в
    канале», and the server decides under the channel lock; the field then
    shows what the server stored.
  */
  const ownAutopilotWorkspace = async (stored) => {
    await workspace({
      [`GET ${DETAIL_URL}`]: detailDoor(ok(OWN_AUTOPILOT)),
      [`PUT ${SETTINGS_URL}`]: () =>
        ok({
          settings: {
            options: adapter.DEFAULT_POST_OPTIONS,
            planMode: stored,
            savedAt: '2026-09-24T07:05:00.000Z',
            textChangedAt: null,
          },
          adaptation: null,
        }),
    });
    await settle(() => screen.getByLabelText('План').value === 'autopilot');
  };

  test('«Бронь» shown as the channel mode goes out with the mode the person saw; no read before the save (97dq.86, F10)', async () => {
    await ownAutopilotWorkspace('reserve');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'reserve' } });
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    expect(calls.some((call) => call.method === 'GET' && call.url === PLAN_MODE_URL)).toBe(false);
    expect(calls.find((call) => call.url === SETTINGS_URL).body).toEqual({
      planMode: null,
      expectedChannelMode: 'reserve',
    });
  });

  test('the field keeps what the server stored: an explicit «Бронь» when the channel had moved on (97dq.86, F10)', async () => {
    await ownAutopilotWorkspace('reserve');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('План'), { target: { value: 'reserve' } });
    });
    await settle(() => calls.some((call) => call.url === SETTINGS_URL));
    await settle(() => screen.getByLabelText('План').value === 'reserve');
    expect(screen.getByLabelText('План').value).toBe('reserve');
  });

  test('the action row of the adaptation is visible, with no «Ещё» menu', async () => {
    await workspace();
    const row = document.querySelector('[data-adaptation-review="adaptation-12-tg"]');
    expect(row).not.toBeNull();
    expect(
      Array.from(row.querySelectorAll('[data-review-action]')).map((node) =>
        node.getAttribute('data-review-action')
      )
    ).toEqual(['slop', 'checkFacts', 'rewrite']);
    const core = async () => {
      await click(screen.getByRole('tab', { name: 'Суть' }));
      return document.querySelector('[data-adaptation-review="core"]');
    };
    const coreRow = await core();
    expect(
      Array.from(coreRow.querySelectorAll('[data-review-action]')).map((node) =>
        node.getAttribute('data-review-action')
      )
    ).toEqual(['research', 'checkFacts', 'rewrite']);
  });
});

describe('уточнение стоит там, где стоит суть', () => {
  /*
    Given/When/Then живого прогона 07.09.2026: заготовка уже записана, вопрос
    приехал в её брифе; человек отвечает — суть переписывается, и повторного
    «на что это опирается» не бывает.
  */
  test('the model question is drawn before the substance', async () => {
    serve(table({ detail: detailDoor(ok(ASKED_DETAIL)) }));
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    expect(card).not.toBeNull();
    const core = document.querySelector('[data-piece-core]');
    expect(card.compareDocumentPosition(core) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).toContain('На чьей вы стороне?');
    // Заготовка уже сохранена, и карточка говорит это словами.
    expect(card.textContent).toContain('Мы спросили по вашему тексту');
  });

  /*
    Десятый заход 22.09.2026 (`content-factory-next-97dq.25`): пока сути нет,
    вопрос задан по тексту, которого перед глазами нет. Теперь присланное стоит
    на месте сути — чужой пост под своей подписью, своя мысль под своей, — а
    как только суть написана, показывается она сама.
  */
  test('while the core is empty, the sent text stands in its place', async () => {
    const foreign = {
      ...ASKED_DETAIL,
      core: {
        ...ASKED_DETAIL.core,
        text: '',
        brief: { ...ASKED_DETAIL.core.brief, inputKind: 'foreign_post' },
        sourceText: 'Маркетплейсы снова подняли комиссии, и продавцы опять пишут, что работать стало невыгодно.',
      },
    };
    serve(table({ detail: detailDoor(ok(foreign)) }));
    await open();

    const sent = document.querySelector('[data-piece-sent-text]');
    expect(sent).not.toBeNull();
    expect(sent.getAttribute('data-piece-sent-text')).toBe('source');
    expect(sent.textContent).toContain('Маркетплейсы снова подняли комиссии');
    // Свёрнуто под «Что вы прислали» с видом входа (`97dq.41`).
    const toggle = screen.getByRole('button', { name: /Что вы прислали/ });
    expect(toggle.textContent).toContain('чужой пост');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Текст стоит над вопросами: с двумя вопросами карточка выше экрана, и
    // текст под ней уходил за сгиб (стенд 22.09.2026, s2-page.png).
    const card = document.querySelector('[data-piece-clarify="true"]');
    expect(sent.compareDocumentPosition(card) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('a thought shows the person’s own words, and they stay after the core is written', async () => {
    const thought = {
      ...ASKED_DETAIL,
      core: { ...ASKED_DETAIL.core, text: '', personText: 'Мы сократили неделю до четырёх дней.' },
    };
    serve(table({ detail: detailDoor(ok(thought)) }));
    await open();
    const sent = document.querySelector('[data-piece-sent-text]');
    expect(sent.getAttribute('data-piece-sent-text')).toBe('person');
    expect(sent.textContent).toContain('Мы сократили неделю до четырёх дней.');
    expect(
      screen.getByRole('button', { name: /Что вы прислали/ }).textContent
    ).toContain('свой текст');
    cleanup();

    const written = {
      ...ASKED_DETAIL,
      core: { ...ASKED_DETAIL.core, personText: 'Мы сократили неделю до четырёх дней.' },
    };
    serve(table({ detail: detailDoor(ok(written)) }));
    await open();
    // Присланное хранится «как есть, до правок» и после сути (`97dq.41`).
    expect(
      document.querySelector('[data-piece-sent-text="person"]').textContent
    ).toBe('Мы сократили неделю до четырёх дней.');
  });

  /** Задание (`97dq.29`): над вопросами стоит само задание, свёрнутым. */
  test('an instruction without a core shows «Ваше задание» above the questions', async () => {
    const instructed = {
      ...ASKED_DETAIL,
      core: {
        ...ASKED_DETAIL.core,
        text: '',
        personText: '',
        instructionText: 'Хочу пост о том, что я выступил на радио. Сохранить https://t.me/radiosputnik_khv/20430',
        keepLinks: ['https://t.me/radiosputnik_khv/20430'],
      },
    };
    serve(table({ detail: detailDoor(ok(instructed)) }));
    await open();
    const sent = document.querySelector('[data-piece-sent-text]');
    expect(sent.getAttribute('data-piece-sent-text')).toBe('instruction');
    expect(
      screen.getByRole('button', { name: /Что вы прислали/ }).textContent
    ).toContain('задание');
    expect(sent.textContent).toContain('Хочу пост о том, что я выступил на радио.');
  });

  test('an answer travels by field, and the piece is read again', async () => {
    const answered = [];
    serve(
      table({
        detail: detailDoor(ok(ASKED_DETAIL), ok(fixture.PIECE_FIXTURE_DETAIL)),
        answer: (call) => {
          answered.push(call.body);
          return streamed([
            {
              name: 'answer-started',
              pieceId: PIECE_ID,
              round: 1,
            },
            {
              name: 'piece',
              pieceId: PIECE_ID,
              code: 'cnt-12',
              core: fixture.PIECE_FIXTURE_DETAIL.core,
              previousBody: 'Предыдущая суть.',
            },
            { name: 'done', pieceId: PIECE_ID },
          ])();
        },
      })
    );
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    await click(
      within(card.querySelector('[data-piece-question="position"]')).getByRole(
        'radio',
        { name: 'Поправить' }
      )
    );
    const field = document.querySelector('[name="piece-answer-position"]');
    expect(field).not.toBeNull();
    await act(async () => {
      fireEvent.change(field, {
        target: { value: 'из шести дедлайнов сдивнулись пять, я считал' },
      });
    });
    await click(within(card).getByRole('button', { name: 'Дальше' }), () =>
      answered.length > 0
    );

    // Ответ опознан полем брифа и доехал дословно, с опечаткой.
    expect(answered).toEqual([
      {
        answers: [
          {
            field: 'position',
            text: 'из шести дедлайнов сдивнулись пять, я считал',
          },
        ],
      },
    ]);
    // Дверь ответила без вопросов — карточка ушла, и второго круга нет.
    await settle(
      () => document.querySelector('[data-piece-clarify="true"]') === null
    );
    expect(document.querySelector('[data-piece-clarify="true"]')).toBeNull();
    expect(detailReads).toBe(2);
    expect(document.querySelector('[data-core-answer="changed"]')).not.toBeNull();
    expect(document.querySelector('[data-piece-core] mark')).not.toBeNull();
  });

  test('«Реши сама» hands the field over and asks nothing again', async () => {
    const answered = [];
    serve(
      table({
        detail: detailDoor(ok(ASKED_DETAIL), ok(fixture.PIECE_FIXTURE_DETAIL)),
        answer: (call) => {
          answered.push(call.body);
          return streamed([
            { name: 'answer-started', pieceId: PIECE_ID, round: 1 },
            {
              name: 'piece',
              pieceId: PIECE_ID,
              code: 'cnt-12',
              core: fixture.PIECE_FIXTURE_DETAIL.core,
              previousBody: fixture.PIECE_FIXTURE_DETAIL.core.text,
            },
            { name: 'done', pieceId: PIECE_ID },
          ])();
        },
      })
    );
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    await click(
      within(card.querySelector('[data-piece-question="position"]')).getByRole(
        'radio',
        { name: 'Решите за меня' }
      )
    );
    await click(within(card).getByRole('button', { name: 'Дальше' }), () =>
      answered.length > 0
    );

    expect(answered).toEqual([{ decide: ['position'] }]);
    await settle(() => document.querySelector('[data-core-answer="unchanged"]') !== null);
    expect(document.body.textContent).toContain('Суть не менялась, ответ сохранён');
  });

  test('single question has no duplicate bottom delegation action', async () => {
    serve(table({ detail: detailDoor(ok(ASKED_DETAIL)) }));
    await open();
    const card = document.querySelector('[data-piece-clarify="true"]');
    expect(within(card).getAllByRole('radio', { name: 'Решите за меня' })).toHaveLength(1);
    expect(within(card).queryByRole('button', { name: 'Решите всё за меня' })).toBeNull();
  });

  test('two questions delegate together through the answer door', async () => {
    const requests = [];
    const detail = {
      ...ASKED_DETAIL,
      core: {
        ...ASKED_DETAIL.core,
        questions: {
          ...ASKED_DETAIL.core.questions,
          items: [
            ...ASKED_DETAIL.core.questions.items,
            {
              field: 'thesis',
              question: 'Что вы хотите доказать?',
              suggested: 'Внешнее обещание держит срок',
              options: [],
            },
          ],
        },
      },
    };
    serve(table({ detail: detailDoor(ok(detail)), answer: (call) => { requests.push(call.body); return streamed([{ name: 'done', pieceId: 'piece-12' }])(); } }));
    await open();
    const card = document.querySelector('[data-piece-clarify="true"]');
    await click(within(card).getByRole('button', { name: 'Решите всё за меня' }));
    expect(requests).toHaveLength(1);
    expect(requests[0].decide).toEqual(['position', 'thesis']);
  });
});

describe('«В архив»', () => {
  test('the door of the contract is asked, and the piece is read again', async () => {
    const archived = {
      ...fixture.PIECE_FIXTURE_DETAIL,
      piece: {
        ...fixture.PIECE_FIXTURE_DETAIL.piece,
        archivedAt: '2026-09-07T10:00:00.000Z',
      },
    };
    serve(
      table({
        detail: detailDoor(ok(fixture.PIECE_FIXTURE_DETAIL), ok(archived)),
        archive: ok({ ok: true }),
      })
    );
    await open();

    const button = document.querySelector('[data-piece-archive="true"]');
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('В архив');

    await click(button, () => detailReads > 1);

    const asked = calls.filter((call) => call.url === ARCHIVE_URL);
    expect(asked).toHaveLength(1);
    expect(asked[0].method).toBe(routes.PIECE_ROUTES.archive.method);
    /*
      Тело обязательно. `PieceArchiveDto` требует `archived` и умолчания не
      имеет — намеренно, — а страница слала запрос без тела и получала 400 на
      живом прогоне 07.09.2026 (`content-factory-next-m2eg`).
    */
    expect(asked[0].body).toEqual({ archived: true });
    // Состояние приходит с перечитанной заготовки, а не из памяти о нажатии.
    expect(detailReads).toBe(2);
    await settle(() => document.body.textContent.includes('в архиве'));
    expect(document.body.textContent).toContain('в архиве');
    // И кнопки больше нет: в архив дважды не убирают.
    expect(document.querySelector('[data-piece-archive="true"]')).toBeNull();
  });

  test('a refused door is printed in the words the server sent', async () => {
    /*
      Слово сервера доходит как есть. Своей ветки под `PIECE_ARCHIVED` здесь
      больше нет: дверь архива не отказывает уже архивной заготовке — сервис
      знает только `PIECE_NOT_FOUND`, — и ветка на недостижимый код была
      подписью под отказом, которого не бывает.
    */
    serve(
      table({
        archive: refused(404, {
          code: 'PIECE_NOT_FOUND',
          message: 'Такой заготовки в рабочем пространстве нет.',
        }),
      })
    );
    await open();

    await click(document.querySelector('[data-piece-archive="true"]'), () =>
      document.body.textContent.includes('Такой заготовки')
    );

    expect(document.body.textContent).toContain(
      'Такой заготовки в рабочем пространстве нет.'
    );
    // Отказ не выдаёт заготовку за архивную: кнопка на месте.
    expect(document.querySelector('[data-piece-archive="true"]')).not.toBeNull();
  });
});

/** Удаление заготовки со страницы (`97dq.30`). */
describe('«Удалить»', () => {
  const DELETE_URL = adapter.PIECES_API.delete(PIECE_ID);

  test('the first press arms the button, the second asks the door and leaves for the list', async () => {
    navigations.length = 0;
    serve({ ...table({}), [`DELETE ${DELETE_URL}`]: ok({ deleted: true }) });
    await open();
    const button = document.querySelector('[data-piece-delete="true"]');
    expect(button.textContent).toContain('Удалить');
    expect(button.getAttribute('data-confirm-armed')).toBe('false');

    await click(button);
    expect(button.getAttribute('data-confirm-armed')).toBe('true');
    // Одно нажатие — ни одного запроса: подтверждение ещё не дано.
    expect(calls.filter((call) => call.url === DELETE_URL && call.method === 'DELETE')).toHaveLength(0);

    await click(button, () => navigations.length > 0);
    const asked = calls.filter((call) => call.url === DELETE_URL && call.method === routes.PIECE_ROUTES.delete.method);
    expect(asked).toHaveLength(1);
    expect(navigations).toHaveLength(1);
  });

  test('a refused door is printed and the page stays', async () => {
    navigations.length = 0;
    serve({
      ...table({}),
      [`DELETE ${DELETE_URL}`]: refused(404, {
        code: 'PIECE_NOT_FOUND',
        message: 'Такой заготовки в рабочем пространстве нет.',
      }),
    });
    await open();
    const button = document.querySelector('[data-piece-delete="true"]');
    await click(button);
    await click(button, () => document.body.textContent.includes('Такой заготовки'));
    expect(document.body.textContent).toContain('Такой заготовки в рабочем пространстве нет.');
    expect(navigations).toEqual([]);
    // Кнопка вернулась в покой: второй промах ничего не удалит.
    expect(document.querySelector('[data-piece-delete="true"]').getAttribute('data-confirm-armed')).toBe('false');
  });
});

/* ---- Review of 97dq.78–80: a queued post is saved on purpose -------------- */

describe('a queued post is saved only by «Сохранить в пост» (review 97dq.80)', () => {
  const slot = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  const withQueued = () => ({
    ...fixture.PIECE_FIXTURE_DETAIL,
    adaptations: fixture.PIECE_FIXTURE_DETAIL.adaptations.map((one) =>
      one.id === TG_DRAFT_ID ? { ...one, state: 'queued', date: slot(), url: null } : one
    ),
  });
  const queuedWorkspace = async (patch) => {
    const detail = withQueued();
    serve({
      ...table({ detail: detailDoor(ok(detail)) }),
      [`PATCH ${ADAPTATION_URL}`]: patch,
    });
    await open({ initialTab: 'int-tg-main' });
    await click(screen.getByRole('button', { name: 'Редактировать' }), () =>
      document.querySelector('[data-editor-field="true"]') !== null
    );
    const field = screen.getByRole('textbox', { name: 'Текст поста для Telegram' });
    await act(async () => {
      field.editor.commands.setContent('<p>Мы запуска</p>');
    });
  };
  const saveButton = () => document.querySelector('[data-queued-save]');

  test('no autosave into the live post: the PATCH goes only on the button (P2-2)', async () => {
    await queuedWorkspace((call) =>
      ok({ adaptation: { ...withQueued().adaptations[0], body: call.body.body } })
    );
    await wait(900);
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(0);
    expect(saveButton().textContent).toBe('Сохранить в пост');
    expect(saveButton().disabled).toBe(false);
    await click(saveButton(), () => calls.some((call) => call.method === 'PATCH'));
    const patched = calls.filter((call) => call.method === 'PATCH');
    expect(patched).toHaveLength(1);
    expect(patched[0].body).toEqual({ body: 'Мы запуска' });
  });

  test('a closing refusal forgets the refused text and offers no retry (P2-4)', async () => {
    await queuedWorkspace(() =>
      refused(409, {
        code: 'ADAPTATION_EDIT_CLOSED',
        message:
          'Пост уже уходит в канал или вышел — эту правку сохранить нельзя. В канале остаётся прежний текст.',
      })
    );
    await click(saveButton(), () => screen.queryByRole('alert') !== null);
    expect(screen.getByRole('alert').textContent).toContain('В канале остаётся прежний текст');
    expect(screen.queryByRole('button', { name: 'Попробовать снова' })).toBeNull();
    // Нечего сохранять: поле снова показывает то, что в посте.
    await settle(() => saveButton()?.disabled === true);
    expect(saveButton().disabled).toBe(true);
  });
});

describe('one save in flight per adaptation (review 97dq.80, P2-2)', () => {
  test('the second autosave waits for the first, so the server gets them in order', async () => {
    const releases = [];
    await workspace({
      [`PATCH ${ADAPTATION_URL}`]: (call) =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve(ok({ adaptation: { ...WITH_DRAFT.adaptations[0], body: call.body.body } }))
          );
        }),
    });
    await click(screen.getByRole('button', { name: 'Редактировать' }), () =>
      document.querySelector('[data-editor-field="true"]') !== null
    );
    const field = screen.getByRole('textbox', { name: 'Текст поста для Telegram' });
    await act(async () => {
      field.editor.commands.setContent('<p>Первая правка.</p>');
    });
    await wait(900);
    await settle(() => calls.some((call) => call.method === 'PATCH'));
    await act(async () => {
      field.editor.commands.setContent('<p>Вторая правка.</p>');
    });
    await wait(900);
    await settle();
    // Первая ещё в полёте — вторая не ушла.
    expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(1);
    await act(async () => {
      releases[0]();
    });
    await settle(() => calls.filter((call) => call.method === 'PATCH').length === 2);
    const patched = calls.filter((call) => call.method === 'PATCH');
    expect(patched.map((call) => call.body.body)).toEqual(['Первая правка.', 'Вторая правка.']);
    await act(async () => {
      releases[1]();
    });
    await settle(() => document.querySelector('[data-autosave="saved"]') !== null);
    expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull();
  });
});
