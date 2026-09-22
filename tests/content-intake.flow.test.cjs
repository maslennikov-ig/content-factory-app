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
 *  - тонкий ввод даёт заготовку с первого же хода и уходит на её страницу:
 *    второго запроса нет вовсе, а вопросы уехали туда, где стоит суть
 *    (`content-factory-next-m2eg`, живой прогон 07.09.2026);
 *  - готового текста и квитанции на этом экране нет вовсе: с `m2eg.21` их
 *    рисует страница заготовки, на которую экран уходит сам;
 *  - третьего круга расспросов нет, и это решается на экране, до запроса;
 *  - уход с экрана обрывает ход.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
/*
  Уходы со страницы записываются, а не случаются. `window.location` в jsdom
  подменить нельзя — он «неподделываемый», — но всякая попытка навигации
  приходит сюда ошибкой окружения, и набор считает именно попытки: экран обязан
  уйти на страницу заготовки, и это видно.
*/
const navigations = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (String(error?.message || '').includes('Not implemented: navigation')) {
    navigations.push(error.message);
    return;
  }
  // Остальное окружение по-прежнему говорит вслух.
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

/** Каналы необязательны и приезжают позже поля ввода: канал ждём отдельно. */


const start = async (text = 'Надо больше писать про ИИ, чем сейчас') => {
  await type('[name="intake-input"]', text);
  await click(
    screen.getByRole('button', { name: /Сделать заготовку/ }),
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
  navigations.length = 0;
});

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* ---------------------------------------------------------------------- */

describe('a thin thought is answered with a piece, not with a dead end', () => {
  test('one run, a saved piece, and the screen leaves for its page', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('thin-input')))));
    await open();
    await start();

    // Один ход и один запрос: второго круга не бывает вовсе.
    expect(intakeAnswers).toHaveLength(1);
    expect(intakeAnswers[0].answers).toBeUndefined();
    expect(intakeAnswers[0].integrationIds).toBeUndefined();

    // Заготовка названа кодом — это первое, что человек получает.
    const line = document.querySelector('[data-intake-piece="cnt-07"]');
    expect(line).not.toBeNull();
    expect(line.textContent).toContain('Заготовка сохранена — cnt-07');

    // И экран ушёл на её страницу сам.
    expect(navigations).toHaveLength(1);
  });

  test('neither a question card nor a dead end is ever drawn', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('thin-input')))));
    await open();
    await start();

    /*
      Ровно то, обо что владелец споткнулся на прогоне 07.09.2026: два круга
      вопросов и «больше спрашивать не будем» вместо заготовки. Вопросы теперь
      живут на странице заготовки, поэтому здесь их нет ни одного.
    */
    expect(document.querySelector('[data-intake-questions="true"]')).toBeNull();
    expect(document.querySelector('[data-piece-questions="true"]')).toBeNull();
    expect(document.querySelector('[data-intake-rounds-spent="true"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Больше спрашивать не будем');
    // И отказом это не читается: заготовка есть, ход кончился «done».
    expect(panel().getAttribute('data-intake-state')).not.toBe('error');
  });
});

describe('somebody else’s post: the screen leaves, it does not display', () => {
  /*
    `content-factory-next-m2eg.21`, хвост живого прогона 07.09.2026. Текст,
    квитанция и находки рисовались и здесь, и на странице заготовки, а экран
    уходит на неё сам — здешняя копия успевала только мигнуть между первым
    каналом и концом стрима. Судится то, что осталось: ход прошёл, заготовка
    названа кодом, переход случился, а второго места для того же брифа больше
    нет.
  */
  test('the run finishes and nothing of the draft is drawn here', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('foreign-post')))));
    await open();
    await start('Чужой пост про выручку 4,2 млрд и рост на 37% в 12 странах');

    expect(panel().getAttribute('data-intake-state')).toBe('draft');
    expect(document.querySelector('[data-intake-draft]')).toBeNull();
    expect(document.querySelector('[data-brief-receipt]')).toBeNull();
    expect(document.querySelectorAll('[data-brief-fact-verified]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Открыть в редакторе' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Пересобрать' })).toBeNull();
  });

  test('what stays is the piece code and the move to its page', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('foreign-post')))));
    await open();
    await start('Чужой пост про выручку');

    expect(document.querySelector('[data-intake-piece]')).not.toBeNull();
    expect(navigations).toHaveLength(1);
    // Один ход и один запрос: пересобирать отсюда больше нечего.
    expect(intakeAnswers).toHaveLength(1);
    expect(intakeAnswers[0].briefOverrides).toBeUndefined();
  });
});

describe('a link, declared to the door as a link', () => {
  test('the link is recognised on the screen and declared to the door', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('link')))));
    await open();
    await type('[name="intake-input"]', 'https://example.test/post');

    expect(document.querySelector('[data-intake-kind-line="link"]')).not.toBeNull();

      await click(screen.getByRole('button', { name: /Сделать заготовку/ }));

    expect(intakeAnswers[0].inputKind).toBe('link');
    expect(intakeAnswers[0].input).toBe('https://example.test/post');
    // Язык взят у канала, а не спрошен заново.
    expect(intakeAnswers[0].language).toBe('ru');
  });

  /*
    Редактор с этого экрана больше не открывается: пост сохранён сервером как
    DRAFT и открывается из календаря и со страницы заготовки. Тяжёлое дерево
    редактора не должно приезжать на экран, который сейчас уйдёт.
  */
  test('the editor is not opened from here at all', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/content-intelligence/intake/intake.container.tsx'),
      'utf8'
    );
    expect(source).not.toContain('EDITOR_MODAL');
    expect(source).not.toContain('AddEditModal');
    expect(source).not.toContain('ExistingDataContextProvider');
  });
});

/*
  Вид входа называет человек (`content-factory-next-97dq.28`, `.29`): до
  22.09.2026 был флажок «Это чужой текст», а остальное угадывал сервер — и
  угадал собственные слова владельца о собственном посте как чужой пост
  (`cnt-28`). Переключатель обязан доехать до двери и в первом ходе, и во
  втором проходе ресерча; по умолчанию дверь получает `thought`, названный
  явно; голая ссылка остаётся ссылкой при любом положении.
*/
describe('the kind switch is carried to the door', () => {
  const RESEARCH_PAUSE = [
    { name: 'intake-started', inputKind: 'foreign_post', channels: [] },
    {
      name: 'research-selection-required',
      level: 'standard',
      snapshotKey: 'snap-1',
      facts: [
        {
          statement: 'Производительность сохранилась или выросла',
          kind: 'found',
          origin: 'search',
          status: 'confirmed',
          selected: true,
          factKey: 'ev-2:x',
          sourceUrl: 'https://theconversation.com/a',
        },
      ],
      corrections: [],
      summary: { confirmed: 0, conflicting: 0, unverified: 0, found: 1, sources: 4, encyclopedic: 0 },
    },
  ];

  const choose = async (label) => {
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('radiogroup', { name: 'Что вы присылаете' })).getByRole('radio', { name: label })
      );
    });
  };

  test('«Чужой пост» declares foreign_post on the first run and on the second pass', async () => {
    serve(baseTable(intakeDoor(
      streamed(RESEARCH_PAUSE),
      streamed(scenario('thin-input'))
    )));
    await open();
    await choose('Чужой пост');
    await start('Вставленный чужой пост про четырёхдневную неделю');

    expect(intakeAnswers[0].inputKind).toBe('foreign_post');
    // Ряд продолжения стоит и над находками, и под ними.
    const rows = document.querySelectorAll('[data-intake-research-row]');
    expect(rows).toHaveLength(2);

    await click(
      screen.getAllByRole('button', { name: 'Продолжить' })[0],
      () => intakeAnswers.length > 1
    );

    expect(intakeAnswers).toHaveLength(2);
    expect(intakeAnswers[1].inputKind).toBe('foreign_post');
    expect(intakeAnswers[1].snapshotKey).toBe('snap-1');
  });

  test('the untouched switch names «thought», «Задание» names instruction, and a bare link stays a link', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('thin-input')))));
    await open();
    await start('Надо больше писать про ИИ, чем сейчас');
    expect(intakeAnswers[0].inputKind).toBe('thought');

    cleanup();
    serve(baseTable(intakeDoor(streamed(scenario('thin-input')))));
    await open();
    await choose('Задание');
    await start('Хочу пост о том, что я выступил на радио, сохранить https://t.me/radiosputnik_khv/20430');
    expect(intakeAnswers[0].inputKind).toBe('instruction');

    cleanup();
    serve(baseTable(intakeDoor(streamed(scenario('link')))));
    await open();
    await choose('Чужой пост');
    await start('https://example.test/post');
    expect(intakeAnswers[0].inputKind).toBe('link');
  });
});

describe('two channels, and no text on the screen', () => {
  test('both drafts are asked for, and neither is drawn here', async () => {
    serve(baseTable(intakeDoor(streamed(scenario('two-channels')))));
    await open();
    await start('Дедлайн, назначенный себе, работает хуже');

    // Ход дошёл до черновиков — состояние это помнит…
    expect(panel().getAttribute('data-intake-state')).toBe('draft');
    // …а текстов на экране нет ни одного: они сохранены и открываются со
    // страницы заготовки и из календаря.
    expect(document.querySelectorAll('[data-intake-draft]')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Из шести дедлайнов');
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

  test('a refusal the server explained keeps its own words after the stream ends', async () => {
    // 14.09.2026: the site behind a pasted link answered 4xx, the server sent
    // its explanation and closed the stream, and the screen wrote «ответ
    // пришёл неполным» over it (`content-factory-next-75xn.36`).
    serve(baseTable(intakeDoor(streamed([
      { name: 'intake-started', inputKind: 'link', channels: [] },
      {
        name: 'error',
        error: true,
        code: 'INTAKE_LINK_UNREACHABLE',
        message: 'Страницу по ссылке не удалось прочитать. Вставьте текст поста прямо в поле.',
      },
    ]))));
    await open();
    await start();

    expect(panel().getAttribute('data-intake-state')).toBe('error');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Страницу по ссылке не удалось прочитать');
    expect(alert.textContent).not.toContain('Ответ пришёл неполным');
  });

  test('«Продолжить без ссылки» drops the address for the person and runs again', async () => {
    // Owner 14.09.2026 (`content-factory-next-75xn.38`): the link was not
    // essential, and deleting it by hand is our job, not theirs.
    serve(baseTable(intakeDoor(
      streamed([
        { name: 'intake-started', inputKind: 'foreign_post', channels: [] },
        {
          name: 'error',
          error: true,
          code: 'INTAKE_LINK_UNREACHABLE',
          message: 'Страницу по ссылке не удалось прочитать. Вставьте текст поста прямо в поле.',
        },
      ]),
      streamed(scenario('thin-input'))
    )));
    await open();
    await start('Надо больше писать про ИИ, чем сейчас — вот пример: https://example.com/post/1.');

    expect(panel().getAttribute('data-intake-state')).toBe('error');
    await click(
      screen.getByRole('button', { name: 'Продолжить без ссылки' }),
      () => panel().getAttribute('data-intake-state') !== 'error'
        && panel().getAttribute('data-intake-state') !== 'streaming'
    );

    expect(intakeAnswers).toHaveLength(2);
    expect(intakeAnswers[0].input).toContain('https://example.com/post/1');
    expect(intakeAnswers[1].input).toBe('Надо больше писать про ИИ, чем сейчас — вот пример:');
    expect(document.querySelector('[name="intake-input"]').value).toBe(
      'Надо больше писать про ИИ, чем сейчас — вот пример:'
    );
    expect(navigations).toHaveLength(1);
  });

  test('a bare link the site refused offers no way to continue without it', async () => {
    serve(baseTable(intakeDoor(streamed([
      { name: 'intake-started', inputKind: 'link', channels: [] },
      { name: 'error', error: true, code: 'INTAKE_LINK_UNREACHABLE', message: 'Страницу по ссылке не удалось прочитать.' },
    ]))));
    await open();
    await start('https://example.com/post/1');

    expect(panel().getAttribute('data-intake-state')).toBe('error');
    expect(screen.queryByRole('button', { name: 'Продолжить без ссылки' })).toBeNull();
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
      // Ход запускается и не дочитывается: экран закрывают на середине.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Сделать заготовку/ }));
    });

    expect(carried).not.toBeNull();
    expect(carried.aborted).toBe(false);
    await act(async () => {
      view.unmount();
    });
    expect(carried.aborted).toBe(true);
  });
});
