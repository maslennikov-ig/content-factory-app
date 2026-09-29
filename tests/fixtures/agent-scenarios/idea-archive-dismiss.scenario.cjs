'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Unsubscribing and «Не надо» (kcxz.23), each on its card in the web chat
 * (kcxz.45): the feed stops, its leads stay; a declined lead leaves the
 * queue, and taking it afterwards — «Да» on that card too — is refused by the
 * repository's own rule.
 */
module.exports = {
  id: 'idea-archive-dismiss',
  title: 'Отписка и «Не надо» — по карточке, повторный отказ по правилу',
  covers: ['ideas.archive', 'ideas.dismiss', 'ideas.take'],
  world: ideaRows(),
  turns: [
    {
      say: 'Этот про созвоны не надо. И отпишись от vc.ru',
      model: [[['tool', 'ideas_dismiss', { leadIds: ['lead-1'] }]]],
    },
    { approve: true, model: [[['tool', 'ideas_archive', { subscriptionId: 'sub-1' }]]] },
    { approve: true, model: [[['text', 'Готово.']]] },
    { say: 'А про созвоны всё-таки возьми', model: [[['tool', 'ideas_take', { leadId: 'lead-1' }]]] },
    { approve: true, model: [[['text', 'Он уже отклонён.']]] },
  ],
  check: (run) => {
    const outputs = run.turns.flatMap((turn) => turn.outputs.map((one) => one.output));
    expect(run.turns.map((turn) => turn.approvals.map((one) => one.toolName))).toEqual([
      ['ideas_dismiss'],
      ['ideas_archive'],
      [],
      ['ideas_take'],
      [],
    ]);
    expect(outputs[0]).toMatchObject({
      ok: true,
      summary: { untrustedData: { value: { count: 1, dismissed: [{ leadId: 'lead-1' }] } } },
    });
    expect(outputs[1]).toMatchObject({ ok: true, summary: { untrustedData: { value: { subscriptionId: 'sub-1', name: 'vc.ru', archived: true } } } });
    expect(outputs[2]).toMatchObject({ ok: false, code: 'LEAD_NOT_NEW' });
    expect(run.writes).toEqual([
      ['idea.dismissed', 'lead-1'],
      ['idea.unsubscribed', 'sub-1'],
    ]);
    const feed = run.world.subscriptions.find((one) => one.id === 'sub-1');
    expect(feed).toMatchObject({ state: 'PAUSED', deletedAt: '2026-09-27T10:00:00.000Z' });
    // The leads it brought stay.
    expect(run.world.leads.filter((one) => one.subscriptionId === 'sub-1')).toHaveLength(2);
  },
};
