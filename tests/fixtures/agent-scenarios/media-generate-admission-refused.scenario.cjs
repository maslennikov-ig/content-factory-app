'use strict';

const { mediaRows } = require('./media-rows.cjs');

/**
 * The picture's one admission is refused — another tab spent the month's last
 * operation (owner 28.09.2026, kcxz.44). It is admitted before the picture
 * prompt is written, so the refusal comes before any provider request: nothing
 * is spent, the credit row is taken back, nothing is saved, and the message's
 * paid step is given back — the piece asked for in the same message is still
 * written. (It replaces `media-generate-draw-refused`, where the prompt was a
 * paid operation of its own and the drawing could be refused after it.)
 */
module.exports = {
  id: 'media-generate-admission-refused',
  title: 'Операцию на картинку не дали — ничего не потрачено, шаг возвращён',
  covers: ['media.generate', 'piece.create'],
  world: { ...mediaRows(), pictureAdmission: 'AI_INCLUDED_QUOTA_EXHAUSTED' },
  turns: [
    {
      say: 'Сделай картинку к посту и напиши пост из мысли: повестка экономит час',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['tool', 'piece_create', { text: 'Повестка экономит час' }]],
        [['text', 'На картинку не хватило лимита. Заготовка готова.']],
      ],
    },
  ],
  check: (run) => {
    const [refused, written] = run.turns[0].outputs.map((one) => one.output);
    expect(refused).toMatchObject({ ok: false, code: 'AI_INCLUDED_QUOTA_EXHAUSTED' });
    // The paid step came back: the piece is written.
    expect(written).toMatchObject({ ok: true, card: { kind: 'piece' } });
    const operations = run.turns[0].admissions.map(([operation]) => operation);
    expect(operations).not.toContain('image_generation');
    expect(operations).not.toContain('text_generation');
    // No provider request: the refusal came before the picture prompt.
    expect(run.requests.filter(([name]) => name.startsWith('media.')).map(([name]) => name)).toEqual([
      'media.admission-refused',
    ]);
    // `useCredit` takes the credit row back; nothing is stored or saved.
    expect(run.writes.filter(([name]) => name.startsWith('media.') || name.startsWith('credit.')).map(([name]) => name)).toEqual([
      'credit.used',
      'credit.returned',
    ]);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
