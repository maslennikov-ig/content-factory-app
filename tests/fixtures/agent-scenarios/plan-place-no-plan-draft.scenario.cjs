'use strict';

/**
 * The other half of `kcxz.31` D5: where the post's own mode cannot be stored,
 * the post stays a draft with its time, and the result says in words that it
 * is not a reserve — the model reports that state, not «бронь».
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
  id: 'plan-place-no-plan-draft',
  title: '«Без плана» без своих режимов поста: черновик со временем, и сказано, что это не бронь',
  covers: ['plan.place'],
  timeZoneHeader: 'Europe/Moscow',
  world: {
    adaptations: [ROW],
    noPostModes: true,
    channels: [
      { id: 'c1', name: 'Кухня продукта', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'draft', posts: 1 },
    ],
  },
  turns: [
    {
      say: 'Поставь бронью на 4 марта, 12:00',
      model: [
        [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: AT }]],
        [['text', 'Бронь не получилась: пост лежит черновиком на вт 04.03 12:00 и сам не выйдет.']],
      ],
    },
  ],
  check: (run) => {
    const [place] = run.turns;
    const summary = place.outputs[0].output.summary;
    expect(summary).toMatchObject({ state: 'draft', at: '2031-03-04T09:00:00.000Z' });
    expect(summary.postMode).toBeUndefined();
    expect(summary.note).toMatch(/^Not a reserve: the post stays a draft with this time/);
    expect(place.data.filter((part) => part.type === 'data-plan').map((part) => part.data.state)).toEqual(['draft']);
    expect(run.writes).toEqual([['plan.placed', 'a1', 'draft', '2031-03-04T09:00:00.000Z']]);
  },
};
