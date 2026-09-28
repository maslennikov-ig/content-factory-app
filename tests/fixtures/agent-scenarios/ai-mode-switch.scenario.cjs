'use strict';

/**
 * Switching whose keys the workspace runs on asks first (kcxz.20; the usage
 * mode switch is confirm-class, owner default 27.09): «Нет» changes nothing,
 * «Да» saves the mode through the settings door's own step, and nothing else
 * — the provider, the models and the keys stay (review W3-20 F1).
 */
module.exports = {
  id: 'ai-mode-switch',
  title: 'Переключение «Свой ключ» → «Ключи системы» — карточка, «Нет», потом «Да»',
  role: 'ADMIN',
  covers: ['ai.mode'],
  world: { ai: { apiKey: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE00000000' } },
  turns: [
    { say: 'Переведи нас на ключи системы', model: [[['tool', 'ai_mode', { mode: 'included' }]]] },
    { approve: false, model: [[['text', 'Хорошо, остаёмся на своём ключе.']]] },
    { say: 'Всё-таки переведи', model: [[['tool', 'ai_mode', { mode: 'included' }]]] },
    { approve: true, model: [[['text', 'Готово: работаем на ключах системы.']]] },
  ],
  check: (run) => {
    const line =
      'Перевести пространство на «Ключи системы»: ИИ и поиск будут работать на ключах системы в пределах месячного лимита (в этом месяце осталось 180 из 300). Ваши сохранённые ключи останутся, но спят, пока вы не вернёте «Свой ключ»';
    expect(run.turns[0].approvals[0].reason).toBe(line);
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.turns[2].approvals[0].reason).toBe(line);
    expect(run.turns[3].outputs[0].output).toMatchObject({
      ok: true,
      summary: { mode: 'included', changed: true },
    });
    // The door's body: the mode, nothing else.
    expect(run.requests.filter(([name]) => name === 'ai.settings')).toEqual([
      ['ai.settings', { usageMode: 'included' }],
    ]);
    expect(run.writes).toEqual([['ai.settings', 'included']]);
    expect(run.world.ai.usageMode).toBe('included');
    expect(run.world.ai.apiKey).toBe('sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE00000000');
    expect(run.secrets.model).toEqual([]);
    expect(run.secrets.stored).toEqual([]);
  },
};
