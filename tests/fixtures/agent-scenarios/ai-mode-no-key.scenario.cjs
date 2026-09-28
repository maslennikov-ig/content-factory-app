'use strict';

/**
 * «Свой ключ» with no own key saved (review W3-20 F7): nothing switches —
 * the chat would be left without an AI to answer with — and the key card is
 * shown instead; saving a key there switches the mode.
 */
module.exports = {
  id: 'ai-mode-no-key',
  title: '«Свой ключ» без сохранённого ключа — не переключаем, показываем карточку ключа',
  role: 'ADMIN',
  covers: ['ai.mode'],
  world: { ai: { usageMode: 'included', apiKey: null } },
  turns: [
    { say: 'Переведи на свой ключ', model: [[['tool', 'ai_mode', { mode: 'workspace_key' }]]] },
    {
      approve: true,
      model: [[['text', 'Своего ключа ещё нет — введите его в карточке, и пространство перейдёт само.']]],
    },
  ],
  check: (run) => {
    const answer = run.turns[1];
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { mode: 'included', changed: false, shown: 'card' },
      card: { kind: 'secret', id: 'workspace-key' },
    });
    expect(answer.data.map((part) => part.data)).toEqual([
      { kind: 'secret', id: 'workspace-key', field: 'workspace-key' },
    ]);
    expect(run.requests.filter(([name]) => name === 'ai.settings')).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.ai.usageMode).toBe('included');
  },
};
