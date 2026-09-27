'use strict';

const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * A firm date, a move and «Ко всем N» each ask once on a card that names the
 * piece, the channel and the time in the person's zone (or N); taking a post
 * off the schedule asks nothing. Bodies are the screens' own: the page's
 * `buildSchedulePayload`, the calendar's drag body for `PUT /posts/:id/date`,
 * the channel card's `plan-apply` body.
 */
const row = (id, extra = {}) => ({
  id,
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст поста.',
  postId: `post-${id}`,
  state: 'draft',
  date: null,
  plan: null,
  ...extra,
});
const AT = '2031-03-04T10:00:00+03:00';
const MOVE_TO = '2031-03-05T12:00:00+03:00';

module.exports = {
  id: 'plan-schedule-move-apply',
  title: 'Дата, перенос и «Ко всем N» — каждое с одним подтверждением; снять — без',
  covers: ['plan.schedule', 'plan.move', 'plan.unschedule', 'plan.apply'],
  // The browser's zone, as the screen's transport sends it: the cards say
  // the times in Moscow time, and the model is told the zone.
  timeZoneHeader: 'Europe/Moscow',
  world: { adaptations: [row('a1'), row('a2')] },
  turns: [
    { say: 'Запланируй cnt-1 на 4 марта 10:00', model: [[['tool', 'plan_schedule', { pieceId: 'p1', adaptationId: 'a1', at: AT }]]] },
    { approve: true, model: [[['text', 'Запланировали.']]] },
    { say: 'Перенеси на среду 12:00', model: [[['tool', 'plan_move', { pieceId: 'p1', adaptationId: 'a1', at: MOVE_TO }]]] },
    { approve: true, model: [[['text', 'Перенесли.']]] },
    {
      say: 'Сними его с расписания',
      model: [[['tool', 'plan_unschedule', { pieceId: 'p1', adaptationId: 'a1' }]], [['text', 'Снова бронь.']]],
    },
    {
      say: 'Примени режим канала ко всем написанным постам',
      model: [[['tool', 'plan_apply', { channelId: 'c1', planMode: 'reserve' }]]],
    },
    { approve: true, model: [[['text', 'Применили.']]] },
  ],
  check: (run) => {
    expect(run.firstCall.system).toContain('The person’s time zone: Europe/Moscow (now UTC+3); their date and time: 2026-09-27 13:00.');
    expect(run.firstCall.system).toContain('2026-09-27T13:00:00+03:00');
    const approvals = run.turns.flatMap((turn) => turn.approvals);
    expect(approvals.map((one) => [one.toolName, one.reason])).toEqual([
      // What else happens, and the text that goes out (review W2 F4, F10).
      [
        'plan_schedule',
        'Запланировать пост заготовки cnt-1 в канале «Канал про работу» на вт 04.03 10:00 (UTC+3): в это время он выйдет сам, до выхода его можно снять с расписания; черновики других версий (1) уйдут из календаря. «Текст поста.»',
      ],
      [
        'plan_move',
        'Перенести запланированный пост заготовки cnt-1 в канале «Канал про работу» с вт 04.03 10:00 (UTC+3) на ср 05.03 12:00 (UTC+3): он выйдет сам в новое время, до выхода его можно снять с расписания. «Текст поста.»',
      ],
      [
        'plan_apply',
        'Применить режим «Бронь» канала «Канал про работу» ко всем написанным постам (1): они встанут в план бронью и выйдут только после подтверждения',
      ],
    ]);
    // Unscheduling asked nothing.
    expect(run.turns[4].approvals).toEqual([]);

    const screen = screenPieces();
    expect(run.requests.filter(([door]) => ['plan.schedule', 'post.date', 'plan.unschedule', 'plan.apply'].includes(door))).toEqual([
      ['plan.schedule', 'p1', 'a1', screen.buildSchedulePayload({ date: AT })],
      // `calendar.tsx`: `{ date: getDate.utc().format('YYYY-MM-DDTHH:mm:ss'), action }`.
      ['post.date', 'post-a1', { date: dayjs(MOVE_TO).utc().format('YYYY-MM-DDTHH:mm:ss'), action: 'schedule', movableFrom: ['QUEUE'] }],
      ['plan.unschedule', 'p1', 'a1'],
      // `ChannelPlanApplyDto`: the mode the person answered for.
      ['plan.apply', 'c1', { planMode: 'reserve' }],
    ]);
    // One «Да», one write each.
    expect(run.writes).toEqual([
      ['plan.scheduled', 'a1', '2031-03-04T07:00:00.000Z'],
      ['post.date', 'post-a1', '2031-03-05T09:00:00.000Z'],
      ['plan.unscheduled', 'a1'],
      ['plan.applied', 'c1', 'reserve', 1],
    ]);
    expect(run.turns[3].outputs[0].output.summary).toEqual({
      pieceId: 'p1',
      adaptationId: 'a1',
      channelId: 'c1',
      state: 'scheduled',
      at: '2031-03-05T09:00:00.000Z',
      local: 'ср 05.03 12:00 (UTC+3)',
    });
    expect(run.turns[4].outputs[0].output.summary).toMatchObject({ state: 'reserve', at: '2031-03-05T09:00:00.000Z' });
    expect(run.turns[6].outputs[0].output.summary).toEqual({ channelId: 'c1', planMode: 'reserve', count: 1, applied: 1 });
    expect(run.pending).toBe(0);
  },
};
