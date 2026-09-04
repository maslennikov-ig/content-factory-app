'use strict';

/**
 * An avatar at an address.
 *
 * Four screens describing one long-lived object used to open on top of the
 * list, on a piece of component state nothing outside the component could see.
 * That cost three ordinary things: the browser's back button left the section
 * instead of returning to the list, a reload dropped whoever had it open back
 * onto the list, and there was no link to send somebody who should look at a
 * particular voice.
 *
 * What is under test is the page that replaced it — that it names the avatar
 * it is showing, that it leads back to the list in one click, that a link to an
 * avatar this workspace does not hold is a stated dead end rather than four
 * empty screens, and that an avatar with no corpus opens on the step that
 * collects one rather than on a passport with every line blank.
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

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
  }),
  usePathname: () => '/content/avatars/avt-01',
  useSearchParams: () => new URLSearchParams(),
}));

// `next/link` renders an anchor and needs the router context this page does not
// mount in jsdom. The anchor is all the page asks of it.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }) =>
    require('react').createElement('a', { href, ...rest }, children),
}));

const { cleanup, fireEvent, render, screen, waitFor } =
  require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const files = {
  screen: `${base}/voice-avatar.screen.tsx`,
  route: 'apps/frontend/src/app/(app)/(site)/content/avatars/[id]/page.tsx',
};

test('the avatar has a route of its own and a screen behind it', () => {
  for (const file of Object.values(files)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
  const route = fs.readFileSync(path.join(root, files.route), 'utf8');
  expect(route).toContain('VoiceAvatarScreen');
  // The id comes from the path, not from a query string somebody has to know
  // to append.
  expect(route).toMatch(/params/);
});

const page = loadTypeScriptModule(files.screen);
const copy = loadTypeScriptModule(`${base}/voice-copy.ts`);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const OVERVIEW = {
  contractVersion: 'brand-voice-wiring/v1',
  hasVoice: true,
  state: 'default',
  permissions: {
    canRead: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    referencePathDisabled: false,
  },
  readiness: {
    ready: true,
    charCount: 15200,
    sampleCount: 16,
    missingChars: 0,
    missingSamples: 0,
    confidence: 'NORMAL',
  },
  paths: { available: { manual: true, own: true, reference: true }, disabledReasons: {} },
};

const avatarRow = (over = {}) => ({
  id: 'avt-01',
  name: 'Алексей Ким',
  kind: 'PERSON',
  isDefault: true,
  analysed: true,
  versionLabel: 'v3',
  sampleCount: 48,
  createdAt: '12.06.2026',
  ...over,
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

const answer = (body, status = 200) => ({ body, status });
let routes = {};

const setBackend = (avatars = [avatarRow()]) => {
  const scoped = '?avatar=avt-01';
  routes = {
    '/content-intelligence/voice/overview': answer(OVERVIEW),
    '/content-intelligence/voice/avatars': answer({
      state: 'default',
      avatars,
      defaultAvatarId: avatars[0]?.id ?? null,
      limit: 8,
      canManage: true,
    }),
    [`/content-intelligence/voice/passport${scoped}`]: answer(PASSPORT),
    [`/content-intelligence/voice/scales${scoped}`]: answer({
      state: 'default',
      scales: {},
      canEditCorridors: true,
    }),
    [`/content-intelligence/voice/redactions${scoped}`]: answer({
      state: 'default',
      redactions: [],
      kept: [],
      referenceCount: 0,
      finishedAt: '22.08.2026',
      longestMatch: 0,
    }),
    [`/content-intelligence/voice/versions${scoped}`]: answer({
      state: 'default',
      versions: [],
      canRestore: true,
    }),
    '/content-intelligence/voice/paths': answer({
      state: 'default',
      ...OVERVIEW.paths,
    }),
    '/content-intelligence/voice/samples': answer({
      state: 'empty',
      samples: [],
      sources: [],
      readiness: OVERVIEW.readiness,
    }),
    '/content-intelligence/voice/proposal': answer({
      outcome: 'insufficient',
      readiness: OVERVIEW.readiness,
    }),
  };
};

beforeEach(() => {
  setBackend();
  global.fetch = async (url) => {
    const result = routes[String(url)] ?? answer({}, 404);
    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.body,
      // `content-factory-next-fn33.65`: the shared request helper hands the
      // common refusal handler a copy, so a fake answer must clone like a
      // real `Response`.
      clone() {
        return this;
      },
    };
  };
});

afterEach(cleanup);

const renderPage = (avatarId = 'avt-01') =>
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
        React.createElement(page.VoiceAvatarScreen, { avatarId })
      )
    )
  );

const surfaces = () =>
  Array.from(document.querySelectorAll('[data-voice-surface]')).map((node) =>
    node.getAttribute('data-voice-surface')
  );

describe('the page names who it is about and leads back', () => {
  test('the avatar’s name is the heading, not «Аватары»', async () => {
    renderPage();

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Алексей Ким');
  });

  test('the breadcrumb goes back to the list in one click', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });

    const back = screen.getByRole('link', { name: 'Аватары' });
    expect(back.getAttribute('href')).toBe('/content');
  });

  test('an avatar with an analysis opens on its passport', async () => {
    renderPage();

    await waitFor(() => expect(surfaces()).toContain('passport'));
    expect(surfaces()).toContain('scales');
  });
});

describe('the states a link can land in', () => {
  test('a link to an avatar this workspace does not hold says so', async () => {
    renderPage('avt-missing');

    expect(
      await screen.findByText(/Такого аватара нет/)
    ).toBeTruthy();
    // Four empty screens about nothing would read as a broken page rather
    // than as a dead link.
    expect(surfaces()).not.toContain('passport');
  });

  test('an avatar with no corpus opens on the step that collects one', async () => {
    setBackend([avatarRow({ analysed: false, versionLabel: undefined })]);
    renderPage();

    // This is the second half of «Создать аватар»: the dialog asked the two
    // questions it could, and what the person writes like is measured rather
    // than typed.
    await waitFor(() => expect(surfaces()).toContain('empty'));
    expect(surfaces()).not.toContain('passport');
  });
});

describe('building the voice again is offered, not hidden', () => {
  test('an administrator can start the wizard over a voice that exists', async () => {
    renderPage();
    await waitFor(() => expect(surfaces()).toContain('passport'));

    fireEvent.click(
      screen.getByRole('button', { name: /^Собрать голос заново$/ })
    );

    await waitFor(() => expect(surfaces()).toContain('empty'));
  });

  test('leaving the wizard returns to the voice that is still in force', async () => {
    renderPage();
    await waitFor(() => expect(surfaces()).toContain('passport'));
    fireEvent.click(
      screen.getByRole('button', { name: /^Собрать голос заново$/ })
    );
    await waitFor(() => expect(surfaces()).toContain('empty'));

    fireEvent.click(
      screen.getByRole('button', { name: /^Вернуться к аватару$/ })
    );

    await waitFor(() => expect(surfaces()).toContain('passport'));
  });

  test('a member without the right is not offered it', async () => {
    routes['/content-intelligence/voice/overview'] = answer({
      ...OVERVIEW,
      permissions: { ...OVERVIEW.permissions, canCreate: false },
    });
    renderPage();
    await waitFor(() => expect(surfaces()).toContain('passport'));

    // Not a disabled button either: an action a member can never take is an
    // action that does not belong on their screen.
    expect(
      screen.queryByRole('button', { name: /^Собрать голос заново$/ })
    ).toBeNull();
  });
});

describe('the hint the page carries', () => {
  test('«Собрать голос заново» says what happens to the voice in force', async () => {
    renderPage();
    await waitFor(() => expect(surfaces()).toContain('passport'));

    const hint = screen.getByRole('button', {
      name: copy.voiceCopy.ru.hintFor('Собрать голос заново'),
    });
    fireEvent.focus(hint);

    expect(
      screen.getByRole('tooltip').textContent
    ).toMatch(/Действующая версия работает/);
  });
});
