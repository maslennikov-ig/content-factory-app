'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * «Добавь факт» says what was stored (review W4-24 F2, F4): a statement the
 * workspace already holds is the same fact — the answer says it existed; a
 * new day told to the agent is set on it while it is in work (owner
 * 29.09.2026, walk review F1: `redated`); a known fact since replaced says so and is
 * not in work; one removed for good is refused (`FACT_REMOVED`), as the
 * form's add leaves it untouched. A day that is not a day or is already over
 * is refused before anything is written.
 */
module.exports = {
  id: 'fact-add-known',
  title: 'Добавить известный факт — «уже был», его срок и состояние; неверная и прошедшая дата — отказ',
  covers: ['facts.add'],
  world: factRows(),
  turns: [
    {
      say: 'Запомни три факта: скидка для школ 20% по 31 марта 2099-го, доставка по Москве бесплатно, офис открыт до 21:00',
      model: [
        [['tool', 'facts_add', { statement: 'Скидка для школ — 20%.', validUntil: '2099-03-31' }]],
        [['tool', 'facts_add', { statement: 'Доставка по Москве бесплатная.' }]],
        [['tool', 'facts_add', { statement: 'Офис открыт до 21:00.' }]],
        [['text', 'Запомнил три факта.']],
      ],
    },
    {
      // On «Откуда факты» the delivery fact is corrected by a copy, and the
      // office one is removed for good.
      before: (rows) => {
        rows.facts.find((one) => one.statement === 'Доставка по Москве бесплатная.').status = 'SUPERSEDED';
        rows.facts.find((one) => one.statement === 'Офис открыт до 21:00.').status = 'TOMBSTONED';
      },
      say: 'Скидка для школ 20% теперь по 30 июня 2099-го. И снова: доставка по Москве бесплатная, офис открыт до 21:00',
      model: [
        [['tool', 'facts_add', { statement: 'Скидка для школ — 20%.', validUntil: '2099-06-30' }]],
        [['tool', 'facts_add', { statement: 'Доставка по Москве бесплатная.' }]],
        [['tool', 'facts_add', { statement: 'Офис открыт до 21:00.' }]],
        [['text', 'Скидка уже была — теперь она до 30 июня 2099-го.']],
      ],
    },
    {
      say: 'Цена «Про» — 1990 ₽ до 30 февраля 2099-го. Или до 1 января 2020-го',
      model: [
        [['tool', 'facts_add', { statement: 'Цена «Про» — 1990 ₽.', validUntil: '2099-02-30' }]],
        [['tool', 'facts_add', { statement: 'Цена «Про» — 1990 ₽.', validUntil: '2020-01-01' }]],
        [['text', 'Такой даты нет, а вторая уже прошла.']],
      ],
    },
  ],
  check: (run) => {
    const [first, again, dates] = run.turns;
    const [discount, delivery, office] = first.outputs.map((one) => one.output.summary);
    expect(discount).toMatchObject({ existed: false, validUntil: '2099-03-31', inWork: true });
    expect(delivery).toMatchObject({ existed: false, validUntil: null, inWork: true });
    expect(office).toMatchObject({ existed: false });

    const [sameDiscount, replaced, removed] = again.outputs.map((one) => one.output);
    expect(sameDiscount.summary).toMatchObject({
      factId: discount.factId,
      existed: true,
      redated: true,
      validUntil: '2099-06-30',
      inWork: true,
    });
    expect(sameDiscount.summary).not.toHaveProperty('validUntilAsked');
    expect(sameDiscount.summary.note).toContain('its last day is now 2099-06-30');
    expect(replaced.summary).toMatchObject({
      factId: delivery.factId,
      existed: true,
      superseded: true,
      inWork: false,
      notInWorkBecause: 'superseded',
    });
    expect(replaced.summary.note).toContain('corrected copy');
    expect(removed).toMatchObject({ ok: false, code: 'FACT_REMOVED' });

    expect(dates.outputs.map((one) => one.output)).toEqual([
      expect.objectContaining({ ok: false, code: 'FACT_DATE_INVALID' }),
      expect.objectContaining({ ok: false, code: 'FACT_DATE_PAST' }),
    ]);

    // Three facts written on the first turn; after that only the discount's
    // new day (the write and its status recompute), nothing added.
    expect(run.writes.map(([name, id]) => [name, id])).toEqual([
      ['fact.added', discount.factId],
      ['fact.added', delivery.factId],
      ['fact.added', office.factId],
      ['fact.status', discount.factId],
      ['fact.status', discount.factId],
    ]);
    const stored = run.world.facts.find((one) => one.id === discount.factId);
    expect(stored.status).toBe('VERIFIED');
  },
};
