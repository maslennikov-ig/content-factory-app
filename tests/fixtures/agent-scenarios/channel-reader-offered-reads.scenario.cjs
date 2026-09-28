'use strict';

/**
 * A «Пользователь» reads channels but is offered nothing that changes,
 * connects or deletes one (spec §4.2; kcxz.19).
 */
module.exports = {
  id: 'channel-reader-offered-reads',
  title: 'Пользователь — каналы только на чтение',
  role: 'USER',
  covers: ['channel.open'],
  turns: [
    {
      say: 'Как у нас пишем в канал?',
      model: [[['tool', 'channel_open', { channelId: 'c1' }]], [['text', 'От 500 до 1000 знаков, немного эмодзи.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['channels_list', 'channel_open', 'channel_posts']));
    for (const tool of [
      'channel_writing',
      'channel_writing_remember',
      'channel_plan',
      'channel_times',
      'channel_autopilot',
      'channel_connect',
      'channel_bot_rename',
      'channel_disable',
      'channel_delete',
    ]) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs[0].output.summary.untrustedData.value.writing).toMatchObject({
      length: { min: 500, max: 1000, hardMax: 1500 },
      emoji: 'few',
      avatarId: 'a1',
      addressForm: 'avatar',
    });
    expect(run.writes).toEqual([]);
  },
};
