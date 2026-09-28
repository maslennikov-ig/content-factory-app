'use strict';

/**
 * «Автопилот» asks first (spec §1.4): the card names the channel and what
 * changes; «Нет» leaves the mode, «Да» sets it through the plan-mode door.
 */
module.exports = {
  id: 'channel-autopilot',
  title: 'Автопилот — только после «Да», карточка говорит, что посты пойдут сами',
  covers: ['channel.autopilot'],
  turns: [
    { say: 'Переведи канал на автопилот', model: [[['tool', 'channel_autopilot', { channelId: 'c1' }]]] },
    { approve: false, model: [[['text', 'Оставили «Бронь».']]] },
    { say: 'Нет, всё-таки переведи', model: [[['tool', 'channel_autopilot', { channelId: 'c1' }]]] },
    { approve: true, model: [[['text', 'Канал на автопилоте.']]] },
  ],
  check: (run) => {
    const [ask, no, again, yes] = run.turns;
    expect(ask.approvals[0].reason).toBe(
      'Перевести канал «Канал про работу» на автопилот: новые посты будут вставать в очередь и выходить сами, без подтверждения. Уже написанные останутся как есть'
    );
    expect(no.outputs).toEqual([]);
    expect(again.approvals).toHaveLength(1);
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { channelId: 'c1', planMode: 'autopilot' } });
    expect(run.writes).toEqual([['channel.plan-mode', 'c1', 'autopilot']]);
  },
};
