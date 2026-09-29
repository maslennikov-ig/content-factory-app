'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * «Да» is for the fact the card quoted, as it stood (kcxz.24): the fact is
 * retracted on the screen before the person answers, so the answer is refused
 * with `APPROVAL_CONTENT_CHANGED`, nothing is written, and the card is shown
 * again — now saying the fact is already retracted.
 */
module.exports = {
  id: 'fact-retract-changed',
  title: 'Снять факт — факт изменился после карточки: «Да» ничего не делает, карточка заново',
  covers: ['facts.retract'],
  world: factRows(),
  turns: [
    { say: 'Сними факт про пробный период', model: [[['tool', 'facts_retract', { factId: 'f1' }]]] },
    {
      // Another member presses «Снять» on «Откуда факты».
      before: (rows) => {
        rows.facts.find((one) => one.id === 'f1').status = 'RETRACTED';
      },
      approve: true,
      model: [[['tool', 'facts_retract', { factId: 'f1' }]]],
    },
  ],
  endsPending: true,
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toMatch(/^Снять факт «Пробный период — 14 дней\.»/);
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'APPROVAL_CONTENT_CHANGED' });
    expect(run.writes).toEqual([]);
    expect(yes.approvals[0].reason).toBe('Факт «Пробный период — 14 дней.» уже снят — ничего не изменится');
  },
};
