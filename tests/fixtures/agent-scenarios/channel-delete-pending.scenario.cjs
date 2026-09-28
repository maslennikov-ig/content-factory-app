'use strict';

/**
 * Deleting a channel asks first, and the card says it takes every post of the
 * channel with it; while the card waits, nothing is deleted (kcxz.19).
 */
const post = (id, state) => ({
  id,
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст',
  postId: `post-${id}`,
  state,
  date: '2031-03-04T07:00:00.000Z',
  plan: null,
});

module.exports = {
  id: 'channel-delete-pending',
  title: 'Удаление канала — карточка говорит «все посты канала», без «Да» ничего не удалено',
  role: 'ADMIN',
  covers: ['channel.delete'],
  endsPending: true,
  world: { adaptations: [post('a1', 'queued'), post('a2', 'draft')] },
  turns: [{ say: 'Удали канал про работу', model: [[['tool', 'channel_delete', { channelId: 'c1' }]]] }],
  check: (run) => {
    const [ask] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'channel_delete',
        reason:
          'Удалить канал «Канал про работу» и все его посты (2): черновики, брони и запланированные исчезнут из плана и не выйдут; уже опубликованное останется на площадке. Копии тех же постов в других каналах останутся',
      }),
    ]);
    expect(ask.outputs).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.channels.map((one) => one.id)).toEqual(['c1']);
    expect(run.world.adaptations).toHaveLength(2);
    expect(run.pendingCards).toEqual([expect.objectContaining({ kind: 'approval', toolName: 'channel_delete' })]);
  },
};
