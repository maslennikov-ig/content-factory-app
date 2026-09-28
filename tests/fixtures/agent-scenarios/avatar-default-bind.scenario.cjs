'use strict';

/**
 * The default avatar and a channel that writes as an avatar — the second
 * through the channel card's own door, the rest of the card untouched.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const BRAND = 'a2a2a2a2-0000-4000-8000-000000000002';

module.exports = {
  id: 'avatar-default-bind',
  title: 'Аватар по умолчанию и аватар канала',
  covers: ['avatar.list', 'avatar.default', 'avatar.bind'],
  world: {
    avatars: [
      { id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] },
      { id: BRAND, name: 'Студия', kind: 'BRAND', isDefault: false, analysed: true, active: true, samples: [] },
    ],
  },
  turns: [
    {
      say: 'Пусть по умолчанию пишет Студия, а канал про работу — Игорь',
      model: [
        [['tool', 'avatar_list', {}]],
        [
          ['tool', 'avatar_default', { avatarId: BRAND }],
          ['tool', 'avatar_bind', { avatarId: AVATAR, channelId: 'c1' }],
        ],
        [['text', 'Готово.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    const list = turn.outputs[0].output.summary;
    expect(list.untrustedData.sources).toEqual(['workspace-text']);
    expect(list.untrustedData.value).toMatchObject({
      defaultAvatarId: AVATAR,
      avatars: [
        { id: AVATAR, kind: 'person', isDefault: true, writes: true },
        { id: BRAND, kind: 'brand', isDefault: false, writes: true },
      ],
    });
    expect(turn.outputs.slice(1).map(({ output }) => output.card)).toEqual([
      { kind: 'avatar', id: BRAND },
      { kind: 'avatar', id: AVATAR },
    ]);
    // The channel card, rewritten with only the avatar changed.
    const [[, channel, body]] = run.requests.filter(([name]) => name === 'channel.writing-profile');
    expect(channel).toBe('c1');
    expect(body).toMatchObject({ brandProfileId: AVATAR, emojiLevel: 'few', notes: 'Пишем коротко.' });
    expect(run.writes).toEqual([
      ['avatar.default', BRAND],
      ['channel.profile.updated', 'c1'],
    ]);
  },
};
