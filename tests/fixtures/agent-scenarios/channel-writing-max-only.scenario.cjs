'use strict';

/**
 * W3 live walk 28.09.2026, P2-C, and its recheck R-3 / correctness review F5:
 * «до 800 знаков» is a maximum alone, and it is the ceiling. The walk's model
 * sent `lengthMin: 1` with it, the service refused `IDEAL_MIN_TOO_SMALL`, and
 * the agent asked the person for a minimum; the first fix then kept the
 * stored hard maximum 1500 above the named 800 and stored the post floor 50
 * as a real minimum. Now:
 *
 * - the named maximum is the hard maximum too (a hard maximum named with it
 *   wins), and the answer says when a stored hard maximum changed;
 * - the minimum is the one named, else the stored one while it fits, else
 *   none (`null`); a named minimum under the post floor is none too, said in
 *   the answer, and the floor is never stored.
 *
 * No refusal, no question.
 */
module.exports = {
  id: 'channel-writing-max-only',
  title: 'Длина «до N знаков» — потолок, без выдуманного минимума, без отказа и без вопроса',
  covers: ['channel.writing'],
  turns: [
    {
      say: 'Пиши в канал коротко, до 800 знаков, и без эмодзи',
      model: [
        // As the walk's model sent it: a minimum of 1 for «no minimum».
        [['tool', 'channel_writing', { channelId: 'c1', length: 'range', lengthMin: 1, lengthMax: 800, emojiLevel: 'none' }]],
        [['text', 'Готово: до 800 знаков, без эмодзи.']],
      ],
    },
    {
      say: 'Нет, ещё короче — до 300',
      model: [[['tool', 'channel_writing', { channelId: 'c1', lengthMax: 300 }]], [['text', 'До 300 знаков.']]],
    },
    {
      say: 'Но не короче 200',
      model: [[['tool', 'channel_writing', { channelId: 'c1', lengthMin: 200 }]], [['text', 'От 200 до 300 знаков.']]],
    },
    {
      say: 'Передумал: до 2000',
      model: [[['tool', 'channel_writing', { channelId: 'c1', lengthMax: 2000 }]], [['text', 'От 200 до 2000 знаков.']]],
    },
  ],
  check: (run) => {
    const summaries = run.turns.map((turn) => turn.outputs[0].output.summary);
    expect(run.turns.map((turn) => turn.outputs[0].output.ok)).toEqual([true, true, true, true]);
    expect(summaries.map((summary) => summary.length)).toEqual([
      // «до 800» is the ceiling; the minimum of 1 means none.
      { lengthMin: null, lengthMax: 800, lengthHardMax: 800 },
      { lengthMin: null, lengthMax: 300, lengthHardMax: 300 },
      // A minimum alone keeps the maximum and its ceiling.
      { lengthMin: 200, lengthMax: 300, lengthHardMax: 300 },
      // The stored 200 fits under 2000 and stays.
      { lengthMin: 200, lengthMax: 2000, lengthHardMax: 2000 },
    ]);
    // A stored hard maximum that changed is said, not hidden.
    expect(summaries.map((summary) => summary.hardMaxChanged ?? null)).toEqual([
      { from: 1500, to: 800 },
      { from: 800, to: 300 },
      null,
      { from: 300, to: 2000 },
    ]);
    expect(summaries[0].minimum).toMatch(/^none — a minimum under the 50-character floor/);
    expect(summaries.slice(1).every((summary) => summary.minimum === undefined)).toBe(true);
    const bodies = run.requests.filter(([door]) => door === 'channel.writing-profile').map(([, , body]) => body);
    expect(bodies.map((body) => body.length)).toEqual([
      { idealMin: null, idealMax: 800, hardMax: 800 },
      { idealMin: null, idealMax: 300, hardMax: 300 },
      { idealMin: 200, idealMax: 300, hardMax: 300 },
      { idealMin: 200, idealMax: 2000, hardMax: 2000 },
    ]);
    expect(bodies[0]).toMatchObject({ lengthPolicy: 'range', emojiLevel: 'none' });
    expect(run.world.channels[0].profile.lengthPolicy).toEqual({ idealMin: 200, idealMax: 2000, hardMax: 2000 });
  },
};
