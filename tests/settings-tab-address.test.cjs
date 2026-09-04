'use strict';

/**
 * Экран настроек и адресная строка.
 *
 * Две беды из живого прогона 04.09.2026, обе про одно место — состояние вкладки
 * читалось из `?tab=` один раз и без разбора.
 *
 * `content-factory-next-fn33.42`: внутренняя ссылка «Сменить пароль» меняла
 * адрес, а панель оставалась прежней. Next перерисовывает этот компонент, а не
 * монтирует заново, поэтому начальное значение `useState` больше не читается —
 * любая ссылка вида `/settings?tab=…` внутри живого сеанса была мёртвой, хотя
 * тот же адрес обычной загрузкой открывался правильно.
 *
 * `content-factory-next-fn33.75`: незнакомое имя вкладки (`?tab=global` вместо
 * `global_settings`) бралось как есть — слева рельса без выделения, справа
 * пусто. Экран выглядел сломанным.
 *
 * Третье правило здесь же: выбор вкладки мышью адрес не меняет, поэтому
 * отсутствие `?tab=` не должно возвращать человека назад.
 */

const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/settings',
});
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
} = require('@testing-library/react');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request))
      return mocks[request];
    if (request.startsWith('.')) {
      for (const extension of ['.tsx', '.ts']) {
        const candidate = `${path.resolve(
          path.dirname(filename),
          request
        )}${extension}`;
        if (fs.existsSync(candidate)) {
          return loadTypeScriptModule(
            path.relative(repositoryRoot, candidate),
            mocks
          );
        }
      }
    }
    return require(request);
  };
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

const { formErrorsMock } = require('./helpers/form-errors-mock.cjs');

const h = React.createElement;
const Empty = () => null;
/** Панель, которую видно по имени: так проверяется, что открылось. */
const Panel = (name) => () => h('div', { 'data-panel': name }, name);

/** Адрес, который тест меняет между отрисовками. */
let search = new URLSearchParams('');

const settings = loadTypeScriptModule(
  'apps/frontend/src/components/layout/settings.component.tsx',
  {
    // Общий помощник отказов (`.ts`) этот загрузчик разрешить не умеет, а
    // после `content-factory-next-fn33.66` его тянет вкладка входа.
    '@contentfactory/frontend/components/auth/form.errors': formErrorsMock,
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ closeAll: jest.fn(), openModal: jest.fn() }),
    },
    'react-hook-form': {
      FormProvider: ({ children }) => children,
      useForm: () => ({
        watch: jest.fn(),
        setValue: jest.fn(),
        register: () => ({ name: 'fullname' }),
        formState: { errors: {} },
        handleSubmit: (submit) => submit,
      }),
    },
    '@contentfactory/frontend/components/media/media.component': {
      useOpenMediaBox: () => jest.fn(),
    },
    '@contentfactory/frontend/components/ui/avatar': { Avatar: Empty },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async () => ({ json: async () => ({}) }),
    },
    '@hookform/resolvers/class-validator': {
      classValidatorResolver: jest.fn(),
    },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {
      UserDetailDto: class {},
    },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    swr: { useSWRConfig: () => ({ mutate: jest.fn() }) },
    '@contentfactory/frontend/components/settings/teams.component': {
      TeamsComponent: Empty,
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ tier: { current: 'FREE' }, role: 'ADMIN' }),
    },
    '@contentfactory/frontend/components/layout/logout.component': {
      LogoutComponent: Empty,
    },
    'next/navigation': { useSearchParams: () => search },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ isGeneral: true, language: 'en' }),
    },
    '@contentfactory/frontend/components/public-api/public.component': {
      PublicComponent: Empty,
    },
    'next/link': {
      __esModule: true,
      default: ({ children, ...props }) => h('a', props, children),
    },
    '@contentfactory/frontend/components/webhooks/webhooks': {
      Webhooks: Empty,
    },
    '@contentfactory/frontend/components/sets/sets': { Sets: Empty },
    '@contentfactory/frontend/components/settings/signatures.component': {
      SignaturesComponent: Empty,
    },
    '@contentfactory/frontend/components/autopost/autopost': {
      Autopost: Empty,
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
    '@contentfactory/frontend/components/settings/global.settings': {
      GlobalSettings: Panel('global_settings'),
    },
    '@contentfactory/frontend/components/approved-apps/approved-apps.component':
      { ApprovedAppsComponent: Empty },
    '@contentfactory/frontend/components/settings/about-project.component': {
      AboutProjectComponent: Empty,
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, ...props }) => h('button', props, children),
    },
    '@contentfactory/react/form/button-link': {
      ButtonLink: ({ children, ...props }) => h('a', props, children),
    },
    '@contentfactory/react/form/input': {
      Input: ({ label, error: _error, ...props }) =>
        h('label', null, label, h('input', props)),
    },
    '@contentfactory/frontend/components/settings/sign-in-methods.component': {
      initialSettingsTab: (params) =>
        params.has('code') || params.has('identity_confirmation')
          ? 'sign_in_methods'
          : 'global_settings',
      SignInMethodsComponent: Panel('sign_in_methods'),
    },
    '@contentfactory/frontend/components/settings/settings-surface.component': {
      SettingsSurface: ({ tabs, value, onChange, children }) =>
        h(
          'div',
          { 'data-settings-tab': value },
          tabs.map((entry) =>
            h(
              'button',
              {
                key: entry.value,
                type: 'button',
                'data-tab-button': entry.value,
                'aria-pressed': entry.value === value,
                onClick: () => onChange(entry.value),
              },
              entry.label
            )
          ),
          children
        ),
    },
    '@contentfactory/frontend/components/ui/surface': {
      RestrictedState: Empty,
    },
    '@contentfactory/nestjs-libraries/user/organization.roles': {
      isOrganizationAdmin: () => true,
    },
  }
);

afterEach(() => {
  cleanup();
  search = new URLSearchParams('');
});

const openedTab = () =>
  document
    .querySelector('[data-settings-tab]')
    .getAttribute('data-settings-tab');

test('an internal ?tab= link switches the panel inside a live session', () => {
  search = new URLSearchParams('');
  const view = render(h(settings.SettingsPopup));
  expect(openedTab()).toBe('global_settings');

  // Exactly what «Сменить пароль» does: same mounted screen, new address.
  search = new URLSearchParams('?tab=sign_in_methods');
  view.rerender(h(settings.SettingsPopup));

  expect(openedTab()).toBe('sign_in_methods');
  expect(screen.getByText('sign_in_methods')).toBeTruthy();
});

test('an unknown tab name opens the first tab instead of an empty panel', () => {
  search = new URLSearchParams('?tab=global');
  render(h(settings.SettingsPopup));

  expect(openedTab()).toBe('profile');
  // The rail always has exactly one selected tab; before the fix it had none.
  expect(
    document.querySelectorAll('[data-tab-button][aria-pressed="true"]')
  ).toHaveLength(1);
  expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
});

test('the same is true for the other name the walkthrough tried', () => {
  search = new URLSearchParams('?tab=content-intelligence');
  render(h(settings.SettingsPopup));
  expect(openedTab()).toBe('profile');
});

test('picking a tab by hand is not undone by an address that names none', () => {
  search = new URLSearchParams('');
  const view = render(h(settings.SettingsPopup));

  fireEvent.click(document.querySelector('[data-tab-button="sets"]'));
  expect(openedTab()).toBe('sets');

  // A re-render for any other reason — the address still names no tab.
  view.rerender(h(settings.SettingsPopup));
  expect(openedTab()).toBe('sets');
});

test('the known list is exactly what the screen can draw', () => {
  const known = new Set(settings.SETTINGS_TABS);
  expect(settings.SETTINGS_TABS[0]).toBe('profile');
  for (const tab of ['teams', 'api']) {
    // Held back from a member, but answered for by name rather than silence.
    expect(known.has(tab)).toBe(true);
  }
  expect(settings.resolveSettingsTab(null)).toBe('profile');
  expect(settings.resolveSettingsTab('nonsense')).toBe('profile');
  expect(settings.resolveSettingsTab('sign_in_methods')).toBe(
    'sign_in_methods'
  );

  const source = fs.readFileSync(
    path.join(
      repositoryRoot,
      'apps/frontend/src/components/layout/settings.component.tsx'
    ),
    'utf8'
  );
  // Every `arr.push({ tab: 'x' ... })` name is in the list, and the list holds
  // no name the screen cannot draw.
  const drawn = [...source.matchAll(/tab: '([a-z_]+)'/g)].map(
    (match) => match[1]
  );
  expect(drawn.length).toBeGreaterThan(0);
  for (const tab of drawn) expect(known.has(tab)).toBe(true);
  for (const tab of known) expect(drawn).toContain(tab);
});
