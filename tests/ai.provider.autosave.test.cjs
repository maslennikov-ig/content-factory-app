'use strict';

/**
 * `content-factory-next-75xn.14`: что сохраняется само, а что — только рукой.
 *
 * Владелец 13.09.2026: «обязательно нажимать „Сохранить“ или есть
 * автосохранение?… я бы использовал автосохранение, и если человек очень
 * хочет, он может нажать и сохранить». Три из четырёх разделов вкладки
 * «Глобальные настройки» уже сохранялись сами; четвёртый был единственным с
 * кнопкой, и его же кнопка «убрать ключ» работала мимо неё.
 *
 * Исключение ровно одно и оно не косметическое. Ключ — это секрет, нажатие
 * клавиши не является решением его опубликовать, и поле, отправляющее `sk-`
 * по мере вставки, оставляет обрывок учётных данных в журнале каждого узла по
 * дороге. Поэтому здесь проверяется не «работает ли автосохранение», а обе
 * половины сразу: неключевое поле уходит само, ключевое не уходит никогда, и
 * запрос автосохранения не несёт ключа даже тогда, когда ключ уже набран в
 * соседнем поле.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

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

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
/**
 * The loader that honours mocks. `load-tsx.cjs` resolves every workspace
 * import to the real file, which is right for a rendering test and wrong here:
 * this suite has to own `useFetch`, or «the key never leaves» is a claim about
 * a request nobody watched.
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const fetchMock = jest.fn();
let settings;

const Passthrough = ({
  label,
  children,
  disableForm: _disableForm,
  hideErrors: _hideErrors,
  ...props
}) =>
  React.createElement(
    'label',
    null,
    label,
    React.createElement('select', props, children)
  );

const component = loadTypeScriptModule(
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
  {
    swr: {
      __esModule: true,
      default: () => ({ data: settings, mutate: async () => settings }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchMock },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    '@contentfactory/react/form/select': { Select: Passthrough },
    '@contentfactory/react/form/input': {
      Input: ({
        label,
        helper,
        action,
        secret: _secret,
        disableForm: _disableForm,
        ...props
      }) =>
        React.createElement(
          'label',
          null,
          label,
          React.createElement('input', props),
          action,
          helper
        ),
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, ...props }) =>
        React.createElement('button', props, children),
    },
    '@contentfactory/react/choice/control.button': {
      ControlButton: ({ children, density: _d, layout: _l, ...props }) =>
        React.createElement('button', props, children),
    },
    '@contentfactory/react/layout/hint': {
      Hint: ({ children }) => React.createElement('span', null, children),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) => fallback ?? key,
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'en' }),
    },
    '@contentfactory/react/helpers/delete.dialog': {
      deleteDialog: jest.fn(),
    },
    '@contentfactory/frontend/components/ui/icons': {
      CloseIconSmall: () => React.createElement('svg'),
    },
    '@contentfactory/frontend/components/settings/settings-section': {
      SettingsSection: ({ title, children }) =>
        React.createElement('section', null, title, children),
    },
    // Настоящий файл слов: строки раздела проверяются вместе с поведением.
    '@contentfactory/frontend/components/settings/ai-provider.copy':
      require('./helpers/load-tsx.cjs').loadTypeScriptModule(
        'apps/frontend/src/components/settings/ai-provider.copy.ts'
      ),
  }
);

const posts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === '/settings/ai' && init?.method === 'POST'
  );

const lastBody = () => JSON.parse(posts().at(-1)[1].body);

describe('автосохранение раздела ИИ', () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
    settings = {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      textModel: 'openai/gpt-5.6-luna',
      imageModel: 'openai/gpt-5-image',
      roleModels: {},
      hasKey: true,
      searchEnabled: false,
      searchProvider: 'tavily',
      searchTopic: 'general',
      searchDepth: 'basic',
      hasSearchKey: true,
      searchKeys: { tavily: true, exa: false, openrouter: false },
      workspaceSearchKeys: { tavily: true, exa: false, openrouter: false },
      searchTaskProviders: {},
      searchFallbackAvailable: true,
      workspaceKeyConfigured: true,
      includedAvailable: true,
      includedMonthlyOperations: 0,
      includedUsedOperations: 0,
      includedRemainingOperations: 0,
      includedRestrictionReason: 'quota_unavailable',
      usageByMember: [],
      usageByRole: [],
    };
  });

  afterEach(cleanup);

  const mount = async () => {
    /**
     * The render is wrapped rather than followed by `act`: React 18 commits a
     * concurrent root through its scheduler, so a bare `render()` here leaves
     * an empty container and the effect that copies the loaded settings into
     * the form has not run yet.
     */
    let view;
    await act(async () => {
      view = render(React.createElement(component.default));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return view;
  };

  test('неключевой выбор уходит на сервер сам, без нажатия «Сохранить»', async () => {
    const { container } = await mount();

    await act(async () => {
      fireEvent.change(container.querySelector('[name="searchEnabled"]'), {
        target: { value: 'enabled' },
      });
    });

    expect(posts()).toHaveLength(1);
    expect(lastBody()).toMatchObject({
      searchEnabled: true,
      usageMode: 'workspace_key',
    });
  });

  test('печать в поле ключа не отправляет ничего', async () => {
    const { container } = await mount();

    for (const name of ['apiKey', 'searchApiKey-tavily', 'searchApiKey-exa']) {
      const field = container.querySelector(`[name="${name}"]`);
      expect(field).not.toBeNull();
      await act(async () => {
        fireEvent.change(field, { target: { value: 'sk-secret-fragment' } });
        fireEvent.blur(field);
      });
    }

    expect(posts()).toHaveLength(0);
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(
      'sk-secret-fragment'
    );
  });

  test('автосохранение соседнего поля не уносит с собой набранный ключ', async () => {
    const { container } = await mount();

    await act(async () => {
      fireEvent.change(
        container.querySelector('[name="searchApiKey-exa"]'),
        { target: { value: 'exa-live-secret' } }
      );
    });

    await act(async () => {
      fireEvent.change(container.querySelector('[name="searchDepth"]'), {
        target: { value: 'advanced' },
      });
    });

    expect(posts()).toHaveLength(1);
    const body = lastBody();
    expect(body.searchDepth).toBe('advanced');
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('searchApiKeys');
    expect(JSON.stringify(body)).not.toContain('exa-live-secret');
  });

  test('кнопка «Сохранить» остаётся и она единственная отправляет ключ', async () => {
    const { container, getByText } = await mount();

    await act(async () => {
      fireEvent.change(
        container.querySelector('[name="searchApiKey-exa"]'),
        { target: { value: 'exa-live-secret' } }
      );
    });

    await act(async () => {
      fireEvent.click(getByText('Save'));
    });

    expect(posts()).toHaveLength(1);
    expect(lastBody().searchApiKeys).toEqual({ exa: 'exa-live-secret' });
  });

  test('поле модели сохраняется по уходу из него, а не по каждой букве', async () => {
    const { container } = await mount();
    const field = container.querySelector('[name="ai-role-model-draft"]');

    await act(async () => {
      fireEvent.change(field, { target: { value: 'openai/gpt-5' } });
    });
    expect(posts()).toHaveLength(0);

    await act(async () => {
      fireEvent.blur(field);
    });

    expect(posts()).toHaveLength(1);
    expect(lastBody().roleModels).toEqual({ draft: 'openai/gpt-5' });
  });
});
