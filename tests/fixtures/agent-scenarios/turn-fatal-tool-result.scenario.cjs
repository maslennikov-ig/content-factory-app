'use strict';

const { factRows } = require('./fact-rows.cjs');

module.exports = {
  id: 'turn-fatal-tool-result',
  title: 'После фатального отказа инструмента слова модели «Готово» не превращают операцию в успешную',
  covers: ['analytics.channel'],
  incompleteTurns: [0],
  world: factRows({
    channels: [{ id: 'c-down', name: 'Недоступный канал', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, posts: 0 }],
    channelAnalyticsFails: { 'c-down': 'synthetic platform timeout' },
  }),
  turns: [{
    say: 'Проверь статистику канала.',
    model: [[['tool', 'analytics_channel', { channelId: 'c-down' }]], [['text', 'Готово.']]],
  }],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs).toEqual([{ toolName: 'analytics_channel', output: expect.objectContaining({ ok: false, code: 'ANALYTICS_UNAVAILABLE' }) }]);
    expect(turn.modelCalls).toBe(2);
    expect(turn.text).toBe('Готово.');
    expect(turn.admissions).toEqual([['agent', 'agent', 'user-1', 'failed']]);
    expect(turn.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(run.history.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(run.requests.filter(([name]) => name === 'analytics.platform')).toEqual([['analytics.platform', 'c-down', '7']]);
    expect(run.writes).toEqual([]);
  },
};
