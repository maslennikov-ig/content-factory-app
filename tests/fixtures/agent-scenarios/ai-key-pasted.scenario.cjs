'use strict';

/**
 * A key pasted into the chat by mistake (kcxz.20, spec §1.5, §4.10). The
 * screen's composer refuses to send it; a client that sends it anyway meets
 * the door, which takes it out before the model, the history, the title, the
 * memory, the traces and the log — `[KEY]` stands in its place — and the
 * agent shows the key card instead. The scenario sends the key the way such a
 * client would (`secrets.sent`), so the guard is not blind.
 */
const KEY = 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE22222222';
const TAVILY = 'tvly-dev-FAKEFAKEFAKEFAKE2222';

module.exports = {
  id: 'ai-key-pasted',
  title: 'Ключ вставлен в сообщение — до ИИ и истории доходит [KEY], в ответ карточка ключа',
  role: 'ADMIN',
  covers: ['ai.key.enter'],
  pastedKeys: [KEY, TAVILY],
  turns: [
    {
      say: `Вот наш ключ: ${KEY} — поставь его`,
      model: [
        [['tool', 'ai_key_enter', { field: 'workspace' }]],
        [['text', 'Ключ из сообщения мы убрали и не сохранили. Введите его в карточке — он уйдёт прямо в настройки.']],
      ],
    },
    {
      say: `И для поиска Tavily: ${TAVILY}`,
      model: [
        [['tool', 'ai_key_enter', { field: 'tavily' }]],
        [['text', 'Этот ключ тоже убрали. Карточка для Tavily ниже.']],
      ],
    },
  ],
  check: (run) => {
    // The key left the client, and nothing after the door holds it.
    expect(run.secrets.sent).toEqual(['sk-key', 'tavily-key']);
    expect(run.secrets).toMatchObject({ model: [], stored: [], stream: [], history: [], requests: [], logs: [] });
    // What the model read of the person's messages.
    expect(run.prompts[0].user).toBe('Вот наш ключ: [KEY] — поставь его');
    expect(run.prompts.at(-1).user).toBe('И для поиска Tavily: [KEY]');
    expect(run.turns[0].data.map((part) => part.data)).toEqual([
      { kind: 'secret', id: 'workspace-key', field: 'workspace-key' },
    ]);
    expect(run.turns[1].data.map((part) => part.data)).toEqual([
      { kind: 'secret', id: 'search-key:tavily', field: 'search-key', engine: 'tavily' },
    ]);
    expect(run.writes).toEqual([]);
    expect(run.world.ai.apiKey).toBeNull();
  },
};
