'use strict';

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

const { act, cleanup, fireEvent, render, screen } =
  require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;

function makeLanguageStore(initialLanguage) {
  let language = initialLanguage;
  const listeners = new Set();
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => language;
  return {
    useInterfaceLanguage: () =>
      React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    set(next) {
      language = next;
      for (const listener of listeners) listener();
    },
  };
}

const language = makeLanguageStore('en');
const languageHook = {
  useInterfaceLanguage: language.useInterfaceLanguage,
};
const requestCalls = {
  piece: jest.fn(),
  voice: jest.fn(),
  channel: jest.fn(),
};
const swrKeys = {
  piece: new Set(),
  voice: new Set(),
  voiceProfile: new Set(),
  voiceWizard: new Set(),
  channel: new Set(),
};

function trackedSWR(area, readData) {
  return {
    __esModule: true,
    default(key, fetcher) {
      if (key && fetcher) swrKeys[area].add(String(key));
      return readData(key);
    },
  };
}

const emptySWR = () => ({
  data: undefined,
  error: undefined,
  isLoading: true,
  mutate: jest.fn(),
});

const pieceApi = new Proxy(
  {},
  {
    get: (_target, method) => (...args) =>
      `/pieces/${String(method)}/${args.map(String).join('/')}`,
  }
);
const emptyPieceWords = new Proxy(
  {},
  { get: (_target, key) => `piece:${String(key)}` }
);
const pieceAdapter = {
  DEFAULT_POST_BASELINE: {},
  DEFAULT_POST_OPTIONS: {},
  PIECES_API: pieceApi,
  PIECE_MAX_INTERVIEW_ROUNDS: 2,
  PIECE_TAB_CORE: 'core',
  PieceContractError: class PieceContractError extends Error {},
  DROP_RESERVE: {},
  EDIT_CLOSED_CODES: [],
  readPieceTab: () => 'core',
  readPieceWhen: () => null,
  workspaceChannels: () => [],
  postBaselineOf: () => ({}),
  postOptionsFrom: () => ({}),
  ...Object.fromEntries(
    [
      'adaptOverrides',
      'adaptationPlace',
      'buildAdaptPayload',
      'buildAdaptationPatch',
      'buildPostSettingsPayload',
      'buildSchedulePayload',
      'calendarPath',
      'channelOfTab',
      'fetchPieceDetail',
      'findSlotUrl',
      'pieceTabPath',
      'platformName',
      'readAdaptEvent',
      'readAdaptationPatch',
      'readPostSettingsResponse',
      'readScheduleResult',
      'readSlotDate',
      'refusalMessage',
      'refusalCode',
      'rememberedProfilePayload',
      'tabOfPlatform',
    ].map((name) => [name, () => undefined])
  ),
};

const pieceScreenProbe = ({ locale }) =>
  h(
    'section',
    { 'data-testid': 'piece-screen', 'data-locale': locale },
    h('p', { 'data-testid': 'piece-copy' }, locale === 'ru' ? 'Суть' : 'Core'),
    h('textarea', {
      'data-testid': 'piece-editor-draft',
      defaultValue: 'piece original draft',
    })
  );

const PieceContainer = loadWithMocks(
  'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx',
  {
    '../../agents/assistant.workspace-context': { AssistantContextAction: () => null },
    '../../ui/recoverable-draft': {
      clearRecoverableDraft: jest.fn(),
      readRecoverableDraft: () => null,
      retainRecoverableDraft: jest.fn(),
      textDraftScope: () => null,
    },
    swr: trackedSWR('piece', emptySWR),
    dayjs: { __esModule: true, default: () => ({}) },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => requestCalls.piece,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/use-interface-language': languageHook,
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback ?? '',
    },
    '../../layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
    '../../new-launch/ndjson': { createNdjsonSplitter: () => () => [] },
    '../../launches/helpers/date.picker': { DatePicker: () => null },
    '../../brand-voice/voice-avatars.adapter': {
      AVATAR_ROUTES: { list: '/avatars' },
      mapAvatars: () => ({ avatars: [] }),
    },
    '../../brand-voice/voice-profile.adapter': { readVoice: jest.fn() },
    '../content-write-right': {
      ContentReadOnlyNote: () => null,
      writeRightFromRole: () => ({ allowed: true }),
    },
    '../content-section.copy': {
      resolveContentLocale: (value) =>
        String(value).toLowerCase().startsWith('ru') ? 'ru' : 'en',
    },
    '../intake/questions.card': { SuggestedQuestionsCard: () => null },
    './adaptation-review': {
      AdaptationReview: () => null,
      CORE_REVIEW_ACTIONS: {},
    },
    './piece.screen': { PieceScreen: pieceScreenProbe },
    './piece-core-tab': { PieceCoreTab: () => null },
    './piece-channel-tab': { PieceChannelTab: () => null },
    './material-ask': { MaterialAsk: () => null },
    '../../ui/use-autosave': { AUTOSAVE_MS: 800 },
    './piece-questions': { PieceQuestions: () => null },
    '../intake/post-link.question': { PostLinkQuestion: () => null },
    './piece-channel-profile': {
      useChannelWritingProfile: () => ({ data: undefined, mutate: jest.fn() }),
    },
    './pieces.copy': { piecesCopy: { ru: emptyPieceWords, en: emptyPieceWords } },
    './pieces.adapter': pieceAdapter,
    '../intake/intake.adapter': {
      readQualityChecks: () => null,
      readQuestions: () => [],
    },
    '../intake/writing-profile.adapter': {
      writingProfileUrl: () => '/profile',
    },
    '../intake/channel-plan-mode': { channelPlanModeUrl: () => '/plan' },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': {
      isInterviewAskKey: () => false,
      PIECE_ROUTES: {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/media/image-prompt': {
      DEFAULT_IMAGE_STYLE: '',
      imagePromptBody: () => '',
    },
  }
).PieceContainer;

const VoiceProfileContainer = loadWithMocks(
  'apps/frontend/src/components/brand-voice/voice-profile.container.tsx',
  {
    swr: trackedSWR('voiceProfile', emptySWR),
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => requestCalls.voice,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/use-interface-language': languageHook,
    '../layout/user.context': { useUser: () => ({}) },
    './voice-passport.screen': {
      VoicePassportScreen: ({ locale }) =>
        h(
          'section',
          { 'data-testid': 'voice-profile-probe', 'data-locale': locale },
          h('p', { 'data-testid': 'voice-profile-copy' }, locale === 'ru' ? 'Поле паспорта' : 'Passport field'),
          h('textarea', {
            'data-testid': 'voice-profile-draft',
            defaultValue: 'passport original draft',
          })
        ),
    },
    './voice-scales.screen': { VoiceScalesScreen: () => null },
    './voice-redactions.screen': { VoiceRedactionsScreen: () => null },
    './voice-versions.screen': { VoiceVersionsScreen: () => null },
    './voice-learning.screen': { VoiceLearningScreen: () => null },
    '@contentfactory/frontend/components/ui/allowance-hint': {
      AllowanceHint: () => null,
    },
  }
).VoiceProfileContainer;

const VoiceWizardContainer = loadWithMocks(
  'apps/frontend/src/components/brand-voice/voice-wizard.container.tsx',
  {
    '@contentfactory/react/layout': { Panel: ({ children }) => h('section', null, children) },
    swr: trackedSWR('voiceWizard', (key) => ({
      data:
        key === '/content-intelligence/voice/overview'
          ? { state: 'empty', permissions: { canCreate: true } }
          : undefined,
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    })),
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => requestCalls.voice,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/use-interface-language': languageHook,
    '@contentfactory/react/form/button': {
      Button: ({ children, onClick, type = 'button', ...props }) =>
        h('button', { ...props, type, onClick }, children),
    },
    '@contentfactory/react/form/checkbox.field': { CheckboxField: () => null },
    '@contentfactory/react/form/input': { Input: () => null },
    '@contentfactory/react/form/textarea': { Textarea: () => null },
    '@contentfactory/frontend/components/ui/allowance-hint': {
      AllowanceHint: () => null,
    },
    '@contentfactory/frontend/components/launches/helpers/use.integration.list': {
      useIntegrationList: () => ({ data: [], isLoading: false, error: undefined }),
    },
    '../new-launch/ndjson': { createNdjsonSplitter: () => () => [] },
    './voice-empty.screen': {
      VoiceEmptyScreen: ({ locale, onContinueManual }) =>
        h(
          'section',
          { 'data-testid': 'voice-wizard-empty-probe', 'data-locale': locale },
          h('p', null, locale === 'ru' ? 'Начало мастера' : 'Wizard start'),
          h('button', { onClick: onContinueManual }, 'Open manual path')
        ),
    },
    './voice-paths.screen': { VoicePathsScreen: () => null },
    './voice-samples.screen': { VoiceSamplesScreen: () => null },
    './voice-analysis.screen': { VoiceAnalysisScreen: () => null },
    './voice-proposal.screen': {
      VoiceProposalScreen: ({ locale }) =>
        h(
          'section',
          { 'data-testid': 'voice-wizard-proposal-probe', 'data-locale': locale },
          h('p', { 'data-testid': 'voice-wizard-copy' }, locale === 'ru' ? 'Ручное предложение' : 'Manual proposal'),
          h('textarea', {
            'data-testid': 'voice-wizard-draft',
            defaultValue: 'wizard original draft',
          })
        ),
    },
  }
).VoiceWizardContainer;

const VoiceAvatarScreen = loadWithMocks(
  'apps/frontend/src/components/brand-voice/voice-avatar.screen.tsx',
  {
    '@contentfactory/react/layout': {
      Panel: ({ children }) => h('section', null, children),
    },
    'next/link': {
      __esModule: true,
      default: ({ href, children, ...props }) => h('a', { href, ...props }, children),
    },
    'next/navigation': { useRouter: () => ({ push: jest.fn() }) },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => requestCalls.voice,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/use-interface-language': languageHook,
    '@contentfactory/react/form/button': {
      Button: ({ children, onClick, ...props }) =>
        h('button', { ...props, onClick }, children),
    },
    '@contentfactory/react/layout/hint': {
      Hint: ({ children }) => h('span', null, children),
    },
    './voice-wizard.container': {
      VoiceWizardContainer,
    },
    './voice-profile.container': { VoiceProfileContainer },
    './voice-avatars.adapter': {
      AVATAR_ROUTES: { list: '/avatars' },
      mapAvatars: (data) => ({ avatars: data?.avatars ?? [] }),
    },
    './voice-profile.adapter': { readVoice: jest.fn() },
    './voice-copy': {
      voiceCopy: {
        ru: { avatarsNoName: 'Без имени', hintFor: (value) => value },
        en: { avatarsNoName: 'Unnamed avatar', hintFor: (value) => value },
      },
    },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': {
      VOICE_API_BASE: '/content-intelligence/voice',
    },
    swr: trackedSWR('voice', (key) => ({
      data:
        key === '/avatars'
          ? {
              avatars: [
                { id: 'voice-1', name: 'Alex Kim', analysed: false },
                { id: 'voice-2', name: 'Sam Lee', analysed: true },
              ],
            }
          : key === '/content-intelligence/voice/overview'
            ? { permissions: { canCreate: true } }
            : undefined,
      isLoading: false,
      mutate: jest.fn(),
    })),
  }
).VoiceAvatarScreen;

const channelRow = {
  id: 'channel-1',
  name: 'Test channel',
  identifier: 'telegram',
  contentLanguage: 'ru',
  publicUrl: null,
  time: [],
  inBetweenSteps: false,
  disabled: false,
  writingProfileStored: false,
};

function channelWords(locale) {
  const labels = {
    title: locale === 'ru' ? 'Каналы' : 'Channels',
    back: locale === 'ru' ? '← Все каналы' : '← All channels',
    backMobile: locale === 'ru' ? '‹ Каналы' : '‹ Channels',
  };
  return new Proxy(labels, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'posts' || key === 'slots') return (count) => String(count);
      return `${locale}:${String(key)}`;
    },
  });
}

const channelsCopy = {
  ru: channelWords('ru'),
  en: channelWords('en'),
};
const ChannelScreen = loadWithMocks(
  'apps/frontend/src/components/channels/channel-screen.tsx',
  {
    '@contentfactory/react/layout/hint': {
      Hint: ({ children }) => h('span', null, children),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/use-interface-language': languageHook,
    'next/navigation': {
      useParams: () => ({ id: 'channel-1' }),
      useSearchParams: () => new URLSearchParams(),
    },
    '@mantine/hooks': { useMediaQuery: () => false },
    swr: trackedSWR('channel', () => ({
      data: { total: 0, posts: [] },
      isLoading: false,
      mutate: jest.fn(),
    })),
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => requestCalls.channel,
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, onClick, type = 'button', ...props }) =>
        h('button', { ...props, type, onClick }, children),
    },
    '@contentfactory/react/form/button-link': {
      ButtonLink: ({ children, href, ...props }) => h('a', { href, ...props }, children),
    },
    '@contentfactory/react/choice/tabs': {
      Tabs: ({ children }) => h('div', null, children),
      Tab: ({ children }) => h('button', null, children),
      TabList: ({ children, ...props }) => h('div', props, children),
      TabPanel: ({ children, ...props }) => h('section', props, children),
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationAdmin: (role) => role === 'ADMIN',
      isOrganizationEditor: (role) => role === 'ADMIN' || role === 'EDITOR',
    },
    '../layout/user.context': { useUser: () => ({ role: 'ADMIN' }) },
    '../launches/helpers/use.integration.list': {
      useIntegrationList: () => ({
        data: [channelRow],
        mutate: jest.fn(),
        isLoading: false,
        error: null,
      }),
    },
    '../launches/calendar.context': {
      CalendarContext: React.createContext({}),
      calendarDefaults: {},
    },
    '../ui/surface': {
      Panel: ({ title, actions, children }) =>
        h('section', null, title, actions, children),
      Status: ({ children }) => h('span', null, children),
      EmptyState: ({ title, description }) => h('section', null, title, description),
      ErrorState: ({ title, children }) => h('section', null, title, children),
      SkeletonRows: ({ label }) => h('p', null, label),
    },
    './channel-writing-profile': {
      ChannelWritingProfile: ({ locale: editorLocale }) =>
        h(
          'div',
          null,
          h('p', null, editorLocale === 'ru' ? 'Карточка канала' : 'Channel profile'),
          h('textarea', {
            'data-testid': 'channel-editor-draft',
            defaultValue: 'channel original draft',
          })
        ),
    },
    './channels.copy': { channelsCopy },
    './channel-model': { publicChannelUrl: () => null },
    './channel-parts': {
      ChannelAvatar: () => null,
      ChannelStatus: () => h('span', null, 'status'),
      ChannelSlots: () => h('span', null, 'slots'),
      channelDate: (value) => value,
    },
    './channel-menu': {
      ChannelMenu: ({ renderActions }) =>
        renderActions(h('button', null, 'Menu'), {
          reconnect: jest.fn(),
          schedule: jest.fn(),
          group: jest.fn(),
          changeBot: jest.fn(),
          enable: jest.fn(),
          disable: jest.fn(),
          remove: jest.fn(),
        }),
    },
    '../ui/section-tabs': { sectionTabClass: () => '' },
  }
).ChannelScreen;

afterEach(cleanup);

test('piece, voice, and channel editors follow interface language without losing drafts', () => {
  const view = render(
    h(
      React.Fragment,
      null,
      h(PieceContainer, { pieceId: 'piece-1' }),
      h(VoiceAvatarScreen, { avatarId: 'voice-1' }),
      h(VoiceAvatarScreen, { avatarId: 'voice-2' }),
      h(ChannelScreen)
    )
  );

  expect(screen.getByTestId('piece-copy').textContent).toBe('Core');
  expect(screen.getAllByText('Avatars')).toHaveLength(2);
  expect(screen.getByTestId('voice-wizard-empty-probe').dataset.locale).toBe('en');
  expect(screen.getByTestId('voice-wizard-empty-probe').textContent).toContain('Wizard start');
  expect(screen.getByTestId('voice-profile-copy').textContent).toBe('Passport field');
  expect(document.body.textContent).toContain('‹ Channels');
  expect(screen.getByText('Channel profile')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open manual path' }));
  expect(screen.getByTestId('voice-wizard-proposal-probe').dataset.locale).toBe('en');
  expect(screen.getByTestId('voice-wizard-copy').textContent).toBe('Manual proposal');

  const editors = [
    screen.getByTestId('piece-editor-draft'),
    screen.getByTestId('voice-wizard-draft'),
    screen.getByTestId('voice-profile-draft'),
    screen.getByTestId('channel-editor-draft'),
  ];
  const dirtyDrafts = [
    'piece unsaved text exactly',
    'wizard unsaved text exactly',
    'passport unsaved text exactly',
    'channel unsaved text exactly',
  ];
  editors.forEach((editor, index) =>
    fireEvent.change(editor, { target: { value: dirtyDrafts[index] } })
  );

  const initialSWRKeys = Object.fromEntries(
    Object.entries(swrKeys).map(([area, keys]) => [area, [...keys]])
  );
  expect(Object.values(requestCalls).every((request) => request.mock.calls.length === 0)).toBe(true);

  act(() => language.set('ru'));
  expect(screen.getByTestId('piece-copy').textContent).toBe('Суть');
  expect(screen.getAllByText('Аватары')).toHaveLength(2);
  expect(screen.getByTestId('voice-wizard-proposal-probe').dataset.locale).toBe('ru');
  expect(screen.getByTestId('voice-wizard-copy').textContent).toBe('Ручное предложение');
  expect(screen.getByTestId('voice-profile-copy').textContent).toBe('Поле паспорта');
  expect(document.body.textContent).toContain('‹ Каналы');
  expect(screen.getByText('Карточка канала')).toBeTruthy();
  editors.forEach((editor, index) => {
    expect(editor.isConnected).toBe(true);
    expect(editor.value).toBe(dirtyDrafts[index]);
  });

  act(() => language.set('en'));
  expect(screen.getByTestId('piece-copy').textContent).toBe('Core');
  expect(screen.getAllByText('Avatars')).toHaveLength(2);
  expect(screen.getByTestId('voice-wizard-proposal-probe').dataset.locale).toBe('en');
  expect(screen.getByTestId('voice-wizard-copy').textContent).toBe('Manual proposal');
  expect(screen.getByTestId('voice-profile-copy').textContent).toBe('Passport field');
  expect(document.body.textContent).toContain('‹ Channels');
  expect(screen.getByText('Channel profile')).toBeTruthy();
  editors.forEach((editor, index) => {
    expect(editor.isConnected).toBe(true);
    expect(editor.value).toBe(dirtyDrafts[index]);
  });
  expect(
    Object.fromEntries(Object.entries(swrKeys).map(([area, keys]) => [area, [...keys]]))
  ).toEqual(initialSWRKeys);
  expect(Object.values(requestCalls).every((request) => request.mock.calls.length === 0)).toBe(true);
  expect(view.container.querySelectorAll('textarea')).toHaveLength(4);
});
