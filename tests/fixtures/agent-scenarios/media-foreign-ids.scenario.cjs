'use strict';

const { DELETED, FOREIGN, mediaRows } = require('./media-rows.cjs');

/**
 * Ids of another workspace, or of something gone, are refused (kcxz.25):
 * another workspace's picture and a deleted one are not put on a post
 * (`ADAPTATION_MEDIA_UNKNOWN`), a picture is not generated for another
 * piece's or an unknown adaptation — refused before anything is admitted —
 * and the library lists neither.
 */
module.exports = {
  id: 'media-foreign-ids',
  title: 'Чужие и удалённые картинки, чужие посты — отказ, ничего не тронуто',
  covers: ['adaptation.image', 'media.generate', 'media.library'],
  world: mediaRows(),
  turns: [
    {
      say: 'Поставь к посту картинки ' + FOREIGN + ' и ' + DELETED + ', нарисуй к посту a9 и к заготовке p-foreign',
      model: [
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: FOREIGN }]],
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: DELETED }]],
        [['tool', 'media_generate', { pieceId: 'p1', adaptationId: 'a9' }]],
        [['tool', 'media_generate', { pieceId: 'p-foreign', adaptationId: 'a1' }]],
        [['tool', 'media_generate', {}]],
        [['tool', 'media_library', {}]],
        [['text', 'Таких нет.']],
      ],
    },
  ],
  check: (run) => {
    const outputs = run.turns[0].outputs.map((one) => one.output);
    expect(outputs.slice(0, 5).map((one) => one.code)).toEqual([
      'ADAPTATION_MEDIA_UNKNOWN',
      'ADAPTATION_MEDIA_UNKNOWN',
      'ADAPTATION_NOT_FOUND',
      'PIECE_NOT_FOUND',
      'MEDIA_PROMPT_MISSING',
    ]);
    // Refused before anything was spent: each gave the paid step back, so
    // the next one ran instead of meeting the paid limit.
    expect(outputs.map((one) => one.code)).not.toContain('PAID_CAP_REACHED');
    const listed = outputs[5].summary.untrustedData.value;
    expect(listed.items.map((item) => item.id)).toEqual(['11111111-0000-4000-8000-000000000001']);
    expect(JSON.stringify(run.turns[0].outputs)).not.toContain('Чужая картинка');
    expect(run.writes).toEqual([]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent']);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
