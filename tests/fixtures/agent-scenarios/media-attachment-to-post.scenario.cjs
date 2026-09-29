'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');
const { PICTURE, mediaRows, receipt } = require('./media-rows.cjs');

/**
 * The acceptance «вложение → картинка поста» (kcxz.25, spec §5.9): a picture
 * attached in the composer went to the media library from the browser; the
 * message carries only its receipt. The door checks the id is this
 * workspace's, the model reads the receipt as data — ids and names, never a
 * picture — and puts it on the post with `adaptation.image`, the page's own
 * patch. No paid step, no AI operation beyond the turn.
 */
module.exports = {
  id: 'media-attachment-to-post',
  title: 'Картинка из сообщения — в медиатеке, потом на пост',
  covers: ['adaptation.image'],
  world: mediaRows(),
  turns: [
    {
      say: 'Поставь эту картинку к посту для канала про работу',
      media: receipt(PICTURE),
      model: [
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: PICTURE }]],
        [['text', 'Поставили картинку к посту.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    // What the model read: the receipt as untrusted data, no picture.
    const read = run.prompts.filter((prompt) => prompt.turn === 0).map((prompt) => prompt.user)[0];
    expect(read).toContain('"untrustedData"');
    expect(read).toContain('mediaUpload');
    expect(read).toContain(PICTURE);
    expect(read).toContain('media library');
    expect(read).not.toContain('base64');
    expect(read).not.toContain('[file]');
    // Set as the page sets it, on the adaptation the card opens.
    expect(turn.outputs[0].output).toMatchObject({ ok: true, card: { kind: 'adaptation', id: 'a1' } });
    expect(run.requests.filter(([door]) => door === 'adaptation.edit')).toEqual([
      ['adaptation.edit', 'p1', 'a1', screenPieces().buildAdaptationPatch({ image: { id: PICTURE } })],
    ]);
    expect(run.world.adaptations[0].mediaId).toBe(PICTURE);
    expect(run.writes).toEqual([['adaptation.edited', 'a1']]);
    // Only the turn's own operation: nothing paid, nothing drawn.
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent']);
    // The thread keeps the receipt's line, as a reload shows it.
    expect(run.storedPartTypes).toContain('text');
    expect(JSON.stringify(run.history)).toContain('mediaUpload');
  },
};
