'use strict';

/**
 * The "Brand voice" tab on live data.
 *
 * Screens 06–09 were accepted as components in `36r` and are not redrawn here;
 * what is under test is the container that feeds them and the decisions it
 * makes on the way — which route fills which screen, what a refusal looks like
 * when it reaches a screen, and what the tab refuses to offer because the
 * action belongs somewhere else.
 *
 * Four rules are the kind that erode quietly. A missing voice turns into an
 * error state; a measured gap turns into a zero; a restore starts rewriting
 * history instead of adding to it; and a route drifts away from the one the
 * contract named for the screen.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const ts = require('typescript');
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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const files = {
  container: `${base}/voice-profile.container.tsx`,
  adapter: `${base}/voice-profile.adapter.ts`,
};

test('starts RED until the container and its adapter exist and transpile', () => {
  for (const file of Object.values(files)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
    const result = ts.transpileModule(
      fs.readFileSync(path.join(root, file), 'utf8'),
      {
        fileName: file,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
        reportDiagnostics: true,
      }
    );
    expect(result.diagnostics || []).toHaveLength(0);
  }
});

if (!Object.values(files).every((file) => fs.existsSync(path.join(root, file)))) {
  return;
}

const contract = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts'
);
const copy = loadTypeScriptModule(`${base}/voice-copy.ts`);
const adapter = loadTypeScriptModule(files.adapter);
const container = loadTypeScriptModule(files.container);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const source = fs.readFileSync(path.join(root, files.container), 'utf8');

/* -------------------------------------------------------------------------
 * A backend that answers, in the shapes the contract declares
 * ---------------------------------------------------------------------- */

const PASSPORT = {
  state: 'default',
  voice: {
    whoSpeaks: 'Служба новостей завода',
    tone: 'Спокойно и по делу',
    audience: 'К своим: смены, мастера',
    neverSay: ['мы рады сообщить'],
    versionLabel: 'v3',
    activeSince: '22.08.2026',
    sampleCount: 16,
    charCount: 15200,
    confidence: 'LOW',
    sentenceLength: { value: '14,2', low: 10, high: 18 },
    dashShare: '74%',
  },
};

const SCALES = {
  state: 'default',
  scales: {
    sentenceLength: {
      kind: 'value',
      raw: 14.2,
      display: 28,
      low: 10,
      high: 18,
      observations: 980,
      sampleCount: 16,
      exampleText: 'Причина — поставка.',
      exampleSampleCode: 'smp-02',
    },
    questions: { kind: 'gap', reason: 'TOO_FEW_POSITIVE', positives: 4 },
  },
  profileLabel: 'Завод',
  versionLabel: 'v3',
  sampleCount: 16,
  canEditCorridors: true,
};

const REDACTIONS = {
  state: 'default',
  redactions: [{ category: 'PERSON', occurrences: 12, examples: ['А. К.'] }],
  kept: [{ label: 'Насколько длинные фразы', value: '14.2' }],
  referenceCount: 4,
  finishedAt: '22.08.2026',
  longestMatch: 3,
};

const VERSIONS = {
  state: 'default',
  versions: [
    {
      id: 'ver-3',
      label: 'v3',
      lifecycle: 'PUBLISHED',
      active: true,
      changedAt: '2026-08-22T10:00:00.000Z',
      actor: 'А. Ким',
    },
    {
      id: 'ver-2',
      label: 'v2',
      lifecycle: 'ARCHIVED',
      changedAt: '2026-07-02T09:00:00.000Z',
      actor: 'М. Соловьёва',
    },
  ],
  comparison: {
    from: 'v2',
    to: 'v3',
    fields: [
      {
        field: 'Кто говорит',
        was: 'Пресс-служба',
        became: 'Служба новостей',
        changed: true,
      },
      { field: 'Аудитория', was: 'К своим', became: 'К своим', changed: false },
    ],
  },
  profileLabel: 'Завод',
  canRestore: true,
};

let calls = [];
let routes = {};

const answer = (body, status = 200) => ({ body, status });

const resetBackend = () => {
  calls = [];
  routes = {
    [adapter.VOICE_ROUTES.passport]: answer(PASSPORT),
    [adapter.VOICE_ROUTES.scales]: answer(SCALES),
    [adapter.VOICE_ROUTES.redactions]: answer(REDACTIONS),
    [adapter.VOICE_ROUTES.versions]: answer(VERSIONS),
  };
};

beforeEach(() => {
  resetBackend();
  global.fetch = async (url, options = {}) => {
    const requested = String(url);
    calls.push({
      path: requested,
      method: options.method || 'GET',
      body: options.body ? JSON.parse(options.body) : undefined,
    });
    const handler = routes[requested];
    // `await`, потому что ответ бывает отложенным: набор, проверяющий состояние
    // «идёт работа», обязан уметь придержать ответ. Без него обещание попадало
    // в `result.status` как объект без полей, и запрос мгновенно «падал».
    const result = await (typeof handler === 'function'
      ? handler(options)
      : handler ?? answer({}, 404));
    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.body,
    };
  };
});

afterEach(cleanup);

const renderTab = () =>
  render(
    React.createElement(
      SWRConfig,
      {
        value: {
          provider: () => new Map(),
          dedupingInterval: 0,
          revalidateOnFocus: false,
        },
      },
      React.createElement(
        variables.VariableContextComponent,
        { language: 'ru' },
        React.createElement(container.VoiceProfileContainer)
      )
    )
  );

const voiceCalls = () =>
  calls.filter((call) => call.path.startsWith(contract.VOICE_API_BASE));

/* -------------------------------------------------------------------------
 * The wire
 * ---------------------------------------------------------------------- */

describe('what feeds what', () => {
  test('every route the tab uses is the one the contract named for the screen', () => {
    const only = (surface, method, endsWith) =>
      contract.VOICE_SURFACES[surface].routes.find(
        (route) =>
          route.method === method &&
          (!endsWith || route.path.endsWith(endsWith))
      ).path;

    expect(adapter.VOICE_ROUTES).toEqual({
      passport: only('passport', 'GET'),
      // Убрать пример и подобрать набор заново — тот же экран, и отвечает он
      // паспортом, потому что изменилась именно карточка.
      examples: only('passport', 'POST', '/passport/examples'),
      // Одна из пяти строк, переписанная на той же карточке, где её читают.
      // У паспорта теперь две записи, поэтому обе названы по хвосту пути.
      passportField: only('passport', 'POST', '/passport/field'),
      scales: only('scales', 'GET'),
      // Измерить те же тексты заново нынешней меркой. Живёт у разбора, а не
      // у шкал: разбор его и делает, шкалы только предлагают.
      recalibrate: only('analysis', 'POST', '/analysis/refresh'),
      corridor: only('scales', 'POST'),
      redactions: only('redactions', 'GET'),
      versions: only('versions', 'GET'),
      restore: only('versions', 'POST'),
    });
  });

  test('the tab asks four questions on mount and invents no fifth', async () => {
    renderTab();
    await screen.findByText(PASSPORT.voice.whoSpeaks);

    await waitFor(() => expect(voiceCalls().length).toBe(4));
    expect(voiceCalls().map((call) => call.path).sort()).toEqual(
      [
        adapter.VOICE_ROUTES.passport,
        adapter.VOICE_ROUTES.redactions,
        adapter.VOICE_ROUTES.scales,
        adapter.VOICE_ROUTES.versions,
      ].sort()
    );
    expect(voiceCalls().every((call) => call.method === 'GET')).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * The four screens on live data
 * ---------------------------------------------------------------------- */

describe('the passport', () => {
  test('shows the measured voice with the two numbers under it', async () => {
    renderTab();

    expect(await screen.findByText(PASSPORT.voice.whoSpeaks)).toBeTruthy();
    expect(screen.getByText(PASSPORT.voice.tone)).toBeTruthy();
    expect(screen.getAllByText('14,2').length).toBeGreaterThan(0);
    expect(screen.getByText('74%')).toBeTruthy();
  });

  test('"no voice" arrives as a variant of the card, never as a failure', async () => {
    routes[adapter.VOICE_ROUTES.passport] = answer({ state: 'empty', voice: null });
    renderTab();

    expect(
      await screen.findByText(copy.voiceCopy.ru.passportNoVoice)
    ).toBeTruthy();
    expect(screen.getByText(/рабочий режим, а не ошибка/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the eight scales', () => {
  test('a scale without data stays a stated gap, not a zero', async () => {
    renderTab();

    expect(
      await screen.findByText(/мало, чтобы считать привычкой/)
    ).toBeTruthy();
    expect(screen.queryByText('4%')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  test('the corridor is moved on the bar and written through the contract route', async () => {
    routes[adapter.VOICE_ROUTES.corridor] = answer({
      ...SCALES,
      scales: {
        ...SCALES.scales,
        sentenceLength: {
          ...SCALES.scales.sentenceLength,
          low: 11,
          high: 17,
          manualCorridor: true,
        },
      },
    });
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: copy.voiceCopy.ru.scalesEditCorridors,
      })
    );

    // Two handles on the bar itself, not two boxes in a panel below the fold.
    const low = screen.getByLabelText(
      new RegExp(`${copy.voiceCopy.ru.scalesLow}$`)
    );
    const high = screen.getByLabelText(
      new RegExp(`${copy.voiceCopy.ru.scalesHigh}$`)
    );
    // The domain is the scale's own — words per sentence, not per cent.
    expect(low.getAttribute('min')).toBe('4');
    expect(low.getAttribute('max')).toBe('40');

    fireEvent.change(low, { target: { value: '11' } });
    fireEvent.change(high, { target: { value: '17' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: copy.voiceCopy.ru.scalesCorridorSave,
      })
    );

    await waitFor(() =>
      expect(
        calls.find(
          (call) =>
            call.path === adapter.VOICE_ROUTES.corridor && call.method === 'POST'
        )
      ).toMatchObject({ body: { key: 'sentenceLength', low: 11, high: 17 } })
    );
  });

  test('dragging alone writes nothing: the row commits when it is saved', async () => {
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: copy.voiceCopy.ru.scalesEditCorridors,
      })
    );
    fireEvent.change(
      screen.getByLabelText(new RegExp(`${copy.voiceCopy.ru.scalesLow}$`)),
      { target: { value: '12' } }
    );

    // A range input fires on every pixel of a drag. Writing there would send
    // fifty requests for one gesture and leave the corridor wherever the
    // network happened to land last.
    expect(
      calls.filter((call) => call.path === adapter.VOICE_ROUTES.corridor)
    ).toHaveLength(0);
  });

  test('the handles cannot cross: the corridor stays a corridor', async () => {
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: copy.voiceCopy.ru.scalesEditCorridors,
      })
    );
    const low = screen.getByLabelText(
      new RegExp(`${copy.voiceCopy.ru.scalesLow}$`)
    );
    fireEvent.change(low, { target: { value: '30' } });

    // The upper bound is 18. Dragging the lower one past it clamps rather
    // than swapping the two ends under the reader's finger.
    expect(low.value).toBe('18');
  });

  test('a member without the right sees the corridors and no way to move them', async () => {
    routes[adapter.VOICE_ROUTES.scales] = answer({
      ...SCALES,
      state: 'restricted',
      canEditCorridors: false,
    });
    renderTab();

    expect(
      (await screen.findAllByText(copy.scaleLabels.ru.sentenceLength.label))
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', {
        name: copy.voiceCopy.ru.scalesEditCorridors,
      })
    ).toBeNull();
    expect(screen.getByText(/Шкалы видны, коридоры правит владелец/)).toBeTruthy();
  });
});

describe('what stayed outside', () => {
  test('the cut list is a report here: the tab never asks for consent again', async () => {
    renderTab();

    expect(
      await screen.findByText(copy.voiceCopy.ru.categoryPerson)
    ).toBeTruthy();
    // Consent belongs to the reference path in the wizard, where it gates
    // activation. Offering the same checkbox over a voice already in force
    // would be a dialog with nothing behind it.
    expect(screen.queryByText(copy.voiceCopy.ru.consentRead)).toBeNull();
    expect(
      screen.queryByRole('button', { name: copy.voiceCopy.ru.proceed })
    ).toBeNull();
  });

  test('a workspace that never took a reference is not shown a reference report', async () => {
    routes[adapter.VOICE_ROUTES.redactions] = answer({
      state: 'empty',
      redactions: [],
      kept: [],
      referenceCount: 0,
      finishedAt: '22.08.2026',
      longestMatch: 0,
    });
    renderTab();

    await screen.findByText(PASSPORT.voice.whoSpeaks);
    expect(screen.queryByText(copy.voiceCopy.ru.redactionsTitle)).toBeNull();
  });

  test('an empty cut list under a real reference is still shown', async () => {
    routes[adapter.VOICE_ROUTES.redactions] = answer({
      ...REDACTIONS,
      redactions: [],
    });
    renderTab();

    expect(
      await screen.findByText(copy.voiceCopy.ru.redactionsEmpty)
    ).toBeTruthy();
  });
});

describe('versions', () => {
  test('the history reads in the reader’s dates, not in machine time', async () => {
    renderTab();

    expect(await screen.findByText(/22\.08\.2026 · А\. Ким/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('2026-08-22T10:00');
  });

  test('the two the server compared are the two shown ticked', async () => {
    renderTab();
    await screen.findByText('v3');

    // Ticked by id and not by label: two versions can carry the same label,
    // and matching on it is what put three ticks on a two-way comparison.
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-voice-version-picked="true"]').length
      ).toBe(2)
    );
    expect(adapter.defaultComparedIds(VERSIONS.versions)).toEqual([
      'ver-3',
      'ver-2',
    ]);
  });

  test('a third tick is refused where it happens, not undone elsewhere', async () => {
    routes[adapter.VOICE_ROUTES.versions] = answer({
      ...VERSIONS,
      versions: [
        ...VERSIONS.versions,
        {
          id: 'ver-1',
          label: 'v1',
          lifecycle: 'ARCHIVED',
          changedAt: '2026-06-01T09:00:00.000Z',
          actor: 'М. Соловьёва',
        },
      ],
    });
    renderTab();
    await screen.findByText('v1');

    const boxes = document.querySelectorAll('input[type="checkbox"]');
    await waitFor(() => expect(boxes[2].disabled).toBe(true));
    // Two are ticked and the third box is disabled with the reason beside it.
    // The version this replaces accepted the tick and cleared a box the
    // reader had not touched.
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(true);
    expect(
      document.querySelector('[data-voice-versions-full="true"]')
    ).not.toBeNull();
  });

  test('the pair that is ticked is the pair the route is asked about', async () => {
    renderTab();
    await screen.findByText('v3');

    const boxes = document.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(boxes[0]);

    await waitFor(() =>
      expect(
        calls.some((call) =>
          call.path.startsWith(`${adapter.VOICE_ROUTES.versions}?`)
        )
      ).toBe(false)
    );

    // One tick is not a comparison, so nothing is asked for. Ticking the
    // second sends the pair, in the order the reader built it.
    fireEvent.click(boxes[0]);
    await waitFor(() =>
      expect(
        calls.find((call) =>
          call.path.includes('from=ver-2') && call.path.includes('to=ver-3')
        )
      ).toBeTruthy()
    );
  });

  test('the path carries both ends of the pair or neither', () => {
    const base = adapter.VOICE_ROUTES.versions;
    expect(adapter.versionsPath(base, [])).toBe(base);
    expect(adapter.versionsPath(base, ['ver-3'])).toBe(base);
    expect(adapter.versionsPath(base, ['ver-3', 'ver-2'])).toBe(
      `${base}?from=ver-3&to=ver-2`
    );
    // The avatar is already on the path; the pair joins it rather than
    // starting a second query string.
    expect(adapter.versionsPath(`${base}?avatar=a1`, ['ver-3', 'ver-2'])).toBe(
      `${base}?avatar=a1&from=ver-3&to=ver-2`
    );
  });

  test('restoring adds a version and leaves the old one in the list', async () => {
    const restored = {
      ...VERSIONS,
      versions: [
        {
          id: 'ver-4',
          label: 'v4',
          lifecycle: 'PUBLISHED',
          active: true,
          changedAt: '2026-08-22T12:00:00.000Z',
          actor: 'А. Ким',
        },
        ...VERSIONS.versions.map((version) => ({ ...version, active: false })),
      ],
    };
    routes[adapter.VOICE_ROUTES.restore] = answer(restored);
    renderTab();

    fireEvent.click(
      await screen.findByRole('button', {
        name: copy.voiceCopy.ru.versionsRestore('v2'),
      })
    );

    await waitFor(() =>
      expect(
        calls.find((call) => call.path === adapter.VOICE_ROUTES.restore)
      ).toMatchObject({ method: 'POST', body: { versionId: 'ver-2' } })
    );

    expect(await screen.findByText('v4')).toBeTruthy();
    // Both are still there: a restore writes a version, it does not move a
    // pointer, and posts remember which version wrote them.
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('v3')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'История не переписывается'
    );
    // The passport is read again: the active version just changed.
    expect(
      calls.filter((call) => call.path === adapter.VOICE_ROUTES.passport).length
    ).toBeGreaterThan(1);
  });

  test('a member without the right still sees the history', async () => {
    routes[adapter.VOICE_ROUTES.versions] = answer({
      ...VERSIONS,
      state: 'restricted',
      canRestore: false,
    });
    renderTab();

    expect(await screen.findByText('v3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Вернуть/ })).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

describe('a refusal reaches the screen whole', () => {
  test('the code and the server’s sentence both arrive', async () => {
    routes[adapter.VOICE_ROUTES.scales] = answer(
      {
        code: 'VOICE_ANALYSIS_FAILED',
        message: 'Шкала sentenceLength не посчитана — коридор задавать не на чем.',
      },
      500
    );
    renderTab();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('VOICE_ANALYSIS_FAILED');
    expect(alert.textContent).toContain('коридор задавать не на чем');
  });

  test('a forbidden read is a restricted screen, not an error banner', async () => {
    routes[adapter.VOICE_ROUTES.versions] = answer(
      { code: 'VOICE_FORBIDDEN', message: 'Голосом управляет владелец.' },
      403
    );
    renderTab();

    await screen.findByText(PASSPORT.voice.whoSpeaks);
    await waitFor(() =>
      expect(
        document.querySelector('[data-voice-surface="versions"]')?.getAttribute(
          'data-voice-state'
        )
      ).toBe('restricted')
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the error table is read from the contract, not retyped', () => {
    for (const [code, entry] of Object.entries(contract.VOICE_ERROR_CODES)) {
      expect(adapter.readVoiceFailure({ code, message: 'x' })).toMatchObject({
        code,
        screenState: entry.screenState,
      });
    }
    expect(adapter.readVoiceFailure({ message: 'boom' })).toMatchObject({
      code: null,
      screenState: 'error',
    });
    expect(adapter.readVoiceFailure(undefined)).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The edit that moved onto the card
 * ---------------------------------------------------------------------- */

describe('a voice line is edited where it is read', () => {
  test('the second brand form is gone rather than kept in step', () => {
    // `ContentIntelligenceSettings` mounted its brand section under «Изменить
    // вручную», directly below the card showing the same five values. One
    // object with two front doors, and the far one was a draft-and-activate
    // flow demanding all five lines before any of them counted.
    expect(source).not.toMatch(/<ContentIntelligenceSettings/);
    expect(source).not.toMatch(/from '\.\.\/content-intelligence\//);
    expect(source).not.toMatch(/data-voice-manual/);
    // And no hand-rolled replacement either: the near door writes through the
    // voice route, not through the brand-profile drafts.
    expect(source).not.toMatch(/brand-profile\/drafts/);
    expect(source).toMatch(/VOICE_ROUTES\.passportField/);
  });

  test('each of the five lines carries its own edit', async () => {
    renderTab();
    await screen.findByText(PASSPORT.voice.whoSpeaks);

    const edits = screen.getAllByRole('button', {
      name: new RegExp(`^${copy.voiceCopy.ru.passportEdit}:`),
    });
    expect(edits).toHaveLength(5);
  });

  test('saving one line writes that line and nothing else', async () => {
    routes[adapter.VOICE_ROUTES.passportField] = answer({
      ...PASSPORT,
      voice: { ...PASSPORT.voice, tone: 'Сухо и коротко', versionLabel: 'v4' },
    });
    renderTab();
    await screen.findByText(PASSPORT.voice.tone);

    fireEvent.click(
      screen.getByRole('button', {
        name: `${copy.voiceCopy.ru.passportEdit}: ${copy.voiceCopy.ru.passportTone}`,
      })
    );
    fireEvent.change(
      screen.getByLabelText(copy.voiceCopy.ru.passportTone),
      { target: { value: 'Сухо и коротко' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.voiceCopy.ru.passportEditSave })
    );

    await waitFor(() =>
      expect(
        calls.find(
          (call) =>
            call.path === adapter.VOICE_ROUTES.passportField &&
            call.method === 'POST'
        )
      ).toMatchObject({ body: { key: 'TONE', text: 'Сухо и коротко' } })
    );
    // The write activates a new version, so the history and the scales — whose
    // header names the version in force — are read again.
    await waitFor(() =>
      expect(
        calls.filter((call) =>
          call.path.startsWith(adapter.VOICE_ROUTES.versions)
        ).length
      ).toBeGreaterThan(1)
    );
  });

  test('an empty line is not saved', async () => {
    renderTab();
    await screen.findByText(PASSPORT.voice.tone);

    fireEvent.click(
      screen.getByRole('button', {
        name: `${copy.voiceCopy.ru.passportEdit}: ${copy.voiceCopy.ru.passportTone}`,
      })
    );
    fireEvent.change(
      screen.getByLabelText(copy.voiceCopy.ru.passportTone),
      { target: { value: '   ' } }
    );

    expect(
      screen.getByRole('button', { name: copy.voiceCopy.ru.passportEditSave })
        .disabled
    ).toBe(true);
    expect(
      screen.getByText(copy.voiceCopy.ru.passportEditEmpty)
    ).toBeTruthy();
  });

  test('a reader who may not change the voice is offered no edit at all', async () => {
    routes[adapter.VOICE_ROUTES.scales] = answer({
      ...SCALES,
      state: 'restricted',
      canEditCorridors: false,
    });
    renderTab();
    await screen.findByText(PASSPORT.voice.whoSpeaks);

    // Not a disabled control: an action a member can never take is an action
    // that does not belong on their screen.
    expect(
      screen.queryAllByRole('button', {
        name: new RegExp(`^${copy.voiceCopy.ru.passportEdit}:`),
      })
    ).toHaveLength(0);
  });

  test('a person may add an example of their own, not only remove one', async () => {
    routes[adapter.VOICE_ROUTES.examples] = answer(PASSPORT);
    renderTab();
    await screen.findByText(PASSPORT.voice.whoSpeaks);

    fireEvent.click(
      screen.getByRole('button', {
        name: copy.voiceCopy.ru.passportExampleAdd,
      })
    );
    fireEvent.change(
      screen.getByLabelText(copy.voiceCopy.ru.passportExampleAdd),
      { target: { value: 'Смена закрыта в 14:20.' } }
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: copy.voiceCopy.ru.passportExampleAddSave,
      })
    );

    await waitFor(() =>
      expect(
        calls.find(
          (call) =>
            call.path === adapter.VOICE_ROUTES.examples && call.method === 'POST'
        )
      ).toMatchObject({ body: { texts: ['Смена закрыта в 14:20.'] } })
    );
  });
});
