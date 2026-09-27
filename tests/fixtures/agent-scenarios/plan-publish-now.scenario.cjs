'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * «Опубликовать сейчас» does not go out without «Да» (spec §1.4): the card
 * names the piece and the channel from the stored rows; «Нет» leaves the post
 * as it was; «Да» sends the page's own `buildSchedulePayload({ now: true })`
 * once.
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
  date: '2031-03-04T07:00:00.000Z',
  plan: { status: 'reserved', date: '2031-03-04T07:00:00.000Z', autopilot: false, current: true },
};
const CALL = { pieceId: 'p1', adaptationId: 'a1' };

module.exports = {
  id: 'plan-publish-now',
  title: 'Опубликовать сейчас: «нет» оставляет пост, «да» — один раз',
  covers: ['plan.publish_now'],
  world: { adaptations: [ROW] },
  turns: [
    { say: 'Опубликуй cnt-1 сейчас', model: [[['tool', 'plan_publish_now', CALL]]] },
    { approve: false, model: [[['text', 'Не публикуем, пост остался бронью.']]] },
    { say: 'Всё-таки опубликуй', model: [[['tool', 'plan_publish_now', CALL]]] },
    { approve: true, model: [[['text', 'Опубликовали.']]] },
  ],
  check: (run) => {
    const [ask, no, askAgain, yes] = run.turns;
    const reason =
      // The text that goes out, quoted (review W2 F4).
      'Опубликовать сейчас пост заготовки cnt-1 в канале «Канал про работу»: он уйдёт в канал сразу. «Текст поста.»';
    expect(ask.approvals).toEqual([expect.objectContaining({ toolName: 'plan_publish_now', reason })]);
    expect(askAgain.approvals).toEqual([expect.objectContaining({ toolName: 'plan_publish_now', reason })]);
    // Nothing reached the door before «Да», and «Нет» changed nothing.
    expect(ask.outputs).toEqual([]);
    expect(no.data.filter((part) => part.type === 'data-plan')).toEqual([]);
    expect(run.requests.filter(([door]) => door === 'plan.schedule')).toEqual([
      ['plan.schedule', 'p1', 'a1', screenPieces().buildSchedulePayload({ now: true })],
    ]);
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { state: 'scheduled' }, card: { kind: 'plan', id: 'a1' } });
    expect(run.writes).toEqual([['plan.scheduled', 'a1', 'now']]);
    expect(run.pending).toBe(0);
  },
};
