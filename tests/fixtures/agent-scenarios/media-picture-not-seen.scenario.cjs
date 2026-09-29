'use strict';

const { mediaRows } = require('./media-rows.cjs');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * The workspace's model does not take pictures (review W4-25 vision F5, F7):
 * the provider refuses the step that carried one. The person reads that the
 * AI could not look at the picture — not «the administrator's settings» —
 * and the provider's error, which quotes the whole request with the picture,
 * leaves no bytes in the log or the storage.
 */
module.exports = {
  id: 'media-picture-not-seen',
  title: 'Модель не принимает картинки — «ИИ не смог посмотреть картинку»',
  covers: [],
  skills: ['media'],
  role: 'USER',
  failedTurns: [0, 1],
  world: mediaRows(),
  lookFor: [PNG],
  turns: [
    {
      say: 'Что на картинке?',
      pictures: [{ name: 'схема.png', base64: PNG }],
      model: [[['reject', 400]]],
    },
    {
      // The picture rides in the first step only (F4): a refusal of a later
      // step is not about it, and is the settings' one.
      say: 'А эту?',
      pictures: [{ name: 'схема-2.png', base64: PNG }],
      model: [[['tool', 'skill', { name: 'media' }]], [['reject', 400]]],
    },
  ],
  check: (run) => {
    const [looked, later] = run.turns;
    expect(looked.errors).toEqual(['AGENT_PICTURE_NOT_SEEN']);
    expect(later.errors).toEqual(['AI_PROVIDER_REJECTED']);
    expect(run.prompts.map((prompt) => [prompt.turn, prompt.user.includes('[file]')])).toEqual([
      [0, true],
      [1, true],
      [1, false],
    ]);
    expect(run.found[PNG].model).toBe(true);
    expect(run.found[PNG]).toMatchObject({ stored: false, snapshots: false, logged: false, usage: false });
    // Mastra logged the provider's error with the request it quoted — as
    // the console prints objects, the picture two levels down is not there.
    expect(run.loggedRequest).toBe(true);
    // A failed turn is not a success, and nothing was written.
    expect(looked.admissions.map(([operation, , , status]) => [operation, status])).toEqual([['agent', 'failed']]);
    expect(run.writes).toEqual([]);
  },
};
