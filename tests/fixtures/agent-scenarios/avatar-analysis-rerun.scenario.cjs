'use strict';

/**
 * A stored run whose proposal never arrived (`2q28.34`, «analysis»): nothing
 * is paid until the person agrees; then `rerun` pays once.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-analysis-rerun',
  title: 'Разбор без предложения — повтор только после согласия, один раз',
  covers: ['avatar.analyse'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: false,
        active: false,
        samples: [1, 2, 3].map((n) => ({ id: `s-${n}`, code: `smp-0${n}`, title: `Пост ${n}`, origin: 'PASTE', charCount: 600 })),
        run: { corpus: ['smp-01', 'smp-02', 'smp-03'], proposal: false, measuredAt: '2026-09-20T09:00:00.000Z' },
      },
    ],
  },
  turns: [
    {
      say: 'Что с разбором?',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['text', 'Числа сохранены, а предложение ИИ не закончил. Запустить разбор заново? Это около пяти минут.']],
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
    const [ask, again] = run.turns;
    expect(ask.outputs[0].output).toMatchObject({ ok: true, summary: { outcome: 'proposal-missing', spent: false } });
    expect(ask.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(again.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, outcome: 'proposal', spent: true },
      card: { kind: 'avatar', id: AVATAR },
    });
    expect(again.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    expect(run.requests.filter(([name]) => name === 'voice.analysis')).toHaveLength(1);
  },
};
