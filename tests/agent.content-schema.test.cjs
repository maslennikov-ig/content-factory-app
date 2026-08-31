const { zodResponseFormat } = require('openai/helpers/zod');
const { RunnableLambda } = require('@langchain/core/runnables');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

/**
 * The schema the generator asks the provider to fill has to be one the
 * provider accepts.
 *
 * Structured output validates the schema on the client, before a request is
 * made, and rejects an optional field that cannot also be null. `website` has
 * carried `.nullable().optional()` since upstream; `usedCitationIds` carried
 * only `.optional()`, so every generation that required no citations — which
 * is every generation in a space with nothing attached — ended in a schema
 * error instead of a post. No suite saw it: every existing agent test mocks
 * the prompt and the model, so the schema was built and never converted.
 *
 * `zodResponseFormat` is the same conversion the SDK performs on the way out,
 * so this runs offline and costs nothing.
 */

const captureSchema = (usedCitationIds = []) => {
  const seen = [];
  const chatModel = {
    withStructuredOutput(schema) {
      seen.push(schema);
      return RunnableLambda.from(async () => ({
        hook: 'хук',
        content: { content: 'тело', usedCitationIds },
      }));
    },
  };
  return { seen, chatModel };
};

const stateFor = (contentContext) => ({
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'тема' }],
  popularPosts: [],
  researchAvailable: false,
  hook: 'хук',
  ...(contentContext ? { contentContext } : {}),
});

describe('generator structured output', () => {
  test.each([
    ['without citations', undefined, []],
    [
      'with citations',
      { facts: [{ citationId: 'f1', statement: 'факт' }], evidence: [] },
      ['f1'],
    ],
  ])('the content schema converts %s', async (unused, contentContext, cited) => {
    const { seen, chatModel } = captureSchema(cited);
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(stateFor(contentContext));

    expect(seen).toHaveLength(1);
    expect(() => zodResponseFormat(seen[0], 'content')).not.toThrow();
  });

  test('the hook schema converts', async () => {
    const { seen, chatModel } = captureSchema();
    const { service } = loadAgentGraph({ chatModel });

    await service.generateHook(stateFor(undefined));

    expect(() => zodResponseFormat(seen[0], 'hook')).not.toThrow();
  });
});
