'use strict';

/**
 * The plan without a card (`kcxz.15`, owner 26.09 rule 2): what is ready, a
 * reserve («Бронь») placed at once — the calendar picker's own `place` body —
 * and what is ahead and in the calendar, read in the person's zone.
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
  id: 'plan-reserve-and-read',
  title: 'План: готовое, бронь без вопроса, что впереди и календарь',
  covers: ['plan.ready', 'plan.place', 'plan.ahead', 'plan.calendar'],
  // The screen's transport names the browser's zone (kcxz.15).
  timeZoneHeader: 'Europe/Moscow',
  world: { adaptations: [ROW] },
  turns: [
    { say: 'Что готово к публикации?', model: [[['tool', 'plan_ready', {}]], [['text', 'Готова одна адаптация.']]] },
    {
      say: 'Поставь её на вторник, 4 марта, 10:00',
      model: [[['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: AT }]], [['text', 'Поставили бронь.']]],
    },
    {
      say: 'Что у нас впереди на этой неделе?',
      model: [
        [
          ['tool', 'plan_ahead', {}],
          ['tool', 'plan_calendar', { from: '2031-03-03', to: '2031-03-09' }],
        ],
        [['text', 'Одна бронь во вторник.']],
      ],
    },
  ],
  check: (run) => {
    const [ready, place, ahead] = run.turns;
    expect(ready.outputs[0].output.summary.untrustedData.value.items).toEqual([
      expect.objectContaining({ adaptationId: 'a1', pieceId: 'p1', pieceCode: 'cnt-1', channelId: 'c1', slot: 'free', at: null }),
    ]);

    // A reserve asks nothing: no approval card, the door runs at once.
    expect(place.approvals).toEqual([]);
    // The picker's body (`adaptation-picker.tsx`: `{ date: date.toDate().toISOString() }`).
    expect(run.requests.filter(([door]) => door === 'plan.place')).toEqual([
      ['plan.place', 'p1', 'a1', { date: new Date(AT).toISOString() }],
    ]);
    expect(place.outputs[0].output).toEqual({
      ok: true,
      capability: 'plan.place',
      summary: {
        pieceId: 'p1',
        adaptationId: 'a1',
        channelId: 'c1',
        state: 'reserve',
        at: '2031-03-04T07:00:00.000Z',
        local: 'вт 04.03 10:00 (UTC+3)',
      },
      card: { kind: 'plan', id: 'a1' },
    });
    expect(place.data.filter((part) => part.type === 'data-plan')).toEqual([
      {
        type: 'data-plan',
        transient: false,
        data: {
          kind: 'plan',
          id: 'a1',
          pieceId: 'p1',
          channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
          at: '2031-03-04T07:00:00.000Z',
          state: 'reserve',
        },
      },
    ]);
    // The card is stored with the thread: a reload draws the same slot.
    expect(run.storedPartTypes).toContain('data-plan');

    // `planAheadUrl` and the calendar's `loadData` query, in the person's zone.
    expect(run.requests.filter(([door]) => door === 'plan.ahead' || door === 'plan.calendar')).toEqual([
      ['plan.ahead', { timeZone: 'Europe/Moscow' }],
      ['plan.calendar', { startDate: '2031-03-02T21:00:00Z', endDate: '2031-03-09T20:59:59Z', customer: '' }],
    ]);
    const [aheadOut, calendarOut] = ahead.outputs.map((one) => one.output.summary.untrustedData.value);
    expect(aheadOut).toMatchObject({ planned: 1, reserved: 1, queued: 0, zone: 'Europe/Moscow' });
    expect(calendarOut.posts).toEqual([
      {
        postId: 'post-1',
        at: '2031-03-04T07:00:00.000Z',
        local: 'вт 04.03 10:00 (UTC+3)',
        state: 'DRAFT',
        plan: 'reserve',
        channel: { id: 'c1', name: 'Канал про работу' },
        piece: { id: 'p1', code: 'cnt-1', title: 'Про созвоны' },
      },
    ]);
    expect(run.writes).toEqual([['plan.placed', 'a1', 'reserved', '2031-03-04T07:00:00.000Z']]);
    // Free: every turn is the one `agent` admission.
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent', 'agent', 'agent']);
  },
};
