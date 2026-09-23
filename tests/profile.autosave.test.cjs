'use strict';

/**
 * `content-factory-next-97dq.58`, walk D1: Settings → Профиль saves itself.
 *
 * Text goes 800 ms after the last change and at once on blur; the loaded
 * profile (`setValue`) saves nothing; «Сохранить» stays and answers next to
 * itself with «Сохранено · ЧЧ:ММ»; a refused save says so in place and offers
 * «Повторить»; an invalid form is not sent; the time zone still reaches
 * `localStorage` and `User.timezone`.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/settings?tab=profile',
});
for (const key of ['window', 'document', 'navigator', 'localStorage']) {
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
} = require('@testing-library/react');
const { useFormContext } = require('react-hook-form');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadTypeScriptModule: loadTsx } = require('./helpers/load-tsx.cjs');

const fetchMock = jest.fn();
const toast = { show: jest.fn() };
const closeAll = jest.fn();
let postStatus = 200;

const Empty = () => null;
const field = (tag) =>
  React.forwardRef(function Field(
    { label, error, layout: _l, standalone: _s, name, ...props },
    ref
  ) {
    const form = useFormContext();
    const bound = tag === 'textarea' && name ? form.register(name) : { name, ref };
    return React.createElement(
      'label',
      null,
      label,
      React.createElement(tag, { ...props, ...bound, 'aria-label': label }),
      error ? React.createElement('span', { role: 'note' }, error) : null
    );
  });

const { ProfileSettings } = loadTypeScriptModule(
  'apps/frontend/src/components/settings/profile.component.tsx',
  {
    swr: { __esModule: true, default: () => ({ data: undefined }) },
    'next/link': { __esModule: true, default: Empty },
    // The DTO is the server's; here a name «BAD» is the one invalid form.
    '@hookform/resolvers/class-validator': {
      classValidatorResolver: () => async (values) =>
        values.fullname === 'BAD'
          ? {
              values: {},
              errors: { fullname: { type: 'x', message: 'bad name' } },
            }
          : { values, errors: {} },
    },
    '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {
      UserDetailDto: class {},
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchMock },
    '@contentfactory/react/toaster/toaster': { useToaster: () => toast },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/form/button': {
      Button: React.forwardRef(function Button(
        { children, loading: _l, loadingLabel: _ll, variant: _v, density: _d, ...props },
        ref
      ) {
        return React.createElement('button', { ...props, ref }, children);
      }),
    },
    '@contentfactory/react/form/input': { Input: field('input') },
    '@contentfactory/react/form/textarea': { Textarea: field('textarea') },
    '@contentfactory/react/form/select': {
      Select: ({ label, disableForm: _d, hideErrors: _h, children, ...props }) =>
        React.createElement(
          'label',
          null,
          label,
          React.createElement('select', props, children)
        ),
    },
    '@contentfactory/react/helpers/display-name': { displayName: () => 'Анна' },
    '@contentfactory/react/helpers/localized.date': {
      formatLocalizedDate: () => '',
    },
    '@contentfactory/react/helpers/provider-label': { providerLabel: (p) => p },
    '@contentfactory/react/translation/i18n.config': { languages: ['ru', 'en'] },
    '@contentfactory/frontend/components/auth/form.errors': {
      useFieldErrorMessage: () => (_name, message) => message,
    },
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({ closeAll }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({ email: 'a@example.test', orgId: 'org-1' }),
    },
    '@contentfactory/frontend/components/media/media.component': {
      useOpenMediaBox: () => () => undefined,
    },
    '@contentfactory/frontend/components/ui/avatar': { Avatar: Empty },
    '@contentfactory/frontend/components/ui/surface': {
      Panel: ({ children }) => React.createElement('section', null, children),
    },
    '@contentfactory/frontend/components/ui/section-label': {
      SectionLabel: ({ children }) => React.createElement('h3', null, children),
    },
    '@contentfactory/frontend/components/layout/language.component': {
      useAccountLanguage: () => ({ current: 'ru', change: () => undefined }),
    },
    '@contentfactory/frontend/components/layout/language.presentation': {
      getLanguageLabel: (code) => code,
    },
    '@contentfactory/frontend/components/layout/set.timezone': {
      getTimezone: () => 'Europe/Moscow',
    },
    '@contentfactory/frontend/components/settings/teams.component': {
      useOrganizationRoleName: () => () => '',
    },
    '@contentfactory/frontend/components/settings/settings.copy': loadTsx(
      'apps/frontend/src/components/settings/settings.copy.ts'
    ),
    // Подпись поля с «?» (`97dq.62`) — настоящая: набор ищет поля по подписи.
    '@contentfactory/frontend/components/ui/field-label': loadTsx(
      'apps/frontend/src/components/ui/field-label.tsx'
    ),
  },
  {
    sources: {
      '@contentfactory/frontend/components/ui/use-autosave':
        'apps/frontend/src/components/ui/use-autosave.ts',
    },
  }
);

const posts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === '/user/personal' && init?.method === 'POST'
  );
const lastBody = () => JSON.parse(posts().at(-1)[1].body);
const status = (container) =>
  container.querySelector('[data-profile-autosave]');

const settle = async (ms = 0) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => undefined);
};

describe('Профиль сохраняется сам', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 23, 14, 5));
    postStatus = 200;
    toast.show.mockReset();
    closeAll.mockReset();
    localStorage.clear();
    fetchMock.mockReset().mockImplementation(async (url, init) => {
      if (init?.method === 'POST')
        return { ok: postStatus < 400, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({ name: 'Анна', lastName: '', bio: '', picture: null }),
      };
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  const mount = async () => {
    let view;
    await act(async () => {
      view = render(React.createElement(ProfileSettings));
    });
    await settle();
    return view;
  };
  const type = async (container, name, value) => {
    await act(async () => {
      fireEvent.change(container.querySelector(`[name="${name}"]`), {
        target: { value },
      });
    });
  };

  test('every profile field has a «?» with one line, beside its label (twelfth-wave canvas)', async () => {
    await mount();
    for (const name of ['name', 'фамилия', 'коротко о себе', 'язык интерфейса', 'часовой пояс']) {
      const hint = screen.getByRole('button', { name: `Подсказка: ${name}` });
      expect(hint.getAttribute('data-hint-trigger')).toBe('true');
      expect(hint.closest('label')).toBeNull();
    }
    // Поля по-прежнему названы своими подписями.
    expect(document.querySelector('#profile-timezone').name).toBe('profileTimezone');
    expect(
      document.querySelector('label[for="profile-bio"]').textContent
    ).toBe('Коротко о себе');
  });

  test('loading the profile saves nothing', async () => {
    const { container } = await mount();
    await settle(2000);
    expect(posts()).toHaveLength(0);
    expect(status(container).textContent).toBe('Изменения сохраняются сами');
  });

  test('text saves 800 ms after the last change, once', async () => {
    const { container } = await mount();
    await type(container, 'bio', 'Пишу');
    await settle(500);
    await type(container, 'bio', 'Пишу о визах');
    await settle(799);
    expect(posts()).toHaveLength(0);
    await settle(1);
    expect(posts()).toHaveLength(1);
    expect(lastBody()).toMatchObject({ bio: 'Пишу о визах', timezone: 180 });
    expect(status(container).textContent).toBe('Сохранено · 14:05');
    expect(localStorage.getItem('timezone')).toBe('Europe/Moscow');
    // Autosave neither toasts nor closes anything.
    expect(toast.show).not.toHaveBeenCalled();
    expect(closeAll).not.toHaveBeenCalled();
  });

  test('leaving the field saves at once', async () => {
    const { container } = await mount();
    await type(container, 'lastName', 'Петрова');
    await act(async () => {
      fireEvent.blur(container.querySelector('[name="lastName"]'));
    });
    await settle();
    expect(posts()).toHaveLength(1);
    expect(lastBody()).toMatchObject({ lastName: 'Петрова' });
    await settle(2000);
    expect(posts()).toHaveLength(1);
  });

  test('«Сохранить» answers next to itself', async () => {
    const { container } = await mount();
    await act(async () => {
      fireEvent.click(container.querySelector('button[type="submit"]'));
    });
    await settle();
    expect(posts()).toHaveLength(1);
    expect(status(container).textContent).toBe('Сохранено · 14:05');
    expect(status(container).getAttribute('role')).toBe('status');
  });

  test('a refused save says so in place and retries', async () => {
    const { container } = await mount();
    postStatus = 500;
    await type(container, 'bio', 'Текст');
    await settle(800);
    expect(status(container).textContent).toBe('Не сохранилось');
    expect(status(container).getAttribute('role')).toBe('alert');
    const retry = container.querySelector('[data-profile-autosave-retry]');
    expect(retry.textContent).toBe('Повторить');

    postStatus = 200;
    await act(async () => {
      fireEvent.click(retry);
    });
    await settle();
    expect(posts()).toHaveLength(2);
    expect(lastBody()).toMatchObject({ bio: 'Текст' });
    expect(status(container).textContent).toBe('Сохранено · 14:05');
    expect(container.querySelector('[data-profile-autosave-retry]')).toBeNull();
  });

  test('an invalid form is not sent', async () => {
    const { container } = await mount();
    await type(container, 'fullname', 'BAD');
    await settle(800);
    expect(posts()).toHaveLength(0);
    expect(status(container).textContent).toBe('Изменения сохраняются сами');
  });

  test('a new time zone saves at once and reaches this browser', async () => {
    const { container } = await mount();
    await act(async () => {
      fireEvent.change(container.querySelector('[name="profileTimezone"]'), {
        target: { value: 'Asia/Kolkata' },
      });
    });
    await settle();
    expect(posts()).toHaveLength(1);
    expect(lastBody()).toMatchObject({ timezone: 330 });
    expect(localStorage.getItem('timezone')).toBe('Asia/Kolkata');
  });
});
