'use strict';

/**
 * Review W3-19 P3-1: «Да» on the delete card is for the posts the card
 * counted. The card says (2); before the person answers, a third post is
 * written for the channel. The call is refused with `APPROVAL_CONTENT_CHANGED`,
 * nothing is deleted, and the card is shown again with (3).
 */
const post = (id) => ({
  id,
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст',
  postId: `post-${id}`,
  state: 'queued',
  date: '2031-03-04T07:00:00.000Z',
  plan: null,
});

module.exports = {
  id: 'channel-delete-posts-changed',
  title: 'Удаление канала — постов стало больше после карточки: «Да» ничего не удаляет, карточка заново',
  role: 'ADMIN',
  covers: ['channel.delete'],
  world: { adaptations: [post('a1'), post('a2')] },
  turns: [
    { say: 'Удали канал про работу', model: [[['tool', 'channel_delete', { channelId: 'c1' }]]] },
    {
      // An autopilot or another member adds a post to the channel.
      before: (rows) => {
        rows.adaptations.push(post('a3'));
      },
      approve: true,
      model: [[['tool', 'channel_delete', { channelId: 'c1' }]]],
    },
  ],
  endsPending: true,
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toContain('все его посты (2)');
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'APPROVAL_CONTENT_CHANGED' });
    expect(run.writes).toEqual([]);
    expect(run.world.channels.map((one) => one.id)).toEqual(['c1']);
    expect(run.world.adaptations).toHaveLength(3);
    // Shown again, counting what would go now.
    expect(yes.approvals[0].reason).toContain('все его посты (3)');
  },
};
