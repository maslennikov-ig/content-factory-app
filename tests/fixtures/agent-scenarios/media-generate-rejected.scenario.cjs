'use strict';

const { mediaRows } = require('./media-rows.cjs');

/**
 * The provider's safety system refuses the picture (kcxz.25): the refusal is
 * the product's own code, the one `image_generation` operation — the picture
 * prompt was written in it — failed and is counted (kcxz.44), its credit row is
 * taken back by `useCredit` — nothing is stored or saved, and the post keeps
 * no picture.
 */
module.exports = {
  id: 'media-generate-rejected',
  title: 'ИИ отказался рисовать — код продукта, картинки нет',
  covers: ['media.generate'],
  world: { ...mediaRows(), imageRefused: true },
  turns: [
    {
      say: 'Нарисуй к посту что-нибудь',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1', description: 'что-нибудь яркое', style: 'Pop Art' }]],
        [['text', 'ИИ отказался рисовать это — опишите иначе.']],
      ],
    },
  ],
  check: (run) => {
    const [output] = run.turns[0].outputs.map((one) => one.output);
    expect(output).toMatchObject({ ok: false, code: 'MEDIA_IMAGE_REJECTED' });
    expect(run.turns[0].admissions.map(([operation, , , status]) => [operation, status])).toEqual([
      ['agent', 'succeeded'],
      ['image_generation', 'failed'],
    ]);
    // The person's words come first, then the post; in their style.
    const [prompted] = run.requests.filter(([name]) => name === 'media.picture-prompt');
    expect(prompted[2]).toContain('что-нибудь яркое\n\nСозвоны без повестки');
    expect(prompted[2]).toContain('Pop Art');
    expect(run.writes.map(([name]) => name)).toEqual(['credit.used', 'credit.returned']);
    expect(run.world.credits).toEqual([]);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
