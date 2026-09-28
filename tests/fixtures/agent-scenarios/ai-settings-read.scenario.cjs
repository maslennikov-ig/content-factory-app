'use strict';

/**
 * An administrator reads the AI settings and the spend per member from the
 * chat (kcxz.20): the settings door's own answer, with keys as flags only.
 * The workspace holds a saved AI key and an Exa key (obvious fakes that still
 * match the key shapes); neither reaches the model, the stream or storage.
 */
const SAVED_KEY = 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE00000000';
const SAVED_EXA = 'exa-fake-key-for-the-scenario';

module.exports = {
  id: 'ai-settings-read',
  title: 'Настройки ИИ и расход — флаги вместо ключей, движок по задачам, расход по участникам',
  role: 'ADMIN',
  covers: ['ai.settings', 'ai.usage'],
  world: { ai: { apiKey: SAVED_KEY, ownSearchKeys: { exa: SAVED_EXA } } },
  turns: [
    {
      say: 'Как у нас настроен ИИ и кто сколько потратил?',
      model: [
        [['tool', 'ai_settings', {}], ['tool', 'ai_usage', {}]],
        [['text', 'Работаем на своём ключе, ключ сохранён. Больше всех потратила Анна.']],
      ],
    },
  ],
  check: (run) => {
    // An administrator is offered the whole group.
    expect(run.firstCall.tools).toEqual(
      expect.arrayContaining(['ai_settings', 'ai_usage', 'ai_mode', 'ai_key_enter', 'ai_key_clear', 'ai_search_key_clear'])
    );
    const [settings, usage] = run.turns[0].outputs;
    expect(settings.output).toMatchObject({ ok: true, capability: 'ai.settings' });
    expect(settings.output.summary.untrustedData.value).toEqual(
      {
        mode: 'workspace_key',
        provider: 'openrouter',
        keys: { workspace: true, tavily: false, exa: true },
        textAi: 'openai/gpt-5-mini',
        imageAi: null,
        aiByRole: { agent: 'openai/gpt-5-mini' },
        // Exa has the workspace's own key, Tavily the system's.
        search: { enabled: true, byTask: { research: 'Exa', facts: 'Tavily', discovery: 'Tavily' } },
        systemKeysAvailable: true,
      }
    );
    expect(usage.output.summary.untrustedData.value).toEqual({
      members: [
        { member: 'Анна Петрова', operations: 90 },
        // Never an email (review W3-20 F6): «Участник N» for one without a name.
        { member: 'Участник 1', operations: 25 },
        { member: null, operations: 5 },
      ],
      byRole: [
        { role: 'agent', operations: 70 },
        { role: 'writer', operations: 50 },
      ],
      total: 120,
    });
    expect(run.reads.filter((name) => name.startsWith('AiProviderService'))).toEqual([
      'AiProviderService.getSettings',
      'AiProviderService.getSettings',
    ]);
    expect(run.writes).toEqual([]);
    // The keys are in the workspace's settings, and nowhere in the chat.
    expect(run.world.ai.apiKey).toBe(SAVED_KEY);
    expect(run.secrets).toEqual({ sent: [], model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
  },
};
