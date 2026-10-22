'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator']) {
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
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

let response;
let calls;
const mocks = {
  swr: {
    __esModule: true,
    default: (key) => ({
      data:
        key === 'ai-models' ? { text: [], image: [], error: false } : response,
      mutate: async () => {},
    }),
  },
  '@contentfactory/helpers/utils/custom.fetch': {
    useFetch: () => async (url, init) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return { ok: true, json: async () => response };
    },
  },
  '@contentfactory/frontend/components/layout/user.context': {
    useUser: () => ({ id: 'u', isSuperAdmin: true }),
  },
  '@contentfactory/react/helpers/variable.context': {
    useVariables: () => ({ language: 'ru', isSecured: true }),
  },
  '@contentfactory/react/translation/get.transation.service.client': {
    useT: () => (key, fallback) => fallback ?? key,
  },
  '@contentfactory/react/toaster/toaster': {
    useToaster: () => ({ show: () => {} }),
  },
  '@contentfactory/react/helpers/delete.dialog': {
    deleteDialog: async () => false,
  },
  '../translation/translated-label': {
    TranslatedLabel: ({ label, children }) =>
      React.createElement(React.Fragment, null, label, children),
  },
  'react-hook-form': {
    useFormContext: () => null,
    useForm: () => ({ handleSubmit: () => () => {} }),
    FormProvider: ({ children }) => children,
  },
};
const { default: AiProviderComponent, buildAiSettingsPayload } = loadWithMocks(
  'apps/frontend/src/components/settings/ai-provider.component.tsx',
  mocks
);
const { AdminAiDefaultsComponent, buildAiDefaultsPayload } = loadWithMocks(
  'apps/frontend/src/components/admin/admin-ai-defaults.component.tsx',
  mocks
);

const routing = {
  enabled: true,
  advancedModel: 'provider/strong-custom',
  advancedFlex: true,
};
const form = () => ({
  usageMode: 'workspace_key',
  provider: 'openrouter',
  apiKey: '',
  textModel: 'provider/primary',
  imageModel: '',
  roleModels: { adapt: ' provider/adapt-pin ', judge: 'provider/voice-pin' },
  modelRouting: { ...routing },
  searchEnabled: true,
  searchApiKeys: {},
  searchTopic: 'general',
  searchDepth: 'advanced',
});
const workspace = (overrides = {}) => ({
  ...form(),
  hasKey: true,
  workspaceProvider: 'openrouter',
  searchProvider: 'tavily',
  hasSearchKey: false,
  searchKeys: {},
  workspaceSearchKeys: {},
  workspaceKeyConfigured: true,
  includedAvailable: true,
  includedMonthlyOperations: null,
  includedUsedOperations: 0,
  includedRemainingOperations: null,
  includedUnlimited: true,
  includedRestrictionReason: null,
  usageByMember: [],
  usageByRole: [],
  textMaxRetries: 2,
  textChain: {
    fallbackModels: ['provider/backup-a', 'provider/backup-b'],
    maxRetries: 2,
    fallbackDisabled: false,
  },
  ...overrides,
});
const instance = () => ({
  ...workspace(),
  monthlyOperations: null,
  searchTaskProviders: {},
  fromEnvironment: {
    apiKey: false,
    provider: false,
    textModel: false,
    imageModel: false,
    monthlyOperations: false,
    searchKeys: {},
  },
  updatedAt: null,
  updatedByUserId: null,
});
const change = async (id, value) =>
  act(async () =>
    fireEvent.change(document.getElementById(id), { target: { value } })
  );
const blur = async (id) =>
  act(async () => fireEvent.blur(document.getElementById(id)));
const click = async (node) => act(async () => fireEvent.click(node));
const lastBody = () => calls.at(-1)?.body;

beforeEach(() => {
  calls = [];
  response = workspace();
});
afterEach(cleanup);

test('workspace payload retains routing, stage pins, ordered fallback, explicit empty and zero retries', () => {
  const result = buildAiSettingsPayload({
    ...form(),
    modelRouting: { ...routing, advancedModel: ' provider/strong-custom ' },
    textFallbackModels: [' provider/backup-b ', 'provider/backup-a'],
    textFallbackDisabled: false,
    textMaxRetries: '0',
  });
  expect(result).toMatchObject({
    modelRouting: routing,
    roleModels: { adapt: 'provider/adapt-pin', judge: 'provider/voice-pin' },
    textFallbackModels: ['provider/backup-b', 'provider/backup-a'],
    textFallbackDisabled: false,
    textMaxRetries: 0,
  });
  expect(result).not.toHaveProperty('apiKey');
  expect(
    buildAiSettingsPayload({ ...form(), textFallbackModels: [] })
      .textFallbackModels
  ).toEqual([]);
  const inherited = buildAiSettingsPayload(form());
  expect(inherited).not.toHaveProperty('textFallbackModels');
  expect(inherited).not.toHaveProperty('textFallbackDisabled');
  expect(inherited).not.toHaveProperty('textMaxRetries');
  const reset = buildAiSettingsPayload({
    ...form(),
    textFallbackModel: '',
    textFallbackDisabled: false,
  });
  expect(reset).toMatchObject({
    textFallbackModel: '',
    textFallbackDisabled: false,
  });
  expect(reset).not.toHaveProperty('textFallbackModels');
});

test('included payload never stores operator routing, stage pins or fallback as workspace overrides', () => {
  const result = buildAiSettingsPayload({
    ...form(),
    usageMode: 'included',
    textFallbackModels: [],
    textFallbackDisabled: true,
    textMaxRetries: 0,
  });
  for (const key of [
    'modelRouting',
    'roleModels',
    'textModel',
    'imageModel',
    'textFallbackModel',
    'textFallbackModels',
    'textFallbackDisabled',
    'textMaxRetries',
    'apiKey',
  ])
    expect(result).not.toHaveProperty(key);
});

test('four stages are visible, Auto follows routing, utility pins stay in the disclosure, and autosave excludes typed keys', async () => {
  render(React.createElement(AiProviderComponent));
  for (const label of [
    'Ассистент',
    'Суть материала',
    'Адаптация для канала',
    'Редакторская проверка',
  ])
    expect(screen.getByRole('combobox', { name: label })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Ассистент' }).placeholder).toBe(
    'Авто'
  );
  expect(screen.queryByRole('combobox', { name: 'ai_role_judge' })).toBeNull();
  await change('ai-api-key', 'sk-or-unsaved-test');
  await click(
    screen.getByRole('checkbox', { name: 'Выбирать модель автоматически' })
  );
  expect(lastBody()).toMatchObject({
    modelRouting: { ...routing, enabled: false },
    roleModels: { adapt: 'provider/adapt-pin', judge: 'provider/voice-pin' },
  });
  expect(lastBody()).not.toHaveProperty('apiKey');
  expect(lastBody()).not.toHaveProperty('textMaxRetries');
  expect(screen.getByRole('combobox', { name: 'Ассистент' }).placeholder).toBe(
    'provider/primary'
  );
  await change('ai-role-model-adapt', 'provider/new-adapt');
  await blur('ai-role-model-adapt');
  expect(lastBody().roleModels.adapt).toBe('provider/new-adapt');
  expect(lastBody()).not.toHaveProperty('apiKey');
});

test('reordering inherited fallback makes an explicit chain, removing all retains empty, reset restores inheritance', async () => {
  render(React.createElement(AiProviderComponent));
  expect(
    screen.getByText('Используется цепочка по умолчанию провайдера.')
  ).toBeTruthy();
  await click(screen.getByRole('button', { name: 'Выше: provider/backup-b' }));
  expect(lastBody().textFallbackModels).toEqual([
    'provider/backup-b',
    'provider/backup-a',
  ]);
  await click(
    screen.getByRole('button', { name: 'Убрать: provider/backup-b' })
  );
  await click(
    screen.getByRole('button', { name: 'Убрать: provider/backup-a' })
  );
  expect(lastBody().textFallbackModels).toEqual([]);
  expect(document.activeElement.id).toBe('ai-fallback-add');
  expect(
    screen.getByText(
      'Сохранена пустая цепочка: резервные модели не вызываются.'
    )
  ).toBeTruthy();
  await click(screen.getByRole('button', { name: 'Вернуть по умолчанию' }));
  expect(lastBody()).toMatchObject({
    textFallbackModel: '',
    textFallbackDisabled: false,
  });
  expect(lastBody()).not.toHaveProperty('textFallbackModels');
});

test('switching to system keys hides editable routing and sends only the selected mode', async () => {
  render(React.createElement(AiProviderComponent));
  await change('ai-usage-mode', 'included');
  expect(lastBody()).toEqual({ usageMode: 'included' });
  expect(
    screen.queryByRole('checkbox', { name: 'Выбирать модель автоматически' })
  ).toBeNull();
  expect(
    screen.queryByRole('combobox', { name: 'Усиленная модель' })
  ).toBeNull();
});

test('operator routing and stage edits preserve fallback settings and never autosave a typed key', async () => {
  response = instance();
  render(React.createElement(AdminAiDefaultsComponent));
  await change('admin-ai-api-key', 'sk-or-unsaved-test');
  await change('admin-ai-advanced-model', 'provider/new-strong');
  await blur('admin-ai-advanced-model');
  expect(lastBody()).toMatchObject({
    modelRouting: { ...routing, advancedModel: 'provider/new-strong' },
    roleModels: { adapt: 'provider/adapt-pin', judge: 'provider/voice-pin' },
  });
  expect(lastBody()).not.toHaveProperty('apiKey');
  expect(lastBody()).not.toHaveProperty('textFallbackModels');
  const payload = buildAiDefaultsPayload({
    ...form(),
    monthlyOperations: '',
    textFallbackModels: [],
    textFallbackDisabled: true,
    textMaxRetries: 0,
  });
  expect(payload).toMatchObject({
    modelRouting: routing,
    textFallbackModels: [],
    textFallbackDisabled: true,
    textMaxRetries: 0,
  });
});

test('own-key controls wait for the selected mode response before exposing operator values', async () => {
  response = workspace({
    usageMode: 'included',
    modelRouting: { ...routing, advancedModel: 'operator/strong' },
  });
  render(React.createElement(AiProviderComponent));
  await change('ai-usage-mode', 'workspace_key');
  expect(lastBody()).toEqual({ usageMode: 'workspace_key' });
  expect(
    screen.queryByRole('combobox', { name: 'Усиленная модель' })
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
});

test.each([true, false])(
  'provider switch clears model ids and retains enabled=%s before a new key is saved',
  async (enabled) => {
    response = workspace({ modelRouting: { ...routing, enabled } });
    render(React.createElement(AiProviderComponent));
    await change('ai-provider-name', 'openai');
    expect(
      screen.getByRole('combobox', { name: 'Усиленная модель' }).value
    ).toBe('');
    expect(
      screen.getByRole('checkbox', { name: 'Выбирать модель автоматически' })
        .checked
    ).toBe(enabled);
    expect(
      screen.getByRole('combobox', { name: 'Адаптация для канала' }).value
    ).toBe('');
    expect(
      screen.queryByRole('button', { name: 'Выше: provider/backup-b' })
    ).toBeNull();
    expect(calls).toEqual([]);
  }
);

test('an inherited default returned as an array stays omitted after profile edits and returning to the provider', async () => {
  response = workspace({
    textFallbackModels: ['provider/default-backup'],
    textFallbackDisabled: false,
    textChain: {
      inheritedDefault: true,
      configuredFallbackModels: ['provider/default-backup'],
      fallbackModels: ['provider/default-backup'],
      maxRetries: 2,
      fallbackDisabled: false,
    },
  });
  render(React.createElement(AiProviderComponent));
  expect(
    screen.getByText('Используется цепочка по умолчанию провайдера.')
  ).toBeTruthy();
  await change('ai-advanced-model', 'provider/new-strong');
  await blur('ai-advanced-model');
  expect(lastBody().modelRouting.advancedModel).toBe('provider/new-strong');
  expect(lastBody()).not.toHaveProperty('textFallbackModels');
  expect(lastBody()).not.toHaveProperty('textFallbackModel');
  await change('ai-provider-name', 'openai');
  await change('ai-provider-name', 'openrouter');
  expect(lastBody()).not.toHaveProperty('textFallbackModels');
  expect(lastBody()).not.toHaveProperty('textFallbackModel');
});
