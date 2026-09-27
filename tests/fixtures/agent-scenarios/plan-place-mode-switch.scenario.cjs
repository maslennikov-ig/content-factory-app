'use strict';

/**
 * Correctness review W2 F2: `plan.place` checks the mode, and the service
 * decides again under the channel lock. Here the channel goes on autopilot
 * right after the capability's check: the service refuses to queue without
 * a card, nothing is placed, and the model offers the dated schedule.
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

module.exports = {
  id: 'plan-place-mode-switch',
  title: 'Режим сменился между проверкой и записью: бронь не встаёт в очередь',
  covers: ['plan.place'],
  world: { adaptations: [ROW], switchModeAfterRead: { channelId: 'c1', to: 'autopilot' } },
  turns: [
    {
      say: 'Поставь cnt-1 на 4 марта 10:00',
      model: [
        [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: '2031-03-04T10:00:00+03:00' }]],
        [['text', 'Канал ушёл на автопилот — поставить бронью нельзя, могу запланировать с подтверждением.']],
      ],
    },
  ],
  check: (run) => {
    const [ask] = run.turns;
    expect(ask.outputs[0].output).toMatchObject({ ok: false, code: 'PLAN_PLACE_AUTOPILOT' });
    // The door was reached — the check passed on «Бронь» — and refused.
    expect(run.requests.filter(([door]) => door === 'plan.place')).toHaveLength(1);
    expect(run.writes).toEqual([]);
    expect(run.world.adaptations[0]).toMatchObject({ state: 'draft', plan: null });
  },
};
