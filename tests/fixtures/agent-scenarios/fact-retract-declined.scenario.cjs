'use strict';

const { factRows } = require('./fact-rows.cjs');

/** «Нет» on the retract card: the fact stays in work, nothing written (kcxz.24). */
module.exports = {
  id: 'fact-retract-declined',
  title: 'Снять факт — «Нет», факт остаётся в работе',
  covers: ['facts.retract'],
  world: factRows(),
  turns: [
    { say: 'Сними факт про пробный период', model: [[['tool', 'facts_retract', { factId: 'f1' }]]] },
    { approve: false, model: [[['text', 'Хорошо, оставили.']]] },
  ],
  check: (run) => {
    expect(run.turns[0].approvals[0].reason).toContain('«Пробный период — 14 дней.»');
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.facts.find((one) => one.id === 'f1').status).toBe('VERIFIED');
  },
};
