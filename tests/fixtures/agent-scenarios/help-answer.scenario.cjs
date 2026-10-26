'use strict';

/**
 * An answer from «Помощь» (kcxz.24, ADR-0012 amendment §6: help answers are
 * disclosed as needed, as a skill). Bundled help instructions are preloaded;
 * the agent reads the references in the person's language — the questions and answers
 * the /help screen shows (`help-faq.questions.ts`), not a copy — and answers
 * from them. Nothing is written and nothing but the turn is spent.
 */
module.exports = {
  id: 'help-answer',
  title: 'Ответ из «Помощи» — навык help, те же ответы, что на экране',
  covers: [],
  // Not a capability: the «help» skill (checked by the coverage guard).
  skills: ['help'],
  turns: [
    {
      say: 'Почему у постов в Telegram нет просмотров?',
      model: [
        [['tool', 'skill_read', { skillName: 'help', path: 'references/ru.md' }]],
        [['text', 'Telegram не отдаёт ботам просмотры — смотрите их в статистике канала в самом Telegram.']],
      ],
    },
  ],
  check: (run) => {
    const { HELP_QUESTIONS } = require('../../helpers/load-ts-module.cjs').loadTypeScriptModule(
      'libraries/nestjs-libraries/src/help/help-faq.questions.ts'
    );
    const [turn] = run.turns;
    expect(run.firstCall.tools).toContain('skill_read');
    expect(run.firstCall.tools).not.toContain('skill');
    expect(run.firstCall.system).toContain('references/ru.md');
    expect(turn.toolCalls.map((call) => call.toolName)).toEqual(['skill_read']);
    const [read] = turn.outputs;
    expect(read.toolName).toBe('skill_read');
    const views = HELP_QUESTIONS.ru.find((item) => item.id === 'telegram-analytics');
    expect(String(read.output)).toContain(`## ${views.question}`);
    expect(String(read.output)).toContain(views.answer);
    // Every answer of the screen, in its order.
    const headings = String(read.output).split('\n').filter((line) => line.startsWith('## '));
    expect(headings).toEqual(HELP_QUESTIONS.ru.map((item) => `## ${item.question}`));
    expect(run.writes).toEqual([]);
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
