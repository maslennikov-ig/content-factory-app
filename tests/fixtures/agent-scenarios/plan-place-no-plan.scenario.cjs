'use strict';

/**
 * «Поставь бронью» on a channel «Без плана» (`kcxz.31`, D5; live stand
 * 27.09.2026, `http/s1l-sse-01.ndjson`): the calendar's own «Поставить на»
 * leaves a draft with a time there, and the agent reported it as «бронь». The
 * person asked for a reserve, so this post's own mode becomes «Бронь» first —
 * what «Для этого поста → Бронь» on the screen does — and the result says so.
 */
const ROW = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Кухня продукта',
  body: 'Текст поста.',
  postId: 'post-1',
  state: 'draft',
  date: null,
  plan: null,
};
const AT = '2031-03-04T12:00:00+03:00';

module.exports = {
  id: 'plan-place-no-plan',
  title: '«Без плана»: «поставь бронью» ставит бронь поста, канал не трогает',
  covers: ['plan.place'],
  timeZoneHeader: 'Europe/Moscow',
  world: {
    adaptations: [ROW],
    channels: [
      { id: 'c1', name: 'Кухня продукта', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'draft', posts: 1 },
    ],
  },
  turns: [
    {
      say: 'Поставь бронью на 4 марта, 12:00',
      model: [
        [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: AT }]],
        [['text', 'Поставил бронью на вт 04.03 12:00. Канал без плана, поэтому для этого поста включил режим «Бронь».']],
      ],
    },
  ],
  check: (run) => {
    const [place] = run.turns;
    expect(place.approvals).toEqual([]);
    expect(place.outputs[0].output).toEqual({
      ok: true,
      capability: 'plan.place',
      summary: {
        pieceId: 'p1',
        adaptationId: 'a1',
        channelId: 'c1',
        state: 'reserve',
        at: '2031-03-04T09:00:00.000Z',
        local: 'вт 04.03 12:00 (UTC+3)',
        postMode: 'reserve',
      },
      card: { kind: 'plan', id: 'a1' },
    });
    expect(place.data.filter((part) => part.type === 'data-plan').map((part) => part.data.state)).toEqual(['reserve']);
    // The post's own mode, then the reserve; the channel stays «Без плана».
    expect(run.writes).toEqual([
      ['post.mode', 'p1', 'c1', 'reserve'],
      ['plan.placed', 'a1', 'reserved', '2031-03-04T09:00:00.000Z'],
    ]);
    expect(run.world.channels.find((one) => one.id === 'c1').planMode).toBe('draft');
  },
};
