'use strict';

/**
 * Keys pasted where the detector used to miss them, or where the text does
 * not come from the message field (review W3-20 F4, F5): an Exa key (a UUID
 * with the word «exa» beside it), a key glued to a word, a key in an attached
 * text file, in a question card's answer and in a decline reason. The door
 * takes each out before the model, the memory, the stream, the history, the
 * services and the log; `pastedKeys` makes the guard look for the exact
 * values, not only for their shapes.
 */
const EXA = '5f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const GLUED = 'sk-or-v1-FAKEglued0000FAKEglued0000FAKE';
const IN_FILE = 'tvly-dev-FAKEinfile00000000';
const IN_ANSWER = 'gsk_FAKEanswer0000FAKEanswer0000';
const IN_REASON = 'xai-FAKEreason0000FAKEreason0000';
const A1 = 'a1a1a1a1-0000-4000-8000-0000000000a1';

module.exports = {
  id: 'ai-key-pasted-elsewhere',
  title: 'Ключ Exa, приклеенный ключ, ключ в файле, в ответе на вопрос и в причине отказа — до ИИ доходит [KEY]',
  role: 'ADMIN',
  covers: ['ai.key.enter', 'avatar.activate', 'ai.mode'],
  pastedKeys: [EXA, GLUED, IN_FILE, IN_ANSWER, IN_REASON],
  world: {
    avatars: [{ id: A1, name: 'Черновик голоса', isDefault: true, analysed: true, kind: 'PERSON', active: false }],
  },
  turns: [
    {
      say: `вот ключ exa: ${EXA}`,
      model: [
        [['tool', 'ai_key_enter', { field: 'exa' }]],
        [['text', 'Ключ из сообщения убрали. Карточка для Exa ниже.']],
      ],
    },
    { say: `KEY_${GLUED} — поставь`, model: [[['text', 'Ключ убрали; введите его в карточке.']]] },
    {
      say: 'Посмотри файл',
      files: [{ name: 'notes.txt', text: `Заметки.\nключ поиска: ${IN_FILE}\nконец` }],
      model: [[['text', 'В файле был ключ — мы его убрали.']]],
    },
    { say: 'Включи аватар', model: [[['tool', 'avatar_activate', { avatarId: A1, mode: 'assist' }]]] },
    {
      resume: { consentGiven: true, avatarName: `Игорь ${IN_ANSWER}` },
      model: [[['text', 'Аватар включён.']]],
    },
    { say: 'Переведи на ключи системы', model: [[['tool', 'ai_mode', { mode: 'included' }]]] },
    {
      approve: false,
      reason: `не надо, вот мой ключ ${IN_REASON}`,
      model: [[['text', 'Хорошо, остаёмся на своём ключе.']]],
    },
  ],
  check: (run) => {
    expect(run.prompts[0].user).toBe('вот ключ exa: [KEY]');
    expect(run.prompts.find((prompt) => prompt.turn === 1).user).toBe('KEY_[KEY] — поставь');
    expect(run.storedKeyMarker).toBe(true);
    // The answer and the reason reached what they were for, the keys did not.
    expect(run.world.avatars[0]).toMatchObject({ active: true, name: 'Игорь [KEY]' });
    expect(run.world.ai.usageMode).toBe('workspace_key');
    expect(run.writes).toEqual([['avatar.activated', A1, 'assist']]);
  },
};
