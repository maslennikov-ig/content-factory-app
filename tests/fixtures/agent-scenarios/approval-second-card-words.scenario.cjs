'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * Review kcxz.45 F5: two approval calls in one step. Mastra runs them one by
 * one, so the second card is streamed in the answer to the first — a stream
 * that never showed that call. It still carries its words, and what it sends
 * out is recorded as it was drawn: the fact is retracted on the screen after
 * the card was shown, and «Да» is refused with `APPROVAL_CONTENT_CHANGED`.
 */
module.exports = {
  id: 'approval-second-card-words',
  title: 'Две карточки в одном шаге — у второй есть слова, «Да» привязано к показанному',
  covers: ['facts.retract'],
  world: factRows(),
  turns: [
    {
      say: 'Сними факты про пробный период и про тариф',
      model: [
        [
          ['tool', 'facts_retract', { factId: 'f1' }],
          ['tool', 'facts_retract', { factId: 'f2' }],
        ],
      ],
    },
    { approve: true, model: [] },
    {
      // Another member presses «Снять» on «Откуда факты» after the second card.
      before: (rows) => {
        rows.facts.find((one) => one.id === 'f2').status = 'RETRACTED';
      },
      approve: true,
      model: [[['text', 'Этот факт уже сняли.']]],
    },
  ],
  check: (run) => {
    const [ask, first, second] = run.turns;
    expect(ask.approvals.map((one) => one.reason)).toEqual([
      expect.stringMatching(/^Снять факт «Пробный период — 14 дней\.»/),
    ]);
    expect(first.approvals).toHaveLength(1);
    expect(first.approvals[0].toolName).toBe('facts_retract');
    expect(first.approvals[0].reason).toMatch(/^Снять факт «Тариф «Команда» стоит 990 ₽/);
    // Mastra hands both results over in the last answer: f1 ran on its «Да»;
    // f2's «Да» is bound to what its card showed — had the door not recorded
    // it, «Да» would bind to the fact as it is now and pass this check.
    expect(second.outputs.map((one) => one.output.ok === true || one.output.code)).toEqual([
      true,
      'APPROVAL_CONTENT_CHANGED',
    ]);
    expect(run.writes).toEqual([['fact.status', 'f1', 'RETRACTED']]);
  },
};
