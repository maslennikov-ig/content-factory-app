'use strict';

/** «Да» deletes the avatar with the door's semantics: the successor takes over. */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const OTHER = 'a2a2a2a2-0000-4000-8000-000000000002';

module.exports = {
  id: 'avatar-delete-approved',
  title: 'Удаление аватара — «Да», образцы и умолчание у преемника',
  covers: ['avatar.delete'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: true,
        active: true,
        samples: [{ id: 's-1', code: 'smp-01', title: 'Пост 1', origin: 'PASTE', charCount: 600 }],
      },
      { id: OTHER, name: 'Студия', kind: 'BRAND', isDefault: false, analysed: true, active: true, samples: [] },
    ],
  },
  turns: [
    {
      say: 'Удали аватар Игорь, пусть пишет Студия',
      model: [[['tool', 'avatar_delete', { avatarId: AVATAR, successorId: OTHER }]]],
    },
    { approve: true, model: [[['text', 'Удалили. Теперь по умолчанию пишет «Студия».']]] },
  ],
  check: (run) => {
    const [, answer] = run.turns;
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, deleted: true, successorId: OTHER },
    });
    expect(run.writes).toEqual([['avatar.deleted', AVATAR, OTHER]]);
    expect(run.world.avatars).toEqual([
      expect.objectContaining({ id: OTHER, isDefault: true, samples: [expect.objectContaining({ code: 'smp-01' })] }),
    ]);
  },
};
