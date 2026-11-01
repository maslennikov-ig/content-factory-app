const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { TokenLimiterProcessor } = require('@mastra/core/processors');
const { ConductorPromptBudget } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/conductor.prompt-budget.ts'
);

const sourceGroup = (id, count, text) => [
  { role: 'assistant', content: Array.from({ length: count }, (_, i) => ({
    type: 'tool-call', toolCallId: `${id}-${i}`, toolName: 'piece_read', input: { sourceIndex: i },
  })) },
  ...Array.from({ length: count }, (_, i) => ({ role: 'tool', content: [{
    type: 'tool-result', toolCallId: `${id}-${i}`, toolName: 'piece_read',
    output: { type: 'text', value: `${id} source ${i}: ${text}` },
  }] })),
];

test('native model budget retains a large atomic evidence group without rewriting history', async () => {
  const prompt = [
    { role: 'system', content: 'Use the supplied evidence and preserve the author conditions.' },
    { role: 'user', content: [{ type: 'text', text: 'Compare all topics and write one coherent post.' }] },
    ...sourceGroup('read-evidence', 12, 'A source statement with a material condition. '.repeat(800)),
    ...sourceGroup('later-check', 1, 'One later check. '.repeat(500)),
  ];
  const before = JSON.stringify(prompt);
  const args = { prompt, model: { modelId: 'large-context', provider: 'test' }, state: {}, steps: [], stepNumber: 4 };
  const old = await new TokenLimiterProcessor({ limit: 48_000 }).processLLMRequest(args);
  expect(JSON.stringify(old?.prompt ?? prompt)).not.toContain('read-evidence source');
  const resolve = jest.fn(async ({ model }) => model.modelId === 'large-context' ? 200_000 : 8_000);
  const processor = new ConductorPromptBudget(48_000, resolve);
  const result = await processor.processLLMRequest(args);
  expect(JSON.stringify(result?.prompt ?? prompt)).toContain('read-evidence source 11');
  expect(JSON.stringify(prompt)).toBe(before);
  // Native fallback may have a smaller context. Do not reuse the previous model's budget.
  const fallback = await processor.processLLMRequest({ ...args, model: { ...args.model, modelId: 'small-context' } });
  expect(JSON.stringify(fallback?.prompt ?? prompt)).not.toContain('read-evidence source');
  expect(JSON.stringify(prompt)).toBe(before);
});

test.each([undefined, NaN, 0, -1, 'unavailable'])('unknown context %s retains the existing native fallback bound', async limit => {
  const args = { prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Long history. '.repeat(2_000) }] },
    { role: 'user', content: [{ type: 'text', text: 'Continue.' }] },
  ],
    model: { modelId: 'unknown', provider: 'test' }, state: {}, steps: [], stepNumber: 0 };
  const expected = await new TokenLimiterProcessor({ limit: 100 }).processLLMRequest(args);
  expect(await new ConductorPromptBudget(100, async () => {
    if (limit === 'unavailable') throw Error('Optional metadata unavailable');
    return limit;
  }).processLLMRequest(args)).toEqual(expected);
});
