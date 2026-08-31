/**
 * Super-admin tools as the administrator experiences them.
 *
 * The contract catches three regressions that previously arrived together:
 * a fixed-width row overflowing the application shell, untranslated copy in
 * the Russian locale, and pointer-only `div` controls that silently ignored
 * keyboard users.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
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
const {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} = require('@testing-library/react');

const repositoryRoot = path.resolve(__dirname, '..');
const componentPath = path.join(
  repositoryRoot,
  'apps/frontend/src/components/layout/impersonate.tsx'
);
const messages = Object.fromEntries(
  ['en', 'ru'].map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(
        path.join(
          repositoryRoot,
          `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
        ),
        'utf8'
      )
    ),
  ])
);

let locale = 'en';
let lastSearchLoader;
const fetchRequest = jest.fn(async () => ({
  ok: true,
  json: async () => [],
  text: async () => '',
}));
const openModal = jest.fn();
const showToast = jest.fn();
const mutate = jest.fn();

const h = React.createElement;
const Input = ({
  label,
  fieldClassName,
  disableForm: _disableForm,
  removeError: _removeError,
  ...props
}) =>
  h(
    'label',
    { className: fieldClassName },
    label,
    h('input', { 'aria-label': label || props.placeholder, ...props })
  );
const Select = ({ label, children, ...props }) =>
  h('label', {}, label, h('select', props, children));
const Button = ({ loading, children, ...props }) =>
  h('button', { ...props, disabled: props.disabled || loading }, children);
const Textarea = ({ standalone: _standalone, layout: _layout, ...props }) =>
  h('textarea', props);

const useSWR = (_key, loader) => {
  lastSearchLoader = loader;
  return { data: [], error: undefined, isLoading: false };
};

const mocks = {
  '@contentfactory/react/form/input': { Input },
  '@contentfactory/react/form/select': { Select },
  '@contentfactory/react/form/button': { Button },
  '@contentfactory/react/form/textarea': { Textarea },
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => fetchRequest,
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({
      id: 'admin-user',
      admin: true,
      impersonate: false,
      tier: { current: 'PRO', team_members: false },
    }),
  },
  '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
    pricing: { PRO: {}, TEAM: {} },
  },
  '@contentfactory/react/helpers/delete.dialog': {
    deleteDialog: jest.fn(async () => true),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({
      isSecured: true,
      billingEnabled: false,
      language: locale,
    }),
  },
  '@contentfactory/frontend/components/layout/layout.context': {
    setCookie: jest.fn(),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => {
      const currentLocale = locale;
      return (key, fallback, params = {}) => {
        let value = messages[currentLocale][key] ?? fallback ?? key;
        for (const [name, replacement] of Object.entries(params)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      };
    },
  },
  '@contentfactory/frontend/components/layout/new-modal': {
    useModals: () => ({ openModal }),
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({ show: showToast }),
  },
  '@contentfactory/frontend/components/launches/import-debug-post.modal': {
    ImportDebugPostModal: () => null,
  },
  '@hookform/resolvers/class-validator': {
    classValidatorResolver: () => async (values) => ({ values, errors: {} }),
  },
  '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto': {
    AdminAddTeamMemberDto: class AdminAddTeamMemberDto {},
  },
  'react-hook-form': {
    FormProvider: ({ children }) => children,
    useForm: () => ({
      handleSubmit: (submit) => submit,
      formState: { errors: {} },
    }),
  },
  swr: {
    __esModule: true,
    default: useSWR,
    useSWRConfig: () => ({ mutate }),
  },
};

const compiled = ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
  fileName: componentPath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const loaded = { exports: {} };
const localRequire = (request) =>
  Object.prototype.hasOwnProperty.call(mocks, request)
    ? mocks[request]
    : require(request);
new Function(
  'exports',
  'require',
  'module',
  '__filename',
  '__dirname',
  compiled
)(
  loaded.exports,
  localRequire,
  loaded,
  componentPath,
  path.dirname(componentPath)
);
const { Impersonate } = loaded.exports;

const copy = {
  en: {
    region: 'Super Admin',
    placeholder: 'Email or name',
    modalActions: ['Import Debug Post', 'Add Announcement'],
    links: [
      ['Accounts', '/admin/users'],
      ['View Errors', '/admin/errors'],
      ['View Stats', '/admin/stats'],
      ['Product Events', '/admin/product-events'],
    ],
  },
  ru: {
    region: 'Супер администратор',
    placeholder: 'Почта или имя',
    modalActions: [
      'Импортировать отладочную публикацию',
      'Добавить объявление',
    ],
    links: [
      ['Аккаунты', '/admin/users'],
      ['Просмотреть ошибки', '/admin/errors'],
      ['Просмотреть статистику', '/admin/stats'],
      ['Продуктовые события', '/admin/product-events'],
    ],
  },
};

afterEach(() => {
  cleanup();
  fetchRequest.mockReset();
  fetchRequest.mockResolvedValue({
    ok: true,
    json: async () => [],
    text: async () => '',
  });
  openModal.mockClear();
  showToast.mockClear();
  mutate.mockClear();
});

describe('super-admin toolbar', () => {
  test.each(['en', 'ru'])(
    'renders the %s toolbar as wrapping, localized controls',
    (language) => {
      locale = language;
      render(h(Impersonate));

      const expected = copy[language];
      const region = screen.getByRole('region', { name: expected.region });
      expect(region.className).toContain('min-w-0');
      expect(region.className).not.toContain('h-[52px]');
      expect(region.textContent).not.toContain('Write the user details');

      const row = region.firstElementChild;
      expect(row.className).toContain('flex-wrap');
      expect(row.className).not.toContain('w-[600px]');
      expect(screen.getByPlaceholderText(expected.placeholder)).toBeTruthy();

      for (const label of expected.modalActions) {
        expect(screen.getByRole('button', { name: label })).toBeTruthy();
      }
      for (const [label, href] of expected.links) {
        expect(
          screen.getByRole('link', { name: label }).getAttribute('href')
        ).toBe(href);
      }
    }
  );

  test('encodes a search value before sending it to the impersonation endpoint', async () => {
    locale = 'en';
    render(h(Impersonate));
    fireEvent.change(screen.getByPlaceholderText('Email or name'), {
      target: { value: 'Alice & team' },
    });

    await lastSearchLoader();

    expect(fetchRequest).toHaveBeenCalledWith(
      '/user/impersonate?name=Alice%20%26%20team'
    );
  });

  test('uses the newly selected language when an action opens a dialog', () => {
    locale = 'en';
    const view = render(h(Impersonate));

    locale = 'ru';
    view.rerender(h(Impersonate));
    fireEvent.click(
      screen.getByRole('button', { name: 'Добавить объявление' })
    );

    expect(openModal.mock.calls.at(-1)[0].title).toBe('Добавить объявление');
  });

  test('keeps an announcement dialog open and reports an HTTP failure', async () => {
    locale = 'ru';
    fetchRequest.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
      text: async () => 'failed',
    });
    render(h(Impersonate));
    fireEvent.click(
      screen.getByRole('button', { name: 'Добавить объявление' })
    );

    const modal = openModal.mock.calls.at(-1)[0];
    const close = jest.fn();
    cleanup();
    render(modal.children(close));
    for (const label of ['Информация', 'Предупреждение', 'Ошибка']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.change(screen.getByPlaceholderText('Заголовок объявления'), {
      target: { value: 'Работы' },
    });
    fireEvent.change(screen.getByPlaceholderText('Описание объявления'), {
      target: { value: 'Сервис будет недоступен десять минут' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать объявление' }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  test('keeps the consequential confirmations translated in English and Russian', () => {
    for (const key of [
      'refund_selected_confirm',
      'switch_user_confirm',
      'add_subscription_confirm',
    ]) {
      expect(messages.en[key]).toEqual(expect.any(String));
      expect(messages.ru[key]).toEqual(expect.any(String));
      expect(messages.ru[key]).not.toBe(messages.en[key]);
    }
  });
});
