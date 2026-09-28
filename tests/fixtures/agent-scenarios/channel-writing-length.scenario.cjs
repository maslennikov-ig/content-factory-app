'use strict';

/**
 * Review W3-19 P3-7: length numbers mean a range, and what is not named
 * stays. «400–800» without `length` changes the range and keeps the stored
 * hard maximum; a hard maximum alone keeps the ideal range; numbers beside
 * another length rule are refused with their own code and change nothing.
 */
module.exports = {
  id: 'channel-writing-length',
  title: 'Длина в карточке «Как пишем» — числа значат диапазон, жёсткий предел сохраняется, противоречие отказано',
  covers: ['channel.writing'],
  turns: [
    {
      say: 'Пиши в канал 400–800 знаков, без эмодзи',
      model: [
        [['tool', 'channel_writing', { channelId: 'c1', lengthMin: 400, lengthMax: 800, emojiLevel: 'none' }]],
        [['text', 'Готово: 400–800 знаков, без эмодзи.']],
      ],
    },
    {
      say: 'И никогда не длиннее 1200',
      model: [[['tool', 'channel_writing', { channelId: 'c1', lengthHardMax: 1200 }]], [['text', 'Не длиннее 1200.']]],
    },
    {
      say: 'Пусть длину решает сама, но от 300',
      model: [
        [['tool', 'channel_writing', { channelId: 'c1', length: 'auto', lengthMin: 300 }]],
        [['text', 'Либо сама, либо от 300 — выберите одно.']],
      ],
    },
  ],
  check: (run) => {
    const [range, hard, conflict] = run.turns;
    expect(range.outputs[0].output).toMatchObject({
      ok: true,
      summary: { channelId: 'c1', changed: ['length', 'emojiLevel'] },
    });
    expect(hard.outputs[0].output).toMatchObject({ ok: true, summary: { changed: ['length'] } });
    expect(conflict.outputs[0].output).toMatchObject({ ok: false, code: 'CHANNEL_WRITING_LENGTH_CONFLICT' });
    const bodies = run.requests.filter(([door]) => door === 'channel.writing-profile').map(([, , body]) => body);
    expect(bodies.map((body) => body.length)).toEqual([
      // The world's card is 500–1000 with a hard maximum of 1500.
      { idealMin: 400, idealMax: 800, hardMax: 1500 },
      { idealMin: 400, idealMax: 800, hardMax: 1200 },
    ]);
    expect(bodies[0]).toMatchObject({ lengthPolicy: 'range', emojiLevel: 'none' });
    expect(run.writes).toEqual([
      ['channel.profile.updated', 'c1'],
      ['channel.profile.updated', 'c1'],
    ]);
    expect(run.world.channels[0].profile.lengthPolicy).toEqual({ idealMin: 400, idealMax: 800, hardMax: 1200 });
  },
};
