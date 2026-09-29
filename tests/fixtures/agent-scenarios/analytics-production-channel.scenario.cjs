'use strict';

const { factRows, INJECTED } = require('./fact-rows.cjs');

/**
 * «Аналитика» from the chat (kcxz.24): «Производство» counted by the real
 * function over this workspace's posts of the window (a failure reason is the
 * platform's words, read as data); a Telegram channel's audience for the
 * longest period Telegram answers — 7 days even when a month was asked — each
 * metric's number by the screen's rule; a platform without analytics is
 * refused without asking it.
 */
module.exports = {
  id: 'analytics-production-channel',
  title: 'Аналитика — «Производство» и аудитория канала, Telegram отвечает за 7 дней',
  covers: ['analytics.production', 'analytics.channel'],
  world: factRows({
    channels: [
      ...require('./world.cjs').createWorld().rows.channels,
      { id: 'c2', name: 'Блог', providerIdentifier: 'wordpress', disabled: false, refreshNeeded: false, posts: 0 },
    ],
  }),
  turns: [
    {
      say: 'Сколько постов вышло за неделю и за месяц?',
      model: [
        [['tool', 'analytics_production', { days: 7 }]],
        [['tool', 'analytics_production', {}]],
        [['text', 'За неделю три, за месяц четыре.']],
      ],
    },
    {
      say: 'А что с аудиторией канала про работу за месяц? И блога?',
      model: [
        [['tool', 'analytics_channel', { channelId: 'c1', days: 30 }]],
        [['tool', 'analytics_channel', { channelId: 'c2' }]],
        [['text', 'Реакций 10, комментариев 3.']],
      ],
    },
  ],
  check: (run) => {
    const [production, audience] = run.turns;
    const [week, month] = production.outputs.map((one) => one.output.summary.untrustedData.value);
    expect(week).toMatchObject({ days: 7, published: 2, failed: 1, failureRatePercent: 33.3, averageLeadTimeHours: 24 });
    expect(week.origins).toEqual([
      { origin: 'MCP', count: 1, percentage: 33.3 },
      { origin: 'WEB', count: 2, percentage: 66.7 },
    ]);
    expect(week.failureReasons[0].reason).toContain(INJECTED);
    expect(month).toMatchObject({ days: 30, published: 3, failed: 1 });

    const [channel, blog] = audience.outputs.map((one) => one.output);
    expect(channel.summary.untrustedData.value).toMatchObject({
      channelId: 'c1',
      platform: 'telegram',
      days: 7,
      metrics: [
        { label: 'Реакции', value: 10, changePercent: 25 },
        { label: 'Комментарии в обсуждении', value: 3, changePercent: -10 },
      ],
    });
    expect(blog).toMatchObject({ ok: false, code: 'ANALYTICS_NOT_AVAILABLE' });
    // The platform was asked once, for Telegram's own period.
    expect(run.requests.filter(([name]) => name === 'analytics.platform')).toEqual([['analytics.platform', 'c1', '7']]);
    expect(run.writes).toEqual([]);
  },
};
