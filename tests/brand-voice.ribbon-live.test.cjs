'use strict';

/**
 * The applied-voice strip, in the post form people actually use.
 *
 * `36r.13` accepted the four-state strip and `07h` gave it routes, but the two
 * were never joined: the strip in the post form decided its own state from a
 * thirty-day constant compiled into the client, and `voice-moved` could not
 * fire at all because nothing on that side knew which version is in force now.
 * A strip that answers "what is writing this" from a guess is worse than no
 * strip, because it is believed.
 *
 * Three rules are checked here, and each is a decision rather than a detail.
 * The state comes from the server. The voice is restated at the real
 * boundaries of the thread the form holds — every item, and never twice for a
 * single post, where the repetition would only cost tokens. And the remark
 * about leaving the corridor is computed by the same functions that drew the
 * corridor, so it fires outside *this* author's habits and never against a
 * general norm nobody asked for.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, render, screen, waitFor } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { withCalibration } = require('./helpers/voice-calibration-fixture.cjs');

const h = React.createElement;

const CONTAINER_FILE =
  'apps/frontend/src/components/brand-voice/voice-ribbon.container.tsx';
const FORM_FILE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/** Source with its comments blanked, so a file may explain itself freely. */
const code = (relativePath) =>
  read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const WORKSPACE_ALIASES = [
  ['@contentfactory/frontend/', 'apps/frontend/src/'],
  ['@contentfactory/nestjs-libraries/', 'libraries/nestjs-libraries/src/'],
  ['@contentfactory/react/', 'libraries/react-shared-libraries/src/'],
  ['@contentfactory/helpers/', 'libraries/helpers/src/'],
];

/** The shared loader takes a file; an import names a module. */
const loadModulePath = (relativePath) => {
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = relativePath + suffix;
    if (fs.existsSync(path.join(repositoryRoot, candidate))) {
      return loadTypeScriptModule(candidate);
    }
  }
  throw new Error(`cannot resolve ${relativePath}`);
};

/**
 * The container, compiled with only its two edges replaced.
 *
 * Everything below it is the real thing — the accepted strip, its copy, the
 * shared button — because a stubbed strip would let the container and the
 * component disagree while this file still passed. Only the transport and the
 * interface language are mocked, since those are what a test has to steer.
 */
const loadContainer = (mocks) => {
  const filename = path.join(repositoryRoot, CONTAINER_FILE);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (request.startsWith('.')) {
      return loadModulePath(
        path.relative(
          repositoryRoot,
          path.resolve(path.dirname(filename), request)
        )
      );
    }
    for (const [alias, target] of WORKSPACE_ALIASES) {
      if (request.startsWith(alias)) {
        return loadModulePath(target + request.slice(alias.length));
      }
    }
    return require(request);
  };

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));

  return loaded.exports;
};

const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const retention = loadTypeScriptModule(`${base}/voice-retention.ts`);
const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const contract = loadTypeScriptModule(`${base}/voice-wiring.contract.ts`);

const VOICE_API = contract.VOICE_API_BASE;
const RIBBON = `${VOICE_API}/ribbon`;
const PLAN = `${VOICE_API}/injection-plan`;
const CHECK = `${VOICE_API}/text-check`;

/* -------------------------------------------------------------------------
 * The author, measured once, exactly as the product measures one.
 * ---------------------------------------------------------------------- */

const plain = (index) => `
Поставщика поменяли — старый срывал сроки третий месяц. Новый везёт из Челябинска, доставка на два дня дольше. Зато по графику.

Мы вчера догнали план. Правда, ценой субботней смены. У нас на участке это уже третий раз за квартал.

Сроки сдвинулись на два дня. Причина — поставка. Мастер смены предупредил заранее, и это правильно: лучше знать за неделю, чем узнать в пятницу.

Что делаем дальше? Ставим контрольную точку на среду. Проверяем остатки. Если подшипники придут, линию запускаем в четверг.

Отгрузка ${index} прошла по факту без лишних слов. Мы её приняли. Смена отработала ровно.
`;

const clerical = `
Проведение мероприятий по обеспечению выполнения плановых показателей осуществляется в соответствии с утверждённым регламентом организации предприятия. Обеспечение соблюдения установленных требований возлагается на ответственных должностных лиц подразделения.

Компания информирует о следующем обстоятельстве. Предприятие осуществляет выполнение принятых обязательств в полном объёме, что подтверждается результатами проведения контрольных мероприятий.

Организация обеспечивает предоставление необходимой документации. Проведение проверки назначено на согласованную ранее дату заседания комиссии.
`.repeat(4);

/**
 * Рабочая точка едет с измерением с 27.08.2026.
 *
 * Без неё «похоже» не выносится вовсе: константа `2/3`, стоявшая тут раньше,
 * на шеренге из настоящих авторов отвергала от 41% до 71% собственных
 * отложенных постов трёх измеренных людей. Границы снимаются на настоящих
 * голосах — тех же двух манерах, что проверяются ниже, только за пределами
 * корпуса.
 */
const measurement = withCalibration(
  analyzer.analyzeBrandVoice(
    Array.from({ length: 14 }, (unused, index) => ({
      code: `smp-${String(index + 1).padStart(2, '0')}`,
      text: plain(index + 1),
      language: 'ru',
      contentHash: `hash-${String(index + 1).padStart(4, '0')}`,
    }))
  ),
  Array.from({ length: 24 }, (unused, index) => plain(100 + index)),
  Array.from({ length: 24 }, (unused, index) => `${clerical}\n\nПункт ${100 + index} настоящего регламента подлежит применению в установленном порядке.`)
);

const voiceBlock = retention.renderVoiceInjection({
  pointOfView: 'company_we',
  formality: 'neutral',
  prose: 'Спокойно и по делу.',
});

/* -------------------------------------------------------------------------
 * The routes, answered the way the backend answers them.
 * ---------------------------------------------------------------------- */

const freshRibbon = {
  state: 'fresh',
  details: {
    versionLabel: 'v3',
    profileLabel: 'Цех',
    contextLabel: 'август',
    contextAgeDays: 2,
    factCount: 6,
    evidenceCount: 11,
  },
};

const defaultRoutes = () => ({
  [RIBBON]: () => freshRibbon,
  [PLAN]: (body) => ({
    injections: retention.planInjections(voiceBlock, body.boundaries),
  }),
  // The same functions that drew the corridor, over the wire. A stub with its
  // own idea of "outside" would prove nothing about the rule this exists for.
  [CHECK]: (body) => retention.checkText(body.text, measurement, 'ru'),
});

const mount = ({ chunks = [''], routes = {}, locale = 'ru' } = {}) => {
  const answers = { ...defaultRoutes(), ...routes };
  const calls = [];

  const request = jest.fn(async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? 'GET', body });
    const answer = answers[url];
    if (!answer) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    const value = typeof answer === 'function' ? answer(body) : answer;
    if (value && value.httpStatus) {
      return { ok: false, status: value.httpStatus, json: async () => value };
    }
    return { ok: true, status: 200, json: async () => value };
  });

  const { VoiceRibbonContainer } = loadContainer({
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: locale }),
    },
  });

  render(
    h(
      SWRConfig,
      // A cache per mount, so one test's answer is never another's, and no
      // retry timer outlives the run.
      {
        value: {
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
          // SWR's "this is taking a while" timer is three seconds of nothing
          // once a test has its answer, and Jest counts it as a live handle.
          loadingTimeout: 0,
        },
      },
      h(VoiceRibbonContainer, { chunks, checkDebounceMs: 0 })
    )
  );

  return { calls, request };
};

const strip = () => document.querySelector('[data-voice-ribbon-state]');
const retentionLine = () => document.querySelector('[data-voice-retention]');
const corridorLine = () => document.querySelector('[data-voice-corridor]');

const called = (calls, url) => calls.filter((one) => one.url === url);

afterEach(cleanup);

/* -------------------------------------------------------------------------
 * 1. The state is the server's answer, not the client's arithmetic.
 * ---------------------------------------------------------------------- */

describe('the strip takes its state from the product', () => {
  test('renders the state the route reports, verbatim', async () => {
    mount({ routes: { [RIBBON]: () => freshRibbon } });

    await waitFor(() =>
      expect(strip()?.getAttribute('data-voice-ribbon-state')).toBe('fresh')
    );
    expect(screen.getByText(/Цех/)).toBeTruthy();
  });

  test.each([['stale-context'], ['voice-moved'], ['no-profile']])(
    'renders %s when the route says so',
    async (state) => {
      mount({
        routes: {
          [RIBBON]: () => ({
            state,
            details: {
              versionLabel: 'v2',
              currentVersionLabel: 'v4',
              // Two days old. A client that decided staleness on its own
              // thirty-day constant would call this fresh and be wrong.
              contextAgeDays: 2,
            },
          }),
        },
      });

      await waitFor(() =>
        expect(strip()?.getAttribute('data-voice-ribbon-state')).toBe(state)
      );
    }
  );

  test('the container never decides freshness itself', () => {
    const source = code(CONTAINER_FILE);

    // Age is the server's judgement: it holds the snapshot's expiry, and a
    // day count compiled into the client is a second opinion that cannot be
    // corrected without a release.
    expect(source).not.toContain('contextAgeDays');
    expect(source).not.toMatch(/STALE_AFTER|_DAYS\b/);
  });

  test('a refused route says so instead of inventing a voice', async () => {
    mount({ routes: { [RIBBON]: () => ({ httpStatus: 502 }) } });

    await waitFor(() =>
      expect(
        document.querySelector('[data-voice-ribbon-live="error"]')
      ).toBeTruthy()
    );
    expect(strip()).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * 2. The voice is restated at the boundaries the form really has.
 * ---------------------------------------------------------------------- */

describe('the voice is held across a long generation', () => {
  test('a thread names the voice before every item', async () => {
    const { calls } = mount({
      chunks: ['Первый кусок ветки.', 'Второй кусок.', 'Третий кусок.'],
    });

    await waitFor(() => expect(called(calls, PLAN)).toHaveLength(1));
    const [plan] = called(calls, PLAN);
    expect(plan.method).toBe('POST');
    // Three boxes, two boundaries between them, and the injection at the
    // start makes three namings — one per item.
    expect(plan.body.boundaries).toEqual(['thread-item', 'thread-item']);

    const expected = retention.planInjections(
      voiceBlock,
      plan.body.boundaries
    ).length;
    expect(expected).toBe(3);
    await waitFor(() =>
      expect(retentionLine()?.getAttribute('data-voice-retention')).toBe(
        String(expected)
      )
    );
  });

  /**
   * У одиночного поста строки о повторах нет вовсе.
   *
   * Она говорила «голос назван один раз: у одиночного поста нет границы,
   * повтор был бы шумом» — это объяснение устройства генератора человеку,
   * который просто пишет пост (замечание владельца 04.09.2026). Повтор
   * по-прежнему не планируется; молчит теперь и экран.
   */
  test('a single post is neither repeated at nor talked about', async () => {
    const { calls } = mount({ chunks: ['Один пост, одна мысль.'] });

    await waitFor(() => expect(called(calls, PLAN)).toHaveLength(1));
    const [plan] = called(calls, PLAN);
    expect(plan.body.boundaries).toEqual([]);
    expect(retentionLine()).toBeNull();
  });

  test('nothing is planned when there is no voice to inject', async () => {
    const { calls } = mount({
      chunks: ['Первый.', 'Второй.'],
      routes: { [RIBBON]: () => ({ state: 'no-profile', details: {} }) },
    });

    await waitFor(() =>
      expect(strip()?.getAttribute('data-voice-ribbon-state')).toBe(
        'no-profile'
      )
    );
    expect(called(calls, PLAN)).toHaveLength(0);
    expect(retentionLine()).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * 3. The corridor is this author's, and the remark is the product's words.
 * ---------------------------------------------------------------------- */

describe('the corridor remark belongs to this author', () => {
  test('text unlike the author is named, in the words the route sent', async () => {
    const { calls } = mount({ chunks: [clerical] });

    await waitFor(() => expect(corridorLine()).toBeTruthy());
    const [check] = called(calls, CHECK);
    expect(check.method).toBe('POST');
    expect(check.body.text).toContain('Проведение мероприятий');

    const server = retention.checkText(clerical, measurement, 'ru');
    expect(server.outside.length).toBeGreaterThan(0);
    // The line the screen prints is the line the product computed. A second
    // wording on the client is a second opinion.
    expect(corridorLine()?.textContent).toContain(server.summary);
  });

  test('text written like the author raises nothing', async () => {
    const inside = plain(99);
    expect(retention.checkText(inside, measurement, 'ru').outside).toHaveLength(
      0
    );

    const { calls } = mount({ chunks: [inside] });

    await waitFor(() => expect(called(calls, CHECK)).toHaveLength(1));
    await waitFor(() =>
      expect(strip()?.getAttribute('data-voice-ribbon-state')).toBe('fresh')
    );
    // The one answer is shown either way — a person writing wants to know
    // whether this reads like them, and silence is not an answer. What does
    // not appear is the warning tone: inside this author's own corridor there
    // is nothing to warn about, and warning anyway turns the check into a
    // style guide nobody asked for.
    const line = corridorLine();
    expect(line?.getAttribute('data-voice-similarity')).toBe('CLOSE');
    expect(line?.getAttribute('data-voice-corridor')).toBe('false');
    expect(line?.getAttribute('class')).not.toContain('cf-warning');
    expect(line?.textContent).toContain('Похоже на ваш обычный стиль');
  });

  test('the whole thread is measured, not only its first box', async () => {
    const { calls } = mount({
      chunks: [clerical, 'Организация обеспечивает предоставление сведений.'],
    });

    await waitFor(() => expect(called(calls, CHECK)).toHaveLength(1));
    expect(called(calls, CHECK)[0].body.text).toContain(
      'Организация обеспечивает предоставление сведений.'
    );
  });

  test('nothing is measured while there is nothing written', async () => {
    const { calls } = mount({ chunks: [''] });

    await waitFor(() => expect(called(calls, RIBBON)).toHaveLength(1));
    expect(called(calls, CHECK)).toHaveLength(0);
  });

  test('the container carries no corridor of its own', () => {
    const source = code(CONTAINER_FILE);

    // The corridor is measured where the samples were measured. A threshold
    // retyped here would drift from the one the profile was built with.
    expect(source).not.toMatch(/\blow\b|\bhigh\b|placement/);
    expect(source).not.toContain('checkText');
  });
});

/* -------------------------------------------------------------------------
 * 4. Чего стоит вердикт, и что делать, когда его нет.
 * ---------------------------------------------------------------------- */

const errorsBlock = () =>
  document.querySelector('[data-voice-calibration-errors]');
const silenceLine = () => document.querySelector('[data-voice-silence]');

describe('экран показывает две доли ошибок, а не один процент', () => {
  test('обе строки видны, с настоящими знаменателями', async () => {
    const inside = plain(99);
    const server = retention.checkText(inside, measurement, 'ru');
    expect(server.similarity.verdict).toBe('CLOSE');

    mount({ chunks: [inside] });

    await waitFor(() => expect(errorsBlock()).toBeTruthy());
    const block = errorsBlock();

    // Не процент: знаменатель и числитель стоят рядом, потому что «ошибка
    // 5%» на двух десятках текстов — это одно наблюдение.
    expect(block.textContent).toContain(
      server.calibrationErrors.falseAccept.text
    );
    expect(block.textContent).toContain(
      server.calibrationErrors.falseReject.text
    );
    expect(block.textContent).toContain(
      String(measurement.calibration.falseAccept.of)
    );
    expect(block.textContent).not.toMatch(/\d+%/);

    // Обе, а не одна: показать только ложно принятых значит показать ту
    // половину размена, которая продукту льстит.
    expect(block.querySelector('[data-voice-false-accept]')).toBeTruthy();
    expect(block.querySelector('[data-voice-false-reject]')).toBeTruthy();
  });

  test('счётчики приходят с сервера, а не считаются на экране', () => {
    const source = code(CONTAINER_FILE);

    // Порог и его цена сняты там же, где мерились тексты. Пересчёт здесь
    // разъехался бы с вердиктом, который он объясняет.
    expect(source).not.toMatch(/falseAccept\s*[/*+-]|\bwrong\s*\//);
    expect(source).not.toContain('calibrate(');
    expect(source).not.toMatch(/toFixed|Math\.round/);
  });

  test('без калибровки долей ошибок на экране нет', async () => {
    const uncalibrated = { ...measurement, calibration: null };
    const inside = plain(99);
    expect(retention.checkText(inside, uncalibrated, 'ru').similarity.reason).toBe(
      'UNCALIBRATED'
    );

    mount({
      chunks: [inside],
      routes: {
        [CHECK]: (body) => retention.checkText(body.text, uncalibrated, 'ru'),
      },
    });

    await waitFor(() => expect(corridorLine()).toBeTruthy());
    // Ноль прочитался бы как «ни разу не ошиблась». Правда — «никто не
    // мерил», и она обязана выглядеть как отсутствие.
    expect(errorsBlock()).toBeNull();
  });
});

describe('три состояния молчания различимы и предлагают разное', () => {
  /** Один пост автора и четыре абзаца канцелярита ложатся в слепую полосу. */
  const between = [
    plain(99).trim().split('\n\n')[0],
    ...clerical.trim().split('\n\n').slice(0, 4),
  ].join('\n\n');

  const cases = [
    ['TOO_SHORT', plain(99).trim().slice(0, 160), measurement],
    ['CANNOT_TELL', between, measurement],
    ['UNCALIBRATED', plain(99), { ...measurement, calibration: null }],
  ];

  test.each(cases)('%s назван на экране своим именем', async (
    reason,
    text,
    used
  ) => {
    const server = retention.checkText(text, used, 'ru');
    expect(server.similarity.verdict).toBe('UNKNOWN');
    expect(server.similarity.reason).toBe(reason);

    mount({
      chunks: [text],
      routes: { [CHECK]: (body) => retention.checkText(body.text, used, 'ru') },
    });

    await waitFor(() => expect(silenceLine()).toBeTruthy());
    // До 27.08.2026 все три приходили одним `UNKNOWN`, и человек не мог
    // отличить «допишите» от «подождите».
    expect(silenceLine().getAttribute('data-voice-silence')).toBe(reason);
    expect(silenceLine().textContent).toBe(server.silenceHint);
    expect(corridorLine().getAttribute('data-voice-similarity')).toBe('UNKNOWN');
  });

  test('три молчания предлагают три разных выхода', () => {
    const lines = cases.map(
      ([, text, used]) => retention.checkText(text, used, 'ru').silenceHint
    );

    expect(new Set(lines).size).toBe(3);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });

  test('вынесенный вердикт подсказку не показывает', async () => {
    mount({ chunks: [plain(99)] });

    await waitFor(() =>
      expect(corridorLine()?.getAttribute('data-voice-similarity')).toBe('CLOSE')
    );
    // «Попробуйте другой текст» под уверенным «похоже» читалось бы как
    // сомнение в нём.
    expect(silenceLine()).toBeNull();
  });

  test('слова молчания — серверные, экран своих не пишет', () => {
    const source = code(CONTAINER_FILE);

    expect(source).not.toContain('CANNOT_TELL');
    expect(source).not.toContain('UNCALIBRATED');
    expect(source).not.toContain('TOO_SHORT');
  });
});

/* -------------------------------------------------------------------------
 * 5. The post window: one line of provenance, and no strip.
 * ---------------------------------------------------------------------- */

describe('the post window', () => {
  /**
   * Ленты голоса в окне поста больше нет.
   *
   * 04.09.2026 владелец сказал: окно даёт только полезное. Лента отвечала на
   * вопрос «что применено» пятью значениями через точку и двумя кнопками, а
   * рядом стояла панель контекста с тем же ответом другими словами. Вместо
   * них — одна строка происхождения, и только у поста, который контекст
   * несёт. Контейнер ленты остался: он живёт своей проверкой и своим
   * маршрутом, но окно его больше не зовёт.
   */
  test('does not mount the strip any more', () => {
    const form = code(FORM_FILE);

    expect(form).not.toContain('VoiceRibbonContainer');
    expect(form).not.toContain('brand-voice/voice-ribbon.container');
  });

  test('shows one line of provenance, and only when the post carries context', () => {
    const form = code(FORM_FILE);

    expect(form).toContain('<ProvenanceLine');
    const mountIndex = form.indexOf('<ProvenanceLine');
    const preceding = form.slice(Math.max(0, mountIndex - 200), mountIndex);
    expect(preceding).toMatch(/contentIntelligenceProvenance\s*&&/);
  });
});
