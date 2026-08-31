const { RunnableLambda } = require('@langchain/core/runnables');
const { loadAgentGraph } = require('../scripts/evidence/voice-eval/product-graph.cjs');

/**
 * The length trim checks the wrong text.
 *
 * The author's `postLength` range is measured over whole posts
 * (`voice.service.ts`'s `deviationsFor` adds `postLength` from `sample.text`,
 * the corpus's real, whole posts; the evidence stand builds the same "whole"
 * for a generation as `[hook, content].join('\n\n')` — `generate.cjs`). The
 * product's own trim, `AgentGraphService#trimToAuthorLength`, instead measured
 * `content.content` alone and never the hook next to it, so a post could sit
 * comfortably under the ceiling by that measure while the thing actually
 * published — hook and content together — sat well above it, and the edit
 * never fired to say so.
 */

const trimChatModel = (contentText, onTrimInvoke) => ({
  withStructuredOutput() {
    return RunnableLambda.from(async () => ({
      hook: 'хук',
      content: { content: contentText, usedCitationIds: [] },
    }));
  },
  // The one-edit step calls `model.invoke(prompt)` directly, not through
  // `withStructuredOutput` — this is the trim call the check should or should
  // not fire.
  invoke: async (prompt) => {
    onTrimInvoke(prompt);
    // Rejected downstream (`NOT_SHORTER`): the point of this test is whether
    // the edit is attempted at all, not whether it is accepted.
    return { content: contentText };
  },
});

const stateFor = (hook, range) => ({
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'тема' }],
  popularPosts: [],
  researchAvailable: false,
  hook,
  resolvedBrandProfile: { effectiveVoice: { postLength: range } },
});

// median 500, high 500 -> ceiling = round(500 * 1.25) = 625.
const RANGE = { median: 500, low: 300, high: 500 };
const CONTENT = 'Слово за словом обычный текст без чисел и ссылок и с разными фразами. '
  .repeat(20)
  .slice(0, 600);
const HOOK = 'Короткий заголовок для поста в самом начале этого текста здесь. '
  .repeat(5)
  .slice(0, 100);

describe('the length trim measures the whole post, not the content field alone', () => {
  test('content alone sits under the ceiling, but content plus the hook does not — the edit must fire', async () => {
    const calls = [];
    const chatModel = trimChatModel(CONTENT, (prompt) => calls.push(prompt));
    const { service } = loadAgentGraph({ chatModel });

    // Content alone (600 chars) is under the 625 ceiling by itself: the old,
    // content-only check would never trigger here.
    expect(CONTENT.length).toBeLessThanOrEqual(625);
    // Hook + content (702 chars, joined the way the evidence stand joins
    // them) is over it.
    expect(HOOK.length + 2 + CONTENT.length).toBeGreaterThan(625);

    await service.generateContent(stateFor(HOOK, RANGE));

    expect(calls).toHaveLength(1);
  });

  /**
   * Аватар прячет число от модели и обязан оставить его проверке.
   *
   * До 26.08.2026 «убрать строку про длину» означало выбросить `postLength`, и
   * подрезка вместе с ней переставала существовать. Прогон
   * `owner-2026-08-26-a` показал цену: медиана 3450 знаков против 823 у
   * автора.
   */
  test('a length withheld from the prompt is still checked after the draft', async () => {
    const calls = [];
    const chatModel = trimChatModel(CONTENT, (prompt) => calls.push(prompt));
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(
      stateFor(HOOK, { ...RANGE, stated: false })
    );

    expect(calls).toHaveLength(1);
  });

  test('with no hook, the same content stays under the ceiling and the edit does not fire', async () => {
    const calls = [];
    const chatModel = trimChatModel(CONTENT, (prompt) => calls.push(prompt));
    const { service } = loadAgentGraph({ chatModel });

    await service.generateContent(stateFor('', RANGE));

    expect(calls).toHaveLength(0);
  });
});
