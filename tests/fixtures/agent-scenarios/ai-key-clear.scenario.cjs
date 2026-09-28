'use strict';

/**
 * Removing a saved key asks first (kcxz.20, spec §5.2 «clear a key»): the
 * card says what the settings screen says before it removes one; «Да» runs
 * the settings door's own step. A key that is not saved changes nothing.
 */
module.exports = {
  id: 'ai-key-clear',
  title: 'Удаление ключа ИИ и ключа Exa — карточка со словами экрана настроек; несохранённый ключ — отказ',
  role: 'ADMIN',
  covers: ['ai.key.clear', 'ai.search_key.clear'],
  world: {
    ai: {
      apiKey: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE33333333',
      ownSearchKeys: { exa: 'exa-fake-key-for-the-scenario' },
    },
  },
  turns: [
    { say: 'Удали наш ключ ИИ', model: [[['tool', 'ai_key_clear', {}]]] },
    { approve: true, model: [[['text', 'Ключ удалён. Пока не сохраните новый, ИИ работать не будет.']]] },
    { say: 'И ключ Exa', model: [[['tool', 'ai_search_key_clear', { engine: 'exa' }]]] },
    { approve: true, model: [[['text', 'Ключ Exa удалён, поиск вернулся на ключ системы.']]] },
    { say: 'И Tavily', model: [[['tool', 'ai_search_key_clear', { engine: 'tavily' }]]] },
    { approve: true, model: [[['text', 'Ключа Tavily и не было.']]] },
  ],
  check: (run) => {
    const [askKey, yesKey, askExa, yesExa, askTavily, yesTavily] = run.turns;
    expect(askKey.approvals[0].reason).toBe(
      'Удалить сохранённый ключ ИИ пространства: восстановить его нельзя, и пока не сохранят новый, ИИ в пространстве работать не будет'
    );
    expect(yesKey.outputs[0].output).toMatchObject({ ok: true, summary: { field: 'workspace', removed: true } });
    expect(askExa.approvals[0].reason).toBe(
      'Удалить сохранённый ключ Exa: восстановить его нельзя. Поиск через Exa вернётся на ключ системы, а если его нет — перестанет работать'
    );
    expect(yesExa.outputs[0].output).toMatchObject({ ok: true, summary: { field: 'exa', removed: true } });
    expect(askTavily.approvals[0].reason).toBe('Такого ключа не сохранено — ничего не изменится');
    expect(yesTavily.outputs[0].output).toMatchObject({ ok: false, code: 'AI_KEY_NOT_STORED' });
    expect(run.writes).toEqual([
      ['ai.key.cleared', 'workspace'],
      ['ai.key.cleared', 'exa'],
    ]);
    expect(run.world.ai.apiKey).toBeNull();
    expect(run.world.ai.ownSearchKeys).toEqual({});
    expect(run.secrets).toEqual({ sent: [], model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
  },
};
