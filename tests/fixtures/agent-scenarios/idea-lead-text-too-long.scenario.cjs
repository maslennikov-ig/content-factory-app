'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F8: the lead and the words the person added are read by the
 * intake together, and together they keep the door's own limit (20 000
 * characters). Over it the call is refused before intake is admitted. A
 * subsequent shorter author request can write the lead; the model cannot
 * silently replace the author's notes with its own shorter text.
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
      say: 'з'.repeat(20_000),
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-1' }]],
        [['text', 'Вместе с поводом заметки превышают предел. Пришлите более короткий запрос.']],
      ],
    },
    {
      say: 'Напиши только по взятому поводу.',
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-1' }]],
        [['text', 'Заметки не влезли — написал по одному поводу «Созвоны без повестки».']],
      ],
    },
  ],
  check: (run) => {
    const tooLong = run.turns[0].outputs[0].output;
    const written = run.turns[1].outputs[0].output;
    expect(tooLong).toMatchObject({ ok: false, code: 'INTAKE_TEXT_TOO_LONG' });
    expect(run.turns[0].admissions.map(([operation]) => operation)).toEqual(['agent']);
    expect(written).toMatchObject({ ok: true, summary: { fromLead: { leadId: 'lead-1' } } });
    expect(run.requests.filter(([name]) => name === 'intake')).toHaveLength(1);
  },
};
