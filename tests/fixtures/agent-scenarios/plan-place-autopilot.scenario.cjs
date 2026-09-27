'use strict';

/**
 * A reserve on an autopilot channel would join the queue and go out by
 * itself (the calendar door places by the channel's mode), so `plan.place`
 * refuses before the door runs (premortem A1) and the agent offers the firm
 * date instead, which the person approves on a card.
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
const AT = '2031-03-04T10:00:00+03:00';

module.exports = {
  id: 'plan-place-autopilot',
  title: 'Автопилот: бронь не ставится сама, дата — через подтверждение',
  covers: ['plan.place', 'plan.schedule'],
  world: {
    adaptations: [ROW],
    channels: [
      { id: 'c1', name: 'Канал про работу', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'autopilot', posts: 1 },
    ],
  },
  turns: [
    {
      say: 'Поставь cnt-1 на 4 марта 10:00',
      model: [
        [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: AT }]],
        [['tool', 'plan_schedule', { pieceId: 'p1', adaptationId: 'a1', at: AT }]],
      ],
    },
    { approve: true, model: [[['text', 'Запланировали: выйдет сама.']]] },
  ],
  check: (run) => {
    const [ask, yes] = run.turns;
    expect(ask.outputs[0].output).toMatchObject({ ok: false, code: 'PLAN_PLACE_AUTOPILOT' });
    expect(run.requests.filter(([door]) => door === 'plan.place')).toEqual([]);
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'plan_schedule',
        // The text that goes out, quoted (review W2 F4).
        reason: 'Запланировать пост заготовки cnt-1 в канале «Канал про работу» на вт 04.03 10:00 (UTC+3): в это время он выйдет сам, до выхода его можно снять с расписания. «Текст поста.»',
      }),
    ]);
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { state: 'scheduled', at: '2031-03-04T07:00:00.000Z' } });
    expect(run.writes).toEqual([['plan.scheduled', 'a1', '2031-03-04T07:00:00.000Z']]);
  },
};
