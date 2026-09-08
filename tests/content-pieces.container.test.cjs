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
 * Пять вещей, ради которых набор существует:
 *
 *  - короткий путь `adapt-started` → `adaptation` → `done` показывает черновик
 *    и перечитывает заготовку: список адаптаций обязан догнать написанное;
 *  - `questions` терминально — карточка показана, черновика нет, а ответ
 *    уходит вторым запросом и несёт `answers`; «Пропустить интервью» несёт
 *    `skipInterview`, а не пустые ответы;
 *  - `error` последней строкой печатается словами сервера, а не общим
 *    «что-то пошло не так»;
 *  - «В архив» шлёт `POST` в дверь контракта и перечитывает заготовку, вместо
 *    того чтобы рисовать «в архиве» по памяти о собственном нажатии;
 *  - когда площадка умеет несколько видов, в тело запроса уходит выбранный
 *    человеком вид, а не первый из списка.
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

/*
  Окно поста подменяется на уровне модуля модалок — тот же приём, что в
  `tests/content-intake.flow.test.cjs`: настоящее окно поста самое тяжёлое
  дерево приложения, и поднимать его ради страницы заготовки значило бы
  проверять редактор.
*/
const modalModule = loadTypeScriptModule(
  'apps/frontend/src/components/layout/new-modal.tsx'
);
modalModule.useModals = () => ({
  openModal: () => undefined,
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
          field: 'facts',
          question:
            'На что это опирается? Нужен хотя бы один факт, на который текст опирается — со ссылкой, если она есть',
          suggested: null,
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

/** Нажать «Адаптировать · <площадка>» и дождаться конца хода. */
const adaptTo = async (name) => {
  await click(
    screen.getByRole('button', { name: `Адаптировать · ${name}` }),
    () => panel().getAttribute('aria-busy') !== 'true'
  );
};

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
});

/* ---------------------------------------------------------------------- */

describe('the short road: started, written, done', () => {
  test('the draft is shown and the piece is read again', async () => {
    serve(table({}));
    await open();
    expect(detailReads).toBe(1);

    await adaptTo('Telegram');

    // Черновик на экране — тот же текст, что приехал событием `adaptation`.
    const draft = document.querySelector('[data-intake-draft]');
    expect(draft).not.toBeNull();
    expect(draft.textContent).toContain(
      fixture.PIECE_FIXTURE_ADAPTATIONS[0].body.slice(0, 24)
    );
    // И заготовка перечитана: список адаптаций обязан догнать написанное.
    expect(detailReads).toBe(2);
    // Тело запроса — то, что собирает контракт, и ничего сверх него.
    expect(adaptBodies).toEqual([{ integrationId: 'int-tg-main', kind: 'post' }]);
  });
});

/* -------------------------------------------------------------------------
 * Строка качества: одна строка под текстом вместо четырёх поверхностей
 *
 * Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`). До неё
 * страница печатала вердикт всегда — и над чистой сутью говорила «находок
 * нет · своё число есть», то есть занимала место, чтобы сообщить, что
 * сообщать нечего. Проверяется здесь именно молчание и именно то, что
 * найденное называется словом.
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

    // Суть фикстуры чиста и несёт своё число: сообщать нечего.
    expect(document.querySelector('[data-quality-line]')).toBeNull();
    expect(document.body.textContent).not.toContain('находок нет');
    expect(document.body.textContent).not.toContain('своё число есть');
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

    // Находки лежат за нажатием, а не разворачиваются сами.
    expect(document.querySelector('[data-slop-finding]')).toBeNull();
    await click(qualitySegment('slop'));
    expect(document.querySelectorAll('[data-slop-finding]').length).toBe(2);
  });

  test('проверки адаптации приезжают её событием и стоят под её текстом', async () => {
    const stream = fixture.PIECE_FIXTURE_ADAPT_STREAM.map((event) =>
      event.name === 'adaptation'
        ? {
            ...event,
            draftGaps: [{ metric: 'carriesOwnMeasurement', authorShare: 54, authorOf: 153, example: null }],
            checks: {
              antiCopy: {
                minWords: 8,
                retried: false,
                clean: false,
                runs: [{ text: 'слово в слово из источника', start: 0, end: 26 }],
              },
              slop: slopFound('в современном мире'),
              /*
                `voice` приезжает в `checks` волной 07.09.2026 и на день
                раньше типа в контракте. Разбор обязан его читать уже сейчас,
                и обязан молчать, когда его нет.
              */
              voice: { verdict: 'FAR' },
            },
          }
        : event
    );
    serve(table({ adapt: adaptDoor(streamed(stream)) }));
    await open();
    await adaptTo('Telegram');

    expect(qualitySegment('slop').textContent).toBe('Штампов: 1');
    expect(qualitySegment('anti-copy').textContent).toBe('Чужих фраз: 1');
    expect(qualitySegment('voice').textContent).toBe('Не похоже на вас');
    expect(qualitySegment('gaps').textContent).toBe('Своих чисел нет');

    // И ни одной кнопки «Проверить на штампы»: проверки уже сняты даром.
    expect(screen.queryByRole('button', { name: 'Проверить на штампы' })).toBeNull();
  });

  test('адаптация без `voice` в ответе не выдумывает вердикта', async () => {
    serve(table({}));
    await open();
    await adaptTo('Telegram');

    expect(document.querySelector('[data-intake-draft]')).not.toBeNull();
    expect(qualitySegment('voice')).toBeNull();
  });
});

describe('questions are the whole answer of that run', () => {
  test('the card is shown, no draft, and the answers go out in a second request', async () => {
    serve(
      table({
        adapt: adaptDoor(
          streamed(fixture.PIECE_FIXTURE_ADAPT_QUESTIONS_STREAM),
          streamed(fixture.PIECE_FIXTURE_ADAPT_STREAM)
        ),
      })
    );
    await open();
    await adaptTo('Telegram');

    const card = document.querySelector('[data-piece-questions="true"]');
    expect(card).not.toBeNull();
    expect(card.querySelectorAll('[data-piece-question]')).toHaveLength(
      fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS.length
    );
    // Вопрос терминален: черновика в этот ход не будет.
    expect(document.querySelector('[data-piece-draft-id]')).toBeNull();

    // Первый вопрос — согласием с моделью, второй отдан ей же.
    await click(
      within(card.querySelector('[data-piece-question="hook"]')).getByRole(
        'radio',
        { name: 'Так и есть' }
      )
    );
    await click(
      within(card.querySelector('[data-piece-question="cta"]')).getByRole(
        'radio',
        { name: fixture.PIECE_FIXTURE_TELEGRAM_QUESTIONS[1].options[1] }
      )
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
    expect(adaptBodies[1].decideKeys).toBeUndefined();
    // Тот же канал и тот же вид: ход второй, а работа одна.
    expect(adaptBodies[1].integrationId).toBe('int-tg-main');
    expect(adaptBodies[1].kind).toBe('post');
  });

  test('«Пропустить интервью» carries skipInterview, not empty answers', async () => {
    serve(
      table({
        adapt: adaptDoor(
          streamed(fixture.PIECE_FIXTURE_ADAPT_QUESTIONS_STREAM),
          streamed(fixture.PIECE_FIXTURE_ADAPT_STREAM)
        ),
      })
    );
    await open();
    await adaptTo('Telegram');

    await click(
      screen.getByRole('button', { name: 'Пропустить интервью' }),
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
      table({ adapt: adaptDoor(streamed(fixture.PIECE_FIXTURE_ADAPT_ERROR_STREAM)) })
    );
    await open();
    await adaptTo('Telegram');

    expect(panel().getAttribute('data-piece-state')).toBe('error');
    const refusal = fixture.PIECE_FIXTURE_ADAPT_ERROR_STREAM.find(
      (event) => event.name === 'error'
    );
    expect(document.body.textContent).toContain(refusal.message);
    expect(document.querySelector('[data-piece-draft-id]')).toBeNull();
  });
});

describe('уточнение стоит там, где стоит суть', () => {
  /*
    Given/When/Then живого прогона 07.09.2026: заготовка уже записана, вопрос
    приехал в её брифе; человек отвечает — суть переписывается, и повторного
    «на что это опирается» не бывает.
  */
  test('the open question is drawn after the substance', async () => {
    serve(table({ detail: detailDoor(ok(ASKED_DETAIL)) }));
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    expect(card).not.toBeNull();
    const core = document.querySelector('[data-piece-core]');
    expect(core.compareDocumentPosition(card) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.textContent).toContain('На что это опирается?');
    // Заготовка уже сохранена, и карточка говорит это словами.
    expect(card.textContent).toContain('Заготовка уже сохранена');
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
      within(card.querySelector('[data-piece-question="facts"]')).getByRole(
        'radio',
        { name: 'Поправить' }
      )
    );
    const field = document.querySelector('[name="piece-answer-facts"]');
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
            field: 'facts',
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
      within(card.querySelector('[data-piece-question="facts"]')).getByRole(
        'radio',
        { name: 'Реши сама' }
      )
    );
    await click(within(card).getByRole('button', { name: 'Дальше' }), () =>
      answered.length > 0
    );

    expect(answered).toEqual([{ decide: ['facts'] }]);
    await settle(() => document.querySelector('[data-core-answer="unchanged"]') !== null);
    expect(document.body.textContent).toContain('Суть не менялась, ответ сохранён');
  });

  test('«Оставить как есть» sends nothing at all', async () => {
    serve(table({ detail: detailDoor(ok(ASKED_DETAIL)) }));
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    await click(
      within(card).getByRole('button', { name: 'Оставить как есть' })
    );

    // Ни одного запроса: заготовка уже годится, и это законный исход.
    expect(calls.filter((call) => call.url === ANSWER_URL)).toEqual([]);
    expect(document.querySelector('[data-piece-clarify="true"]')).toBeNull();
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

describe('the kind of an adaptation is a person’s choice', () => {
  const twoKinds = {
    ...fixture.PIECE_FIXTURE_DETAIL,
    targets: fixture.PIECE_FIXTURE_DETAIL.targets.map((target) =>
      target.platform === 'wordpress'
        ? { ...target, kinds: ['article', 'newsletter'] }
        : target
    ),
  };

  test('one kind: no switch at all, and it goes out as it always did', async () => {
    serve(table({}));
    await open();

    expect(document.querySelector('[data-piece-kind-choice="telegram"]')).toBeNull();
    await adaptTo('Telegram');
    expect(adaptBodies[0].kind).toBe('post');
  });

  test('several kinds: the chosen one reaches the body of the request', async () => {
    serve(table({ detail: detailDoor(ok(twoKinds)) }));
    await open();

    const target = document.querySelector('[data-piece-target="wordpress"]');
    // Умолчание — первый вид площадки, пока человек не сказал иначе.
    expect(target.getAttribute('data-piece-target-kind')).toBe('article');
    /*
      С 07.09.2026 полоса вида стоит в шапке панели «Куда адаптировать», рядом
      с её названием, а не внутри самой кнопки: вопрос «что именно напишется»
      задаётся один раз над рядом кнопок. Связь с площадкой держит
      `data-piece-kind-choice`, поэтому ищется она по панели, а не по кнопке.
    */
    const choice = document.querySelector('[data-piece-kind-choice="wordpress"]');
    expect(choice).not.toBeNull();
    expect(
      [...choice.querySelectorAll('[role="radio"]')].map((one) => one.textContent)
    ).toEqual(['статья', 'письмо']);

    await click(within(choice).getByRole('radio', { name: 'письмо' }));
    expect(target.getAttribute('data-piece-target-kind')).toBe('newsletter');

    await adaptTo('Сайт');
    expect(adaptBodies[0]).toEqual({
      integrationId: 'int-site',
      kind: 'newsletter',
    });
  });
});


/* ---------------------------------------------------------------------- */

/**
 * На что опирается заготовка.
 *
 * Решением владельца 07.09.2026 несмонтированная карточка расписки удалена, а
 * единственное, чего не было в компактной квитанции, — опоры и то, что опорой
 * не стало, — переехало в правую колонку страницы заготовки.
 *
 * Проверяется ровно то, ради чего блок переносили: подтверждение стоит словом,
 * а не одним цветом; источник ведёт наружу и назван хостом; и заголовок «На что
 * это опирается» не встаёт над пустотой, когда опираться не на что.
 */
describe('what the piece rests on', () => {
  const withBrief = (brief) => ({
    ...fixture.PIECE_FIXTURE_DETAIL,
    core: {
      ...fixture.PIECE_FIXTURE_DETAIL.core,
      brief: { ...fixture.PIECE_FIXTURE_DETAIL.core.brief, ...brief },
    },
  });

  test('facts carry the word, the source and the line that did not make it', async () => {
    serve(
      table({
        detail: detailDoor(
          ok(
            withBrief({
              facts: [
                {
                  statement: 'Пять из шести сроков сдвинулись',
                  origin: 'input',
                  verified: true,
                  sourceUrl: 'https://www.industry.synthetic.invalid/deadlines/2026',
                },
                {
                  statement: 'Средний срыв по отрасли 40%',
                  origin: 'model',
                  verified: false,
                },
              ],
              ungrounded: ['Средний срыв по отрасли 40%'],
            })
          )
        ),
      })
    );
    await open();

    const facts = document.querySelector('[data-piece-facts]');
    expect(facts).not.toBeNull();
    const sources = document.querySelector('[data-piece-sources]');
    expect(sources).not.toBeNull();
    expect(sources.open).toBe(false);
    expect(facts.textContent).toContain('Пять из шести сроков сдвинулись');

    // Подтверждение — слово, и оно своё у каждой опоры, а не одно на список.
    const words = [...facts.querySelectorAll('[data-piece-fact-verified]')];
    expect(words.map((one) => one.getAttribute('data-piece-fact-verified'))).toEqual([
      'true',
      'false',
    ]);
    expect(words[0].textContent).toContain('подтверждено');
    expect(words[1].textContent).toContain('не подтверждено');
    // «не подтверждено» не должно случайно проходить проверкой на «подтверждено».
    expect(words[1].textContent).not.toContain('в текст не вошло');

    // Источник ведёт наружу и назван хостом, а не полным адресом.
    const link = words[0].querySelector('a');
    expect(link.getAttribute('href')).toBe(
      'https://www.industry.synthetic.invalid/deadlines/2026'
    );
    expect(link.textContent).toBe('industry.synthetic.invalid');
    expect(link.getAttribute('target')).toBe('_blank');
    // У опоры без адреса ссылки нет вовсе — пустой «—» здесь ничего не сообщал бы.
    expect(words[1].querySelector('a')).toBeNull();

    // То, что подтвердить нечем, стоит отдельно от опор и названо своими словами.
    const ungrounded = [...document.querySelectorAll('[data-piece-ungrounded]')];
    expect(ungrounded.map((one) => one.textContent)).toEqual([
      'Средний срыв по отрасли 40%',
    ]);
    expect(document.body.textContent).toContain('Опоры текста');
    expect(document.body.textContent).toContain('Не подтвердилось и в текст не вошло');
  });

  test('nothing to rest on: no heading over an empty block', async () => {
    serve(
      table({
        detail: detailDoor(ok(withBrief({ facts: [], ungrounded: [] }))),
      })
    );
    await open();

    // Квитанция на месте — исчезает только блок опор.
    expect(document.querySelector('[data-piece-receipt]')).not.toBeNull();
    expect(document.querySelector('[data-piece-facts]')).toBeNull();
    expect(document.querySelector('[data-piece-ungrounded]')).toBeNull();
    expect(document.body.textContent).not.toContain('Опоры текста');
  });
});


describe('S4: safe navigation and one adaptation object', () => {
  test('overview keeps each selected channel separate and opens its exact adaptation', async () => {
    serve(table({}));
    await open();

    expect(panel().classList.contains('w-full')).toBe(true);
    expect(panel().classList.contains('flex-1')).toBe(true);

    const telegram = document.querySelector('[data-piece-target="telegram"]');
    const instagram = document.querySelector('[data-piece-target="instagram"]');
    expect(telegram).not.toBeNull();
    expect(telegram.querySelector('img')).not.toBeNull();
    expect(telegram.textContent).toContain('опубликовано');
    expect(telegram.textContent).toContain('1');
    expect(instagram.getAttribute('data-piece-target-available')).toBe('false');
    expect(instagram.textContent).toContain('нет канала');

    const adaptationId = fixture.PIECE_FIXTURE_ADAPTATIONS[0].id;
    const item = document.querySelector(
      `[data-piece-adaptation="${adaptationId}"]`
    );
    const toggle = item.querySelector('[aria-expanded]');
    expect(
      document.getElementById(toggle.getAttribute('aria-controls')).hidden
    ).toBe(true);
    await click(
      document.querySelector(`[data-piece-overview-view="${adaptationId}"]`)
    );
    expect(
      document.getElementById(toggle.getAttribute('aria-controls')).hidden
    ).toBe(false);

    const channel = within(telegram).getByRole('combobox', {
      name: 'Куда адаптировать · Telegram',
    });
    await act(async () => {
      fireEvent.change(channel, { target: { value: 'int-tg-2' } });
    });
    expect(telegram.textContent).toContain('ещё нет');
    expect(telegram.textContent).toContain('0');
  });

  test('an empty table cell selects the platform without a paid call', async () => {
    serve(table({}));
    await open({ adaptPlatform: 'telegram' });
    await settle();
    expect(calls.filter((call) => call.url === ADAPT_URL)).toHaveLength(0);
    expect(document.querySelector('[data-piece-adapt-focus]').getAttribute('data-piece-adapt-focus')).toBe('telegram');
    await adaptTo('Telegram');
    expect(calls.filter((call) => call.url === ADAPT_URL)).toHaveLength(1);
  });

  test('the generated text stays inside its own expanded adaptation', async () => {
    serve(table({}));
    await open();
    await adaptTo('Telegram');
    const draft = document.querySelector('[data-piece-draft-id]');
    expect(draft).not.toBeNull();
    expect(draft.closest('[data-piece-adaptation]').getAttribute('data-piece-adaptation')).toBe(draft.getAttribute('data-piece-draft-id'));
    const item = draft.closest('[data-piece-adaptation]');
    const toggle = item.querySelector('[aria-expanded]');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await click(toggle);
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(true);
    await click(toggle);
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(false);
  });
});
