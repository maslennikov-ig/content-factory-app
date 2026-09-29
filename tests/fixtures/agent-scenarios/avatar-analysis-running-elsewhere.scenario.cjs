'use strict';

/**
 * `content-factory-next-kcxz.39` (review W3-18 F5): the avatar screen started
 * this avatar's analysis a moment ago — nothing is stored yet, so the resume
 * rule still reads `samples` — and the person says «разбери» in the chat. The
 * service's claim refuses the second start before anything is read or paid
 * for; the chat answers «already running», spends nothing, and the message's
 * paid step stays free for learning from edits.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-analysis-running-elsewhere',
  title: 'Разбор уже запущен с экрана — второй не стартует и не платит, платный шаг свободен',
  covers: ['avatar.analyse', 'avatar.learn'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: true,
        active: true,
        runningElsewhere: true,
        samples: [1, 2, 3].map((n) => ({ id: `s-${n}`, code: `smp-0${n}`, title: `Пост ${n}`, origin: 'PASTE', usagePurpose: 'OWN_VOICE', charCount: 600 })),
        fields: [{ key: 'TONE', text: 'Спокойно.', status: 'ACCEPTED' }],
        edits: 6,
        rules: [],
      },
    ],
  },
  turns: [
    {
      say: 'Разбери образцы и научи на правках',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['tool', 'avatar_learn', { avatarId: AVATAR }]],
        [['text', 'Разбор уже идёт с экрана аватара — загляните через несколько минут. На правках научили.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs[0].output).toMatchObject({
      ok: true,
      summary: { avatarId: AVATAR, outcome: 'running', spent: false },
    });
    expect(turn.outputs[0].output.card).toBeUndefined();
    // The start reached the service and was refused there: no numbers
    // written, no AI call for the analysis.
    expect(run.requests.filter(([name]) => name === 'voice.analysis')).toHaveLength(1);
    expect(run.writes).toEqual([['avatar.learned', AVATAR]]);
    // The only paid call is learning: the analysis gave its slot back.
    expect(turn.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
  },
};
