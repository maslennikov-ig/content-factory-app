'use strict';

const { factRows } = require('./fact-rows.cjs');
const { FOREIGN, mediaRows } = require('./media-rows.cjs');

module.exports = {
  id: 'turn-fatal-tool-result',
  title: 'Ошибка чтения допускает восстановление, но отказ записи остаётся ошибкой',
  covers: ['analytics.channel', 'analytics.production', 'adaptation.image'],
  incompleteTurns: [1],
  world: factRows({
    ...mediaRows(),
    channels: [{ id: 'c-down', name: 'Недоступный канал', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, posts: 0 }],
    channelAnalyticsFails: { 'c-down': 'synthetic platform timeout' },
  }),
  turns: [
    { say: 'Проверь статистику канала, а если она недоступна, покажи общую.', model: [
      [['tool', 'analytics_channel', { channelId: 'c-down' }]],
      [['tool', 'analytics_production', {}]],
      [['text', 'Статистика канала недоступна; показана общая статистика.']],
    ] },
    { say: 'Поставь эту картинку к посту.', model: [
      [['tool', 'adaptation_image', { pieceId: 'p1', adaptationId: 'a1', mediaId: FOREIGN }]],
      [['text', 'Готово.']],
    ] },
  ],
  check: (run) => {
    const [read, write] = run.turns;
    expect(read.outputs).toEqual([
      { toolName: 'analytics_channel', output: expect.objectContaining({ ok: false, code: 'ANALYTICS_UNAVAILABLE' }) },
      { toolName: 'analytics_production', output: expect.objectContaining({ ok: true }) },
    ]);
    expect(read.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(read.execution).toMatchObject({ state: 'settled', outcome: 'completed' });
    expect(write.outputs).toEqual([{ toolName: 'adaptation_image', output: expect.objectContaining({ ok: false, code: 'ADAPTATION_MEDIA_UNKNOWN' }) }]);
    expect(write.modelCalls).toBe(2);
    expect(write.text).toBe('Готово.');
    expect(write.admissions).toEqual([['agent', 'agent', 'user-1', 'failed']]);
    expect(write.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(run.requests.filter(([name]) => name === 'analytics.platform')).toEqual([['analytics.platform', 'c-down', '7']]);
    expect(run.writes).toEqual([]);
    expect(run.world.adaptations[0].mediaId).toBeNull();
  },
};
