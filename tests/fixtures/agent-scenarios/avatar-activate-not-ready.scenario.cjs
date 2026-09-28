'use strict';

/** The avatar's id: a UUID, as Prisma makes them (review W3-18 F10). */
const A1 = 'a1a1a1a1-0000-4000-8000-0000000000a1';

/**
 * An avatar that is not ready is not offered for consent (kcxz.29, D7): the
 * live walk of 27.09.2026 asked for consent and a name on an avatar with an
 * empty line, and only then refused with a raw `VOICE_FIELDS_INCOMPLETE`.
 * Now the readiness is read first, the refusal keeps its code and reason, and
 * no question card is shown.
 */
module.exports = {
  id: 'avatar-activate-not-ready',
  title: 'Неготовый аватар — отказ с причиной, без карточки согласия',
  covers: ['avatar.activate'],
  world: {
    avatars: [
      { id: A1, name: null, isDefault: true, analysed: false, kind: 'PERSON', active: false, ready: false },
    ],
  },
  turns: [
    {
      say: 'Включи аватар',
      model: [
        [['tool', 'avatar_activate', { avatarId: A1, mode: 'manual' }]],
        [['text', 'Аватар ещё не готов: одна строка пуста. Допишите её на экране аватара.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.suspended).toEqual([]);
    expect(turn.outputs).toEqual([
      {
        toolName: 'avatar_activate',
        output: expect.objectContaining({ ok: false, code: 'VOICE_FIELDS_INCOMPLETE' }),
      },
    ]);
    expect(run.writes).toEqual([]);
    expect(run.world.avatars[0]).toMatchObject({ id: A1, active: false });
    expect(run.pendingCards).toEqual([]);
  },
};
