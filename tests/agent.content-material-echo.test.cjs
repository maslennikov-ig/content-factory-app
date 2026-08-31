const { RunnableLambda } = require('@langchain/core/runnables');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

/**
 * With material attached, the content opens by retelling the hook.
 *
 * The evidence run found this at 4 of 8 generations with material against 0
 * of 8 without it (`.codex/stages/content-factory-next-pl1/evidence/README.md`,
 * "Два дефекта, которые вскрыл прогон"). `generateHook` and `generateContent`
 * both read the exact same rendered material block (`researchText(state)`,
 * fed to `generateHook` as `{text}` and to `generateContent` as
 * `{information}`), so the fact that made the strongest hook also reads like
 * the strongest opening line for the content, and the model states it twice.
 * "The Content should not contain the hook" bans a verbatim copy, not a
 * paraphrase of the same fact — the failure is not word-for-word repetition,
 * it is starting from the same claim.
 *
 * This is a prompt defect, not a code one: the fix is one more instruction at
 * the exact spot the content prompt is told to use the material, only when
 * there is material to restate.
 */

const capturePromptChatModel = (capture, usedCitationIds = []) => ({
  withStructuredOutput() {
    return RunnableLambda.from(async (promptValue) => {
      capture(String(promptValue));
      return { hook: 'хук', content: { content: 'тело', usedCitationIds } };
    });
  },
});

const stateFor = (contentContext) => ({
  orgId: 'org',
  language: 'en',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'topic' }],
  popularPosts: [],
  researchAvailable: false,
  hook: 'The hook',
  ...(contentContext ? { contentContext } : {}),
});

describe('the content prompt warns against restating the hook only when there is material to restate it from', () => {
  test('with facts or evidence attached, the prompt tells the model not to reopen with what the hook already said', async () => {
    const prompts = [];
    const { service } = loadAgentGraph({
      chatModel: capturePromptChatModel((prompt) => prompts.push(prompt), ['f1']),
    });

    await service.generateContent(
      stateFor({ facts: [{ citationId: 'f1', statement: 'fact' }], evidence: [] })
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatch(/hook may already (state|summarize)/i);
  });

  test('with nothing attached, the prompt says nothing about it — there is no material to echo', async () => {
    const prompts = [];
    const { service } = loadAgentGraph({
      chatModel: capturePromptChatModel((prompt) => prompts.push(prompt)),
    });

    await service.generateContent(stateFor(undefined));

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toMatch(/hook may already (state|summarize)/i);
  });
});
