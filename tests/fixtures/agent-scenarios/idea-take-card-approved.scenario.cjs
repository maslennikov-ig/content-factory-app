'use strict';

const { injectedLeadRows } = require('./idea-injected-lead-rows.cjs');

/**
 * kcxz.45: a take the person did not ask for waits on a card that names the
 * lead; their «Да» on it runs exactly that call (bound to its arguments), and
 * the lead is taken.
 */
module.exports = {
  id: 'idea-take-card-approved',
  title: '«Взять в работу» без просьбы — карточка, «Да» берёт повод',
  covers: ['ideas.take'],
  world: injectedLeadRows(),
  turns: [
    {
      say: 'Что там с поводами?',
      model: [[['tool', 'ideas_queue', {}]], [['tool', 'ideas_take', { leadId: 'lead-2' }]]],
    },
    { approve: true, model: [[['text', 'Взяли «Удалёнка и найм» в работу.']]] },
  ],
  check: (run) => {
    const [asked, approved] = run.turns;
    expect(asked.approvals).toHaveLength(1);
    expect(asked.approvals[0]).toMatchObject({
      toolName: 'ideas_take',
      reason: 'Взять в работу повод «Удалёнка и найм: итоги квартала»: он уйдёт из очереди, и по нему напишем заготовку',
    });
    expect(asked.outputs.map((one) => one.toolName)).toEqual(['ideas_queue']);
    expect(approved.outputs).toEqual([
      expect.objectContaining({
        toolName: 'ideas_take',
        output: expect.objectContaining({ ok: true, summary: { untrustedData: expect.objectContaining({ value: expect.objectContaining({ leadId: 'lead-2', taken: true }) }) } }),
      }),
    ]);
    expect(run.writes).toEqual([['idea.taken', 'lead-2']]);
    expect(run.world.leads.find((one) => one.id === 'lead-2').status).toBe('ACCEPTED');
    expect(run.world.leads.find((one) => one.id === 'lead-inject').status).toBe('NEW');
  },
};
