'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F2: the model writes before it takes. `piece.create` on a lead
 * still in the queue is refused before anything is spent, and that refusal
 * gives the message's paid step back — so `ideas.take`, then `piece.create`
 * again in the same turn, writes the piece instead of meeting
 * `PAID_CAP_REACHED` with the lead taken and no piece. The answer names the
 * lead the piece was written from (F6).
 */
module.exports = {
  id: 'idea-take-after-refusal',
  title: 'Заготовка раньше «взять» — отказ без траты, та же реплика пишет заготовку',
  covers: ['piece.create', 'ideas.take'],
  world: ideaRows(),
  turns: [
    {
      say: 'Напиши заготовку по поводу про созвоны',
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-1' }]],
        [['tool', 'ideas_take', { leadId: 'lead-1' }]],
      ],
    },
    {
      // Taking asks in the web chat (kcxz.45); «Да» takes, then the piece.
      approve: true,
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-1' }]],
        [['text', 'Заготовка написана по поводу «Созвоны без повестки: что показало исследование».']],
      ],
    },
  ],
  check: (run) => {
    const [asked, turn] = run.turns;
    const [refused] = asked.outputs.map((one) => one.output);
    expect(asked.approvals.map((one) => one.toolName)).toEqual(['ideas_take']);
    const [taken, written] = turn.outputs.map((one) => one.output);
    expect(refused).toMatchObject({ ok: false, code: 'IDEAS_LEAD_NOT_TAKEN' });
    expect(refused.reason).toMatch(/in this turn/);
    expect(taken).toMatchObject({ ok: true });
    expect(written).toMatchObject({
      ok: true,
      summary: { fromLead: { leadId: 'lead-1' } },
      card: { kind: 'piece' },
    });
    const piece = run.world.pieces.find((one) => one.id === written.summary.pieceId);
    expect(piece.leadSource).toMatchObject({ leadId: 'lead-1', url: 'https://vc.ru/a/1' });
    expect(run.world.leads.find((one) => one.id === 'lead-1').status).toBe('ACCEPTED');
    // One intake, one paid operation of its own.
    expect(run.requests.filter(([name]) => name === 'intake')).toHaveLength(1);
    expect(turn.admissions.filter(([operation]) => operation !== 'agent')).toHaveLength(1);
  },
};
