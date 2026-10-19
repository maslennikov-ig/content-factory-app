'use strict';

const { mediaRows } = require('./media-rows.cjs');

/** A failed admitted paid operation is accounted once and cannot replay automatically. */
module.exports = {
  id: 'media-generate-prompt-failed',
  incompleteTurns: [0],
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
    const [failed] = run.turns[0].outputs.map((one) => one.output);
    expect(failed).toMatchObject({ ok: false, code: 'MEDIA_IMAGE_FAILED' });
    expect(run.turns[0].outputs).toHaveLength(1);
    expect(run.turns[0].text).toContain('Задача не завершена');
    expect(run.turns[0].admissions.map(([operation, , , status]) => [operation, status])).toEqual([
      ['agent', 'failed'],
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
