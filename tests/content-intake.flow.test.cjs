'use strict';

/**
 * Дорога от мысли до черновика, проверенная целиком.
 *
 * `content-factory-next-tu3k.4`, сценарии 1–4 плана. Сервер здесь — четыре
 * сценария фикстуры `tests/fixtures/intake-stream.ndjson`, поданные через
 * настоящий `ReadableStream`: событие приезжает кусками, как в жизни, и
 * разбивку строк делает тот же модуль, что и в браузере.
 *
 * Пять вещей, ради которых набор существует:
 *
 *  - тонкий ввод отвечает вопросами, а не отказом, и второй запрос несёт
 *    ответы прошлого хода — иначе тот же вопрос задаётся дважды;
 *  - чужой пост показывает подтверждённое и неподтверждённое разными
 *    строками: число, которого нет в тексте, обязано быть названо;
 *  - правка квитанции уходит на сервер только по «Пересобрать» и только как
 *    `briefOverrides`;
 *  - третьего круга расспросов нет, и это решается на экране, до запроса;
 *  - уход с экрана обрывает ход.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
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

const base = 'apps/frontend/src/components/content-intelligence/intake';
const container = loadTypeScriptModule(`${base}/intake.container.tsx`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const userContext = loadTypeScriptModule(
  'apps/frontend/src/components/layout/user.context.tsx'
);

/*
  Окно поста подменяется на уровне модуля модалок: настоящее — самое тяжёлое
  дерево приложения, и поднимать его ради проверки того, что дверь открылась,
  значило бы проверять редактор. `loadTypeScriptModule` держит по одному
  экземпляру модуля на файл, поэтому подмена видна и контейнеру.
*/
const modalModule = loadTypeScriptModule(
  'apps/frontend/src/components/layout/new-modal.tsx'
);
let opened = [];
modalModule.useModals = () => ({
  openModal: (params) => opened.push(params),
  closeAll: () => undefined,
  closeById: () => undefined,
  closeCurrent: () => undefined,
});

/* -------------------------------------------------------------------------
 * Фикстура стрима: четыре сценария, из которых экран знает по одному за раз
 * ---------------------------------------------------------------------- */

const FIXTURE = fs
  .readFileSync(path.join(root, 'tests/fixtures/intake-stream.ndjson'), 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const scenario = (name) =>
  FIXTURE.filter((event) => event.scenario === name).map(
    ({ scenario: _ignored, ...event }) => event
  );

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

/*
  Ответ собирается заново на каждый ход: поток читается один раз, и второй
  ход, которому подсунули уже вычерпанное тело, увидел бы пустой ответ — а
  экран честно сказал бы «Ответ пришёл неполным», и набор проверял бы свою
  же ошибку.
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

const TELEGRAM = {
  id: 'int-tg',
  name: 'Мой канал',
  identifier: 'telegram',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
  contentLanguage: 'ru',
};

const ALLOWANCE = {
  mode: 'included',
  remaining: 10,
  limit: 100,
  resetsAt: '2026-10-01T00:00:00.000Z',
};

let calls = [];
let intakeAnswers = [];

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

/** Дверь входа, отвечающая по очереди подготовленными стримами. */
const intakeDoor = (...runs) => {
  intakeAnswers = [];
  let at = 0;
  return (call) => {
    intakeAnswers.push(call.body);
    const run = runs[Math.min(at, runs.length - 1)];
    at += 1;
    return typeof run === 'function' ? run(call) : run;
  };
};

const baseTable = (intake) => ({
  'GET /integrations/list': ok({ integrations: [TELEGRAM] }),
  'GET /settings/ai/allowance': ok(ALLOWANCE),
  'POST /content-intelligence/intake': intake,
});

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
          React.createElement(container.IntakeContainer, { surface: 'brief' })
        )
      )
    )
  );
  // Двери каналов и остатка ИИ отвечают своими промисами: экран готов не на
  // первом же тике.
  // Список каналов и остаток ИИ приходят разными тактами; экран готов, когда
  // появилось поле ввода, а не через заранее выбранное число тиков.
  await settle(() => document.querySelector('[name="intake-input"]') !== null);
  return view;
};

/** Прокрутить очередь до тех пор, пока условие не выполнится. */
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

const type = async (selector, value) => {
  const field = document.querySelector(selector);
  expect(field).not.toBeNull();
  await act(async () => {
    fireEvent.change(field, { target: { value } });
  });
};

const start = async (text = 'Надо больше писать про ИИ, чем сейчас') => {
  await type('[name="intake-input"]', text);
  await click(screen.getByRole('button', { name: 'Мой канал' }));
  await click(
    screen.getByRole('button', { name: 'Написать' }),
    () =>
      panel().getAttribute('data-intake-state') !== 'streaming' &&
      panel().getAttribute('data-intake-state') !== 'idle'
  );
};

const panel = () => document.querySelector('[data-content-panel="intake"]');

beforeAll(async () => {
  const i18n = loadTypeScriptModule(
    'libraries/react-shared-libraries/src/translation/i18next.ts'
  ).default;
  if (!i18n.isInitialized) {
    await new Promise((resolve) => i18n.on('initialized', resolve));
  }
  await i18n.loadLanguages(['en', 'ru']);
});

beforeEach(() => {
  opened = [];
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* ---------------------------------------------------------------------- */

describe('a thin thought is answered with questions, not with a refusal', () => {
  test('two questions, no draft, and the second run carries what was answered', async () => {
    serve(
      baseTable(
        intakeDoor(
          streamed(scenario('thin-input')),
          streamed(scenario('two-channels').filter((e) => e.name !== 'intake-started'))
        )
      )
    );
    await open();
    await start();

    expect(panel().getAttribute('data-intake-state')).toBe('questions');
    const card = document.querySelector('[data-intake-questions="true"]');
    expect(card.querySelectorAll('[data-intake-question]')).toHaveLength(2);
    // Черновика нет: вопрос — это и есть весь ответ этого хода.
    expect(document.querySelector('[data-intake-draft]')).toBeNull();

    // Первый вопрос — своим ответом, второй отдан модели.
    await click(
      within(card.querySelector('[data-intake-question="thesis"]')).getByRole(
        'radio',
        { name: 'Свой ответ' }
      )
    );
    await type('[name="intake-answer-thesis"]', 'Про ИИ надо писать реже и точнее');
    await click(
      within(card.querySelector('[data-intake-question="facts"]')).getByRole(
        'radio',
        { name: 'Реши сама' }
      )
    );
    await click(within(card).getByRole('button', { name: 'Написать' }));

    expect(intakeAnswers).toHaveLength(2);
    // Первый ход ничего не нёс — спрашивать было ещё не о чем.
    expect(intakeAnswers[0].answers).toBeUndefined();
    expect(intakeAnswers[1].answers).toEqual([
      { field: 'thesis', text: 'Про ИИ надо писать реже и точнее' },
    ]);
    expect(intakeAnswers[1].decide).toEqual(['facts']);
    // И тот же ввод и тот же канал: ход второй, а работа одна.
    expect(intakeAnswers[1].integrationIds).toEqual(['int-tg']);
  });

  test('a third round is refused on the screen, before any request', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('thin-input')))));
    await open();
    await start();

    // Первый круг вопросов.
    let card = document.querySelector('[data-intake-questions="true"]');
    await click(
      within(card).getByRole('button', { name: 'Реши всё сама' }),
      () => panel().getAttribute('data-intake-state') === 'questions'
    );
    // Второй круг: сервер снова спросил.
    card = document.querySelector('[data-intake-questions="true"]');
    expect(card).not.toBeNull();
    await click(
      within(card).getByRole('button', { name: 'Реши всё сама' }),
      () => document.querySelector('[data-intake-rounds-spent="true"]') !== null
    );

    /*
      Ходов было два: первый — сам ввод, второй — ответ на первый круг
      вопросов. Второй круг пришёл в ответ на него, и на нём расспросы
      кончаются: третьего запроса нет, и решается это здесь, на экране, а не
      ожиданием отказа от сервера.
    */
    expect(intakeAnswers).toHaveLength(2);

    card = document.querySelector('[data-intake-questions="true"]');
    expect(card).toBeNull();
    const spent = document.querySelector('[data-intake-rounds-spent="true"]');
    expect(spent).not.toBeNull();
    expect(spent.textContent).toContain('Больше спрашивать не будем');
  });
});

describe('somebody else’s post: what was checked, and what stayed out', () => {
  test('a confirmed fact and an unconfirmed one read as two different things', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('foreign-post')))));
    await open();
    await start('Чужой пост про выручку 4,2 млрд и рост на 37% в 12 странах');

    expect(panel().getAttribute('data-intake-state')).toBe('draft');
    const facts = document.querySelectorAll('[data-brief-fact-verified]');
    expect(facts.length).toBeGreaterThanOrEqual(2);
    const verified = [...facts].map((one) =>
      one.getAttribute('data-brief-fact-verified')
    );
    expect(verified).toContain('true');
    expect(verified).toContain('false');
    const unconfirmed = [...facts].find(
      (one) => one.getAttribute('data-brief-fact-verified') === 'false'
    );
    expect(unconfirmed.textContent).toContain('не подтверждено — в текст не вошло');
  });

  test('the draft is shown as text, and the receipt says where each line came from', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('foreign-post')))));
    await open();
    await start('Чужой пост про выручку');

    expect(document.querySelector('[data-intake-draft]').textContent).toContain(
      'Рост на 37%'
    );
    const receipt = document.querySelector('[data-brief-receipt]');
    expect(receipt.getAttribute('data-brief-receipt-dirty')).toBe('false');
    expect(
      receipt
        .querySelector('[data-brief-receipt-row="thesis"] [data-brief-origin]')
        .getAttribute('data-brief-origin')
    ).toBe('input');
  });

  test('an edited receipt reaches the server only as briefOverrides, and only on «Пересобрать»', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('foreign-post')))));
    await open();
    await start('Чужой пост про выручку');

    const receipt = document.querySelector('[data-brief-receipt]');
    const row = receipt.querySelector('[data-brief-receipt-row="position"]');
    await click(within(row).getByRole('button', { name: 'Изменить' }));
    await type('[name="intake-receipt-position"]', 'Я бы не резал вовсе');

    // Правка сама никуда не уходит: генерация на каждое нажатие клавиши.
    expect(intakeAnswers).toHaveLength(1);
    expect(
      document
        .querySelector('[data-brief-receipt]')
        .getAttribute('data-brief-receipt-dirty')
    ).toBe('true');
    // И строка теперь принадлежит человеку, а не модели.
    expect(
      document
        .querySelector('[data-brief-receipt-row="position"] [data-brief-origin]')
        .getAttribute('data-brief-origin')
    ).toBe('person');

    await click(screen.getByRole('button', { name: 'Пересобрать' }));
    expect(intakeAnswers).toHaveLength(2);
    expect(intakeAnswers[1].briefOverrides).toEqual({
      position: 'Я бы не резал вовсе',
    });
  });
});

describe('a link, and the editor at the end of it', () => {
  test('the link is recognised on the screen and declared to the door', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('link')))));
    await open();
    await type('[name="intake-input"]', 'https://example.test/post');

    expect(document.querySelector('[data-intake-kind-line="link"]')).not.toBeNull();

    await click(screen.getByRole('button', { name: 'Мой канал' }));
    await click(screen.getByRole('button', { name: 'Написать' }));

    expect(intakeAnswers[0].inputKind).toBe('link');
    expect(intakeAnswers[0].input).toBe('https://example.test/post');
    // Язык взят у канала, а не спрошен заново.
    expect(intakeAnswers[0].language).toBe('ru');
  });

  test('«Открыть в редакторе» asks for the post the server already saved', async () => {
    serve({
      ...baseTable(intakeDoor(streamed(scenario('link')))),
      'GET /posts/post-2': ok({
        integration: 'int-tg',
        posts: [{ publishDate: '2026-09-06T10:00:00.000Z' }],
      }),
    });
    await open();
    await start('https://example.test/post');

    await click(
      screen.getByRole('button', { name: 'Открыть в редакторе' }),
      () => calls.some((call) => call.url === '/posts/post-2')
    );

    // Пост уже сохранён как черновик — экран его читает, а не создаёт заново.
    const post = calls.filter((call) => call.url === '/posts/post-2');
    expect(post).toHaveLength(1);
    expect(post[0].method).toBe('GET');
    /*
      Само окно поста здесь не поднимается: это самое тяжёлое дерево
      приложения, и проверять им открытие двери значило бы проверять
      редактор. Что открывается именно оно и с теми же флагами, что из
      календаря, держит след в исходнике — `EDITOR_MODAL` из
      `voice-materials.adapter.ts`, а не второй набор флагов.
    */
    const source = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/content-intelligence/intake/intake.container.tsx'),
      'utf8'
    );
    expect(source).toContain('EDITOR_MODAL');
    expect(source).toContain('AddEditModal');
    expect(source).toContain('ExistingDataContextProvider');
  });
});

describe('two channels, and one text on the screen', () => {
  test('both drafts are asked for, and the first is the one shown', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('two-channels')))));
    await open();
    await start('Дедлайн, назначенный себе, работает хуже');

    expect(panel().getAttribute('data-intake-state')).toBe('draft');
    const article = document.querySelector('[data-intake-draft]');
    expect(article.textContent).toContain('Из шести дедлайнов');
    // Второй канал сохранён сервером и открывается из календаря; трёх текстов
    // подряд на одном экране быть не должно.
    expect(document.querySelectorAll('[data-intake-draft]')).toHaveLength(1);
  });
});

describe('what a broken answer and a closed screen do', () => {
  test('a stream that ends with nothing says plainly that nothing was saved', async () => {
    serve(baseTable(intakeDoor(streamed([{ name: 'intake-started', inputKind: 'thought', channels: [] }]))));
    await open();
    await start();

    expect(panel().getAttribute('data-intake-state')).toBe('error');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Не написалось');
    expect(alert.textContent).toContain('Ничего не сохранено.');
  });

  test('leaving the screen aborts the run instead of writing into nothing', async () => {
    let carried = null;
    serve(
      baseTable((call) => {
        carried = call.signal;
        intakeAnswers.push(call.body);
        return streamed(scenario('two-channels'), { chunkSize: 8 })();
      })
    );
    intakeAnswers = [];
    const view = await open();
    await type('[name="intake-input"]', 'Мысль про дедлайны, которых себе не ставят');
    await click(screen.getByRole('button', { name: 'Мой канал' }));
    // Ход запускается и не дочитывается: экран закрывают на середине.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Написать' }));
    });

    expect(carried).not.toBeNull();
    expect(carried.aborted).toBe(false);
    await act(async () => {
      view.unmount();
    });
    expect(carried.aborted).toBe(true);
  });
});
