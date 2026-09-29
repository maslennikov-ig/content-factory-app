'use strict';

const { mediaRows } = require('./media-rows.cjs');

/**
 * Where billing is configured and the plan's picture credits are spent, the
 * door answers `false` before anything is admitted (kcxz.25): nothing is
 * drawn, stored or counted, and the refusal gives the message's paid step
 * back (review W4-23 F2) — «сделай картинку и напиши пост» still writes the
 * piece in the same turn.
 */
module.exports = {
  id: 'media-generate-credits-spent',
  title: 'Картинки по тарифу кончились — отказ без трат, платный шаг возвращён',
  covers: ['media.generate', 'piece.create'],
  world: { ...mediaRows(), billing: true },
  turns: [
    {
      say: 'Сделай картинку к посту и напиши пост из мысли: повестка экономит час',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['tool', 'piece_create', { text: 'Повестка экономит час' }]],
        [['text', 'Картинки по тарифу кончились. Заготовка готова.']],
      ],
    },
  ],
  check: (run) => {
    const [refused, written] = run.turns[0].outputs.map((one) => one.output);
    expect(refused).toMatchObject({ ok: false, code: 'MEDIA_IMAGE_CREDITS_EXHAUSTED' });
    // The paid step came back: the piece is written.
    expect(written).toMatchObject({ ok: true, card: { kind: 'piece' } });
    const operations = run.turns[0].admissions.map(([operation]) => operation);
    expect(operations).not.toContain('image_generation');
    expect(operations).not.toContain('text_generation');
    expect(run.requests.filter(([name]) => name.startsWith('media.'))).toEqual([]);
    expect(run.writes.filter(([name]) => name.startsWith('media.') || name.startsWith('credit.'))).toEqual([]);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
