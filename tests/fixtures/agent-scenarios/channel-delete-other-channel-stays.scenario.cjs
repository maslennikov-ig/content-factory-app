'use strict';

/**
 * Review W3-19 P2-1 and P3-8: one count, and only this channel's posts.
 * `channel.open` and the delete card say the same number — every post of the
 * channel that deleting it removes — and after «Да» the posts of the other
 * channel stay. (That a post group spanning both channels keeps its other
 * channel's row is checked against the repository in
 * `agent-channel.review-w3-19.test.cjs`.)
 */
const post = (id, integrationId, state) => ({
  id,
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId,
  integrationName: integrationId,
  body: 'Текст',
  postId: `post-${id}`,
  state,
  date: '2031-03-04T07:00:00.000Z',
  plan: null,
});

module.exports = {
  id: 'channel-delete-other-channel-stays',
  title: 'Удаление канала — одно число постов в канале и на карточке; посты другого канала остаются',
  role: 'ADMIN',
  covers: ['channel.open', 'channel.delete'],
  world: {
    channels: [
      { id: 'c1', name: 'Канал про работу', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 1, profile: null },
      { id: 'c2', name: 'Заметки', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 1, profile: null },
    ],
    adaptations: [post('a1', 'c1', 'queued'), post('a2', 'c1', 'draft'), post('b1', 'c2', 'queued')],
  },
  turns: [
    { say: 'Сколько постов в канале про работу?', model: [[['tool', 'channel_open', { channelId: 'c1' }]], [['text', 'Два.']]] },
    { say: 'Удали его', model: [[['tool', 'channel_delete', { channelId: 'c1' }]]] },
    { approve: true, model: [[['text', 'Удалён.']]] },
  ],
  check: (run) => {
    const [open, ask, yes] = run.turns;
    // Drafts count too: the screen's list counts only published, queued and failed.
    expect(open.outputs[0].output.summary.untrustedData.value.posts).toBe(2);
    expect(ask.approvals[0].reason).toContain('все его посты (2)');
    expect(ask.approvals[0].reason).toContain('Копии тех же постов в других каналах останутся');
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { channelId: 'c1', deleted: true, posts: 2 } });
    expect(run.writes).toEqual([
      ['post.deleted', 'post-a1'],
      ['post.deleted', 'post-a2'],
      ['channel.deleted', 'c1'],
    ]);
    expect(run.world.channels.map((one) => one.id)).toEqual(['c2']);
    expect(run.world.adaptations.map((row) => row.postId)).toEqual(['post-b1']);
  },
};
