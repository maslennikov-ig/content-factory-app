'use strict';

/**
 * `content-factory-next-kcxz.40` (review W3-18 F9): the analysis saved its
 * numbers and then the AI did not answer. The run is marked as ended, so a
 * minute later it no longer reads as «still finishing»: the chat says the
 * proposal is missing, and after the person agrees `rerun` pays once.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-analysis-failed-rerun',
  title: 'Разбор упал после чисел — не «ещё идёт», повтор после согласия работает',
  covers: ['avatar.analyse'],
  world: {
    assistFails: 1,
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: false,
        active: false,
        samples: [1, 2, 3].map((n) => ({ id: `s-${n}`, code: `smp-0${n}`, title: `Пост ${n}`, origin: 'PASTE', charCount: 600 })),
      },
    ],
  },
  turns: [
    {
      say: 'Разбери мои тексты',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['text', 'ИИ не ответил — числа сохранены, предложения нет.']],
      ],
    },
    {
      say: 'Что с разбором?',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['text', 'Числа сохранены, а предложение ИИ не закончил. Запустить заново? Это около пяти минут.']],
      ],
    },
    {
      say: 'Да, запусти',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR, rerun: true }]],
        [['text', 'Готово — предложение рядом.']],
      ],
    },
  ],
  check: (run) => {
    const [failed, ask, again] = run.turns;
    expect(failed.outputs[0].output).toMatchObject({ ok: false, code: 'VOICE_ASSIST_UNAVAILABLE' });
    // The run is over, not «running»: nothing is paid until the person agrees.
    expect(ask.outputs[0].output).toMatchObject({ ok: true, summary: { outcome: 'proposal-missing', spent: false } });
    expect(ask.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(again.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, outcome: 'proposal', spent: true },
      card: { kind: 'avatar', id: AVATAR },
    });
    expect(again.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    expect(run.requests.filter(([name]) => name === 'voice.analysis')).toHaveLength(2);
    expect(run.writes).toEqual([
      ['avatar.measured', AVATAR, 3],
      ['avatar.analysis-failed', AVATAR],
      ['avatar.measured', AVATAR, 3],
      ['avatar.proposed', AVATAR],
    ]);
  },
};
