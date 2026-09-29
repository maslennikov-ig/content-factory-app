'use strict';

const { PICTURE, mediaRows, receipt } = require('./media-rows.cjs');

/**
 * A «Пользователь» reads the media library and is offered nothing that
 * generates a picture or puts one on a post; a pictures receipt from them is
 * refused at the door — the library's upload is the editor's (kcxz.25).
 */
module.exports = {
  id: 'media-reader-offered-reads',
  title: 'Пользователь — медиатека только на чтение, квитанция картинок не принимается',
  role: 'USER',
  covers: ['media.library'],
  world: mediaRows(),
  refusedTurns: [0],
  turns: [
    { say: 'Вот картинка', media: receipt(PICTURE), model: [[['text', 'не должно прозвучать']]] },
    { say: 'Какие картинки у нас есть?', model: [[['tool', 'media_library', {}]], [['text', 'Одна — «кофейня.png».']]] },
  ],
  check: (run) => {
    const [upload, list] = run.turns;
    expect(upload.refused).toEqual({ status: 400, code: 'AGENT_BAD_REQUEST' });
    expect(upload.admissions).toEqual([]);
    const offered = run.firstCall.tools;
    expect(offered).toContain('media_library');
    for (const tool of ['media_generate', 'adaptation_image']) expect(offered).not.toContain(tool);
    expect(list.outputs[0].output).toMatchObject({ ok: true });
    expect(list.outputs[0].output.summary.untrustedData.value.items).toEqual([
      { id: PICTURE, name: 'кофейня.png', kind: 'image' },
    ]);
    expect(run.writes).toEqual([]);
  },
};
