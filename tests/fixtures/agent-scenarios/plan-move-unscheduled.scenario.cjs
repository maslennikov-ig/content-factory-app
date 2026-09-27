'use strict';

/**
 * `plan.move` reads the post as queued, the person takes it off the schedule
 * before the move is written (`content-factory-next-kcxz.38`, review P3-2).
 * The move asks the service to move only from the queue, so the draft is
 * refused with `POST_STATE_CHANGED` in the calendar's words: it is never
 * moved as a draft and then reported «scheduled».
 */
const QUEUED = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст поста.',
  postId: 'post-1',
  state: 'queued',
  date: '2031-03-04T07:00:00.000Z',
  plan: { status: 'queued', date: '2031-03-04T07:00:00.000Z', autopilot: false, current: true },
};

module.exports = {
  id: 'plan-move-unscheduled',
  title: 'Пост сняли с расписания до переноса: отказ, черновик не становится «запланированным»',
  covers: ['plan.move'],
  world: { adaptations: [QUEUED], unscheduleBeforeMove: ['post-1'] },
  turns: [
    { say: 'Перенеси cnt-1 на среду 12:00', model: [[['tool', 'plan_move', { pieceId: 'p1', adaptationId: 'a1', at: '2031-03-05T12:00:00+03:00' }]]] },
    { approve: true, model: [[['text', 'Пост уже не в расписании, переносить нечего.']]] },
  ],
  check: (run) => {
    const moved = run.turns[1].outputs[0].output;
    expect(moved).toEqual({
      ok: false,
      code: 'POST_STATE_CHANGED',
      reason: 'Состояние этого поста только что изменилось — возможно, он уже вышел. Ничего не перенесли.',
    });
    expect(JSON.stringify(moved)).not.toMatch(/scheduled|запланир/);
    const doors = run.requests.filter(([door]) => door === 'post.date');
    expect(doors).toHaveLength(1);
    expect(doors[0][2].movableFrom).toEqual(['QUEUE']);
    // Nothing written: the post stays the draft the person made it, at its old date.
    expect(run.writes).toEqual([]);
    expect(run.world.adaptations).toEqual([{ ...QUEUED, state: 'draft', plan: null }]);
  },
};
