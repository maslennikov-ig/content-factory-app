'use strict';

const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { z } = require('zod');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

let routed;
let generated;
let output;
let inheritedSignal;
const entries = [
  { id: 'selected', model: { modelId: 'advanced-writer' }, maxRetries: 0 },
  { id: 'fallback', model: { modelId: 'backup-writer' }, maxRetries: 0 },
];
const retryPolicy = { maxRetries: 0, maxProcessorRetries: 12 };
const { createNativeStageChatModel } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.stage-model.ts',
  {
    '@mastra/core/agent': {
      Agent: class {
        constructor(config) { this.config = config; }
        async generate(messages, options) {
          generated.push({ config: this.config, messages, options });
          if (output instanceof Error) throw output;
          return output;
        }
      },
    },
    './ai.clients': {
      getRoutedMastraModelEntries: async (...args) => {
        routed.push(args);
        return { entries, primaryModel: 'advanced-writer', policy: { maxRetries: 2 } };
      },
    },
    './ai.native-retries': {
      createNativeTextRetryConfig: () => retryPolicy,
      nativeTextAbortSignal: (signal, requestSignal) => signal ?? requestSignal ?? inheritedSignal,
      setNativeTextMaxRetries: (context, maxRetries, models) => {
        context.set('retries', maxRetries);
        context.set('models', models);
      },
    },
  }
);

beforeEach(() => {
  routed = [];
  generated = [];
  output = { text: 'Готовая адаптация.' };
  inheritedSignal = undefined;
});

const stage = () => createNativeStageChatModel({
  organizationId: 'org-a', role: 'adapt', temperature: 0.3, maxTokens: 2048,
});

test('ordinary prompt piping writes with native-selected entries and the existing retry owner', async () => {
  const signal = new AbortController().signal;
  const result = await ChatPromptTemplate.fromMessages([
    ['system', 'Keep the facts.'], ['human', '{input}'],
  ]).pipe(stage()).invoke({ input: 'Авторский материал.' }, { signal });
  expect(result.content).toBe('Готовая адаптация.');
  expect(routed).toHaveLength(1);
  expect(routed[0].slice(0, 2)).toEqual(['org-a', 'adapt']);
  expect(routed[0][2]).toEqual([
    { role: 'system', content: 'Keep the facts.' },
    { role: 'user', content: 'Авторский материал.' },
  ]);
  expect(generated).toHaveLength(1);
  const call = generated[0];
  expect(call.messages).toEqual(routed[0][2]);
  expect(call.config.model).toBe(entries);
  expect(call.config.maxRetries).toBe(0);
  expect(call.config.maxProcessorRetries).toBe(12);
  expect(call.options).toMatchObject({
    abortSignal: signal, maxSteps: 1,
    modelSettings: { temperature: 0.3, maxOutputTokens: 2048, maxRetries: 0 },
  });
  expect(call.options.requestContext).toBe(routed[0][3].requestContext);
  expect(call.options.requestContext.get('retries')).toBe(2);
  expect(call.options.requestContext.get('models')).toEqual(['advanced-writer', 'backup-writer']);
});

test('structured prompt piping sends the original schema to native generation and returns its object', async () => {
  const schema = z.object({ content: z.string(), usedCitationIds: z.array(z.string()) });
  output = { text: 'provider text', object: { content: 'Текст.', usedCitationIds: ['fact-1'] } };
  const value = await ChatPromptTemplate.fromTemplate('Draft: {input}')
    .pipe(stage().withStructuredOutput(schema)).invoke({ input: 'Основа.' });
  expect(value).toEqual({ content: 'Текст.', usedCitationIds: ['fact-1'] });
  expect(routed).toHaveLength(1);
  expect(generated[0].messages).toEqual([{ role: 'user', content: 'Draft: Основа.' }]);
  expect(generated[0].options.structuredOutput.schema).toBe(schema);
  expect(generated[0].options.structuredOutput).not.toHaveProperty('model');
});

test('a malformed native structured result rejects without another routing or generation attempt', async () => {
  const parsed = z.object({ content: z.string() }).safeParse({ content: 4 });
  output = { text: '{}', error: parsed.error };
  await expect(stage().withStructuredOutput(z.object({ content: z.string() })).invoke('Draft'))
    .rejects.toMatchObject({ name: 'ZodError' });
  expect(routed).toHaveLength(1);
  expect(generated).toHaveLength(1);
});

test('native schema transforms are returned without applying the transform again', async () => {
  const schema = z.object({ content: z.string().transform(value => `${value}!`) });
  output = { text: '{"content":"Ready"}', object: { content: 'Ready!' } };
  await expect(stage().withStructuredOutput(schema).invoke('Draft')).resolves.toEqual({ content: 'Ready!' });
});

test('raw JSON mode configures each native model without consuming the existing parser or repair', async () => {
  const calls = [];
  for (const entry of entries) {
    entry.model.doGenerate = async (options) => calls.push(['generate', options]);
    entry.model.doStream = async (options) => calls.push(['stream', options]);
  }
  output = { text: '{broken' };
  const answer = await stage().invoke('Return JSON', { response_format: { type: 'json_object' } });
  expect(answer.content).toBe('{broken');
  expect(generated[0].options).not.toHaveProperty('structuredOutput');
  for (const entry of generated[0].config.model) {
    await entry.model.doGenerate({ prompt: [] });
    await entry.model.doStream({ prompt: [] });
  }
  expect(calls.map(([method, options]) => [method, options.responseFormat])).toEqual([
    ['generate', { type: 'json' }], ['stream', { type: 'json' }],
    ['generate', { type: 'json' }], ['stream', { type: 'json' }],
  ]);
});

test('native error output remains a failure and never becomes a successful empty message', async () => {
  const error = Object.assign(new Error('Provider rejected authorization.'), { status: 401 });
  output = { text: '', error };
  await expect(stage().invoke('Draft')).rejects.toBe(error);
  expect(generated).toHaveLength(1);
});

test('inherited cancellation stops before routing or model execution', async () => {
  inheritedSignal = AbortSignal.abort(new Error('Execution stopped.'));
  await expect(stage().invoke('Draft')).rejects.toThrow('Execution stopped.');
  expect(routed).toHaveLength(0);
  expect(generated).toHaveLength(0);
});

test('legacy request options cancellation is preserved', async () => {
  const signal = AbortSignal.abort(new Error('Caller stopped.'));
  await expect(stage().invoke('Draft', { options: { signal } })).rejects.toThrow('Caller stopped.');
  expect(routed).toHaveLength(0);
});

test('an unsupported raw schema fails explicitly instead of silently ignoring the contract', async () => {
  await expect(stage().invoke('Draft', {
    response_format: { type: 'json_schema', json_schema: { name: 'draft', schema: { type: 'object' } } },
  })).rejects.toThrow('Native stage schemas must use withStructuredOutput.');
  expect(routed).toHaveLength(0);
});

test('reusing a stage adapter resolves each new request once with an isolated native context', async () => {
  const model = stage();
  await model.invoke('First request');
  await model.invoke('Second request');
  expect(routed).toHaveLength(2);
  expect(routed.map(call => call[2][0].content)).toEqual(['First request', 'Second request']);
  expect(generated[0].options.requestContext).not.toBe(generated[1].options.requestContext);
});
