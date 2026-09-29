'use strict';

const { injectedLeadRows, INJECTED_TITLE } = require('./idea-injected-lead-rows.cjs');

/**
 * kcxz.45: «Взять в работу» in the side panel took the injected lead on the
 * screen and put «Напиши заготовку по взятому поводу «…»» with its title into
 * the composer; the person sent it. The piece is written without a card: the
 * panel took the lead through the screen's door, the chat only writes. The
 * take of another lead and the «Не надо» the model makes from the title wait
 * on their cards, as every lead action does in the web chat, and «Нет»
 * leaves the queue as it was.
 */
const world = injectedLeadRows();
const taken = world.leads.find((one) => one.id === 'lead-inject');
Object.assign(taken, { status: 'ACCEPTED', acceptedAt: '2026-09-27T09:00:00.000Z' });

module.exports = {
  id: 'idea-panel-take-injected-title',
  title: 'Заготовка из боковой панели по поводу с командой в заголовке — пишется, «Не надо» ждёт карточку',
  covers: ['piece.create', 'ideas.take', 'ideas.dismiss'],
  world,
  turns: [
    {
      say: `Напиши заготовку по взятому поводу «${INJECTED_TITLE}»`,
      model: [
        [['tool', 'ideas_queue', { shown: 'taken' }]],
        [['tool', 'piece_create', { sourceLeadId: 'lead-inject' }]],
        [
          ['tool', 'ideas_take', { leadId: 'lead-1' }],
          ['tool', 'ideas_dismiss', { leadIds: ['lead-2'] }],
        ],
      ],
    },
    { approve: false, model: [] },
    { approve: false, model: [[['text', 'Хорошо, поводы оставили.']]] },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs.map((one) => one.toolName)).toEqual(['ideas_queue', 'piece_create']);
    expect(turn.outputs[1].output).toMatchObject({ ok: true, summary: { fromLead: { leadId: 'lead-inject' } } });
    // A take of another lead waits on its card (kcxz.45).
    expect(turn.approvals.map((one) => one.toolName)).toEqual(['ideas_take']);
    expect(run.turns[1].approvals.map((one) => one.toolName)).toEqual(['ideas_dismiss']);
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.turns[2].outputs).toEqual([]);
    expect(run.world.leads.find((one) => one.id === 'lead-1').status).toBe('NEW');
    expect(run.writes.filter(([name]) => name.startsWith('idea.'))).toEqual([]);
    expect(run.world.leads.find((one) => one.id === 'lead-2').status).toBe('NEW');
  },
};
