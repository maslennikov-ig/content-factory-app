'use strict';

/**
 * A run still finishing on the server (`2q28.34`, «waiting»): the chat does
 * not start a second one; it says the analysis is finishing.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-analysis-waiting',
  title: 'Разбор ещё идёт на сервере — второй не запускается',
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
        run: { corpus: ['smp-01', 'smp-02', 'smp-03'], proposal: false, measuredAt: 'recent' },
      },
    ],
  },
  turns: [
    {
      say: 'Разбери мои тексты',
      model: [
        [['tool', 'avatar_analyse', { avatarId: AVATAR }]],
        [['text', 'Разбор ещё идёт — загляните через несколько минут.']],
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
    expect(run.reads).not.toContain('VoiceService.analysisStream');
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
