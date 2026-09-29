'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F8: the lead and the words the person added are read by the
 * intake together, and together they keep the door's own limit (20 000
 * characters). Over it the call is refused before anything is spent, the
 * paid step is given back, and the lead alone is written in the same turn.
 */
const rows = ideaRows();
rows.leads[0].status = 'ACCEPTED';

module.exports = {
  id: 'idea-lead-text-too-long',
  title: 'Повод и дописанное длиннее предела заготовки — отказ без траты',
  covers: ['piece.create'],
  world: rows,
  turns: [
    {
      say: 'Напиши по взятому поводу про созвоны, вот мои заметки',
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-1', text: 'з'.repeat(20_000) }]],
        [['tool', 'piece_create', { sourceLeadId: 'lead-1' }]],
        [['text', 'Заметки не влезли — написал по одному поводу «Созвоны без повестки».']],
      ],
    },
  ],
  check: (run) => {
    const [tooLong, written] = run.turns[0].outputs.map((one) => one.output);
    expect(tooLong).toMatchObject({ ok: false, code: 'INTAKE_TEXT_TOO_LONG' });
    expect(written).toMatchObject({ ok: true, summary: { fromLead: { leadId: 'lead-1' } } });
    expect(run.requests.filter(([name]) => name === 'intake')).toHaveLength(1);
  },
};
