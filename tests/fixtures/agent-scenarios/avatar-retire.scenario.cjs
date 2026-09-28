'use strict';

/** Taking the voice out of use asks first and says it can be restored. */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-retire',
  title: 'Вывести голос из использования — через карточку, с тем, что останется',
  covers: ['avatar.retire'],
  world: {
    avatars: [{ id: AVATAR, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] }],
  },
  turns: [
    { say: 'Выведи голос из использования', model: [[['tool', 'avatar_retire', {}]]] },
    { approve: true, model: [[['text', 'Голос выведен: пишем нейтрально.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'avatar_retire',
        reason:
          'Вывести из использования голос аватара «Игорь»: он перестанет писать, тексты пойдут в нейтральном стиле. Версии и образцы останутся — вернуть голос можно на экране аватара',
      }),
    ]);
    expect(ask.outputs).toEqual([]);
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, retired: true },
      card: { kind: 'avatar', id: AVATAR },
    });
    expect(run.writes).toEqual([['avatar.retired', AVATAR]]);
  },
};
