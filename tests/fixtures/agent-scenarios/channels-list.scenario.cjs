'use strict';

/** A free read: the channels with their ids, as data, nothing written. */
module.exports = {
  id: 'channels-list',
  title: 'Список каналов',
  covers: ['channels.list'],
  turns: [
    {
      say: 'Какие у нас каналы?',
      model: [[['tool', 'channels_list', {}]], [['text', 'Один канал в Telegram.']]],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs).toEqual([
      {
        toolName: 'channels_list',
        output: expect.objectContaining({ ok: true, capability: 'channels.list' }),
      },
    ]);
    const { value } = turn.outputs[0].output.summary.untrustedData;
    expect(value.channels).toEqual([
      {
        id: 'c1',
        name: 'Канал про работу',
        platform: 'telegram',
        disabled: false,
        refreshNeeded: false,
        posts: 2,
      },
    ]);
    expect(run.writes).toEqual([]);
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
