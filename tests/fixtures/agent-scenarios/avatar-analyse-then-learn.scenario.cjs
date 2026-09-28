'use strict';

/**
 * Review W3-18 F4: «разбери и научи на правках» in one message. The analysis
 * finds its proposal already stored and spends nothing (`spent: false`), so
 * the message's one paid step is still free and learning from edits runs.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const samples = [1, 2, 3].map((n) => ({
  id: `s-${n}`,
  code: `smp-0${n}`,
  title: `Пост ${n}`,
  origin: 'PASTE',
  usagePurpose: 'OWN_VOICE',
  charCount: 600,
}));

module.exports = {
  id: 'avatar-analyse-then-learn',
  title: 'Разбор без оплаты не занимает платный шаг: «научи на правках» идёт в том же сообщении',
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
        samples,
        run: { corpus: ['smp-01', 'smp-02', 'smp-03'], proposal: true, measuredAt: '2026-09-27T09:00:00.000Z' },
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
        [['text', 'Разбор уже был, а на правках научили.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs[0].output).toMatchObject({ ok: true, summary: { outcome: 'proposal', spent: false } });
    expect(turn.outputs[1].output).toMatchObject({ ok: true, card: { kind: 'avatar', id: AVATAR } });
    expect(run.writes).toEqual([['avatar.learned', AVATAR]]);
    expect(turn.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
  },
};
