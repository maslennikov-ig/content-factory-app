'use strict';

/**
 * Review W3-19 P3-2: the model reuses the id of a channel deleted earlier.
 * The card says there is no such channel, and «Да» changes nothing either:
 * the run looks the channel up in the workspace's list first, as the card
 * does, instead of finding the deleted row by id and deleting it again with
 * the posts still attached to it.
 */
module.exports = {
  id: 'channel-delete-already-deleted',
  title: 'Удаление уже удалённого канала — карточка «такого нет», и «Да» ничего не трогает',
  role: 'ADMIN',
  covers: ['channel.delete'],
  world: {
    deletedChannels: [
      { id: 'c9', name: 'Старый канал', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 0, profile: null },
    ],
    adaptations: [
      {
        id: 'a9',
        pieceId: 'p1',
        kind: 'post',
        platform: 'telegram',
        integrationId: 'c9',
        integrationName: 'Старый канал',
        body: 'Текст',
        postId: 'post-a9',
        state: 'draft',
        date: null,
        plan: null,
      },
    ],
  },
  turns: [
    { say: 'Удали старый канал', model: [[['tool', 'channel_delete', { channelId: 'c9' }]]] },
    { approve: true, model: [[['text', 'Такого канала уже нет.']]] },
  ],
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toBe('Канала c9 в этом пространстве нет — ничего не изменится');
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'CHANNEL_NOT_FOUND' });
    expect(run.reads).not.toContain('IntegrationService.getIntegrationById');
    expect(run.reads).not.toContain('PostsService.deleteChannelPosts');
    expect(run.writes).toEqual([]);
    expect(run.world.adaptations).toHaveLength(1);
  },
};
