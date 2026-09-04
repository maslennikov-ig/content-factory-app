'use strict';

/**
 * The Material tab, wired to the routes behind it.
 *
 * Screen 11 was accepted as a component in `36r`; this guard is about the wire
 * between it and `/content-intelligence/materials`. Four things here are worth
 * holding in place because each one fails quietly:
 *
 *  - a loss stays a loss. `lossy: true` is the server saying text will be cut
 *    away, and a screen that renders it as one more line of "adaptation" has
 *    told the person the opposite of what happened.
 *  - a piece that already fits says so. `unchanged: true` with an invented
 *    difference beside it is worse than no panel at all.
 *  - a refusal arrives with its code. `MATERIAL_PLATFORM_UNSUPPORTED` and the
 *    sentence the server wrote are the only actionable part of the answer.
 *  - the recut prepares text and stops. The draft it makes is opened in the
 *    product's own editor and published by the ordinary path; nothing on this
 *    surface reaches a platform.
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
  waitFor,
  within,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const FILES = {
  container: `${base}/voice-materials.container.tsx`,
  adapter: `${base}/voice-materials.adapter.ts`,
  calendar: 'apps/frontend/src/components/launches/calendar.tsx',
};

const source = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

/**
 * Source with its comments blanked.
 *
 * Both files explain the rule they keep, and a scan that could not tell using
 * from mentioning would fail them for writing the reason down.
 */
const code = (key) =>
  source(key)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

test('the container and its adapter exist', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

/**
 * The modal shell binds Escape through a dependency that ships ESM only, and
 * Jest here is configured for CommonJS. The shortcut has nothing to do with
 * what is under test, so it is stubbed rather than the container being left
 * unloadable.
 */
jest.mock('react-hotkeys-hook', () => ({ useHotkeys: () => {} }), {
  virtual: true,
});

const adapter = loadTypeScriptModule(FILES.adapter);
const container = loadTypeScriptModule(FILES.container);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

/* -------------------------------------------------------------------------
 * A server, stubbed at the one place the product talks to it
 * ---------------------------------------------------------------------- */

const LIBRARY = Object.freeze({
  state: 'default',
  materials: [
    {
      id: 'piece-1',
      code: 'cnt-01',
      title: 'Почему мы поменяли поставщика подшипников',
      format: 'длинный',
      postCount: 3,
      queuedCount: 0,
      draftCount: 2,
      date: '05.08.26',
      voiceVersion: 'v3',
    },
    {
      id: 'piece-2',
      code: 'cnt-02',
      title: 'Итоги наладки линии',
      format: 'короткий',
      postCount: 1,
      queuedCount: 2,
      date: '12.08.26',
      voiceVersion: 'v3',
    },
  ],
  derived: [],
});

const DERIVATIONS = Object.freeze({
  state: 'selected',
  materials: LIBRARY.materials,
  derived: [
    { platform: 'telegram', state: 'PUBLISHED', date: '06.08.26' },
    { platform: 'vk', state: 'QUEUED', date: '07.08.26' },
  ],
});

const LOSSY_PREVIEW = Object.freeze({
  state: 'selected',
  materials: LIBRARY.materials,
  derived: [],
  recut: {
    code: 'cnt-01',
    platform: 'telegram',
    voiceVersion: 'v3',
    changes: [
      { aspect: 'length', from: '6 200', to: '4 096', lossy: true },
      { aspect: 'lists', from: 'inline', to: 'bullets', lossy: false },
    ],
    unchanged: false,
  },
});

const UNCHANGED_PREVIEW = Object.freeze({
  state: 'selected',
  materials: LIBRARY.materials,
  derived: [],
  recut: {
    code: 'cnt-01',
    platform: 'site',
    voiceVersion: 'v3',
    changes: [],
    unchanged: true,
  },
});

// `content-factory-next-fn33.65`: the shared request helper hands the common
// refusal handler a copy of the response, so a fake answer has to be
// clonable the way a real `Response` is.
const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const refusal = (status, body) => ({
  ok: false,
  status,
  json: async () => body,
  clone() {
    return this;
  },
});

let calls = [];

const serve = (table) => {
  calls = [];
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    const call = {
      url,
      method,
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const answer = table[`${method} ${url}`];
    if (!answer) {
      throw new Error(`no stub for ${method} ${url}`);
    }
    return typeof answer === 'function' ? answer(call) : answer;
  };
};

const CHANNELS = [
  { id: 'int-tg', name: 'Цех', identifier: 'telegram', picture: 'old.png' },
  { id: 'int-vk', name: 'Стена', identifier: 'vk', picture: 'vk.png' },
];

const baseTable = () => ({
  'GET /integrations/list': ok({ integrations: CHANNELS }),
  'GET /content-intelligence/materials': ok(LIBRARY),
});

/**
 * The tab, rendered with its channel list already in.
 *
 * The panel opens on a platform the workspace has a channel for
 * (`content-factory-next-fn33.111`), so which platform a click produces
 * depends on whether `/integrations/list` has answered. Settling it here keeps
 * every test below about what it is actually testing; the wait itself is
 * checked on its own further down.
 */
const renderTab = async (locale = 'ru') => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: locale },
          React.createElement(container.VoiceMaterialsContainer)
        )
      )
    );
  });
  // Two turns of the loop: the request resolves on one and the state it sets
  // lands on the next.
  for (const _turn of [0, 1, 2]) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const click = async (element) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

/**
 * «Переиспользовать» on a row, and the panel it opens.
 *
 * The panel waits for the recut the server works out, and — since
 * `content-factory-next-fn33.111` — for the channel list that says which
 * platform it may open on. Both are answers to requests, so the panel is
 * waited for rather than assumed to be there the instant the click returns.
 */
const openRecut = async (code = 'cnt-01') => {
  const row = document.querySelector(`[data-voice-material="${code}"]`);
  await click(within(row).getByRole('button', { name: 'Переиспользовать' }));
  return waitFor(() => {
    const panel = document.querySelector('[data-voice-recut]');
    expect(panel).toBeTruthy();
    return panel;
  });
};

afterEach(() => {
  cleanup();
  delete global.fetch;
});

/* -------------------------------------------------------------------------
 * The library
 * ---------------------------------------------------------------------- */

describe('the library is the workspace’s own material', () => {
  test('the rows are the ones the route returned', async () => {
    serve(baseTable());
    await renderTab();

    const rows = document.querySelectorAll('[data-voice-material]');
    expect([...rows].map((row) => row.getAttribute('data-voice-material'))).toEqual(
      ['cnt-01', 'cnt-02']
    );
    expect(
      screen.getByText('Почему мы поменяли поставщика подшипников')
    ).toBeTruthy();
    expect(screen.getByText('Итоги наладки линии')).toBeTruthy();
  });

  test('a row opens into where its posts went', async () => {
    serve({
      ...baseTable(),
      'GET /content-intelligence/materials/piece-1/derivations':
        ok(DERIVATIONS),
    });
    await renderTab();

    await click(screen.getByRole('button', { name: 'cnt-01' }));

    // The identifier travels, not the code: the code is what the table prints
    // and the id is what the route answers to.
    expect(calls.map((call) => `${call.method} ${call.url}`)).toContain(
      'GET /content-intelligence/materials/piece-1/derivations'
    );

    // Nine states exist and the screen reports the one it is in; a row open on
    // its provenance is `selected`, not `default` with extra rows under it.
    expect(
      document
        .querySelector('[data-voice-surface="materials"]')
        .getAttribute('data-voice-state')
    ).toBe('selected');

    const origin = document.querySelector('[data-voice-material-origin]');
    expect(origin).toBeTruthy();
    expect(within(origin).getByText(/Telegram · 06\.08\.26/)).toBeTruthy();
    // A post still waiting says so instead of printing a date it has not met.
    expect(within(origin).getByText(/ВКонтакте · В очереди/)).toBeTruthy();
  });

  test('a recut version shows up on the row and in the provenance list', async () => {
    // `content-factory-next-fn33.84`: a recut writes a `DRAFT` derivation, the
    // table counted only what went out and what was queued, and the row went
    // on saying «публикаций 0» over a piece that had just produced two.
    serve({
      ...baseTable(),
      'GET /content-intelligence/materials/piece-1/derivations': ok({
        ...DERIVATIONS,
        derived: [
          { platform: 'telegram', state: 'DRAFT', date: '04.09.26' },
        ],
      }),
    });
    await renderTab();

    const row = document.querySelector('[data-voice-material="cnt-01"]');
    expect(within(row).getByText('2')).toBeTruthy();

    await click(screen.getByRole('button', { name: 'cnt-01' }));
    const origin = document.querySelector('[data-voice-material-origin]');
    // Said in words: a draft and a published post reading alike is what made
    // a recut look like it had done nothing.
    expect(within(origin).getByText(/Telegram · Черновик · 04\.09\.26/)).toBeTruthy();
  });

  test('a provenance that would not load stays shut rather than reading as none', async () => {
    serve({
      ...baseTable(),
      'GET /content-intelligence/materials/piece-1/derivations': refusal(500, {
        code: 'MATERIAL_NOT_FOUND',
        message: 'Материал не найден',
      }),
    });
    await renderTab();

    await click(screen.getByRole('button', { name: 'cnt-01' }));

    // An open row with an empty list under it says "nothing came out of this
    // piece", which is a claim, and a false one.
    expect(document.querySelector('[data-voice-material-origin]')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Материал не найден');
  });

  test('one row’s provenance is never written by another row’s recut', async () => {
    serve({
      ...baseTable(),
      'GET /content-intelligence/materials/piece-2/derivations': ok({
        state: 'selected',
        materials: LIBRARY.materials,
        derived: [{ platform: 'vk', state: 'PUBLISHED', date: '13.08.26' }],
      }),
      'POST /content-intelligence/materials/piece-1/recut-preview': ok({
        ...LOSSY_PREVIEW,
        derived: [{ platform: 'telegram', state: 'PUBLISHED', date: '06.08.26' }],
      }),
    });
    await renderTab();

    await click(screen.getByRole('button', { name: 'cnt-02' }));
    const row = document.querySelector('[data-voice-material="cnt-01"]');
    await click(within(row).getByRole('button', { name: 'Переиспользовать' }));

    const origin = document.querySelector(
      '[data-voice-material-origin="cnt-02"]'
    );
    expect(origin.textContent).toContain('ВКонтакте · 13.08.26');
    expect(origin.textContent).not.toContain('Telegram');
  });

  test('a workspace with no material gets the explanation, not a failure', async () => {
    serve({
      ...baseTable(),
      'GET /content-intelligence/materials': ok({
        state: 'empty',
        materials: [],
        derived: [],
      }),
    });
    await renderTab();

    // The section-level empty state, reused rather than rewritten.
    expect(document.querySelector('[data-content-materials="empty"]')).toBeTruthy();
    expect(screen.getByText(/Материалов пока нет/)).toBeTruthy();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The recut panel
 * ---------------------------------------------------------------------- */

describe('the recut says what will be different', () => {
  test('a change that cuts text away is shown as a loss', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview':
        ok(LOSSY_PREVIEW),
    });
    await renderTab();

    const panel = await openRecut();
    expect(panel).toBeTruthy();

    const length = panel.querySelector('[data-voice-change="length"]');
    expect(length.getAttribute('data-voice-change-lossy')).toBe('true');
    expect(length.textContent).toContain('с потерей');

    // The change that loses nothing is not decorated as though it did.
    const lists = panel.querySelector('[data-voice-change="lists"]');
    expect(lists.getAttribute('data-voice-change-lossy')).toBeNull();
    expect(lists.textContent).not.toContain('с потерей');
  });

  test('“already fits” outranks any difference offered beside it', () => {
    // The two together are a server contradicting itself. `unchanged` is the
    // claim a person acts on, so a difference printed under it would be an
    // invention with the weight of arithmetic behind it.
    const panel = adapter.screenRecut({
      code: 'cnt-01',
      platform: 'site',
      voiceVersion: 'v3',
      changes: [{ aspect: 'length', from: '312', to: '1 400', lossy: false }],
      unchanged: true,
    });

    expect(panel.changes).toEqual([]);
  });

  test('a piece already in the platform’s shape claims no difference', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview':
        ok(UNCHANGED_PREVIEW),
    });
    await renderTab();

    const panel = await openRecut();
    expect(panel.querySelectorAll('[data-voice-change]')).toHaveLength(0);
    expect(
      within(panel).getByText(/Ничего не меняется/)
    ).toBeTruthy();
  });

  test('a platform with no channel is refused before the click, not after it', async () => {
    // `content-factory-next-fn33.86`: all four platforms were offered alike,
    // the preview behaved as though the choice had worked, and the refusal
    // arrived only after «Открыть в редакторе». The workspace here has
    // Telegram and VK and nothing else.
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview':
        ok(UNCHANGED_PREVIEW),
    });
    await renderTab();

    const panel = await openRecut();
    // The channel list arrives on its own request; until it does, every
    // platform stays offered on purpose.
    await waitFor(() =>
      expect(
        within(panel).getByRole('button', { name: 'Сайт' }).disabled
      ).toBe(true)
    );
    expect(
      within(panel).getByRole('button', { name: 'Telegram' }).disabled
    ).toBe(false);
    expect(
      within(panel).getByRole('button', { name: 'ВКонтакте' }).disabled
    ).toBe(false);
    expect(
      within(panel).getByRole('button', { name: 'Рассылка' }).disabled
    ).toBe(true);
    expect(
      panel.querySelector('[data-voice-platform="site"][data-voice-platform-unavailable="true"]')
    ).toBeTruthy();
    expect(within(panel).getAllByText('канала нет').length).toBe(2);
  });

  test('the panel opens on a platform this workspace can post to', async () => {
    // `content-factory-next-fn33.111`: the panel opened on «Сайт» — the one
    // platform this workspace has no channel for — so the button was disabled
    // and painted as chosen at once, and «Открыть в редакторе» went straight
    // into a refusal. The workspace here has Telegram and VK.
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview': (call) =>
        ok({
          ...UNCHANGED_PREVIEW,
          recut: { ...UNCHANGED_PREVIEW.recut, platform: call.body.platform },
        }),
    });
    await renderTab();

    const row = document.querySelector('[data-voice-material="cnt-01"]');
    await openRecut();

    const previews = calls.filter((call) =>
      call.url.endsWith('/recut-preview')
    );
    expect(previews).toHaveLength(1);
    expect(previews[0].body).toEqual({ platform: 'telegram' });
    expect(
      document.querySelector('[data-voice-recut="telegram"]')
    ).toBeTruthy();
  });

  test('with no channel anywhere the recut is not offered, and it says why', async () => {
    // `content-factory-next-fn33.111`: nothing is chosen for a person who has
    // nowhere to put a draft, and the reason is written out instead of being
    // left to a refusal after the click.
    serve({
      ...baseTable(),
      'GET /integrations/list': ok({ integrations: [] }),
    });
    await renderTab();

    const row = document.querySelector('[data-voice-material="cnt-01"]');
    const reuse = within(row).getByRole('button', {
      name: 'Переиспользовать',
    });
    await waitFor(() => expect(reuse.disabled).toBe(true));

    await click(reuse);
    expect(
      calls.filter((call) => call.url.endsWith('/recut-preview'))
    ).toHaveLength(0);
    expect(document.querySelector('[data-voice-recut]')).toBeNull();
    expect(
      document.querySelector('[data-voice-no-channel-anywhere="true"]')
    ).toBeTruthy();
  });

  test('changing the platform asks the server rather than guessing', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview': (call) =>
        ok(call.body.platform === 'telegram' ? LOSSY_PREVIEW : UNCHANGED_PREVIEW),
    });
    await renderTab();

    const panel = await openRecut();
    await click(within(panel).getByRole('button', { name: 'Telegram' }));

    const previews = calls.filter((call) =>
      call.url.endsWith('/recut-preview')
    );
    expect(previews).toHaveLength(2);
    expect(previews[1].body).toEqual({ platform: 'telegram' });
    expect(
      document.querySelector('[data-voice-recut="telegram"]')
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

describe('a refusal reaches the screen intact', () => {
  test('the sentence arrives and the machine code does not', async () => {
    // `content-factory-next-fn33.85`: the screen printed
    // «MATERIAL_PLATFORM_UNSUPPORTED · В рабочем пространстве нет
    // подключённого канала для этой площадки · vk» — three languages in one
    // line, two of them ours. The code stays on the failure object for the
    // screens that branch on it; it is not what a person is shown.
    const message =
      'В рабочем пространстве нет подключённого канала для этой площадки';
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview': refusal(
        422,
        { code: 'MATERIAL_PLATFORM_UNSUPPORTED', message, subject: 'vk' }
      ),
    });
    await renderTab();

    const row = document.querySelector('[data-voice-material="cnt-01"]');
    await click(within(row).getByRole('button', { name: 'Переиспользовать' }));

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain('MATERIAL_PLATFORM_UNSUPPORTED');
    // And the platform is named the way the recut panel names it.
    expect(alert.textContent).toContain('ВКонтакте');
    expect(alert.textContent).not.toContain('vk');
    // The library is still on the screen: a refused recut lost nothing.
    expect(document.querySelectorAll('[data-voice-material]')).toHaveLength(2);
  });

  test('a refusal the contract calls restricted is a state, not an error', () => {
    const failure = adapter.readFailure(
      Object.assign(new Error('нет прав'), {
        status: 403,
        code: 'VOICE_FORBIDDEN',
      }),
      'fallback'
    );

    expect(failure.screenState).toBe('restricted');
  });

  test('an answer with no code still says something a person can read', () => {
    const failure = adapter.readFailure(new Error('socket hang up'), 'запасной');

    expect(failure.code).toBeNull();
    expect(failure.screenState).toBe('error');
    expect(adapter.failureNotice(failure)).toBe('запасной');
  });
});

/* -------------------------------------------------------------------------
 * The handoff into the editor
 * ---------------------------------------------------------------------- */

describe('the draft opens in the product’s own editor', () => {
  const EXISTING = Object.freeze({
    group: 'group-9',
    integration: 'int-tg',
    integrationPicture: 'new.png',
    settings: {},
    posts: [{ id: 'post-1', publishDate: '2026-08-22T09:00:00.000Z' }],
  });

  test('the draft is asked for, then the post it became', async () => {
    const read = async (url, init = {}) => {
      read.calls.push({
        url,
        method: String(init.method || 'GET').toUpperCase(),
        body: init.body ? JSON.parse(init.body) : undefined,
      });
      if (url.endsWith('/draft')) {
        return {
          postId: 'post-1',
          derivationId: 'der-1',
          contentPieceId: 'piece-1',
          platform: 'telegram',
        };
      }
      return EXISTING;
    };
    read.calls = [];

    const handoff = await adapter.draftHandoff(read, 'piece-1', 'telegram');

    expect(read.calls).toEqual([
      {
        url: '/content-intelligence/materials/piece-1/draft',
        method: 'POST',
        body: { platform: 'telegram' },
      },
      { url: '/posts/post-1', method: 'GET', body: undefined },
    ]);
    expect(handoff.postId).toBe('post-1');
    expect(handoff.existing).toEqual(EXISTING);
  });

  test('a refused draft never asks for a post that was not written', async () => {
    const read = async (url) => {
      read.seen.push(url);
      throw Object.assign(new Error('нет канала'), {
        status: 422,
        code: 'MATERIAL_PLATFORM_UNSUPPORTED',
      });
    };
    read.seen = [];

    await expect(
      adapter.draftHandoff(read, 'piece-1', 'site')
    ).rejects.toThrow('нет канала');
    expect(read.seen).toEqual([
      '/content-intelligence/materials/piece-1/draft',
    ]);
  });

  test('the editor is handed the draft’s own channel, with every channel behind it', () => {
    const channels = adapter.editorChannels(EXISTING, CHANNELS);

    expect(channels.allIntegrations.map((one) => one.id)).toEqual([
      'int-tg',
      'int-vk',
    ]);
    // The same narrowing the calendar does: the post belongs to one channel.
    expect(channels.integrations.map((one) => one.id)).toEqual(['int-tg']);
    expect(channels.integrations[0].picture).toBe('new.png');
  });

  test('the editor opens on the draft’s own date', () => {
    expect(adapter.editorDate(EXISTING).toISOString()).toBe(
      '2026-08-22T09:00:00.000Z'
    );
  });

  test('the button asks for the draft and then for the post', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview':
        ok(LOSSY_PREVIEW),
      'POST /content-intelligence/materials/piece-1/draft': ok({
        postId: 'post-1',
        derivationId: 'der-1',
        contentPieceId: 'piece-1',
        platform: 'telegram',
      }),
      'GET /posts/post-1': ok(EXISTING),
    });
    await renderTab();

    const panel = await openRecut();
    await click(
      within(panel).getByRole('button', { name: 'Открыть в редакторе' })
    );

    // The editor tree itself cannot be built under jsdom — it reaches Mantine
    // and MUI through an ESM-only path — so this checks the handoff: the draft
    // is written, and the post it became is read back in the same envelope the
    // calendar hands its own editor.
    const sequence = calls
      .map((call) => `${call.method} ${call.url}`)
      .filter((line) => line.includes('/draft') || line.includes('/posts/'));
    expect(sequence).toEqual([
      'POST /content-intelligence/materials/piece-1/draft',
      'GET /posts/post-1',
    ]);
    expect(
      calls.find((call) => call.url.endsWith('/draft')).body
    ).toEqual({ platform: 'telegram' });
  });

  test('it opens the same dialog the calendar opens', () => {
    // Not a route of its own: the product has one post editor and one modal
    // identity for it. A second door here is a second thing to keep in step.
    expect(adapter.EDITOR_MODAL.id).toBe('add-edit-modal');
    expect(source('calendar')).toContain("id: 'add-edit-modal'");

    const containerCode = code('container');
    expect(containerCode).toContain('AddEditModal');
    expect(containerCode).toContain('ExistingDataContextProvider');
    expect(containerCode).toContain('EDITOR_MODAL');
  });
});

/* -------------------------------------------------------------------------
 * The boundary
 * ---------------------------------------------------------------------- */

describe('nothing on this surface reaches a platform', () => {
  test('no provider, no integration client, no delivery call', () => {
    for (const key of ['container', 'adapter']) {
      const scanned = code(key);

      expect(scanned).not.toMatch(
        /^import[\s\S]*?from\s+'[^']*(?:providers|integrations\/|social\.)/m
      );
      expect(scanned).not.toMatch(/\.(?:publish|schedule|deliver|send)\s*\(/);
      // Every request goes through the product's own helper at a relative
      // path. An absolute URL here is a second way out of the process.
      expect(scanned).not.toMatch(/https?:\/\//);
    }
  });

  test('every path it asks for belongs to this product', () => {
    expect(adapter.MATERIALS_API).toBe('/content-intelligence/materials');
    expect(adapter.materialEndpoint('piece-1', 'draft')).toBe(
      '/content-intelligence/materials/piece-1/draft'
    );
    expect(adapter.postEndpoint('post-1')).toBe('/posts/post-1');
  });

  test('the panel keeps saying who does the sending', async () => {
    serve({
      ...baseTable(),
      'POST /content-intelligence/materials/piece-1/recut-preview':
        ok(LOSSY_PREVIEW),
    });
    await renderTab();

    const panel = await openRecut();
    expect(
      within(panel).getByText(/Отправкой занимается публикация/)
    ).toBeTruthy();
  });
});
