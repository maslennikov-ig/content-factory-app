const { RunnableLambda } = require('@langchain/core/runnables');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

/**
 * A generation paid for by the space should not die on the first invalid
 * citation answer.
 *
 * `generateContent` validates `usedCitationIds` against the context it was
 * given, and used to throw `CONTENT_CONTEXT_CITATIONS_INVALID` straight past
 * the caller the moment the model named an id that was not in the allowed
 * set — no second attempt, unlike the schema-repair loop `runAssist` runs for
 * the same kind of model mistake (`assist.pipeline.ts`'s `attempt()`,
 * `MAX_ATTEMPTS = 2`). One bad structured-output answer then cost the whole
 * paid call with nothing to show for it.
 */

const flakyCitationsChatModel = (responses) => {
  const calls = [];
  return {
    calls,
    withStructuredOutput() {
      return RunnableLambda.from(async () => {
        const response = responses[Math.min(calls.length, responses.length - 1)];
        calls.push(response);
        return response;
      });
    },
  };
};

const stateWithContext = () => ({
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'тема' }],
  popularPosts: [],
  researchAvailable: false,
  hook: 'хук',
  contentContext: {
    facts: [{ citationId: 'f1', statement: 'факт' }],
    evidence: [],
  },
});

describe('citation validation retries once before failing the generation', () => {
  test('a model that names an invalid citation once, then a valid one, is retried and succeeds', async () => {
    const chatModel = flakyCitationsChatModel([
      { hook: 'хук', content: { content: 'тело', usedCitationIds: ['ghost'] } },
      { hook: 'хук', content: { content: 'тело', usedCitationIds: ['f1'] } },
    ]);
    const { service } = loadAgentGraph({ chatModel });

    const result = await service.generateContent(stateWithContext());

    expect(chatModel.calls).toHaveLength(2);
    expect(result.content.usedCitationIds).toEqual(['f1']);
  });

  test('a model that never recovers still fails after exactly one retry', async () => {
    const chatModel = flakyCitationsChatModel([
      { hook: 'хук', content: { content: 'тело', usedCitationIds: ['ghost'] } },
      { hook: 'хук', content: { content: 'тело', usedCitationIds: ['still-ghost'] } },
    ]);
    const { service } = loadAgentGraph({ chatModel });

    await expect(service.generateContent(stateWithContext())).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_CITATIONS_INVALID',
    });
    expect(chatModel.calls).toHaveLength(2);
  });
});
