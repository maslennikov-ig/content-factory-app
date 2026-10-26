'use strict';

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { agentCopy, agentWordsFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const { agentProgressCopy } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.progress.copy.ts');

describe('assistant progress copy uses first person in every agent locale', () => {
  test('Russian progress and thinking copy use singular verbs', () => {
    const ru = agentCopy.ru;

    expect(ru.conversation.thinking).toBe('Думаю…');
    expect(ru.progress.kind).toBe('Работаю');
    expect(ru.progress.working).toBe('Работаю…');
    expect(ru.progress.stages).toMatchObject({
      started: 'Читаю…',
      brief: 'Собираю бриф…',
      claims: 'Разбираю утверждения…',
      search: 'Ищу недостающие факты…',
      writing: 'Пишу…',
      measuring: 'Считаю длину фраз, пунктуацию и повторы…',
      proposing: 'Составляю предложение голоса…',
      retrying: 'Связь мигнула — повторяю шаг…',
      fallback: 'Переключаюсь на резервный ИИ…',
    });
    expect(ru.progress.leaveNote).toBe('Можно уйти с экрана — я продолжу работу');
  });

  test('English progress and thinking copy use singular first person', () => {
    const en = agentCopy.en;

    expect(en.conversation.thinking).toBe("I'm thinking…");
    expect(en.progress.working).toBe("I'm working…");
    expect(en.progress.stages).toMatchObject({
      started: "I'm reading…",
      brief: "I'm filling in the brief…",
      claims: "I'm reviewing the claims…",
      search: "I'm looking for missing facts…",
      writing: "I'm writing…",
      measuring: "I'm checking sentence length, punctuation and repetition…",
      proposing: "I'm drafting a voice proposal…",
      retrying: "Connection hiccup — I'm retrying the step…",
      fallback: "I'm switching to the backup AI…",
    });
    expect(en.progress.leaveNote).toBe("You can leave the screen — I'll keep working.");
  });

  test('all 16 interface locales receive their own live assistant progress copy', () => {
    for (const [locale, progress] of Object.entries(agentProgressCopy)) {
      const words = agentWordsFor(locale);

      expect(words.conversation.thinking).toBe(progress.thinking);
      expect(words.progress.kind).toBe(progress.kind);
      expect(words.progress.working).toBe(progress.working);
      expect(words.progress.leaveNote).toBe(progress.leaveNote);
      expect(words.progress.stages).toMatchObject(progress.stages);
    }
    expect(Object.keys(agentProgressCopy)).toHaveLength(16);
  });
});
