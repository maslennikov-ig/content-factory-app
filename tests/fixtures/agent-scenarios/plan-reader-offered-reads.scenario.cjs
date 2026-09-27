'use strict';

/**
 * A «Пользователь» reads the plan in the chat but is offered nothing that
 * places, schedules, moves or publishes (activeTools from the doors' policies).
 */
module.exports = {
  id: 'plan-reader-offered-reads',
  title: 'Пользователь видит план, но не ставит и не публикует',
  role: 'USER',
  covers: ['plan.calendar'],
  turns: [
    {
      say: 'Что в календаре на неделе?',
      model: [[['tool', 'plan_calendar', { from: '2031-03-03', to: '2031-03-09' }]], [['text', 'Пусто.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['plan_ahead', 'plan_calendar', 'plan_ready']));
    for (const tool of ['plan_place', 'plan_unschedule', 'plan_schedule', 'plan_publish_now', 'plan_move', 'plan_apply']) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs[0].output).toMatchObject({ ok: true });
    expect(run.writes).toEqual([]);
  },
};
