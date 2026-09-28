'use strict';

/** «Нет» on the delete card: the channel and its posts stay (kcxz.19). */
module.exports = {
  id: 'channel-delete-declined',
  title: 'Удаление канала — «Нет», канал и посты на месте',
  role: 'ADMIN',
  covers: ['channel.delete'],
  turns: [
    { say: 'Удали канал про работу', model: [[['tool', 'channel_delete', { channelId: 'c1' }]]] },
    { approve: false, model: [[['text', 'Не удаляем.']]] },
  ],
  check: (run) => {
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.channels.map((one) => one.id)).toEqual(['c1']);
  },
};
