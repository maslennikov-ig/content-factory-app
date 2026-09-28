'use strict';

/**
 * Deleting an avatar names its successor on the card; while the card waits,
 * nothing is deleted.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const OTHER = 'a2a2a2a2-0000-4000-8000-000000000002';

module.exports = {
  id: 'avatar-delete-pending',
  title: 'Удаление аватара — карточка называет преемника, без «Да» ничего не удалено',
  covers: ['avatar.delete'],
  endsPending: true,
  world: {
    avatars: [
      { id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] },
      { id: OTHER, name: 'Студия', kind: 'BRAND', isDefault: false, analysed: true, active: true, samples: [] },
    ],
  },
  turns: [
    {
      say: 'Удали аватар Игорь, пусть пишет Студия',
      model: [[['tool', 'avatar_delete', { avatarId: AVATAR, successorId: OTHER }]]],
    },
  ],
  check: (run) => {
    const [ask] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'avatar_delete',
        reason:
          'Удалить аватар «Игорь» насовсем вместе с правками, на которых он учился; образцы перейдут к аватару «Студия»',
      }),
    ]);
    expect(run.writes).toEqual([]);
    expect(run.world.avatars).toHaveLength(2);
    expect(run.pendingCards).toEqual([
      expect.objectContaining({ kind: 'approval', toolName: 'avatar_delete' }),
    ]);
  },
};
