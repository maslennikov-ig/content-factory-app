'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

let provider, fetchMock, configRead;
const load = () => loadWithMocks('libraries/nestjs-libraries/src/openai/ai.context-window.ts', {
  '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    requireActiveAiConfig: async org => configRead(org),
  },
});
const models = data => ({ ok: true, json: async () => ({ data }) });
beforeEach(() => {
  provider = 'openrouter';
  configRead = jest.fn(async () => ({ provider, apiKey: 'must-not-leave-process' }));
  fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => { jest.restoreAllMocks(); });

test('uses half of each exact public model context, for both small and large models', async () => {
  fetchMock.mockResolvedValue(models([{ id: 'v/small', context_length: 8192 }, { id: 'v/large', context_length: 1000001 }]));
  const { getModelPromptTokenLimit } = load();
  expect(await getModelPromptTokenLimit('workspace', 'v/small')).toBe(4096);
  expect(await getModelPromptTokenLimit('workspace', 'v/large')).toBe(500000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
  expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('must-not-leave-process');
  expect(configRead).toHaveBeenCalledWith('workspace');
});

test('unknown and invalid metadata abstain without guessing', async () => {
  fetchMock.mockResolvedValue(models([{ id: 'v/zero', context_length: 0 }, { id: 'v/nan', context_length: '131072' },
    { id: 'v/fraction', context_length: 3.5 }, { id: 'v/unsafe', context_length: Number.MAX_SAFE_INTEGER + 1 }]));
  const { getModelPromptTokenLimit } = load();
  for (const id of ['v/missing', 'v/zero', 'v/nan', 'v/fraction', 'v/unsafe']) {
    expect(await getModelPromptTokenLimit('workspace', id)).toBeUndefined();
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('reserves advertised maximum completion when it exceeds half the context', async () => {
  fetchMock.mockResolvedValue(models([
    { id: 'v/output-large', context_length: 100000, top_provider: { max_completion_tokens: 70000 } },
    { id: 'v/output-small', context_length: 100000, top_provider: { max_completion_tokens: 10000 } },
    { id: 'v/output-equal', context_length: 100000, top_provider: { max_completion_tokens: 100000 } },
    { id: 'v/output-invalid', context_length: 100000, top_provider: { max_completion_tokens: '70000' } },
  ]));
  const { getModelPromptTokenLimit } = load();
  expect(await getModelPromptTokenLimit('one', 'v/output-large')).toBe(30000);
  expect(await getModelPromptTokenLimit('one', 'v/output-small')).toBe(50000);
  expect(await getModelPromptTokenLimit('one', 'v/output-equal')).toBeUndefined();
  expect(await getModelPromptTokenLimit('one', 'v/output-invalid')).toBe(50000);
});

test('one in-flight public catalog request is shared among concurrent callers', async () => {
  let release, signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  fetchMock.mockImplementation(() => new Promise(resolve => { release = resolve; signalStarted(); }));
  const { getModelPromptTokenLimit } = load();
  const calls = Promise.all([getModelPromptTokenLimit('one', 'v/model'), getModelPromptTokenLimit('two', 'v/model')]);
  await started;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  release(models([{ id: 'v/model', context_length: 64000 }]));
  expect(await calls).toEqual([32000, 32000]);
});

test('catalog expiry refreshes, and temporary failures safely abstain then retry', async () => {
  let now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  fetchMock.mockResolvedValueOnce(models([{ id: 'v/model', context_length: 80000 }]))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(models([{ id: 'v/model', context_length: 100000 }]));
  const { getModelPromptTokenLimit } = load();
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBe(40000);
  now += 6 * 60 * 1000;
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBeUndefined();
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  now += 11 * 1000;
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBe(50000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test.each([{ ok: false }, { ok: true, json: async () => ({ data: null }) }])('catalog HTTP/shape failures abstain', async response => {
  fetchMock.mockResolvedValue(response);
  const { getModelPromptTokenLimit } = load();
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBeUndefined();
});

test('direct OpenAI does not read the OpenRouter catalog, even if already cached', async () => {
  fetchMock.mockResolvedValue(models([{ id: 'v/model', context_length: 80000 }]));
  const { getModelPromptTokenLimit } = load();
  expect(await getModelPromptTokenLimit('one', 'v/model')).toBe(40000);
  provider = 'openai';
  expect(await getModelPromptTokenLimit('two', 'v/model')).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('active configuration remains mandatory', async () => {
  configRead.mockRejectedValue(new Error('no active admission'));
  const { getModelPromptTokenLimit } = load();
  await expect(getModelPromptTokenLimit('one', 'v/model')).rejects.toThrow('no active admission');
  expect(fetchMock).not.toHaveBeenCalled();
});
