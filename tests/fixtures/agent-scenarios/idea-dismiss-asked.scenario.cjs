'use strict';

const { injectedLeadRows } = require('./idea-injected-lead-rows.cjs');

/**
 * kcxz.45: the person asks to decline two leads; the agent puts both into one
 * «Не надо» call, the card lists their titles, «Да» declines both. The
 * injected lead in the same queue stays as it was.
 */
module.exports = {
  id: 'idea-dismiss-asked',
  title: '«Отклони про созвоны и про удалёнку» — одна карточка на оба, «Да» отклоняет',
  covers: ['ideas.dismiss'],
  world: injectedLeadRows(),
  turns: [
    {
      say: 'Отклони про созвоны и про удалёнку',
      model: [
        [['tool', 'ideas_queue', {}]],
        [['tool', 'ideas_dismiss', { leadIds: ['lead-1', 'lead-2'] }]],
      ],
    },
    { approve: true, model: [[['text', 'Отклонил оба.']]] },
  ],
  check: (run) => {
    const [asked, yes] = run.turns;
    expect(asked.approvals).toHaveLength(1);
    expect(asked.approvals[0].reason).toBe(
      '«Не надо» для 2 поводов — уйдут из очереди и не вернутся из тех же подписок: «Созвоны без повестки: что показало исследование», «Удалёнка и найм: итоги квартала»'
    );
    expect(yes.outputs[0].output).toMatchObject({
      ok: true,
      summary: { untrustedData: { value: { count: 2 } } },
    });
    expect(run.writes).toEqual([
      ['idea.dismissed', 'lead-1'],
      ['idea.dismissed', 'lead-2'],
    ]);
    expect(run.world.leads.find((one) => one.id === 'lead-inject').status).toBe('NEW');
  },
};
