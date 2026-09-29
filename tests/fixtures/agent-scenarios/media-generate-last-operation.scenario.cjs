'use strict';

const { GENERATED, mediaRows } = require('./media-rows.cjs');

/**
 * One picture is one AI operation (owner 28.09.2026, kcxz.44): the picture
 * prompt is written inside the drawing's `image_generation` operation, so the
 * last operation of the month is enough for a picture. The workspace runs on
 * the included allowance, and every admission goes through the real
 * `AiUsageService` count (`included` in the runner, review F6): 10 a month,
 * 8 used before — the turn's `agent` operation takes the ninth, the picture
 * the tenth. `media.generate` makes no allowance pre-check of its own. The
 * next request finds nothing left and is refused before any model call.
 * (It replaces `media-generate-allowance-short`, where one operation left
 * refused a picture that took two.)
 */
module.exports = {
  id: 'media-generate-last-operation',
  title: 'Осталась одна операция — картинки хватает: одна картинка, одна операция',
  covers: ['media.generate', 'adaptation.image'],
  included: { limit: 10, used: 8 },
  world: mediaRows(),
  turns: [
    {
      say: 'Сделай картинку к посту',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: GENERATED }]],
        [['text', 'Нарисовали и поставили к посту.']],
      ],
    },
  ],
  check: (run) => {
    const [generated, set] = run.turns[0].outputs.map((one) => one.output);
    expect(generated).toMatchObject({ ok: true, summary: { mediaId: GENERATED } });
    expect(set).toMatchObject({ ok: true, card: { kind: 'adaptation', id: 'a1' } });
    // The ninth and the tenth operation of the month: the turn and the picture.
    expect(run.turns[0].admissions.map(([operation, , , status]) => [operation, status])).toEqual([
      ['agent', 'succeeded'],
      ['image_generation', 'succeeded'],
    ]);
    // The prompt was written and drawn in that one operation.
    expect(run.requests.filter(([name]) => name.startsWith('media.')).map(([name]) => name)).toEqual([
      'media.picture-prompt',
      'media.image',
      'media.stored',
    ]);
    expect(run.world.credits.map((row) => [row.type, row.credits])).toEqual([['ai_images', 1]]);
    expect(run.world.adaptations[0].mediaId).toBe(GENERATED);
  },
};
