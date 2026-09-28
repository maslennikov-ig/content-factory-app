'use strict';

const contract = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
  'apps/frontend/src/components/agents/agent.contract.ts'
);

/**
 * «Да» deletes the channel the door's way (`delete-channel.ts`): the channel
 * is looked up first, its posts go (this channel's only), then the channel; the
 * card the chat had opened for it is marked removed (kcxz.19).
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
  id: 'channel-delete-approved',
  title: 'Удаление канала — «Да»: сначала канал найден, потом его посты, потом он сам',
  role: 'ADMIN',
  covers: ['channel.open', 'channel.delete'],
  world: { adaptations: [post('a1'), post('a2')] },
  turns: [
    { say: 'Покажи канал', model: [[['tool', 'channel_open', { channelId: 'c1' }]], [['text', 'Вот он.']]] },
    { say: 'Удали его', model: [[['tool', 'channel_delete', { channelId: 'c1' }]]] },
    { approve: true, model: [[['text', 'Канал удалён вместе с двумя постами.']]] },
  ],
  check: (run) => {
    const answer = run.turns[2];
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { channelId: 'c1', deleted: true, posts: 2 },
    });
    // From the step's first read on (the approval card counted the posts before).
    const reads = run.reads.slice(run.reads.lastIndexOf('IntegrationService.getIntegrationById'));
    const order = reads.filter((name) =>
      ['IntegrationService.getIntegrationById', 'PostsService.deleteChannelPosts', 'IntegrationService.deleteChannel'].includes(name)
    );
    expect(order).toEqual([
      'IntegrationService.getIntegrationById',
      'PostsService.deleteChannelPosts',
      'IntegrationService.deleteChannel',
    ]);
    expect(run.writes).toEqual([
      ['post.deleted', 'post-a1'],
      ['post.deleted', 'post-a2'],
      ['channel.deleted', 'c1'],
    ]);
    expect(run.world.channels).toEqual([]);
    // The channel line opened earlier in the thread no longer offers to open it.
    const messages = contract.readThreadHistory(run.history).messages;
    expect([...contract.removedArtifactsOf(messages)]).toEqual(['channel:c1']);
  },
};
