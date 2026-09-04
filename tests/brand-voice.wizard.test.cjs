'use strict';

/**
 * The voice wizard on live data: screens 01–05 behind the routes that feed them.
 *
 * The screens were accepted by `36r` and are not redrawn here. What is under
 * test is the wire: whether a reason the server named reaches the person, and
 * whether the corpus and the decided fields survive a reload — which they can
 * only do if the container reads them back rather than remembering them.
 *
 * Three of these are the failures the wiring is most likely to have. A screen
 * printing "что-то пошло не так" over a server that said `VOICE_SAMPLE_
 * UNREADABLE` throws the reason away between two processes. A shortfall shown
 * as an error tells a workspace it did something wrong when it merely has less
 * text than the floor. And an analysis with no end leaves a spinner turning
 * over a request that died.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
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
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

/**
 * The two buttons every test in this file presses, named once.
 *
 * Twenty-three copies of one label meant that renaming «Создать голос бренда»
 * to «Создать аватар» — the owner's word, 2026-08-25 — was twenty-three edits
 * to a file that tests behaviour rather than wording. What the tests assert is
 * that a button opens the wizard, not what it says on it.
 */
const openWizard = (screen) =>
  screen.getByRole('button', { name: 'Создать аватар' });
const activateButton = (screen) =>
  screen.getByRole('button', { name: 'Включить аватар' });

const BASE = 'apps/frontend/src/components/brand-voice';
const CONTAINER = `${BASE}/voice-wizard.container.tsx`;
const ADAPTER = `${BASE}/voice-wizard.adapter.ts`;
const VOICE_API = '/content-intelligence/voice';

/* -------------------------------------------------------------------------
 * Loading the container with its hooks replaced
 * ---------------------------------------------------------------------- */

const ALIASES = [
  ['@contentfactory/frontend/', 'apps/frontend/src/'],
  ['@contentfactory/helpers/', 'libraries/helpers/src/'],
  ['@contentfactory/nestjs-libraries/', 'libraries/nestjs-libraries/src/'],
  ['@contentfactory/react/', 'libraries/react-shared-libraries/src/'],
];
const SUFFIXES = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

const existing = (candidate) => {
  for (const suffix of SUFFIXES) {
    const withSuffix = candidate + suffix;
    const absolute = path.join(root, withSuffix);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      return withSuffix;
    }
  }
  return null;
};

const workspacePath = (request) => {
  for (const [alias, target] of ALIASES) {
    if (!request.startsWith(alias)) continue;
    const resolved = existing(target + request.slice(alias.length));
    if (!resolved) throw new Error(`cannot resolve ${request}`);
    return resolved;
  }
  return null;
};

/**
 * The real screens, the real primitives, mocked hooks.
 *
 * Mocking the screens would leave the interesting half untested: whether the
 * server's sentence lands where a person reads it is a fact about the rendered
 * markup, not about the props object.
 */
function loadWithMocks(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const directory = path.posix.dirname(relativePath);
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (request.startsWith('.')) {
      const resolved = existing(path.posix.join(directory, request));
      if (!resolved) throw new Error(`cannot resolve ${request}`);
      return loadTypeScriptModule(resolved);
    }
    const workspace = workspacePath(request);
    return workspace ? loadTypeScriptModule(workspace) : require(request);
  };
  const loaded = { exports: {} };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

/** A minimal SWR: fetch on key change, expose `mutate`, skip a null key. */
function createUseSWR() {
  return function useSWR(key, fetcher) {
    const [state, setState] = React.useState(() => ({
      isLoading: Boolean(key),
    }));
    const latest = React.useRef(fetcher);
    latest.current = fetcher;
    const run = React.useCallback(async () => {
      if (!key) return undefined;
      try {
        const data = await latest.current();
        setState({ data, isLoading: false });
        return data;
      } catch (error) {
        setState({ error, isLoading: false });
        return undefined;
      }
    }, [key]);
    React.useEffect(() => {
      if (!key) {
        setState({ isLoading: false });
        return;
      }
      setState({ isLoading: true });
      void run();
    }, [key, run]);
    return {
      data: state.data,
      error: state.error,
      isLoading: Boolean(state.isLoading),
      mutate: async (next) => {
        if (next !== undefined) {
          setState({ data: next, isLoading: false });
          return next;
        }
        return run();
      },
    };
  };
}

/* -------------------------------------------------------------------------
 * A server that answers like the controller does
 * ---------------------------------------------------------------------- */

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function createServer(routes) {
  const calls = [];
  const request = async (route, init = {}) => {
    const method = init.method ?? 'GET';
    // Files travel as multipart; everything else as JSON. Parsing a `FormData`
    // as JSON is how a suite that only knew about one of them would fail.
    const body =
      init.body instanceof FormData
        ? init.body
        : init.body
        ? JSON.parse(init.body)
        : undefined;
    calls.push({ method, route, body, signal: init.signal });
    const handler = routes[`${method} ${route}`];
    if (!handler) {
      return json(404, {
        code: 'VOICE_PROFILE_NOT_FOUND',
        message: `no route for ${method} ${route}`,
      });
    }
    const answer =
      typeof handler === 'function' ? await handler(body, init) : handler;
    return answer && typeof answer.status === 'number' && 'body' in answer
      ? json(answer.status, answer.body)
      : json(200, answer);
  };
  return { request, calls };
}

const readiness = (over = {}) => ({
  ready: false,
  charCount: 6400,
  sampleCount: 5,
  missingChars: 8600,
  missingSamples: 3,
  confidence: 'LOW',
  ...over,
});

const permissions = (over = {}) => ({
  canRead: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  referencePathDisabled: false,
  ...over,
});

const pathAvailability = (over = {}) => ({
  available: { manual: true, own: true, reference: true },
  disabledReasons: {},
  ...over,
});

const overview = (over = {}) => ({
  contractVersion: 'brand-voice-wiring/v1',
  hasVoice: false,
  state: 'empty',
  permissions: permissions(),
  readiness: readiness(),
  paths: pathAvailability(),
  ...over,
});

const sampleRow = (index, charCount = 2000) => ({
  id: `sample-${index}`,
  code: `smp-0${index}`,
  title: `Текст ${index}`,
  origin: 'PASTE',
  usagePurpose: 'OWN_VOICE',
  charCount,
  date: `0${index}.08.2026`,
});

const fullCorpus = () =>
  Array.from({ length: 8 }, (_, index) => sampleRow(index + 1, 2000));

const samplesEnvelope = (over = {}) => ({
  state: 'default',
  samples: fullCorpus(),
  sources: [
    { key: 'OWN_POST', available: true },
    { key: 'TELEGRAM_EXPORT', available: true },
    { key: 'PASTE', available: true },
    { key: 'FILE', available: true },
    { key: 'SOURCE_SNAPSHOT', available: true },
  ],
  readiness: readiness({ ready: true, charCount: 16000, sampleCount: 8, missingChars: 0, missingSamples: 0, confidence: 'NORMAL' }),
  ...over,
});

const proposalField = (key, status = 'UNDECIDED') => ({
  key,
  text: `Предложение для ${key}`,
  status,
  observationRefs: ['smp-01#1'],
});

const proposalEnvelope = (fields) => ({
  outcome: 'ready',
  state: 'default',
  mode: 'assist',
  fields,
  observations: [
    {
      ref: 'smp-01#1',
      index: 1,
      field: 'TONE',
      claim: 'Пишет короткими фразами',
      quote: 'Причина — поставка.',
      sampleCode: 'smp-01',
    },
  ],
  profileLabel: 'Голос v1',
});

const MANUAL_KEYS = [
  'WHO_SPEAKS',
  'TONE',
  'AUDIENCE',
  'SENTENCE_LENGTH',
  'NEVER_SAY',
];

/** The hand-filled draft the way `manualProposal` answers with it. */
const manualEnvelope = (written = {}) => {
  const fields = MANUAL_KEYS.map((key) => ({
    key,
    text: written[key] ?? '',
    status: (written[key] ?? '').trim() ? 'ACCEPTED' : 'UNDECIDED',
    observationRefs: [],
  }));
  return {
    outcome: 'ready',
    state: fields.some((field) => field.text) ? 'default' : 'empty',
    mode: 'manual',
    fields,
    observations: [],
  };
};

const analysisReady = () => ({
  outcome: 'ready',
  measurementId: 'measurement-1',
  analyzerVersion: 'brand-voice-analyzer/1.0.0',
  localePackVersion: 'ru-2026-08-22',
  language: 'ru',
  sampleCount: 8,
  charCount: 16000,
  wordCount: 2400,
  sentenceCount: 190,
  lexicon: [],
  punctuation: {
    dashInsteadOfCopula: null,
    colonBeforeList: null,
    questionAtEnd: null,
    exclamation: null,
  },
  rejected: [],
});

function mount(server, { language = 'ru' } = {}) {
  const container = loadWithMocks(CONTAINER, {
    swr: { __esModule: true, default: createUseSWR() },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => server.request,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language }),
    },
  });
  expect(typeof container.VoiceWizardContainer).toBe('function');
  return container;
}

const renderWizard = async (server, options) => {
  const { VoiceWizardContainer } = mount(server, options);
  let view;
  await act(async () => {
    view = render(React.createElement(VoiceWizardContainer));
  });
  await act(async () => {});
  return view;
};

const surface = (name) =>
  document.querySelector(`[data-voice-surface="${name}"]`);

/** A file of a stated weight, which is all the picking rules read. */
const makeFile = (name, size) => {
  const file = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

/** Picking files in the dialog: jsdom will not let `files` be assigned. */
const pick = async (input, files) => {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => {
    fireEvent.change(input);
  });
  await act(async () => {});
};

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await act(async () => {});
};

afterEach(cleanup);

/* -------------------------------------------------------------------------
 * The wire
 * ---------------------------------------------------------------------- */

describe('the voice wizard on live data', () => {
  test('screen 01 reports the state and the reason the server gave, not a guess', async () => {
    // A member may read a voice and may not make one. The server says both —
    // the permission and the sentence — and a screen inventing its own wording
    // would be a second policy nobody can change from the backend.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview({
        permissions: permissions({
          canCreate: false,
          canEdit: false,
          canDelete: false,
        }),
        note: 'Раздел открыт на чтение: изменить голос может администратор.',
      }),
    });
    await renderWizard(server);

    const empty = surface('empty');
    expect(empty).not.toBeNull();
    expect(empty.getAttribute('data-voice-state')).toBe('restricted');
    expect(empty.textContent).toContain(
      'Раздел открыт на чтение: изменить голос может администратор.'
    );
    expect(
      openWizard(screen).disabled
    ).toBe(true);
  });

  test('screen 02 shows a closed path with the sentence the server sent', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: {
        state: 'default',
        available: { manual: true, own: true, reference: false },
        disabledReasons: {
          reference: 'Организация отключила путь «по образцу чужого стиля».',
        },
      },
    });
    await renderWizard(server);

    await click(openWizard(screen));

    const paths = surface('paths');
    expect(paths).not.toBeNull();
    expect(paths.textContent).toContain(
      'Организация отключила путь «по образцу чужого стиля».'
    );
    const reference = document.querySelector('[data-voice-path-index="3"]');
    expect(reference.getAttribute('aria-disabled')).toBe('true');
    expect(reference.querySelector('button').disabled).toBe(true);
  });

  test('a refusal reaches screen 03 with the server code and message', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: {
        state: 'default',
        ...pathAvailability(),
      },
      [`GET ${VOICE_API}/samples`]: {
        status: 422,
        body: {
          code: 'VOICE_SAMPLE_UNREADABLE',
          message: 'Образец smp-03 не читается: файл повреждён.',
          subject: 'smp-03',
        },
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));

    const samples = surface('samples');
    expect(samples).not.toBeNull();
    expect(samples.getAttribute('data-voice-state')).toBe('error');
    expect(screen.getByRole('alert').textContent).toContain(
      'Образец smp-03 не читается: файл повреждён.'
    );
    // The screen's own fallback sentence must not paper over a named reason.
    expect(samples.textContent).not.toContain('Формат не распознан');
  });

  test('a shortfall is a result: the number arrives from the server and no alert fires', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: {
        outcome: 'insufficient',
        readiness: readiness({ missingChars: 8600, missingSamples: 3 }),
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));

    expect(screen.queryByRole('alert')).toBeNull();
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/8[\s  ]?600/);
    expect(status.textContent).toContain('3');
    expect(surface('samples').getAttribute('data-voice-state')).not.toBe(
      'error'
    );
  });

  test('the analysis step has a beginning and an end: busy while it runs, error when it dies', async () => {
    let finish;
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));

    // Screen 04 is its own component now: busy while the request is still
    // in flight, with a caption saying what is happening.
    expect(surface('analysis').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toMatch(/Читаем образцы/i);

    await act(async () => {
      finish({
        status: 500,
        body: {
          code: 'VOICE_ANALYSIS_FAILED',
          message: 'Разбор не удалось завершить.',
        },
      });
    });
    await act(async () => {});

    const analysis = surface('analysis');
    expect(analysis.getAttribute('aria-busy')).toBeNull();
    expect(analysis.getAttribute('data-voice-state')).toBe('error');
    expect(screen.getByRole('alert').textContent).toContain(
      'Разбор не удалось завершить.'
    );
  });

  test('a model that did not answer leaves the numbers on screen, not a promise of them', async () => {
    // `VOICE_ASSIST_UNAVAILABLE` says «Числа разбора сохранены». The server
    // saves them before it asks the model, so the screen has to read them back
    // — otherwise the card under that alert says the numbers are still coming,
    // and the only way to see them is to pay for the run again.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: {
        status: 502,
        body: {
          code: 'VOICE_ASSIST_UNAVAILABLE',
          message:
            'Модель не ответила. Числа разбора сохранены, предложение голоса не составлено.',
        },
      },
      [`GET ${VOICE_API}/analysis`]: analysisReady(),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await act(async () => {});

    const analysis = surface('analysis');
    expect(analysis.getAttribute('data-voice-state')).toBe('error');
    expect(screen.getByRole('alert').textContent).toContain(
      'Числа разбора сохранены'
    );
    // The saved arithmetic is shown rather than promised.
    expect(analysis.textContent).not.toContain(
      'Числа появятся, когда разбор досчитает до конца'
    );
    expect(
      analysis.querySelector('[data-voice-analysis-sentence-length]')
    ).not.toBeNull();
    expect(analysis.textContent).toContain('100%');
  });

  test('an analysis that answers "pending" is followed until it finishes', async () => {
    // The deterministic pass finishes inside the POST; the agent pass may not,
    // and the contract has a `pending` outcome for it. A step that stopped
    // reading at the first `pending` would leave the finished proposal unshown.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: {
        outcome: 'pending',
        progress: 40,
        stage: 'ASSISTING',
      },
      [`GET ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: proposalEnvelope([proposalField('TONE')]),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));

    expect(
      server.calls.some(
        (call) => call.method === 'GET' && call.route === `${VOICE_API}/analysis`
      )
    ).toBe(true);
    // The finished pass stays on screen 04 — the person reads what was
    // counted — until they choose to move on.
    expect(surface('analysis').getAttribute('data-voice-state')).toBe(
      'success'
    );
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));
    expect(surface('proposal')).not.toBeNull();
    expect(surface('proposal').textContent).toContain('Предложение для TONE');
  });

  test('a finished analysis shows what was counted, and screen 05 opens on request', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: proposalEnvelope([
        proposalField('WHO_SPEAKS'),
        proposalField('TONE'),
      ]),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));

    const analysis = surface('analysis');
    expect(analysis).not.toBeNull();
    expect(analysis.getAttribute('data-voice-state')).toBe('success');
    // `analysisReady()` carries 8 samples and a word/sentence count the
    // screen turns into an average length — real numbers, not a guess.
    expect(analysis.textContent).toContain('8 образцов');
    expect(analysis.textContent).toContain('12,6');

    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));

    const proposal = surface('proposal');
    expect(proposal).not.toBeNull();
    expect(proposal.textContent).toContain('Предложение для TONE');
    expect(proposal.textContent).toContain('Причина — поставка.');
    expect(proposal.textContent).toContain('Голос v1');
  });

  test('a reload keeps the corpus and the decided fields, because the server keeps them', async () => {
    const stored = {
      samples: samplesEnvelope(),
      fields: [proposalField('WHO_SPEAKS'), proposalField('TONE')],
    };
    const routes = {
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: () => stored.samples,
      [`POST ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: () => proposalEnvelope(stored.fields),
      [`POST ${VOICE_API}/proposal/field`]: (body) => {
        const field = stored.fields.find((one) => one.key === body.key);
        if (body.action === 'ACCEPT') field.status = 'ACCEPTED';
        return proposalEnvelope(stored.fields);
      },
    };
    const server = createServer(routes);
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));

    const tone = document.querySelector('[data-voice-field="TONE"]');
    await click(tone.querySelector('button'));
    expect(
      server.calls.some(
        (call) =>
          call.route === `${VOICE_API}/proposal/field` &&
          call.body.key === 'TONE' &&
          call.body.action === 'ACCEPT'
      )
    ).toBe(true);
    expect(
      document
        .querySelector('[data-voice-field="TONE"]')
        .getAttribute('data-voice-field-status')
    ).toBe('ACCEPTED');

    // The reload: a second container, a second server object, the same store.
    cleanup();
    const reopened = createServer(routes);
    await renderWizard(reopened);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));

    expect(surface('samples').textContent).toContain('smp-01');
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));
    expect(
      document
        .querySelector('[data-voice-field="TONE"]')
        .getAttribute('data-voice-field-status')
    ).toBe('ACCEPTED');
  });

  test('a pasted text reaches the corpus, and a refused one is named with its reason', async () => {
    const stored = samplesEnvelope({ samples: [sampleRow(1)], state: 'default' });
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: () => ({ ...stored }),
      [`POST ${VOICE_API}/samples`]: (body) => {
        stored.samples = [...stored.samples, sampleRow(2)];
        return {
          accepted: [sampleRow(2)],
          rejected: [{ title: body.items[0].title, reason: 'DUPLICATE' }],
          readiness: readiness(),
        };
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Вставить' }));

    const textarea = document.querySelector('textarea');
    expect(textarea).not.toBeNull();
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Причина — поставка.' } });
    });
    await click(screen.getByRole('button', { name: 'Добавить в набор' }));

    const posted = server.calls.find(
      (call) => call.method === 'POST' && call.route === `${VOICE_API}/samples`
    );
    expect(posted.body.origin).toBe('PASTE');
    expect(posted.body.usagePurpose).toBe('OWN_VOICE');
    expect(posted.body.items[0].text).toBe('Причина — поставка.');
    // The refused text is named, with the reason, on the screen the person is
    // looking at — not counted silently into "1 of 2 added".
    expect(surface('samples').textContent).toContain('уже есть в наборе');
    expect(surface('samples').textContent).toContain('smp-02');
  });

  test('deleting a sample says what it cost, in the words the server used', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: () =>
        samplesEnvelope({ samples: [sampleRow(1), sampleRow(2)] }),
      [`DELETE ${VOICE_API}/samples`]: () =>
        samplesEnvelope({
          samples: [sampleRow(2)],
          notice:
            'Удалено образцов: 1. Разбор помечен устаревшим — числа посчитаны на прежнем корпусе.',
        }),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));

    const row = document.querySelector('[data-voice-sample="smp-01"]');
    await act(async () => {
      fireEvent.click(row.querySelector('input[type="checkbox"]'));
    });
    await click(screen.getByRole('button', { name: 'Удалить выбранные' }));

    const call = server.calls.find((one) => one.method === 'DELETE');
    expect(call.body.codes).toEqual(['smp-01']);
    expect(document.querySelector('[data-voice-sample="smp-01"]')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'Разбор помечен устаревшим'
    );
  });

  test('a reference text carries the confirmed right and the date it is erased', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope({ samples: [] }),
      [`POST ${VOICE_API}/samples`]: {
        accepted: [sampleRow(1)],
        rejected: [],
        readiness: readiness(),
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Указать автора' }));
    await click(screen.getByRole('button', { name: 'Вставить' }));

    await act(async () => {
      fireEvent.change(document.querySelector('textarea'), {
        target: { value: 'Чужой текст.' },
      });
      fireEvent.click(document.querySelector('input[type="checkbox"]'));
      fireEvent.change(document.querySelector('input[type="date"]'), {
        target: { value: '2026-11-20' },
      });
    });
    await click(screen.getByRole('button', { name: 'Добавить в набор' }));

    const posted = server.calls.find(
      (call) => call.method === 'POST' && call.route === `${VOICE_API}/samples`
    );
    expect(posted.body.usagePurpose).toBe('STYLE_REFERENCE');
    expect(posted.body.rightsConfirmed).toBe(true);
    expect(posted.body.retentionUntil).toContain('2026-11-20');
  });

  test('activation is a stated consent and carries the label the server knows', async () => {
    const fields = [
      proposalField('WHO_SPEAKS', 'ACCEPTED'),
      proposalField('TONE', 'ACCEPTED'),
    ];
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: () => ({
        ...proposalEnvelope(fields),
        ...(server.calls.some(
          (call) => call.route === `${VOICE_API}/proposal/activate`
        )
          ? { activatedAt: '22.08.2026' }
          : {}),
      }),
      [`POST ${VOICE_API}/proposal/activate`]: {
        state: 'default',
        voice: null,
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));

    const activate = activateButton(screen);
    expect(activate.disabled).toBe(true);

    await act(async () => {
      fireEvent.click(document.querySelector('input[type="checkbox"]'));
    });
    // Consent alone is no longer enough: an avatar switched on without a name
    // arrives in the list as «Без имени» and the strip then tells its owner
    // «тексты пишет Без имени» (`content-factory-next-fn33.46`).
    expect(activateButton(screen).disabled).toBe(true);
    await act(async () => {
      fireEvent.change(document.querySelector('input[name="voice-avatar-name"]'), {
        target: { value: 'Мастер цеха' },
      });
    });
    await click(activateButton(screen));

    const call = server.calls.find(
      (one) => one.route === `${VOICE_API}/proposal/activate`
    );
    expect(call).toBeDefined();
    expect(call.body.consentGiven).toBe(true);
    expect(call.body.avatarName).toBe('Мастер цеха');
  });

  test('the card that promised a file takes one, and names what it will not send', async () => {
    // The finding this closes: the FILE card's button opened a paste box.
    // Three parsers existed and no route accepted a file for any origin.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope({ samples: [] }),
      [`POST ${VOICE_API}/samples/files`]: {
        accepted: [sampleRow(1)],
        rejected: [{ title: 'скан.pdf', reason: 'NO_TEXT_LAYER' }],
        readiness: readiness(),
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));

    const card = document.querySelector('[data-voice-source="FILE"]');
    expect(card.textContent).toContain('txt, md, docx, pdf');
    const picker = card.querySelector('input[type="file"]');
    expect(picker).not.toBeNull();

    await pick(picker, [
      makeFile('заметка.txt', 4_000),
      makeFile('огромный.docx', 25 * 1024 * 1024),
      makeFile('таблица.xlsx', 2_000),
    ]);

    // What will be sent is named with its weight; what will not is named with
    // the reason — before anything leaves the machine, so the person knows
    // which file to drop rather than that "the upload failed".
    expect(card.textContent).toContain('заметка.txt');
    expect(card.textContent).toContain('огромный.docx');
    expect(card.textContent).toContain('таблица.xlsx');
    expect(card.textContent).toMatch(/тяжелее 20 МБ/u);
    expect(card.textContent).toMatch(/формат не читается/u);
    expect(
      server.calls.some((call) => call.route.includes('/samples/files'))
    ).toBe(false);

    await click(screen.getByRole('button', { name: 'Загрузить 1 файл' }));

    const posted = server.calls.find((call) =>
      call.route.includes('/samples/files')
    );
    expect(posted.method).toBe('POST');
    expect(posted.body.getAll('files').map((one) => one.name)).toEqual([
      'заметка.txt',
    ]);
    expect(posted.body.get('usagePurpose')).toBe('OWN_VOICE');
    // A partial refusal is the ordinary case: what was read is counted, and
    // what was not is named with the file and one thing to do about it.
    expect(screen.getByRole('status').textContent).toContain('скан.pdf');
    expect(screen.getByRole('status').textContent).toContain('это скан');
  });

  test('a reference upload asks for the right and the erasure date in the same card', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope({ samples: [] }),
      [`POST ${VOICE_API}/samples/files`]: {
        accepted: [sampleRow(1)],
        rejected: [],
        readiness: readiness(),
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Указать автора' }));

    const card = document.querySelector('[data-voice-source="FILE"]');
    await pick(card.querySelector('input[type="file"]'), [
      makeFile('чужой.docx', 5_000),
    ]);

    // The two promises somebody else's writing costs are asked here rather
    // than refused by the server after the upload.
    const send = screen.getByRole('button', { name: 'Загрузить 1 файл' });
    expect(send.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(card.querySelector('input[type="checkbox"]'));
      fireEvent.change(card.querySelector('input[type="date"]'), {
        target: { value: '2026-11-20' },
      });
    });
    await click(screen.getByRole('button', { name: 'Загрузить 1 файл' }));

    const posted = server.calls.find((call) =>
      call.route.includes('/samples/files')
    );
    expect(posted.body.get('usagePurpose')).toBe('STYLE_REFERENCE');
    expect(posted.body.get('rightsConfirmed')).toBe('true');
    expect(posted.body.get('retentionUntil')).toContain('2026-11-20');
  });

  test('a batch the server refuses as a batch keeps the files and says why', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope({ samples: [] }),
      [`POST ${VOICE_API}/samples/files`]: {
        status: 413,
        body: {
          code: 'VOICE_UPLOAD_REJECTED',
          message: 'Партия больше 40 МБ. Отправьте файлы в несколько заходов.',
        },
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));

    const card = document.querySelector('[data-voice-source="FILE"]');
    await pick(card.querySelector('input[type="file"]'), [
      makeFile('первый.docx', 4_000),
    ]);
    await click(screen.getByRole('button', { name: 'Загрузить 1 файл' }));

    expect(screen.getByRole('alert').textContent).toContain(
      'Партия больше 40 МБ'
    );
    // The selection survives the refusal: nothing was lost, and the person can
    // drop one file and send the rest without picking them all again.
    expect(card.textContent).toContain('первый.docx');
    expect(
      screen.getByRole('button', { name: 'Загрузить 1 файл' }).disabled
    ).toBe(false);
  });

  test('choosing «заполню сам» opens five writable lines and asks for no analysis', async () => {
    // The finding this closes: the path led to a proposal only `runAnalysis`
    // could have written, so every action on it answered
    // VOICE_PROFILE_NOT_FOUND for anyone without a model key.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/proposal/manual`]: manualEnvelope(),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Заполнить вручную' }));

    const proposal = surface('proposal');
    expect(proposal).not.toBeNull();
    expect(proposal.getAttribute('data-voice-mode')).toBe('manual');
    expect(proposal.querySelectorAll('textarea')).toHaveLength(5);
    // Nothing on this path is measured, so nothing on this path asks to be.
    expect(
      server.calls.some((call) => call.route.includes('/analysis'))
    ).toBe(false);
    expect(
      server.calls.some((call) => call.route === `${VOICE_API}/proposal`)
    ).toBe(false);
    // The corpus shortfall belongs to a path that reads texts. This one does
    // not, and a banner counting missing characters would be a demand for
    // something nobody was asked to bring.
    expect(screen.queryByRole('status')).toBeNull();
    expect(proposal.textContent).not.toMatch(/Добавьте ещё/);
    // The observations column is a question nobody asked of their own words.
    expect(proposal.textContent).not.toContain('Почему предложено именно это');
  });

  test('a hand-written line is saved on its own, with its text', async () => {
    const stored = { TONE: '' };
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/proposal/manual`]: () => manualEnvelope(stored),
      [`POST ${VOICE_API}/proposal/manual/field`]: (body) => {
        stored[body.key] = body.text;
        return manualEnvelope(stored);
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Заполнить вручную' }));

    const tone = document.querySelector('[data-voice-field="TONE"]');
    const box = tone.querySelector('textarea');
    // An empty line is the work still to do, not a decision to save.
    expect(tone.querySelector('button').disabled).toBe(true);
    await act(async () => {
      fireEvent.change(box, { target: { value: 'Спокойно и по делу.' } });
    });
    await click(
      document.querySelector('[data-voice-field="TONE"]').querySelector('button')
    );

    const posted = server.calls.find(
      (call) => call.route === `${VOICE_API}/proposal/manual/field`
    );
    expect(posted.body).toEqual({ key: 'TONE', text: 'Спокойно и по делу.' });
    expect(
      document
        .querySelector('[data-voice-field="TONE"]')
        .getAttribute('data-voice-field-status')
    ).toBe('ACCEPTED');
  });

  test('the hand-filled voice activates through the same consent, and says which draft', async () => {
    const written = {
      WHO_SPEAKS: 'Мастерская, от лица бригады.',
      TONE: 'Спокойно и по делу.',
      AUDIENCE: 'Заказчики, читающие на бегу.',
      SENTENCE_LENGTH: 'Короткие фразы.',
      NEVER_SAY: 'гарантия результата',
    };
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/proposal/manual`]: () => manualEnvelope(written),
      [`POST ${VOICE_API}/proposal/activate`]: { state: 'default', voice: null },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Заполнить вручную' }));

    const activate = activateButton(screen);
    expect(activate.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(document.querySelector('input[type="checkbox"]'));
    });
    // The hand-filled path is the one the owner walked, and it is the one that
    // produced «Без имени» (`content-factory-next-fn33.46`).
    expect(activateButton(screen).disabled).toBe(true);
    await act(async () => {
      fireEvent.change(document.querySelector('input[name="voice-avatar-name"]'), {
        target: { value: 'Голос редакции' },
      });
    });
    await click(activateButton(screen));

    const call = server.calls.find(
      (one) => one.route === `${VOICE_API}/proposal/activate`
    );
    expect(call.body).toEqual({
      consentGiven: true,
      avatarName: 'Голос редакции',
      mode: 'manual',
    });
  });

  test('a collection left half-done is said out loud, with a way back into it', async () => {
    // `content-factory-next-fn33.45`: eight samples in the database, and a
    // reload answered with «Аватара пока нет» and «Создать аватар» — the
    // wizard's own promise is «образцы сохраняются», and the screen said
    // nothing about them.
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview({
        readiness: readiness({ sampleCount: 8, charCount: 17037 }),
      }),
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
    });
    await renderWizard(server);

    const collected = document.querySelector('[data-voice-empty-collected]');
    expect(collected).not.toBeNull();
    expect(collected.getAttribute('data-voice-empty-collected')).toBe('8');
    expect(collected.textContent).toContain('8');

    await click(screen.getByRole('button', { name: 'Продолжить сбор' }));

    // Straight into the corpus that was left, not back to the three paths.
    expect(surface('samples')).not.toBeNull();
  });

  test('a workspace that collected nothing is not told about a collection', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview({
        readiness: readiness({ sampleCount: 0, charCount: 0 }),
      }),
    });
    await renderWizard(server);

    expect(document.querySelector('[data-voice-empty-collected]')).toBeNull();
    expect(openWizard(screen)).toBeTruthy();
  });

  test('back from the hand-filled step returns to the paths, not to a corpus', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/proposal/manual`]: manualEnvelope(),
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Заполнить вручную' }));
    await click(screen.getByRole('button', { name: 'Назад' }));

    expect(surface('paths')).not.toBeNull();
    expect(surface('samples')).toBeNull();
  });

  test('a line the corpus could not ground is still on screen, empty and writable', async () => {
    // Observations are tied to counted metrics, and nothing counts «кто
    // говорит» or «к кому обращаемся», so the model can never propose those.
    // Hiding them let a voice be activated with an empty «Кто говорит» and a
    // placeholder audience, with nothing saying so (`vme.21.11`).
    const fields = [proposalField('TONE')];
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: () => proposalEnvelope(fields),
      [`POST ${VOICE_API}/proposal/field`]: (body) => {
        if (body.action === 'SAVE') {
          fields.push({
            key: body.key,
            text: body.text,
            status: 'ACCEPTED',
            observationRefs: [],
          });
        }
        return proposalEnvelope(fields);
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));

    // All five lines are there, not just the one the model grounded.
    for (const key of ['WHO_SPEAKS', 'TONE', 'AUDIENCE', 'SENTENCE_LENGTH', 'NEVER_SAY']) {
      expect(document.querySelector(`[data-voice-field="${key}"]`)).not.toBeNull();
    }

    // And an ungrounded one takes writing straight away, with no «Поправить»
    // in between — there is nothing there to correct.
    const card = document.querySelector('[data-voice-field="WHO_SPEAKS"]');
    const box = card.querySelector('textarea');
    expect(box).not.toBeNull();
    await act(async () => {
      fireEvent.change(box, { target: { value: 'Инженер, который сам это развернул.' } });
    });
    await click(
      within(card).getByRole('button', { name: 'Сохранить поле' })
    );

    const saved = server.calls
      .filter((call) => call.route === `${VOICE_API}/proposal/field`)
      .pop();
    expect(saved.body).toMatchObject({
      key: 'WHO_SPEAKS',
      action: 'SAVE',
      text: 'Инженер, который сам это развернул.',
    });
  });

  test('«Поправить» on the model path opens a box and the save carries what was typed', async () => {
    // Before this the button moved the field to EDITING and left no way to
    // type, and the save request went out with no text at all.
    const fields = [proposalField('TONE')];
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
      [`GET ${VOICE_API}/paths`]: { state: 'default', ...pathAvailability() },
      [`GET ${VOICE_API}/samples`]: samplesEnvelope(),
      [`POST ${VOICE_API}/analysis`]: analysisReady(),
      [`GET ${VOICE_API}/proposal`]: () => proposalEnvelope(fields),
      [`POST ${VOICE_API}/proposal/field`]: (body) => {
        const field = fields.find((one) => one.key === body.key);
        if (body.action === 'EDIT') field.status = 'EDITING';
        if (body.action === 'SAVE') {
          field.status = 'ACCEPTED';
          if (body.text) field.text = body.text;
        }
        return proposalEnvelope(fields);
      },
    });
    await renderWizard(server);
    await click(openWizard(screen));
    await click(screen.getByRole('button', { name: 'Собрать из моих текстов' }));
    await click(screen.getByRole('button', { name: 'Дальше — разбор' }));
    await click(screen.getByRole('button', { name: 'Дальше — предложение' }));

    await click(screen.getByRole('button', { name: 'Поправить' }));
    const box = document
      .querySelector('[data-voice-field="TONE"]')
      .querySelector('textarea');
    expect(box).not.toBeNull();
    expect(box.value).toBe('Предложение для TONE');

    await act(async () => {
      fireEvent.change(box, { target: { value: 'Мой собственный тон.' } });
    });
    // By its own field: every line the model did not propose is on screen too,
    // each with a save button of its own.
    await click(
      within(document.querySelector('[data-voice-field="TONE"]')).getByRole(
        'button',
        { name: 'Сохранить поле' }
      )
    );

    const saved = server.calls
      .filter((call) => call.route === `${VOICE_API}/proposal/field`)
      .pop();
    expect(saved.body).toMatchObject({
      key: 'TONE',
      action: 'SAVE',
      text: 'Мой собственный тон.',
    });
    expect(surface('proposal').textContent).toContain('Мой собственный тон.');
  });

  test('the reader language chooses the screens language', async () => {
    const server = createServer({
      [`GET ${VOICE_API}/overview`]: overview(),
    });
    await renderWizard(server, { language: 'en' });
    expect(surface('empty').textContent).toContain('No avatar yet');
  });
});

/* -------------------------------------------------------------------------
 * The adapter
 * ---------------------------------------------------------------------- */

describe('the wizard adapter', () => {
  const adapter = () => loadTypeScriptModule(ADAPTER);

  test('a refusal keeps its code and lands in the state the contract assigns it', () => {
    const { voiceFailureFrom } = adapter();
    expect(
      voiceFailureFrom(
        {
          code: 'VOICE_FORBIDDEN',
          message: 'Изменение голоса — право администратора.',
          status: 403,
        },
        'ru'
      )
    ).toMatchObject({
      code: 'VOICE_FORBIDDEN',
      screenState: 'restricted',
      message: 'Изменение голоса — право администратора.',
    });
    expect(
      voiceFailureFrom(
        { code: 'VOICE_ANALYSIS_FAILED', message: 'Разбор не удался.' },
        'ru'
      ).screenState
    ).toBe('error');
  });

  test('a failure with no code still says something true rather than nothing', () => {
    const { voiceFailureFrom } = adapter();
    const failure = voiceFailureFrom(new Error('network down'), 'ru');
    expect(failure.screenState).toBe('error');
    expect(failure.code).toBeNull();
    expect(failure.message.length).toBeGreaterThan(0);
  });

  test('the shortfall line carries both floors in the reader language', () => {
    const { shortfallText } = adapter();
    const ru = shortfallText(
      { missingChars: 8600, missingSamples: 3, charCount: 6400, sampleCount: 5 },
      'ru'
    );
    expect(ru).toMatch(/8[\s  ]?600/);
    expect(ru).toContain('3');
    const en = shortfallText(
      { missingChars: 8600, missingSamples: 0, charCount: 6400, sampleCount: 8 },
      'en'
    );
    expect(en).toMatch(/8[\s,  ]?600/);
    expect(en).not.toMatch(/\b0\b/);
  });

  test('a rejected text is named with its reason rather than dropped', () => {
    const { intakeNotice } = adapter();
    const notice = intakeNotice(
      {
        accepted: [{ code: 'smp-09' }],
        rejected: [{ title: 'Пустой файл', reason: 'EMPTY' }],
      },
      'ru'
    );
    expect(notice).toContain('Пустой файл');
    expect(notice.toLowerCase()).toContain('пуст');
  });
});
