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
    const answer = table[`${method} ${url}`];
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

const open = async () => {
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
          React.createElement(container.PieceContainer, { pieceId: PIECE_ID })
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
    expect(document.querySelector('[data-intake-draft]')).toBeNull();

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
        { name: 'Реши сама' }
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
    ]);
    expect(adaptBodies[1].decideKeys).toEqual(['cta']);
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
    expect(document.querySelector('[data-intake-draft]')).toBeNull();
  });
});

describe('уточнение стоит там, где стоит суть', () => {
  /*
    Given/When/Then живого прогона 07.09.2026: заготовка уже записана, вопрос
    приехал в её брифе; человек отвечает — суть переписывается, и повторного
    «на что это опирается» не бывает.
  */
  test('the open question is drawn on the page, above the substance', async () => {
    serve(table({ detail: detailDoor(ok(ASKED_DETAIL)) }));
    await open();

    const card = document.querySelector('[data-piece-clarify="true"]');
    expect(card).not.toBeNull();
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
