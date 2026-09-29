'use strict';

const { PICTURE, mediaRows } = require('./media-rows.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = '22222222-0000-4000-8000-000000000002';

/**
 * A picture the person showed the agent, then wanted on a post (owner
 * decision 28.09.2026): the agent sees it, asks the browser — which still
 * holds it — to put it into the library (`media.keep`, by its `pictureKey`);
 * the browser uploads it through the library's own request and answers with
 * the id, which the server checks like a receipt; the agent puts it on the
 * post. The server never had the picture's bytes beyond the request that
 * showed it, and the model never uploads anything.
 */
module.exports = {
  id: 'media-picture-kept-to-post',
  title: 'Показанную картинку — в медиатеку через браузер и на пост',
  covers: ['media.keep', 'adaptation.image'],
  world: mediaRows(),
  lookFor: [PNG],
  turns: [
    {
      say: 'Поставь эту картинку к посту для канала про работу',
      pictures: [{ name: 'кофейня.png', base64: PNG, key: KEY }],
      model: [[['tool', 'media_keep', { pictureKey: KEY }]]],
    },
    {
      // The browser put the picture into the library (the library's own
      // request, `PICTURE` is its row) and answers the card with its id.
      resume: { kept: true, mediaId: PICTURE },
      model: [
        [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: PICTURE }]],
        [['text', 'Положили в медиатеку и поставили к посту.']],
      ],
    },
  ],
  check: (run) => {
    const [asked, answered] = run.turns;
    // The card asks the browser for this picture, by its key.
    expect(asked.suspended.at(-1).payload).toMatchObject({
      kind: 'keep-picture',
      pictureKey: KEY,
      canDecideForPerson: false,
    });
    expect(run.found[PNG].model).toBe(true);
    const [kept, set] = answered.outputs.map((one) => one.output);
    expect(kept).toMatchObject({ ok: true, summary: { kept: true, mediaId: PICTURE }, card: { kind: 'media' } });
    expect(set).toMatchObject({ ok: true, card: { kind: 'adaptation', id: 'a1' } });
    expect(run.world.adaptations[0].mediaId).toBe(PICTURE);
    // Saved nowhere by the chat: the bytes are not in the storage or a reload.
    expect(run.found[PNG].stored).toBe(false);
    expect(run.found[PNG].history).toBe(false);
    expect(run.storedPartTypes).not.toContain('file');
    expect(run.writes).toEqual([['adaptation.edited', 'a1']]);
  },
};
