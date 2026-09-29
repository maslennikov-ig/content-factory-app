'use strict';

const { mediaRows } = require('./media-rows.cjs');

/**
 * The picture's one operation was admitted, then the provider failed the
 * picture-prompt call (kcxz.44 review F6). A request left for the provider,
 * so the operation is closed as failed and counted, and the message's paid
 * step is not given back (§5.7: only a refusal before any spend is); the
 * credit row is taken back by `useCredit`, nothing is drawn, stored or saved,
 * and the chat says `MEDIA_IMAGE_FAILED`. A second picture in the same
 * message meets the paid cap.
 */
module.exports = {
  id: 'media-generate-prompt-failed',
  title: 'Операция на картинку открыта, промпт упал — операция учтена, кредит вернули, шаг не вернули',
  covers: ['media.generate'],
  world: { ...mediaRows(), promptFails: true },
  turns: [
    {
      say: 'Сделай картинку к посту',
      model: [
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a1' }]],
        [['text', 'Картинку сделать не получилось.']],
      ],
    },
  ],
  check: (run) => {
    const [failed, retried] = run.turns[0].outputs.map((one) => one.output);
    expect(failed).toMatchObject({ ok: false, code: 'MEDIA_IMAGE_FAILED' });
    expect(retried).toMatchObject({ ok: false, code: 'PAID_CAP_REACHED' });
    expect(run.turns[0].admissions.map(([operation, , , status]) => [operation, status])).toEqual([
      ['agent', 'succeeded'],
      ['image_generation', 'failed'],
    ]);
    expect(run.requests.filter(([name]) => name.startsWith('media.')).map(([name]) => name)).toEqual([
      'media.picture-prompt',
    ]);
    expect(run.writes.map(([name]) => name)).toEqual(['credit.used', 'credit.returned']);
    expect(run.world.credits).toEqual([]);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
