const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.self = window;
const {
  render,
  renderHook,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const fs = require('node:fs'),
  path = require('node:path');
const h = React.createElement;
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
const words = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '../libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
    )
  )
);
const t = (key, fallback) => words[key] || fallback;
const Empty = () => null;
const stub = new Proxy(
  {},
  { get: (_, name) => (name === '__esModule' ? false : Empty) }
);
let role, request, toast, confirm, context, dragOptions;
function useLocalSWR(key, load) {
  const [state, setState] = React.useState({ isLoading: !!key });
  const latest = React.useRef(load);
  latest.current = load;
  const reload = React.useCallback(async () => {
    if (!key) return;
    setState((v) => ({ ...v, isLoading: true }));
    try {
      const data = await latest.current();
      setState({ data, isLoading: false });
      return data;
    } catch (error) {
      setState({ error, isLoading: false });
    }
  }, [key]);
  React.useEffect(() => {
    void reload();
  }, [reload]);
  return { ...state, mutate: reload };
}
const MEDIA = 'apps/frontend/src/components/media/media.component.tsx',
  MENU = 'apps/frontend/src/components/launches/menu/menu.tsx';
const INTEGRATION = {
  id: 'itg-1',
  name: 'Fixture',
  identifier: 'telegram',
  disabled: false,
};
const MEDIA_ITEM = {
  id: 'media-1',
  path: 'probe.png',
  originalName: 'probe.png',
  name: 'probe.png',
  thumbnail: null,
  alt: null,
};
const CalendarContext = React.createContext(null);
const loadCalendar = () =>
  loadWithMocks(
    'apps/frontend/src/components/launches/calendar.tsx',
    {
      '@contentfactory/frontend/components/launches/calendar.context': {
        CalendarContext,
        useCalendar: () => context,
      },
      '@contentfactory/frontend/components/layout/new-modal': {
        useModals: () => ({ openModal: () => {}, closeAll: () => {} }),
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => request,
      },
      'react-dnd': {
        useDrag: (options) => {
          dragOptions = options();
          return [{ opacity: 1 }, () => {}];
        },
        useDrop: () => [{ canDrop: false }, () => {}],
      },
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: toast }),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ role }),
      },
      '@mantine/hooks': {
        useInterval: () => ({ start: () => {}, stop: () => {} }),
      },
      '@contentfactory/frontend/components/launches/statistics': {
        StatisticsModal: () => null,
      },
      '@contentfactory/frontend/components/launches/missing-release.modal': {
        MissingReleaseModal: () => null,
      },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => t,
      },
      '@contentfactory/frontend/components/new-launch/compose.modal': {
        useOpenPostEditor: () => async () => {},
      },
      '@contentfactory/frontend/components/launches/creation.method.badge': {
        CreationMethodBadge: () => null,
      },
      '@contentfactory/react/helpers/delete.dialog': { deleteDialog: confirm },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ disableXAnalytics: false }),
      },
      '@contentfactory/react/translation/use-interface-language': {
        useInterfaceLanguage: () => 'ru',
      },
      './adaptation-picker': { useAdaptationPicker: () => () => {} },
      './helpers/isuscitizen.utils': { isUSCitizen: () => false },
      '@contentfactory/frontend/components/preview/post.preview.dialog': {
        PostPreviewDialog: () => h('div', { role: 'dialog' }, 'Preview'),
      },
    },
    process.env.CF_TEST_BASELINE
  );

const loadMediaBox = () =>
  loadWithMocks(
    MEDIA,
    {
      react: React,
      swr: {
        __esModule: true,
        default: useLocalSWR,
      },
      clsx: require('clsx'),
      lodash: require('lodash'),
      'react-sortablejs': stub,
      'use-debounce': { useDebounce: (value) => [value] },
      'zustand/react/shallow': { useShallow: (fn) => fn },
      '@prisma/client': {},
      '@uppy/react': {
        ...stub,
        Dashboard: () => h('div', { 'data-uppy-dashboard': 'true' }),
      },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => t,
      },
      '@contentfactory/react/form/input': stub,
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: toast }),
      },
      '@contentfactory/react/helpers/video.frame': stub,
      '@contentfactory/react/helpers/use.media.directory': {
        useMediaDirectory: () => ({ set: (value) => value }),
      },
      '@contentfactory/react/helpers/delete.dialog': { deleteDialog: confirm },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ language: 'en' }),
      },
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
      '@contentfactory/helpers/utils/has.extension': {
        hasExtension: () => false,
      },
      '@contentfactory/frontend/components/media/new.uploader': {
        useUppyUploader: () => ({ on: () => {}, cancelAll: () => {} }),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ role }),
      },
      '@contentfactory/frontend/components/layout/drop.files': {
        DropFiles: ({ children }) => h('div', null, children),
      },
      '@contentfactory/frontend/components/layout/loading': stub,
      '@contentfactory/frontend/components/layout/new-modal': {
        useModals: () => ({
          openModal: () => {},
          closeAll: () => {},
          closeById: () => {},
          closeCurrent: () => {},
        }),
      },
      '@contentfactory/frontend/components/launches/ai.image': stub,
      '@contentfactory/frontend/components/launches/ai.video': stub,
      '@contentfactory/frontend/components/launches/helpers/use.values': {
        useSettings: () => ({}),
      },
      '@contentfactory/frontend/components/launches/helpers/media.settings.component':
        stub,
      '@contentfactory/frontend/components/third-parties/third-party.media':
        stub,
      '@contentfactory/frontend/components/third-parties/third-party.media-library':
        stub,
      '@contentfactory/frontend/components/new-launch/store': {
        useLaunchStore: () => () => {},
      },
      '@contentfactory/frontend/components/media/image-editor/image-editor-modal':
        stub,
      '@contentfactory/frontend/components/media/image-editor/upload-edited-media':
        { uploadEditedMedia: () => {} },
      '@contentfactory/frontend/components/media/image-editor/media-completion':
        {
          completeEditedMedia: () => {},
          completeMediaBoxEditorSave: () => {},
          replaceEditedAttachment: () => [],
        },
    },
    process.env.CF_TEST_BASELINE
  );

const loadChannelMenu = () =>
  loadWithMocks(
    MENU,
    {
      react: React,
      clsx: require('clsx'),
      dayjs: require('dayjs'),
      'copy-to-clipboard': { __esModule: true, default: () => true },
      '@prisma/client': {},
      '@mantine/hooks': { useClickOutside: () => ({ current: null }) },
      'next/navigation': { useRouter: () => ({ push: () => {} }) },
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => t,
      },
      '@contentfactory/helpers/utils/custom.fetch': {
        useFetch: () => request,
      },
      '@contentfactory/react/helpers/delete.dialog': { deleteDialog: confirm },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ extensionId: 'fixture-extension' }),
      },
      '@contentfactory/react/toaster/toaster': {
        useToaster: () => ({ show: toast }),
      },
      '@contentfactory/frontend/components/layout/new-modal': {
        useModals: () => ({ openModal: () => {} }),
      },
      '@contentfactory/frontend/components/layout/user.context': {
        useUser: () => ({ role }),
      },
      '@contentfactory/frontend/components/launches/calendar.context': {
        useCalendar: () => ({
          integrations: [INTEGRATION],
          reloadCalendarView: () => {},
        }),
      },
      '@contentfactory/frontend/components/launches/time.table': stub,
      '@contentfactory/frontend/components/launches/bot.picture': stub,
      '@contentfactory/frontend/components/launches/customer.modal': stub,
      '@contentfactory/frontend/components/launches/settings.modal': stub,
      '@contentfactory/frontend/components/launches/add.provider.component':
        stub,
      '@contentfactory/frontend/components/new-launch/add.edit.modal': stub,
      '@contentfactory/frontend/components/new-launch/modal.wrapper.component':
        stub,
    },
    process.env.CF_TEST_BASELINE
  );

beforeEach(() => {
  role = 'ADMIN';
  toast = jest.fn();
  confirm = jest.fn(async () => true);
  request = jest.fn();
  context = {
    display: 'week',
    integrations: [],
    posts: [],
    loading: false,
    listPosts: [],
    listState: 'all',
    listSearched: '',
    reloadCalendarView: jest.fn(),
  };
  global.chrome = { runtime: { sendMessage: jest.fn() } };
});
afterEach(() => {
  cleanup();
  delete global.chrome;
});
afterAll(() => dom.window.close());
const fail = (kind) =>
  kind === 'network'
    ? Promise.reject(Error('private network'))
    : Promise.resolve(new Response('{}', { status: kind }));
test.each([403, 500, 'network'])(
  'calendar delete %s has no success or cache mutation',
  async (kind) => {
    request.mockImplementation(() => fail(kind));
    const { usePostActions } = loadCalendar();
    const view = renderHook(() => usePostActions());
    await act(
      async () => await view.result.current.deletePost({ group: 'g1' })()
    );
    expect(toast).toHaveBeenCalledWith(
      words.post_delete_failed_retry,
      'warning'
    );
    expect(context.reloadCalendarView).not.toHaveBeenCalled();
  }
);
test('calendar delete success uses group target; USER and no-group never write', async () => {
  request.mockResolvedValue(new Response('{}'));
  const { usePostActions } = loadCalendar();
  let view = renderHook(() => usePostActions());
  await act(
    async () =>
      await view.result.current.deletePost({ id: 'row', group: 'group/1' })()
  );
  expect(request.mock.calls[0][0]).toBe('/posts/group%2F1');
  expect(toast).toHaveBeenCalledWith(
    words.post_deleted_successfully,
    'success'
  );
  expect(context.reloadCalendarView).toHaveBeenCalledTimes(1);
  request.mockClear();
  await act(
    async () => await view.result.current.deletePost({ id: 'old-row' })()
  );
  expect(request).not.toHaveBeenCalled();
  role = 'USER';
  view = renderHook(() => usePostActions());
  await act(async () => await view.result.current.deletePost({ group: 'g' })());
  await act(async () => await view.result.current.editPost({ group: 'g' })());
  expect(request).not.toHaveBeenCalled();
});
test('calendar read failure has localized retry distinct from empty', () => {
  context.readError = true;
  const { Calendar } = loadCalendar();
  render(h(Calendar));
  expect(screen.getByRole('alert').textContent).toBe(
    words.calendar_read_failed_retry
  );
  fireEvent.click(screen.getByRole('button', { name: words.try_again }));
  expect(context.reloadCalendarView).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain(words.no_posts);
});
const row = {
  id: 'post1',
  group: 'group1',
  content: 'Post text',
  publishDate: '2030-10-11T12:00:00Z',
  state: 'DRAFT',
  integration: { id: 'itg1', name: 'Channel' },
  tags: [],
};
const mountRow = () => {
  context = { ...context, display: 'list', listPosts: [row], integrations: [] };
  render(h(loadCalendar().ListView));
};
test.each(['USER', 'EDITOR'])(
  '%s calendar card retains preview and gates every write control',
  async (ownRole) => {
    role = ownRole;
    mountRow();
    expect(
      screen.getByRole('button', { name: words.preview_post })
    ).toBeDefined();
    if (role === 'USER') {
      expect(
        screen.queryByRole('button', { name: words.duplicate_post })
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: words.delete_post })
      ).toBeNull();
      expect(dragOptions.canDrag).toBe(false);
      fireEvent.click(screen.getByText('Post text'));
      await screen.findByRole('dialog');
    } else {
      expect(
        screen.getByRole('button', { name: words.duplicate_post })
      ).toBeDefined();
      expect(
        screen.getByRole('button', { name: words.delete_post })
      ).toBeDefined();
      expect(dragOptions.canDrag).toBe(true);
    }
  }
);
test('no-group calendar row is previewable without invented server actions', () => {
  context = {
    ...context,
    display: 'list',
    listPosts: [{ ...row, group: null }],
  };
  render(h(loadCalendar().ListView));
  expect(
    screen.getByRole('button', { name: words.preview_post })
  ).toBeDefined();
  expect(screen.queryByRole('button', { name: words.delete_post })).toBeNull();
  expect(
    screen.queryByRole('button', { name: words.duplicate_post })
  ).toBeNull();
  expect(dragOptions.canDrag).toBe(false);
});
const mediaMount = () =>
  render(
    h(loadMediaBox().MediaBox, {
      setMedia: () => {},
      closeModal: () => {},
      standalone: true,
    })
  );
test.each([403, 500, 'network', 'protocol'])(
  'media read %s has retry and cannot claim empty',
  async (kind) => {
    request.mockImplementation(() =>
      kind === 'protocol'
        ? Promise.resolve(new Response('not json'))
        : fail(kind)
    );
    mediaMount();
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe(
      words.media_read_failed_retry
    );
    expect(document.body.textContent).not.toContain(
      words.you_dont_have_any_media_yet
    );
    request.mockResolvedValue(
      new Response(JSON.stringify({ results: [], pages: 1 }))
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: words.try_again }))
    );
    await screen.findByText(words.you_dont_have_any_media_yet);
  }
);
test.each([403, 500, 'network', 200])(
  'media delete %s refreshes only on success',
  async (kind) => {
    request.mockImplementation((url, options) =>
      options?.method === 'DELETE'
        ? kind === 200
          ? Promise.resolve(new Response('{}'))
          : fail(kind)
        : Promise.resolve(
            new Response(JSON.stringify({ results: [MEDIA_ITEM], pages: 1 }))
          )
    );
    mediaMount();
    await screen.findByText('probe.png');
    await act(async () =>
      fireEvent.click(document.querySelector('svg.group-hover\\:block'))
    );
    const reads = request.mock.calls.filter(([, options]) => !options?.method);
    expect(reads).toHaveLength(kind === 200 ? 2 : 1);
    if (kind !== 200)
      expect(toast).toHaveBeenCalledWith(
        words.media_delete_failed_retry,
        'warning'
      );
  }
);
test.each([403, 500, 'network', 406, 200])(
  'channel delete %s clears extension credentials only on success',
  async (kind) => {
    request.mockImplementation(() =>
      kind === 200 ? Promise.resolve(new Response('{}')) : fail(kind)
    );
    let actions;
    const change = jest.fn();
    const { Menu } = loadChannelMenu();
    render(
      h(Menu, {
        id: INTEGRATION.id,
        onChange: change,
        canEnable: false,
        canDisable: true,
        canChangeProfilePicture: false,
        canChangeNickName: false,
        refreshChannel: () => () => {},
        renderActions: (_, own) => {
          actions = own;
          return null;
        },
      })
    );
    await act(async () => await actions.remove());
    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledTimes(
      kind === 200 ? 1 : 0
    );
    expect(change).toHaveBeenCalledTimes(kind === 200 ? 1 : 0);
    if (kind !== 200)
      expect(toast.mock.calls.some(([, tone]) => tone === 'success')).toBe(
        false
      );
  }
);
function providerFixture(display) {
  const module = loadWithMocks(
    'apps/frontend/src/components/launches/calendar.context.tsx',
    {
      '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
      'next/navigation': {
        useSearchParams: () => new URLSearchParams(`display=${display}`),
      },
      'react-use-cookie': {
        __esModule: true,
        default: () => ['week', () => {}],
      },
      swr: { __esModule: true, default: useLocalSWR },
    },
    process.env.CF_TEST_BASELINE
  );
  let state;
  function Capture() {
    state = module.useCalendar();
    return h(
      'div',
      { 'data-read-error': state.readError ? 'true' : 'false' },
      state.loading ? 'Loading' : 'Settled'
    );
  }
  render(h(module.CalendarWeekProvider, { integrations: [] }, h(Capture)));
  return () => state;
}
test.each(
  ['week', 'list'].flatMap((display) =>
    [403, 500, 'network', 'protocol', 'missing-posts'].map((kind) => [
      display,
      kind,
    ])
  )
)(
  'calendar %s read %s cannot become empty success and recovers',
  async (display, kind) => {
    request.mockImplementation((url) =>
      !url.startsWith('/posts')
        ? Promise.resolve(new Response('[]'))
        : kind === 'protocol'
        ? Promise.resolve(new Response('not-json'))
        : kind === 'missing-posts'
        ? Promise.resolve(new Response('{}'))
        : fail(kind)
    );
    const state = providerFixture(display);
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().readError).toBe(true);
    request.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ posts: [], total: 0, comments: [] }))
      )
    );
    await act(async () => state().reloadCalendarView());
    await waitFor(() => expect(state().readError).toBe(false));
    expect(display === 'list' ? state().listPosts : state().posts).toEqual([]);
  }
);
