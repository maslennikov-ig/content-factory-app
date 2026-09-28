'use strict';

/**
 * Switching a channel off and renaming its bot on the platform ask first
 * (kcxz.19). The rename goes through the service step the channel page's
 * «Изменить бота» door calls, with the name only; a platform that cannot
 * rename a bot (Telegram) is refused without touching anything.
 */
module.exports = {
  id: 'channel-disable-bot',
  title: 'Выключить канал и переименовать бота — каждое после «Да»; Telegram бота не переименует',
  role: 'ADMIN',
  covers: ['channel.disable', 'channel.bot.rename'],
  world: {
    channels: [
      { id: 'c1', name: 'Канал про работу', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 0, profile: null },
      { id: 'd1', name: 'Сервер команды', providerIdentifier: 'discord', disabled: false, refreshNeeded: false, planMode: 'reserve', posts: 0, profile: null },
    ],
  },
  turns: [
    { say: 'Выключи канал про работу', model: [[['tool', 'channel_disable', { channelId: 'c1' }]]] },
    { approve: true, model: [[['text', 'Выключили.']]] },
    { say: 'Переименуй бота в Discord в «Фабрика»', model: [[['tool', 'channel_bot_rename', { channelId: 'd1', name: 'Фабрика' }]]] },
    { approve: true, model: [[['text', 'Бот теперь «Фабрика».']]] },
    { say: 'И в Telegram тоже', model: [[['tool', 'channel_bot_rename', { channelId: 'c1', name: 'Фабрика' }]]] },
    { approve: true, model: [[['text', 'Telegram не даёт переименовать бота отсюда.']]] },
  ],
  check: (run) => {
    const [off, offYes, rename, renameYes, , telegramYes] = run.turns;
    expect(off.approvals[0].reason).toBe(
      'Выключить канал «Канал про работу»: пока он выключен, ничего в него не выходит. Запланированные посты, чьё время придёт в это время, не будут ждать — они завершатся ошибкой, и их придётся поставить заново. Включить обратно можно на странице канала'
    );
    expect(offYes.outputs[0].output).toMatchObject({ ok: true, summary: { channelId: 'c1', disabled: true } });
    expect(rename.approvals[0].reason).toBe(
      'Переименовать бота канала «Сервер команды» в «Фабрика» на самой площадке (discord). Канал у нас тоже будет называться «Фабрика»'
    );
    expect(renameYes.outputs[0].output).toMatchObject({ ok: true, summary: { channelId: 'd1', renamed: true } });
    expect(run.requests.filter(([door]) => door === 'channel.nickname')).toEqual([
      ['channel.nickname', 'd1', { name: 'Фабрика' }],
    ]);
    expect(telegramYes.outputs[0].output).toMatchObject({ ok: false, code: 'CHANNEL_BOT_RENAME_UNSUPPORTED' });
    expect(run.writes).toEqual([
      ['channel.disabled', 'c1'],
      ['channel.renamed', 'd1', 'Фабрика'],
    ]);
  },
};
