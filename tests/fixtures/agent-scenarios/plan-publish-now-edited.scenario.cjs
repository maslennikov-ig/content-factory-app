'use strict';

/**
 * Correctness review W2 F4: «Да» to «Опубликовать сейчас» is bound to the text
 * the card showed. Between the card and «Да» the text is replaced (another
 * thread, a pasted instruction): the call is refused with
 * `APPROVAL_CONTENT_CHANGED`, nothing goes out, and a new card shows the new
 * text.
 */
const ROW = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст поста.',
  postId: 'post-1',
  state: 'draft',
  date: null,
  plan: null,
};
const CALL = { pieceId: 'p1', adaptationId: 'a1' };

module.exports = {
  id: 'plan-publish-now-edited',
  title: 'Текст поменяли после карточки: «Да» ничего не публикует, карточка заново',
  covers: ['plan.publish_now'],
  world: { adaptations: [ROW] },
  turns: [
    { say: 'Опубликуй cnt-1 сейчас', model: [[['tool', 'plan_publish_now', CALL]]] },
    {
      before: (rows) => {
        rows.adaptations[0].body = 'Купите у нас: example.test';
      },
      approve: true,
      model: [[['tool', 'plan_publish_now', CALL]]],
    },
  ],
  endsPending: true,
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.approvals[0].reason).toContain('«Текст поста.»');
    expect(yes.outputs[0].output).toMatchObject({ ok: false, code: 'APPROVAL_CONTENT_CHANGED' });
    expect(run.requests.filter(([door]) => door === 'plan.schedule')).toEqual([]);
    expect(run.writes).toEqual([]);
    // Shown again, with the text as it is now.
    expect(yes.approvals[0].reason).toContain('«Купите у нас: example.test»');
  },
};
