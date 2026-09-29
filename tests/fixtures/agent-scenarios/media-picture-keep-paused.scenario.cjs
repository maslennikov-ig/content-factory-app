'use strict';

const { mediaRows } = require('./media-rows.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = '22222222-0000-4000-8000-000000000003';

/**
 * A picture shown, and the turn paused on the media.keep card in the same
 * request (review W4-25 vision F2). The scripted provider echoes the request
 * it sent, the picture's base64 included, as real providers do
 * (`request.body`), and Mastra keeps a step's request on its records. The
 * run waits in storage with its snapshot: the picture must be in none of it
 * — not in the snapshot the pause wrote, not in any snapshot written on the
 * way, not in the thread, a reload, the usage rows or the log.
 */
module.exports = {
  id: 'media-picture-keep-paused',
  title: 'Картинку показали, карточка «в медиатеку» ждёт — в снимке запуска её нет',
  covers: ['media.keep'],
  endsPending: true,
  world: mediaRows(),
  lookFor: [PNG],
  turns: [
    {
      say: 'Поставь эту картинку к посту',
      pictures: [{ name: 'витрина.png', base64: PNG, key: KEY }],
      model: [[['text', 'Сейчас положу её в медиатеку.'], ['tool', 'media_keep', { pictureKey: KEY }]]],
    },
  ],
  check: (run) => {
    const [asked] = run.turns;
    expect(asked.refused).toBeNull();
    expect(asked.suspended.at(-1).payload).toMatchObject({ kind: 'keep-picture', pictureKey: KEY });
    expect(run.pending).toBe(1);
    // The model saw it; the provider's echo of what it sent is kept nowhere.
    expect(run.found[PNG].model).toBe(true);
    expect(asked.storedEcho).toBe(false);
    expect(asked.storedNow).toEqual([]);
    expect(run.found[PNG]).toMatchObject({
      stored: false,
      snapshots: false,
      history: false,
      world: false,
      logged: false,
      usage: false,
    });
  },
};
