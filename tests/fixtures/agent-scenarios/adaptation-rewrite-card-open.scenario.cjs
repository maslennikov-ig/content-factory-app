'use strict';

/**
 * `kcxz.32` N2 (b), (c): one open card of proposed changes per text.
 *
 * Live recheck 27.09.2026: to «Спасибо, сейчас посмотрю правку» the model ran
 * the rewrite again (two paid operations) and a second card for the same
 * sentence opened; once the first was applied, the second quoted text that no
 * longer existed and stayed answerable. The skill now says a thanks is not a
 * request (c); the hooks make it hold: while a card of proposed changes to a
 * text waits, a new check or rewrite of that text is refused before anything
 * is spent, and the model is told to point at the open card (b). Answering
 * the open card is not a new proposal; once it is answered, a rewrite runs.
 * Final check 27.09 (F5, kcxz.36): the tool line already told the person the
 * card waits and the model said it again; the refusal now tells the model the
 * person sees it and not to repeat it. Recheck 27.09 (R5, kcxz.38): the model
 * still restated it («Повторную проверку сейчас не запустили.»), so a step
 * whose every call is refused that way now ends the turn natively (Mastra
 * `stopWhen`): no model step runs after it. The scripted «Хорошо.» after the
 * refusal is never reached. A message that also asks for something else
 * (another tool in the same step) is answered as ever.
 */
const ROW = { id: 'a1', pieceId: 'p1', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Канал про работу', body: 'Текст поста.', state: 'draft', mediaId: null };
const CHANGES = [
  { id: 'w1', basket: 'show', excerpt: 'Текст поста', replacement: 'Пост', why: 'Короче' },
];
const REWRITE = { pieceId: 'p1', adaptationId: 'a1', instruction: 'проще' };

module.exports = {
  id: 'adaptation-rewrite-card-open',
  title: 'Пока карточка правок открыта, тот же текст заново не переписывают',
  covers: ['adaptation.rewrite', 'adaptation.review'],
  world: { adaptations: [ROW], reviewChanges: CHANGES },
  turns: [
    { say: 'Перепиши пост для Telegram проще', model: [[['tool', 'adaptation_rewrite', REWRITE]]] },
    {
      // The live model's slip: a thanks read as «run it again».
      say: 'Спасибо, сейчас посмотрю правку',
      model: [
        [['tool', 'adaptation_rewrite', REWRITE]],
        // kcxz.38 (R5): never reached — the turn ends on the refusal.
        [['text', 'Повторную проверку сейчас не запустили.']],
      ],
    },
    {
      say: 'А проверь ещё факты в этом посте',
      model: [
        [
          ['tool', 'adaptation_review', { pieceId: 'p1', adaptationId: 'a1', check: 'facts' }],
          // Another question in the same message: the step is not all
          // refusals, so the model goes on and answers it.
          ['tool', 'plan_ahead', {}],
        ],
        [['text', 'В плане ничего нет.']],
      ],
    },
    { resume: { changeIds: ['w1'] }, resumeCardOfTurn: 1, model: [[['text', 'Приняли правку.']]] },
    {
      say: 'Перепиши ещё раз, короче',
      model: [[['tool', 'adaptation_rewrite', { ...REWRITE, instruction: 'короче' }]]],
    },
    { resume: { changeIds: [] }, model: [[['text', 'Оставили как есть.']]] },
  ],
  check: (run) => {
    const [ask, thanks, facts, answer, again] = run.turns;
    expect(ask.suspended).toHaveLength(1);
    // The thanks and the second check: refused before any paid step, the
    // model is told why and where the card is.
    for (const turn of [thanks, facts]) {
      expect(turn.outputs[0]).toEqual({
        toolName: turn === thanks ? 'adaptation_rewrite' : 'adaptation_review',
        output: expect.objectContaining({ ok: false, code: 'PROPOSAL_CARD_OPEN' }),
      });
      expect(turn.suspended).toEqual([]);
      expect(turn.admissions.map(([operation]) => operation)).toEqual(['agent']);
    }
    // kcxz.38 (R5): the refusal alone ends the turn — one model step, no text.
    expect(thanks.outputs).toHaveLength(1);
    expect(thanks.modelCalls).toBe(1);
    expect(thanks.text).toBe('');
    // With another tool in the same step the model goes on to answer it.
    expect(facts.outputs.map((one) => one.toolName)).toEqual(['adaptation_review', 'plan_ahead']);
    expect(facts.modelCalls).toBe(2);
    expect(facts.text).toBe('В плане ничего нет.');
    expect(thanks.outputs[0].output.reason).toMatch(/card above waits/);
    expect(thanks.outputs[0].output.reason).toMatch(/Do not repeat or rephrase that/);
    // The open card answers as ever, and a rewrite after it runs again.
    expect(answer.outputs[0].output.summary).toMatchObject({ outcome: 'applied', applied: 1 });
    expect(again.suspended).toHaveLength(1);
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p1', 'a1', { instruction: 'проще' }],
      ['piece.review', 'p1', 'a1', { instruction: 'короче' }],
    ]);
    expect(run.writes).toEqual([['piece.review.accepted', 'p1', ['w1']]]);
  },
};
