/**
 * The team screen: issuing an invitation, and changing somebody's role.
 *
 * Two decisions of 04.09.2026 live here.
 *
 * `content-factory-next-fn33.24`: the link an invitation produces is shown on
 * screen, always. Before this the checkbox rebuilt the form — with it, the
 * address field and a letter; without it, no address field at all and a link
 * that went silently to the clipboard as the modal closed. An administrator
 * who wanted to send the invitation through Telegram had one shot at a paste
 * and no way back to the link.
 *
 * `content-factory-next-fn33.17`: a member's role can be corrected in place.
 * The dropdown appears only where the change is allowed — never on your own
 * row, never on a row at or above your level — because a control that offers
 * what the server refuses is a worse answer than no control.
 */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/settings',
});

for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in global) continue;
  Object.defineProperty(global, key, {
    configurable: true,
    get: () => dom.window[key],
  });
}
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const ts = require('typescript');
const { useFormContext } = require('react-hook-form');
const {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');

const h = React.createElement;
const repositoryRoot = path.resolve(__dirname, '..');
const screenFile = path.join(
  repositoryRoot,
  'apps/frontend/src/components/settings/teams.component.tsx'
);

let team = [];
const copied = [];
const toasts = [];
const closeAll = jest.fn();
let invitationResponse = {};
let putOk = true;
const requests = [];

const appFetch = jest.fn(async (url, options = {}) => {
  requests.push({
    url,
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : undefined,
  });
  if (options.method === 'POST') {
    return { ok: true, status: 200, json: async () => invitationResponse };
  }
  return {
    ok: putOk,
    status: putOk ? 200 : 400,
    json: async () => ({}),
  };
});

const mutate = jest.fn(async () => {});

/**
 * The shared controls, reduced to the DOM they produce. `Input` and the
 * form's `Select` keep their one real duty — registering with the form — or
 * nothing the administrator types would reach the request under test.
 */
const { formErrorsMock } = require('./helpers/form-errors-mock.cjs');

const mocks = {
  // The shared refusal helper is `.ts`, which this loader cannot compile.
  '@contentfactory/frontend/components/auth/form.errors': formErrorsMock,
  '@contentfactory/react/form/button': {
    Button: ({ loading, secondary: _secondary, density: _density, children, ...props }) =>
      h('button', { ...props, disabled: props.disabled || loading }, children),
  },
  '@contentfactory/react/form/input': {
    Input: ({ label, helper, name, ...props }) => {
      const form = useFormContext();
      return h(
        'label',
        {},
        label,
        helper ? h('span', {}, helper) : null,
        h('input', {
          'aria-label': label,
          ...props,
          ...(name && form ? form.register(name) : {}),
        })
      );
    },
  },
  '@contentfactory/react/form/select': {
    Select: ({ label, standalone, density: _density, children, name, ...props }) => {
      const form = useFormContext();
      return h(
        'select',
        {
          'aria-label': label || props['aria-label'],
          ...props,
          ...(name && !standalone && form ? form.register(name) : {}),
        },
        children
      );
    },
  },
  '@contentfactory/react/form/checkbox.field': {
    CheckboxField: ({ label, ...props }) =>
      h('label', {}, label, h('input', { type: 'checkbox', 'aria-label': label, ...props })),
  },
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => appFetch },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ id: 'boss', role: 'ADMIN' }),
  },
  '@contentfactory/frontend/components/ui/avatar': {
    Avatar: () => null,
  },
  '@contentfactory/react/helpers/display-name': {
    displayName: (user) => user.name || user.email,
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({ closeAll, openModal: jest.fn() }),
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({
      show: (text, type) => toasts.push({ text, type }),
    }),
  },
  '@contentfactory/react/helpers/delete.dialog': {
    deleteDialog: async () => true,
  },
  // The interface language, as i18next resolved it. The screen formats the
  // invitation's expiry with it, and Russian is the language the report that
  // opened `content-factory-next-fn33.35` was written on.
  '@contentfactory/react/translation/i18next': {
    __esModule: true,
    default: { language: 'ru' },
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (_key, fallback, params) =>
      params
        ? String(fallback).replace(/{{(\w+)}}/g, (_match, name) => params[name])
        : fallback,
  },
  'copy-to-clipboard': (value) => copied.push(value),
  '@hookform/resolvers/class-validator': {
    classValidatorResolver: () => async (values) => ({ values, errors: {} }),
  },
  '@contentfactory/nestjs-libraries/dtos/settings/add.team.member.dto': {
    AddTeamMemberDto: class AddTeamMemberDto {},
  },
  swr: {
    __esModule: true,
    default: () => ({ data: team, mutate }),
  },
};

const compiled = ts.transpileModule(fs.readFileSync(screenFile, 'utf8'), {
  fileName: screenFile,
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
  screenFile,
  path.dirname(screenFile)
);
const { AddMember, TeamsComponent } = loaded.exports;

const member = (id, role, email) => ({
  id: `${id}-membership`,
  role,
  user: { id, email, name: null },
});

beforeEach(() => {
  team = [];
  copied.length = 0;
  toasts.length = 0;
  requests.length = 0;
  putOk = true;
  closeAll.mockClear();
  mutate.mockClear();
  appFetch.mockClear();
  invitationResponse = {
    url: 'https://app.example/join-org?org=signed',
    expiresAt: new Date('2026-09-06T12:00:00.000Z').toISOString(),
    sentByEmail: false,
  };
});

afterEach(cleanup);

const emailField = () => screen.getByRole('textbox', { name: 'Email' });
const emailCheckbox = () =>
  screen.getByRole('checkbox', { name: 'Also send it by email' });

describe('issuing an invitation', () => {
  test('asks for an address that is optional, and says what it changes', () => {
    render(h(AddMember));

    expect(emailField()).toBeTruthy();
    expect(
      screen.getByText(
        'Optional. With an address the link works only for that person; without one, for anyone you send it to.'
      )
    ).toBeTruthy();
  });

  test('the letter cannot be ticked until there is somewhere to send it', async () => {
    render(h(AddMember));

    expect(emailCheckbox().disabled).toBe(true);
    expect(
      screen.getByText('Fill in the address to send a letter as well.')
    ).toBeTruthy();

    fireEvent.change(emailField(), {
      target: { value: 'guest@example.com' },
    });

    await waitFor(() => expect(emailCheckbox().disabled).toBe(false));
  });

  test('an invitation without an address ends on the link, not on a closed modal', async () => {
    render(h(AddMember));

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'EDITOR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    await waitFor(() =>
      expect(
        screen.getByText('https://app.example/join-org?org=signed')
      ).toBeTruthy()
    );

    expect(requests).toEqual([
      {
        url: '/settings/team',
        method: 'POST',
        body: { email: '', role: 'EDITOR', sendEmail: false },
      },
    ]);
    // The clipboard and its toast are kept — they were the one convenience of
    // the old flow — but they are no longer the only trace of the link.
    expect(copied).toEqual(['https://app.example/join-org?org=signed']);
    expect(toasts).toEqual([
      { text: 'Link copied to clipboard', type: undefined },
    ]);
    expect(closeAll).not.toHaveBeenCalled();
    expect(
      screen.getByText('The link is open: anyone you send it to can join.')
    ).toBeTruthy();
    /**
     * `content-factory-next-fn33.35`. This line used to read «It stops working
     * on 9&#x2F;6&#x2F;2026, 1:22:38 PM.» on a Russian screen: an American
     * order, a 12-hour clock, and the escaped slashes shown as text. The date
     * is now written the way the reading language writes one, and the
     * separators are characters.
     */
    const expiry = screen.getByText(/It stops working on/).textContent;
    expect(expiry).not.toContain('&#x2F;');
    expect(expiry).not.toContain('/');
    expect(expiry).toMatch(
      /^It stops working on \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}\.$/
    );
  });

  test('an address binds the link whether or not a letter goes with it', async () => {
    invitationResponse = {
      ...invitationResponse,
      boundEmail: 'guest@example.com',
      sentByEmail: true,
    };
    render(h(AddMember));

    fireEvent.change(emailField(), { target: { value: 'guest@example.com' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'USER' },
    });
    await waitFor(() => expect(emailCheckbox().disabled).toBe(false));
    fireEvent.click(emailCheckbox());
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));

    await waitFor(() =>
      expect(
        screen.getByText('The link works only for guest@example.com.')
      ).toBeTruthy()
    );

    expect(requests[0].body).toEqual({
      email: 'guest@example.com',
      role: 'USER',
      sendEmail: true,
    });
    expect(
      screen.getByText('A letter has gone to guest@example.com as well.')
    ).toBeTruthy();
    expect(
      screen.getByText('https://app.example/join-org?org=signed')
    ).toBeTruthy();
  });
});

describe('the role of somebody already in the workspace', () => {
  test('an administrator picks it from the row', async () => {
    team = [member('member-1', 'USER', 'member@example.com')];
    render(h(TeamsComponent));

    const control = screen.getByRole('combobox', { name: 'Role' });
    expect(
      [...control.options].map((option) => option.value)
    ).toEqual(['USER', 'EDITOR', 'ADMIN']);
    expect(control.value).toBe('USER');

    fireEvent.change(control, { target: { value: 'ADMIN' } });

    await waitFor(() => expect(requests.length).toBe(1));
    expect(requests[0]).toEqual({
      url: '/settings/team/member-1',
      method: 'PUT',
      body: { role: 'ADMIN' },
    });
    expect(mutate).toHaveBeenCalled();
    expect(toasts).toEqual([{ text: 'Role updated', type: undefined }]);
  });

  test('a refusal is said out loud and the list is re-read', async () => {
    putOk = false;
    team = [member('member-1', 'USER', 'member@example.com')];
    render(h(TeamsComponent));

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'ADMIN' },
    });

    await waitFor(() => expect(toasts.length).toBe(1));
    expect(toasts[0]).toEqual({
      text: 'The role could not be changed.',
      type: 'warning',
    });
    expect(mutate).toHaveBeenCalled();
  });

  /**
   * Your own row and the instance administrator's. Neither is a change the
   * server would accept, so neither gets a control that implies it would.
   */
  test('is plain text for yourself and for anyone above you', () => {
    team = [
      member('boss', 'ADMIN', 'boss@example.com'),
      member('founder', 'SUPERADMIN', 'founder@example.com'),
    ];
    render(h(TeamsComponent));

    expect(screen.queryAllByRole('combobox')).toEqual([]);
    expect(screen.getByText('Super Admin')).toBeTruthy();
    expect(screen.getAllByText('Admin').length).toBe(1);
    expect(screen.queryAllByRole('button', { name: /Remove/ })).toEqual([]);
  });

  /**
   * `content-factory-next-fn33.50`. Promotion to administrator used to be a
   * one-way door: the row lost both its dropdown and its Remove button the
   * moment it became an equal, and the administrator who had just promoted
   * somebody by mistake had nowhere to undo it.
   */
  test('an equal administrator keeps both controls', async () => {
    team = [
      member('boss', 'ADMIN', 'boss@example.com'),
      member('peer', 'ADMIN', 'peer@example.com'),
    ];
    render(h(TeamsComponent));

    const control = screen.getByRole('combobox', { name: 'Role' });
    expect(control.value).toBe('ADMIN');
    expect(screen.getAllByRole('button', { name: /Remove/ }).length).toBe(1);

    fireEvent.change(control, { target: { value: 'USER' } });
    await waitFor(() => expect(requests.length).toBe(1));
    expect(requests[0]).toEqual({
      url: '/settings/team/peer',
      method: 'PUT',
      body: { role: 'USER' },
    });
  });
});
