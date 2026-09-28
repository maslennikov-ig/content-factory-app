'use strict';

/**
 * Review W3-18 F1: «Да» on a card is for the avatar the card named. The card
 * for `avatar_retire({})` names the default, «Игорь»; before the person
 * answers, another editor makes «Бренд» the default. The call is refused with
 * `APPROVAL_CONTENT_CHANGED`, nothing is taken out of use, and the card is
 * shown again naming «Бренд».
 */
const PERSON = 'a1a1a1a1-0000-4000-8000-000000000001';
const BRAND = 'a1a1a1a1-0000-4000-8000-000000000002';

module.exports = {
  id: 'avatar-retire-default-changed',
  title: 'Аватар по умолчанию сменили после карточки: «Да» ничего не выводит, карточка заново',
  covers: ['avatar.retire'],
  world: {
    avatars: [
      { id: PERSON, name: 'Игорь', kind: 'PERSON', isDefault: true, analysed: true, active: true, samples: [] },
      { id: BRAND, name: 'Бренд', kind: 'BRAND', isDefault: false, analysed: true, active: true, samples: [] },
    ],
  },
  turns: [
    { say: 'Выведи голос из использования', model: [[['tool', 'avatar_retire', {}]]] },
    {
      // Another editor changes the default on the avatars screen.
      before: (rows) => {
        for (const one of rows.avatars) one.isDefault = one.id === BRAND;
      },
      approve: true,
      model: [[['tool', 'avatar_retire', {}]]],
    },
  ],
  endsPending: true,
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toContain('аватара «Игорь»');
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'APPROVAL_CONTENT_CHANGED' });
    expect(run.writes).toEqual([]);
    expect(run.world.avatars.every((one) => one.active)).toBe(true);
    // Shown again, naming the avatar it would act on now.
    expect(yes.approvals[0].reason).toContain('аватара «Бренд»');
  },
};
