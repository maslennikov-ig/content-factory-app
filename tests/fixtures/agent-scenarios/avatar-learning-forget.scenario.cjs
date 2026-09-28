'use strict';

/**
 * Learning from edits is paid and admits its own operation; forgetting a rule
 * asks first, with the rule's words on the card.
 */
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';

module.exports = {
  id: 'avatar-learning-forget',
  title: 'Обучение на правках — платно; «забыть правило» — через карточку',
  covers: ['avatar.learning', 'avatar.learn', 'avatar.rule.forget'],
  world: {
    avatars: [
      {
        id: AVATAR,
        name: 'Игорь',
        kind: 'PERSON',
        isDefault: true,
        analysed: true,
        active: true,
        samples: [],
        edits: 6,
        rules: [{ id: 'r-0', text: 'Не начинать с «Итак».', pairs: 5, learnedAt: '2026-09-20T10:00:00.000Z' }],
      },
    ],
  },
  turns: [
    {
      say: 'Чему аватар научился? Если правок хватает — поучи его',
      model: [
        [['tool', 'avatar_learning', { avatarId: AVATAR }]],
        [['tool', 'avatar_learn', { avatarId: AVATAR }]],
        [['text', 'Научили: теперь правил два.']],
      ],
    },
    {
      say: 'Забудь правило про «Итак»',
      model: [[['tool', 'avatar_rule_forget', { avatarId: AVATAR, ruleId: 'r-0' }]]],
    },
    { approve: true, model: [[['text', 'Забыли.']]] },
  ],
  check: (run) => {
    const [learn, ask, answer] = run.turns;
    expect(learn.outputs[0].output.summary.untrustedData.value).toMatchObject({ pending: 6, minPairs: 5 });
    expect(learn.outputs[1].output).toMatchObject({ ok: true, card: { kind: 'avatar', id: AVATAR } });
    expect(learn.outputs[1].output.summary.untrustedData.value.rules).toHaveLength(2);
    expect(learn.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'avatar_rule_forget',
        reason:
          'Забыть правило аватара «Игорь» «Не начинать с «Итак».»: оно перестанет действовать, а правки, из которых оно выведено, заново не разберутся',
      }),
    ]);
    expect(answer.outputs[0].output).toMatchObject({ ok: true, summary: { ruleId: 'r-0', forgotten: true } });
    expect(run.writes).toEqual([
      ['avatar.learned', AVATAR],
      ['avatar.rule.forgotten', AVATAR, 'r-0'],
    ]);
  },
};
