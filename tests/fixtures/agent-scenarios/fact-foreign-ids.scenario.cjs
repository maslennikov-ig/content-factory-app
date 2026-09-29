'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * Ids of another workspace are refused (kcxz.24): its fact is not retracted
 * or restored, its channel's analytics and own texts are not read, and the
 * card for it says there is no such fact rather than quoting it.
 */
module.exports = {
  id: 'fact-foreign-ids',
  title: 'Чужие факты и каналы — отказ, ничего не тронуто и не прочитано',
  covers: ['facts.retract', 'facts.restore', 'analytics.channel', 'texts.related'],
  world: factRows(),
  turns: [
    {
      say: 'Верни факт f-foreign и покажи аналитику канала c-foreign',
      model: [
        [['tool', 'facts_restore', { factId: 'f-foreign' }]],
        [['tool', 'analytics_channel', { channelId: 'c-foreign' }]],
        [['tool', 'texts_related', { topic: 'созвоны', channelId: 'c-foreign' }]],
        [['text', 'Таких нет.']],
      ],
    },
    { say: 'Сними факт f-foreign', model: [[['tool', 'facts_retract', { factId: 'f-foreign' }]]] },
    { approve: true, model: [[['text', 'Такого факта нет.']]] },
  ],
  check: (run) => {
    const [first, ask, yes] = run.turns;
    expect(first.outputs.map((one) => one.output.code)).toEqual([
      'FACT_NOT_FOUND',
      'CHANNEL_NOT_FOUND',
      'CHANNEL_NOT_FOUND',
    ]);
    // The card does not quote another workspace's fact.
    expect(ask.approvals[0].reason).toBe('Факта f-foreign в этом пространстве нет — ничего не изменится');
    expect(JSON.stringify(run.turns)).not.toContain('Чужой факт');
    expect(yes.outputs[0].output.code).toBe('FACT_NOT_FOUND');
    expect(run.writes).toEqual([]);
    expect(run.world.facts.find((one) => one.id === 'f-foreign').status).toBe('VERIFIED');
    expect(run.requests.filter(([name]) => name === 'analytics.platform')).toEqual([]);
  },
};
