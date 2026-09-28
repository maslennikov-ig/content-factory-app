'use strict';

/**
 * Review W3-19 P3-5: the rename card tells what really changes. Slack does
 * not rename its bot from here — only the channel's name in the product
 * changes, and the card says so; nothing on the card promises «на самой
 * площадке».
 */
module.exports = {
  id: 'channel-bot-rename-slack',
  title: 'Переименовать бота Slack — карточка говорит, что имя сменится только у нас',
  role: 'ADMIN',
  covers: ['channel.bot.rename'],
  world: {
    channels: [
      { id: 's1', name: 'Команда в Slack', providerIdentifier: 'slack', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 0, profile: null },
    ],
  },
  turns: [
    { say: 'Переименуй бота в Slack в «Фабрика»', model: [[['tool', 'channel_bot_rename', { channelId: 's1', name: 'Фабрика' }]]] },
    { approve: true, model: [[['text', 'Теперь канал у нас называется «Фабрика»; в Slack имя бота прежнее.']]] },
  ],
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toBe(
      'Переименовать бота канала «Команда в Slack» в «Фабрика»: имя сменится только у нас — канал будет называться так же. В самом Slack имя бота останется прежним'
    );
    expect(ask.approvals[0].reason).not.toContain('на самой площадке');
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { channelId: 's1', renamed: true } });
    expect(run.writes).toEqual([['channel.renamed', 's1', 'Фабрика']]);
  },
};
