const { RunnableLambda } = require('@langchain/core/runnables');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

/** Keep paid text, discard invented source bindings and report the gap. */

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

describe('generated citation bindings are advisory without another generation', () => {
  test.each([['ghost'], [], null, undefined, ['f1', 'ghost', 'f1']])('retains text for model citation metadata %j', async ids => {
    const chatModel = flakyCitationsChatModel([{ content: { content: 'тело', usedCitationIds: ids } }]);
    const { service } = loadAgentGraph({ chatModel });
    const result = await service.generateContent(stateWithContext());
    expect(result.content.content).toBe('тело');
    expect(result.content.usedCitationIds).toEqual(ids?.includes('f1') ? ['f1'] : []);
    expect(result.adaptationCoverage).toMatchObject({ status: 'partial', reviews: 0, repaired: false,
      missingRequirements: [expect.stringContaining('не связана с источниками')] });
    expect(chatModel.calls).toHaveLength(1);
  });

  test('valid citations are retained once without a warning', async () => {
    const chatModel = flakyCitationsChatModel([{ content: { content: 'тело', usedCitationIds: ['f1', 'f1'] } }]);
    const { service } = loadAgentGraph({ chatModel });
    const result = await service.generateContent(stateWithContext());
    expect(result.content.usedCitationIds).toEqual(['f1']);
    expect(result.adaptationCoverage).toBeUndefined();
    expect(chatModel.calls).toHaveLength(1);
  });

  test('source-free text does not acquire invented bindings or an unnecessary missing-source finding', async () => {
    const source = stateWithContext();source.contentContext = {facts: [], evidence: []};
    const chatModel = flakyCitationsChatModel([{ content: { content: 'тело', usedCitationIds: [] } }]);
    const { service } = loadAgentGraph({ chatModel });
    const result = await service.generateContent(source);
    expect(result.content.usedCitationIds).toEqual([]);
    expect(result.adaptationCoverage).toBeUndefined();
  });
});
