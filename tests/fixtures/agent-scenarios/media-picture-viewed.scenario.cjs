'use strict';

const { mediaRows } = require('./media-rows.cjs');

/** A tiny PNG's bytes, base64: what must reach the model and nothing else. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = '22222222-0000-4000-8000-000000000001';

/**
 * «Что на картинке?» (owner decision 28.09.2026, «агент видит картинки»): a
 * picture attached for the agent to look at reaches the model inline, in the
 * request that carries it, and is saved nowhere — not in the media library,
 * not in the thread's storage, not in a reload. The thread keeps a line with
 * its name and the key the browser keeps it under; the next message does not
 * show the picture again. No paid step, no library write. A reader may show
 * pictures; putting one into the library is not offered to them.
 */
module.exports = {
  id: 'media-picture-viewed',
  title: 'Картинку показали ИИ — он её видит, а сохранить её негде',
  covers: [],
  // The `media` skill's know-how: answer about a shown picture, it is kept nowhere.
  skills: ['media'],
  role: 'USER',
  world: mediaRows(),
  lookFor: [PNG],
  turns: [
    {
      say: 'Что на этой картинке?',
      pictures: [{ name: 'скриншот.png', base64: PNG, key: KEY }],
      model: [[['tool', 'skill', { name: 'media' }]], [['text', 'На картинке — одна точка.']]],
    },
    {
      say: 'А какого она цвета?',
      model: [[['text', 'Картинку я видел только в прошлом сообщении — пришлите её ещё раз.']]],
    },
  ],
  check: (run) => {
    const [looked, later] = run.turns;
    expect(looked.refused).toBeNull();
    expect(later.refused).toBeNull();
    // The model saw the picture in the request that carried it…
    expect(run.found[PNG].model).toBe(true);
    // Only the first step of the request that carries it sees the picture
    // (owner decision 28.09, review W4-25 vision F4); the later step reads
    // the line alone, in the same one `agent` operation.
    const firsts = run.prompts.filter((prompt) => prompt.turn === 0).map((prompt) => prompt.user);
    expect(firsts).toHaveLength(2);
    expect(firsts[0]).toContain('[file]');
    expect(firsts[1]).not.toContain('[file]');
    expect(firsts[1]).toContain(KEY);
    const first = firsts[0];
    expect(first).toContain('скриншот.png');
    expect(first).toContain(KEY);
    // …and not in the next one.
    const second = run.prompts.filter((prompt) => prompt.turn === 1).map((prompt) => prompt.user);
    expect(second.join('\n')).not.toContain('[file]');
    // Saved nowhere: not the storage, not a reload, not the library.
    expect(run.found[PNG].stored).toBe(false);
    expect(run.found[PNG].history).toBe(false);
    expect(run.found[PNG].world).toBe(false);
    expect(run.found[PNG]).toMatchObject({ snapshots: false, logged: false, usage: false });
    expect(run.storedPartTypes).not.toContain('file');
    expect(JSON.stringify(run.history)).toContain('скриншот.png');
    expect(run.writes).toEqual([]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent', 'agent']);
    // A reader looks; keeping a picture in the library is an editor's.
    expect(run.firstCall.tools).not.toContain('media_keep');
  },
};
