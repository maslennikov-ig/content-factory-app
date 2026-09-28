'use strict';

/**
 * Back to «Свой ключ» when the operator runs on another provider (review
 * W3-20 F1). The workspace saved an OpenAI key; «Ключи системы» run on
 * OpenRouter, and there the settings answer the operator's provider. The
 * switch sends the mode alone, so the workspace's key stays filed under
 * OpenAI and never goes to OpenRouter. The approval line says nothing about
 * whether an own key is stored (F8).
 */
const OPENAI_KEY = 'sk-proj-FAKEfakeFAKEfake0000000000000000';

module.exports = {
  id: 'ai-mode-own-key-provider',
  title: '«Свой ключ» после «Ключей системы» — ключ остаётся у своего провайдера',
  role: 'ADMIN',
  covers: ['ai.mode'],
  world: {
    ai: {
      usageMode: 'included',
      provider: 'openai',
      operatorProvider: 'openrouter',
      apiKey: OPENAI_KEY,
      textModel: 'gpt-5-mini',
      roleModels: {},
    },
  },
  turns: [
    { say: 'Верни нас на свой ключ', model: [[['tool', 'ai_mode', { mode: 'workspace_key' }]]] },
    { approve: true, model: [[['text', 'Готово: работаем на своём ключе.']]] },
  ],
  check: (run) => {
    expect(run.turns[0].approvals[0].reason).toBe(
      'Перевести пространство на «Свой ключ»: ИИ будет работать на ключе пространства и за его счёт. Если своего ключа ещё нет, переключения не будет — покажем карточку для ключа, и сохранение ключа переключит само'
    );
    expect(run.turns[1].outputs[0].output).toMatchObject({
      ok: true,
      summary: { mode: 'workspace_key', changed: true },
    });
    // The mode alone: never the operator's provider.
    expect(run.requests.filter(([name]) => name === 'ai.settings')).toEqual([
      ['ai.settings', { usageMode: 'workspace_key' }],
    ]);
    expect(run.world.ai).toMatchObject({
      usageMode: 'workspace_key',
      provider: 'openai',
      apiKey: OPENAI_KEY,
      textModel: 'gpt-5-mini',
    });
  },
};
