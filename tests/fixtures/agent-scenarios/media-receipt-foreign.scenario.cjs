'use strict';

const { FOREIGN, DELETED, PICTURE, mediaRows, receipt } = require('./media-rows.cjs');

/** A video of this workspace, whose uploader named it like a picture. */
const VIDEO = '11111111-0000-4000-8000-000000000003';

/**
 * A pictures receipt is the browser's report of an upload to this workspace's
 * library (kcxz.25), checked at the chat door as a samples receipt is: one
 * that names another workspace's picture, a deleted one, or a library item
 * that is not a picture is refused before anything is billed or read by the
 * model; one of this workspace's goes through — and the model reads the name
 * and the type the library's row gives, not the browser's (review W4-25 F3).
 */
module.exports = {
  id: 'media-receipt-foreign',
  title: 'Квитанция картинок с чужим id — дверь отказывает, модель её не читает',
  covers: ['media.library'],
  world: (() => {
    const rows = mediaRows();
    rows.media.push({
      id: VIDEO,
      name: 'q9Lx.mp4',
      originalName: 'ролик.png',
      path: 'https://cdn.example/q9Lx.mp4',
      deletedAt: null,
      createdAt: '2026-09-27T08:00:00.000Z',
    });
    return rows;
  })(),
  refusedTurns: [0, 1, 2],
  turns: [
    { say: 'Вот картинка', media: receipt(PICTURE, FOREIGN), model: [[['text', 'не должно прозвучать']]] },
    { say: 'Вот картинка', media: receipt(DELETED), model: [[['text', 'не должно прозвучать']]] },
    { say: 'Вот картинка', media: receipt(VIDEO), model: [[['text', 'не должно прозвучать']]] },
    {
      say: 'Вот картинка',
      // The browser's claims: another name and another type.
      media: { media: [{ id: PICTURE, name: 'ложь.gif', type: 'image/gif' }] },
      model: [[['tool', 'media_library', {}]], [['text', 'Картинка в медиатеке.']]],
    },
  ],
  check: (run) => {
    const [foreign, deleted, video, own] = run.turns;
    for (const refused of [foreign, deleted, video]) {
      expect(refused.refused).toEqual({ status: 400, code: 'AGENT_BAD_REQUEST' });
      expect(refused.modelCalls).toBe(0);
      expect(refused.admissions).toEqual([]);
    }
    expect(own.refused).toBeNull();
    expect(own.outputs[0].output).toMatchObject({ ok: true, card: { kind: 'media', id: 'library' } });
    expect(JSON.stringify(run.prompts)).not.toContain(FOREIGN);
    // The line the model read is the library row's: its name, its type.
    const read = run.prompts.filter((prompt) => prompt.turn === 3).map((prompt) => prompt.user)[0];
    expect(read).toContain('кофейня.png');
    expect(read).toContain('image/png');
    expect(read).not.toContain('ложь');
    expect(read).not.toContain('image/gif');
  },
};
