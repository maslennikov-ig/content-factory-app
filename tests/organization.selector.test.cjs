'use strict';

/**
 * `content-factory-next-fn33.36`: the workspace switcher is also the door to a
 * second workspace.
 *
 * Before this it hid itself whenever there was one workspace to choose from,
 * which is exactly the state everybody starts in — so the one control that
 * could have offered «create another» was invisible until another one already
 * existed. Two things are held here: the switcher is shown to anybody signed
 * in, and the form behind it asks the door that actually creates.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
// jsdom's `location` is neither replaceable nor writable, and it refuses to
// reload. The window the component sees is a stand-in that answers `location`
// with a recorder and passes everything else through.
const reload = jest.fn();
const fakeLocation = {
  reload,
  href: 'http://localhost/launches',
  assign: () => undefined,
  replace: () => undefined,
};
const windowProxy = new Proxy(dom.window, {
  get: (target, property) =>
    property === 'location' ? fakeLocation : Reflect.get(target, property),
});

for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? windowProxy : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');

const h = React.createElement;
const repositoryRoot = path.resolve(__dirname, '..');

let organizations = [];
const openedModals = [];
const requests = [];
const toasts = [];
let postOk = true;

const appFetch = jest.fn(async (url, options = {}) => {
  requests.push({
    url,
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : undefined,
  });
  return {
    ok: options.method === 'POST' ? postOk : true,
    status: 200,
    json: async () => ({ id: 'new-org', name: 'Second' }),
  };
});

const t = (_key, fallback) => fallback;

const MenuContext = React.createContext({ open: false, onOpenChange: () => {} });

const sharedMocks = {
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => appFetch },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => t,
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({
      show: (text, type) => toasts.push({ text, type }),
    }),
  },
  '@contentfactory/react/form/button': {
    Button: ({ loading, variant: _variant, density: _density, children, ...props }) =>
      h('button', { ...props, disabled: props.disabled || loading }, children),
  },
  '@contentfactory/react/form/input': {
    Input: ({ label, standalone: _standalone, removeError: _removeError, ...props }) =>
      h('input', { 'aria-label': label, ...props }),
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ id: 'person', orgId: 'org-1' }),
  },
  // The real menu is state plus roving focus; what this test needs from it is
  // the one behaviour the switcher depends on — the button toggles the list.
  '@contentfactory/react/choice/choice.menu': {
    Menu: ({ open, onOpenChange, children }) =>
      h(MenuContext.Provider, { value: { open, onOpenChange } }, children),
    MenuButton: ({ children, onClick, ...props }) => {
      const menu = React.useContext(MenuContext);
      return h(
        'button',
        {
          ...props,
          onClick: (event) => {
            menu.onOpenChange?.(!menu.open);
            onClick?.(event);
          },
        },
        children
      );
    },
    MenuList: ({ children, ...props }) => h('div', props, children),
    MenuOption: ({ selected: _selected, density: _density, children, ...props }) =>
      h('button', props, children),
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({
      openModal: (params) => openedModals.push(params),
      closeCurrent: () => undefined,
      closeAll: () => undefined,
    }),
  },
  swr: {
    __esModule: true,
    default: () => ({ isLoading: false, data: organizations }),
  },
};

const loadComponent = (relativePath, mocks) => {
  const file = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(
    loaded.exports,
    (request) =>
      Object.prototype.hasOwnProperty.call(mocks, request)
        ? mocks[request]
        : require(request),
    loaded,
    file,
    path.dirname(file)
  );
  return loaded.exports;
};

const { CreateOrganization } = loadComponent(
  'apps/frontend/src/components/layout/create.organization.tsx',
  sharedMocks
);
const { OrganizationSelector } = loadComponent(
  'apps/frontend/src/components/layout/organization.selector.tsx',
  {
    ...sharedMocks,
    '@contentfactory/frontend/components/layout/create.organization': {
      CreateOrganization,
    },
  }
);

beforeEach(() => {
  organizations = [{ id: 'org-1', name: 'First' }];
  openedModals.length = 0;
  requests.length = 0;
  toasts.length = 0;
  postOk = true;
  reload.mockClear();
});

afterEach(cleanup);

describe('the workspace switcher', () => {
  test('is shown to somebody who has exactly one workspace', () => {
    render(h(OrganizationSelector, {}));

    expect(screen.getByRole('button', { name: /Organization: First/ })).toBeTruthy();
  });

  test('offers creating a workspace next to the ones that exist', () => {
    render(h(OrganizationSelector, {}));

    fireEvent.click(screen.getByRole('button', { name: /Organization: First/ }));

    expect(screen.getByText('Create workspace')).toBeTruthy();
    // The workspace itself is in the list too — the name also sits on the
    // button that opened it, which is why this counts rather than fetches.
    expect(screen.getAllByText('First')).toHaveLength(2);
  });

  test('the creation form opens in a modal, not in the menu', () => {
    render(h(OrganizationSelector, {}));

    fireEvent.click(screen.getByRole('button', { name: /Organization: First/ }));
    fireEvent.click(screen.getByText('Create workspace'));

    expect(openedModals).toHaveLength(1);
    expect(openedModals[0].title).toBe('Create workspace');
  });
});

describe('the creation form', () => {
  test('asks the door that creates a workspace and reloads onto it', async () => {
    const close = jest.fn();
    render(h(CreateOrganization, { onClose: close }));

    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: '  Second  ' },
    });
    fireEvent.click(screen.getByText('Create workspace'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      url: '/user/organizations',
      method: 'POST',
      body: { name: 'Second' },
    });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(close).toHaveBeenCalled();
  });

  test('an empty name asks nothing', () => {
    render(h(CreateOrganization, {}));

    const submit = screen.getByText('Create workspace');
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);

    expect(requests).toHaveLength(0);
  });

  test('a refusal is said out loud and the page is not reloaded', async () => {
    postOk = false;
    render(h(CreateOrganization, {}));

    fireEvent.change(screen.getByLabelText('Workspace name'), {
      target: { value: 'Second' },
    });
    fireEvent.click(screen.getByText('Create workspace'));

    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].type).toBe('warning');
    expect(reload).not.toHaveBeenCalled();
  });
});
