'use strict';

const { factRows, fact } = require('./fact-rows.cjs');

/**
 * A fact replaced by a corrected copy stays out (review W4-24 F1): «Снять»
 * on it says on the card that nothing will change and is refused after «Да»
 * with `CONTENT_CONTEXT_FACT_SUPERSEDED` — by the repository, as for the
 * screen — so it never becomes a row «Вернуть» accepts. «Вернуть» refuses it
 * too, and refuses a retracted row that already has a correction (one
 * retracted before the refusal existed): the replaced statement never comes
 * back beside the one that corrected it. Nothing is written.
 */
const world = factRows();
world.facts = [
  fact({ id: 'f1', claimKey: 'пробный|период_дней', statement: 'Пробный период — 14 дней.', status: 'SUPERSEDED' }),
  fact({
    id: 'f1-copy',
    claimKey: 'пробный|период_дней',
    statement: 'Пробный период — 30 дней.',
    supersedesFactId: 'f1',
  }),
  fact({ id: 'f8', claimKey: 'цена|старт', statement: 'Тариф «Старт» стоит 490 ₽.', status: 'RETRACTED' }),
  fact({ id: 'f8-copy', claimKey: 'цена|старт', statement: 'Тариф «Старт» стоит 590 ₽.', supersedesFactId: 'f8' }),
];

module.exports = {
  id: 'fact-retract-superseded',
  title: 'Снять и вернуть заменённый факт — отказ, рядом с исправлением старый не встаёт',
  covers: ['facts.retract', 'facts.restore'],
  world,
  turns: [
    { say: 'Убери старый факт про пробный период', model: [[['tool', 'facts_retract', { factId: 'f1' }]]] },
    { approve: true, model: [[['text', 'Этот факт уже заменён — снимать нечего.']]] },
    {
      say: 'Тогда верни старые факты про пробный период и про «Старт»',
      model: [
        [['tool', 'facts_restore', { factId: 'f1' }]],
        [['tool', 'facts_restore', { factId: 'f8' }]],
        [['text', 'Оба заменены исправлениями — старые не возвращаются.']],
      ],
    },
  ],
  check: (run) => {
    const [ask, yes, back] = run.turns;
    expect(ask.approvals[0].reason).toBe(
      'Факт «Пробный период — 14 дней.» уже заменён исправленной копией и не в работе — ничего не изменится'
    );
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'CONTENT_CONTEXT_FACT_SUPERSEDED' });
    expect(back.outputs.map((one) => one.output)).toEqual([
      expect.objectContaining({ ok: false, code: 'CONTENT_CONTEXT_FACT_SUPERSEDED' }),
      expect.objectContaining({ ok: false, code: 'CONTENT_CONTEXT_FACT_SUPERSEDED' }),
    ]);
    expect(run.writes).toEqual([]);
    expect(run.world.facts.map((one) => [one.id, one.status])).toEqual([
      ['f1', 'SUPERSEDED'],
      ['f1-copy', 'VERIFIED'],
      ['f8', 'RETRACTED'],
      ['f8-copy', 'VERIFIED'],
    ]);
  },
};
