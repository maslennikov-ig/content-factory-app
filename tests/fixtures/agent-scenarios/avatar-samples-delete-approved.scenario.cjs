'use strict';

/** Deleting samples waits on its card and says the consequence; «Да» runs it once. */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-samples-delete-approved',
  title: 'Удаление образцов — последствия на карточке, «Да» удаляет',
  covers: ['avatar.samples.delete'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: true,
        active: true,
        samples: [1, 2].map((n) => ({ id: `s-${n}`, code: `smp-0${n}`, title: `Пост ${n}`, origin: 'PASTE', charCount: 600 })),
      },
    ],
  },
  turns: [
    {
      say: 'Удали образец smp-02',
      model: [[['tool', 'avatar_samples_delete', { avatarId: AVATAR, codes: ['smp-02'] }]]],
    },
    { approve: true, model: [[['text', 'Удалили smp-02.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'avatar_samples_delete',
        reason:
          'Удалить насовсем 1 образец аватара «Игорь» (smp-02 «Пост 2»): его текст уйдёт из набора, а разбор, который его читал, будет помечен устаревшим',
      }),
    ]);
    expect(ask.outputs).toEqual([]);
    expect(answer.outputs[0].output).toMatchObject({ ok: true, summary: { avatarId: AVATAR, deleted: 1 } });
    expect(run.writes).toEqual([['avatar.samples.deleted', ['smp-02']]]);
    expect(run.world.avatars[0].samples.map((one) => one.code)).toEqual(['smp-01']);
  },
};
