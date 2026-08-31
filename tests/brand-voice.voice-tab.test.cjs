'use strict';

/**
 * The one door to the brand voice.
 *
 * A workspace with no voice needs the wizard; a workspace with one needs its
 * avatars. Both live behind the same tab, and which of them is shown is a fact
 * the server holds — `overview.hasVoice` — rather than a route a person has to
 * know about. Getting this wrong in either direction is the failure that
 * matters: a wizard shown over a working voice invites somebody to rebuild
 * what they already have, and a list shown to an empty workspace is a list of
 * nothing.
 *
 * From 2026-08-25 the landing is the avatars list rather than the passport.
 * «Покажи голос этого пространства» stopped being a well-formed request the
 * day a space could hold eight of them: the list answers the question that
 * replaced it.
 *
 * From 2026-08-29 the tab stops opening an avatar. Four screens describing one
 * long-lived object used to appear here on component state, which left the
 * object with no address: the back button left the section, a reload dropped
 * the reader onto the list, and there was no link to send anybody. «Открыть»
 * now navigates to `/content/avatars/<id>` and this tab is the list again —
 * one screen, one job. What that page then shows is
 * `tests/brand-voice.avatar-page.test.cjs`.
 */

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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');
const { SWRConfig } = require('swr');
// The tab navigates, and the app router is not mounted in jsdom. The push is
// the observable half of «Открыть», so it is captured rather than stubbed away.
const pushed = [];
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (href) => pushed.push(href),
    replace: (href) => pushed.push(href),
    prefetch: () => undefined,
    back: () => undefined,
  }),
  usePathname: () => '/content',
  useSearchParams: () => new URLSearchParams(),
}));

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const tab = loadTypeScriptModule(`${base}/voice-tab.tsx`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
void root;

const overviewBody = (hasVoice, canCreate = true) => ({
  contractVersion: 'brand-voice-wiring/v1',
  hasVoice,
  state: hasVoice ? 'default' : 'empty',
  permissions: {
    canRead: true,
    canCreate,
    canEdit: canCreate,
    canDelete: canCreate,
    referencePathDisabled: false,
  },
  readiness: {
    ready: false,
    charCount: 0,
    sampleCount: 0,
    missingChars: 15000,
    missingSamples: 8,
    confidence: 'LOW',
  },
  paths: {
    available: { manual: canCreate, own: canCreate, reference: canCreate },
    disabledReasons: {},
  },
});

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
  },
};

const EMPTY_OK = { state: 'default' };

const answer = (body, status = 200) => ({ body, status });

let routes = {};

const setBackend = (hasVoice, canCreate = true) => {
  routes = {
    '/content-intelligence/voice/overview': answer(
      overviewBody(hasVoice, canCreate)
    ),
    '/content-intelligence/voice/avatars': answer({
      state: hasVoice ? 'default' : 'empty',
      avatars: hasVoice
        ? [
            {
              id: 'avt-01',
              name: 'Алексей Ким',
              kind: 'PERSON',
              isDefault: true,
              analysed: true,
              versionLabel: 'v3',
              sampleCount: 48,
              createdAt: '12.06.2026',
            },
          ]
        : [],
      defaultAvatarId: hasVoice ? 'avt-01' : null,
      limit: 8,
      canManage: canCreate,
    }),
    // Открытый аватар называет себя в каждом запросе профиля, поэтому у
    // четырёх экранов появляется вторая пара путей — с `?avatar=`.
    '/content-intelligence/voice/passport?avatar=avt-01': answer(
      hasVoice ? PASSPORT : { state: 'empty', voice: null }
    ),
    '/content-intelligence/voice/scales?avatar=avt-01': answer({
      state: 'default',
      scales: {},
      canEditCorridors: canCreate,
    }),
    '/content-intelligence/voice/redactions?avatar=avt-01': answer({
      state: 'default',
      redactions: [],
      kept: [],
      referenceCount: 0,
      finishedAt: '22.08.2026',
      longestMatch: 0,
    }),
    '/content-intelligence/voice/versions?avatar=avt-01': answer({
      state: 'default',
      versions: [],
      canRestore: canCreate,
    }),
    '/content-intelligence/voice/paths': answer({
      state: 'default',
      ...overviewBody(hasVoice, canCreate).paths,
    }),
    '/content-intelligence/voice/samples': answer({
      state: 'empty',
      samples: [],
      sources: [],
      readiness: overviewBody(hasVoice).readiness,
    }),
    '/content-intelligence/voice/proposal': answer({
      outcome: 'insufficient',
      readiness: overviewBody(hasVoice).readiness,
    }),
    '/content-intelligence/voice/passport': answer(
      hasVoice ? PASSPORT : { state: 'empty', voice: null }
    ),
    '/content-intelligence/voice/scales': answer({
      ...EMPTY_OK,
      scales: {},
      canEditCorridors: canCreate,
    }),
    '/content-intelligence/voice/redactions': answer({
      ...EMPTY_OK,
      redactions: [],
      kept: [],
      referenceCount: 0,
      finishedAt: '22.08.2026',
      longestMatch: 0,
    }),
    '/content-intelligence/voice/versions': answer({
      ...EMPTY_OK,
      versions: [],
      canRestore: canCreate,
    }),
    '/content-intelligence/brand-profile': answer({
      profile: null,
      versions: [],
    }),
    '/content-intelligence/sources': answer({ sources: [], capabilities: {} }),
  };
};

beforeEach(() => {
  pushed.length = 0;
  setBackend(false);
  global.fetch = async (url, options = {}) => {
    const handler = routes[String(url)];
    const result = handler ?? answer({}, 404);
    void options;
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
        React.createElement(tab.VoiceTab)
      )
    )
  );

const surfaces = () =>
  Array.from(document.querySelectorAll('[data-voice-surface]')).map((node) =>
    node.getAttribute('data-voice-surface')
  );

describe('which half of the section a workspace lands in', () => {
  test('with no voice, the tab is the wizard', async () => {
    setBackend(false);
    renderTab();

    await waitFor(() => expect(surfaces().length).toBeGreaterThan(0));
    expect(surfaces()).toContain('empty');
    expect(surfaces()).not.toContain('passport');
  });

  test('with a voice, the tab is the list of avatars', async () => {
    setBackend(true);
    renderTab();

    await waitFor(() => expect(surfaces()).toContain('avatars'));
    // Ни паспорта, ни мастера: пространство с четырьмя аватарами не имеет
    // одного «своего голоса», который можно было бы показать вместо списка.
    expect(surfaces()).not.toContain('passport');
    expect(surfaces()).not.toContain('empty');
  });
});

describe('открыть аватар — это перейти к нему', () => {
  test('«Открыть» ведёт на адрес именно этого аватара', async () => {
    setBackend(true);
    renderTab();

    await waitFor(() => expect(surfaces()).toContain('avatars'));
    fireEvent.click(screen.getByRole('button', { name: /^Открыть$/ }));

    await waitFor(() => expect(pushed).toEqual(['/content/avatars/avt-01']));
    // Список остаётся списком: раскрывать паспорт поверх него — ровно то, из-за
    // чего у аватара не было ни адреса, ни работающей кнопки «назад».
    expect(surfaces()).not.toContain('passport');
  });

  test('вкладка не просит ни паспорт, ни шкалы: их читает страница аватара', async () => {
    setBackend(true);
    renderTab();

    await waitFor(() => expect(surfaces()).toContain('avatars'));
    expect(surfaces()).not.toContain('scales');
    expect(surfaces()).not.toContain('versions');
  });
});

describe('a server that refused is not a workspace without a voice', () => {
  test('a 500 on the overview reaches the screen as an error', async () => {
    setBackend(false);
    routes['/content-intelligence/voice/overview'] = answer(
      { code: 'VOICE_ANALYSIS_FAILED', message: 'Разбор не удался.' },
      500
    );
    renderTab();

    // «Голоса бренда пока нет» over a server that refused is a false
    // statement about the workspace: it may well have a voice nobody could
    // read just now.
    await waitFor(() =>
      expect(
        document.querySelector('[data-voice-state="error"]')
      ).not.toBeNull()
    );
    expect(document.querySelector('[data-voice-state="empty"]')).toBeNull();
  });
});
