'use strict';

/**
 * On «Ключи системы» the workspace's own keys sleep and the settings screen
 * shows no field for them (owner 18.09.2026, 97dq.6): the chat reads the
 * allowance, lists no own key, takes no search key and removes none (kcxz.20).
 */
module.exports = {
  id: 'ai-settings-system-keys',
  title: '«Ключи системы» — лимит виден, свои ключи спят: ни карточки ключа поиска, ни удаления',
  role: 'ADMIN',
  covers: ['ai.settings', 'ai.key.enter', 'ai.search_key.clear'],
  world: {
    ai: {
      usageMode: 'included',
      apiKey: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE00000000',
      ownSearchKeys: { tavily: 'tvly-dev-FAKEFAKEFAKEFAKE0000' },
    },
  },
  turns: [
    {
      say: 'Сколько у нас осталось и поставь ключ Tavily',
      model: [
        [['tool', 'ai_settings', {}], ['tool', 'ai_key_enter', { field: 'tavily' }]],
        [['text', 'Осталось 180 из 300. На ключах системы свой ключ поиска не нужен.']],
      ],
    },
    {
      say: 'Тогда удали ключ Tavily',
      model: [[['tool', 'ai_search_key_clear', { engine: 'tavily' }]]],
    },
    { approve: true, model: [[['text', 'На ключах системы свои ключи отсюда не удаляются.']]] },
  ],
  check: (run) => {
    const [read, enter] = run.turns[0].outputs;
    expect(read.output.summary.untrustedData.value).toEqual({
      mode: 'included',
      systemKeysAvailable: true,
      allowance: { unlimited: false, limit: 300, used: 120, remaining: 180, restriction: null },
      search: 'system-keys',
    });
    // No own key is named on the system keys, not even as a flag.
    expect(JSON.stringify(read.output.summary.untrustedData.value)).not.toMatch(/"keys"|tavily|exa|workspace/i);
    expect(enter.output).toMatchObject({ ok: false, code: 'AI_SEARCH_KEY_ON_SYSTEM_KEYS' });
    expect(run.turns[0].data.filter((part) => part.type === 'data-secret')).toEqual([]);
    expect(run.turns[1].approvals[0].reason).toBe(
      'На «Ключах системы» свои ключи спят и отсюда не удаляются — ничего не изменится'
    );
    expect(run.turns[2].outputs[0].output).toMatchObject({ ok: false, code: 'AI_KEYS_ON_SYSTEM_KEYS' });
    expect(run.writes).toEqual([]);
    expect(run.world.ai.ownSearchKeys).toEqual({ tavily: 'tvly-dev-FAKEFAKEFAKEFAKE0000' });
    expect(run.secrets).toEqual({ sent: [], model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
  },
};
