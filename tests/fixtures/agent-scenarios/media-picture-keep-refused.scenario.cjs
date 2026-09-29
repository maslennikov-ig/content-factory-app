'use strict';

const { FOREIGN, mediaRows } = require('./media-rows.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = '22222222-0000-4000-8000-000000000003';

/**
 * The browser's answer to `media.keep` is checked like a receipt (owner
 * decision 28.09.2026): an id of another workspace's picture keeps nothing
 * and puts nothing on a post; a page that no longer holds the picture says
 * so, and the agent asks for it again.
 */
module.exports = {
  id: 'media-picture-keep-refused',
  title: 'Ответ браузера на «в медиатеку» проверяется; пропавшую картинку просим снова',
  covers: ['media.keep'],
  world: mediaRows(),
  turns: [
    {
      say: 'Поставь эту картинку к посту',
      pictures: [{ name: 'a.png', base64: PNG, key: KEY }],
      model: [[['tool', 'media_keep', { pictureKey: KEY }]]],
    },
    { resume: { kept: true, mediaId: FOREIGN }, model: [[['text', 'Не получилось.']]] },
    {
      say: 'Поставь ту картинку к посту',
      model: [[['tool', 'media_keep', { pictureKey: KEY }]]],
    },
    { resume: { kept: false, gone: true }, model: [[['text', 'Пришлите картинку ещё раз.']]] },
  ],
  check: (run) => {
    const [, foreign, , gone] = run.turns;
    expect(foreign.outputs[0].output).toMatchObject({ ok: false, code: 'ADAPTATION_MEDIA_UNKNOWN' });
    expect(gone.outputs[0].output).toMatchObject({ ok: true, summary: { kept: false } });
    expect(JSON.stringify(gone.outputs[0].output)).toContain('attach it again');
    expect(run.world.adaptations[0].mediaId).toBeNull();
    expect(run.writes).toEqual([]);
  },
};
