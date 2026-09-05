const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
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
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

let settings;
const fetchMock = jest.fn();
const deleteDialogMock = jest.fn();
const translationCalls = [];
const translations = {
  ai_provider_description_org: 'Translated usage description',
  ai_usage_mode: 'Translated AI usage mode',
  ai_usage_included: 'Translated included mode',
  ai_usage_workspace_key: 'Translated workspace key mode',
  ai_usage_managed_unavailable: 'Translated managed unavailable',
  ai_usage_exhausted: 'Translated exhausted allowance',
  ai_usage_zero_quota: 'Translated zero quota',
  ai_usage_workspace_mode: 'Translated workspace mode',
};

const Field = ({ label, children, disableForm: _disableForm, ...props }) =>
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
      default: () => ({ data: settings, mutate: jest.fn() }),
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => fetchMock },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: jest.fn() }),
    },
    '@contentfactory/react/form/select': { Select: Field },
    '@contentfactory/react/form/input': {
      Input: ({
        label,
        disableForm: _disableForm,
        helper: _helper,
        action,
        // Mirrors the real Input: `secret` is a pasted credential, not a
        // password, so it becomes a plain text field the browser's password
        // manager has no reason to claim.
        secret,
        ...props
      }) =>
        React.createElement(
          'label',
          null,
          label,
          React.createElement('input', {
            ...props,
            ...(secret ? { type: 'text', autoComplete: 'off' } : {}),
          }),
          action
        ),
    },
    '@contentfactory/react/helpers/delete.dialog': {
      deleteDialog: deleteDialogMock,
    },
    '@contentfactory/frontend/components/ui/icons': {
      CloseIconSmall: () => React.createElement('svg'),
    },
    '@contentfactory/react/form/button': {
      Button: ({ children, secondary: _secondary, ...props }) =>
        React.createElement('button', props, children),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key, fallback) => {
        translationCalls.push(key);
        return translations[key] ?? fallback;
      },
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'en' }),
    },
  }
);

describe('AI provider search settings component', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    translationCalls.length = 0;
    settings = {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      textModel: 'openai/gpt-5.6-luna',
      imageModel: 'openai/gpt-5-image',
      hasKey: false,
      searchEnabled: true,
      searchProvider: 'tavily',
      searchTopic: 'general',
      searchDepth: 'basic',
      hasSearchKey: true,
      searchFallbackAvailable: true,
      workspaceKeyConfigured: false,
      includedAvailable: true,
      includedMonthlyOperations: 0,
      includedUsedOperations: 0,
      includedRemainingOperations: 0,
      includedRestrictionReason: 'quota_unavailable',
      // `content-factory-next-x63z`: the routing map and its breakdown are part
      // of the settings response now, and the screen reads both.
      roleModels: {},
      usageByRole: [],
    };
  });

  test('renders saved basic depth and preserves it in the save payload', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('Search depth');
    expect(markup).toContain('name="searchDepth"');
    expect(markup).toContain(
      '<option value="basic" selected="">Basic</option>'
    );
    expect(
      component.buildAiSettingsPayload({
        provider: settings.provider,
        usageMode: settings.usageMode,
        apiKey: '',
        textModel: settings.textModel,
        imageModel: settings.imageModel,
        roleModels: settings.roleModels,
        searchEnabled: settings.searchEnabled,
        searchApiKey: '',
        searchTopic: settings.searchTopic,
        searchDepth: settings.searchDepth,
      })
    ).toMatchObject({
      searchProvider: 'tavily',
      searchDepth: 'basic',
      usageMode: 'workspace_key',
    });
  });

  test('offers explicit included and workspace-key modes and explains zero quota', () => {
    settings = { ...settings, usageMode: 'included' };
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('Translated AI usage mode');
    expect(markup).toContain('value="included" selected=""');
    expect(markup).toContain('value="workspace_key"');
    expect(markup).toContain('Translated zero quota');
    expect(translationCalls).toEqual(
      expect.arrayContaining([
        'ai_provider_description_org',
        'ai_usage_mode',
        'ai_usage_included',
        'ai_usage_workspace_key',
        'ai_usage_zero_quota',
      ])
    );
  });

  test('included payload omits workspace secrets and model ids entirely', () => {
    const payload = component.buildAiSettingsPayload({
      usageMode: 'included',
      provider: 'openrouter',
      apiKey: 'workspace-secret',
      textModel: 'workspace-text',
      imageModel: 'workspace-image',
      searchEnabled: true,
      searchApiKey: 'workspace-search-secret',
      searchTopic: 'news',
      searchDepth: 'advanced',
    });

    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('searchApiKey');
    expect(payload).not.toHaveProperty('textModel');
    expect(payload).not.toHaveProperty('imageModel');
    expect(JSON.stringify(payload)).not.toContain('workspace-secret');
  });

  test('shows exhausted allowance separately from zero/unavailable allowance', () => {
    settings = {
      ...settings,
      usageMode: 'included',
      includedMonthlyOperations: 3,
      includedUsedOperations: 3,
      includedRemainingOperations: 0,
      includedRestrictionReason: 'quota_exhausted',
    };

    const markup = renderToStaticMarkup(React.createElement(component.default));
    expect(markup).toContain('Translated exhausted allowance');
    expect(markup).not.toContain('3 included AI operations are available');
  });

  test('renders fallback availability from the backend response', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain(
      'Automatic fallback is available through the OpenRouter AI key'
    );
  });

  test('disables saving until persisted settings have loaded', () => {
    settings = undefined;

    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('<button disabled="">Save</button>');
  });

  test('offers the clear control only for a key that is actually stored', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('aria-label="Remove stored search key"');
    expect(markup).not.toContain('aria-label="Remove stored key"');
  });

  test('the page action row carries saving alone', () => {
    const markup = renderToStaticMarkup(React.createElement(component.default));

    expect(markup).toContain('>Save</button>');
    expect(markup).not.toContain('>Remove stored key</button>');
    expect(markup).not.toContain('>Remove stored search key</button>');
  });
});

describe('removeStoredKey', () => {
  const request = jest.fn();
  const onRemoved = jest.fn();

  beforeEach(() => {
    request.mockReset().mockResolvedValue({ ok: true });
    onRemoved.mockReset().mockResolvedValue(undefined);
  });

  test('a declined confirmation reaches neither the network nor the cache', async () => {
    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/search-key',
      confirm: async () => false,
      request,
      onRemoved,
    });

    expect(outcome).toBe('declined');
    expect(request).not.toHaveBeenCalled();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  test('an approved confirmation deletes exactly the named key', async () => {
    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/search-key',
      confirm: async () => true,
      request,
      onRemoved,
    });

    expect(outcome).toBe('removed');
    expect(request).toHaveBeenCalledWith('/settings/ai/search-key', {
      method: 'DELETE',
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a rejected request', async () => ({ ok: false })],
    [
      'a request that throws',
      async () => {
        throw new Error('network down');
      },
    ],
  ])('%s never reports the key as removed', async (_name, behaviour) => {
    request.mockImplementation(behaviour);

    const outcome = await component.removeStoredKey({
      endpoint: '/settings/ai/key',
      confirm: async () => true,
      request,
      onRemoved,
    });

    expect(outcome).toBe('failed');
    expect(onRemoved).not.toHaveBeenCalled();
  });
});

test('only the provider locale key remains removed; depth keys stay live', () => {
  const localeRoot = path.resolve(
    __dirname,
    '..',
    'libraries/react-shared-libraries/src/translation/locales'
  );
  const localeFiles = fs
    .readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(localeRoot, entry.name, 'translation.json'));

  expect(localeFiles).toHaveLength(16);
  for (const localeFile of localeFiles) {
    const locale = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
    expect(locale).not.toHaveProperty('search_provider');
    expect(locale).toHaveProperty('search_depth');
    expect(locale).toHaveProperty('search_depth_basic');
    expect(locale).toHaveProperty('search_depth_advanced');
  }
});
