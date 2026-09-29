'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * «Как дела у канала?» never changes the channel (review W4-24 F3, owner
 * decision; F8). The real `IntegrationService.checkAnalytics` runs without
 * refreshing: an expired token is `ANALYTICS_CHANNEL_NEEDS_RECONNECT` before
 * the platform is asked; a platform that asks for a new token is the same
 * refusal after one request, with no retry; a platform that fails is
 * `ANALYTICS_UNAVAILABLE`, not an empty answer. A channel whose connection is
 * not finished is `ANALYTICS_CHANNEL_OFF` without asking. No token is
 * refreshed, no channel is marked for reconnection, nobody is notified.
 */
const telegram = (row) => ({
  providerIdentifier: 'telegram',
  disabled: false,
  refreshNeeded: false,
  posts: 0,
  ...row,
});

module.exports = {
  id: 'analytics-channel-refusals',
  title: 'Аналитика канала — истёкший доступ и сбой площадки: отказ с кодом, канал не трогаем',
  covers: ['analytics.channel'],
  world: factRows({
    channels: [
      telegram({ id: 'c-expired', name: 'Старый канал', tokenExpiration: '2020-01-01T00:00:00.000Z' }),
      telegram({ id: 'c-refresh', name: 'Канал новостей' }),
      telegram({ id: 'c-down', name: 'Канал отзывов' }),
      telegram({ id: 'c-half', name: 'Канал без страницы', inBetweenSteps: true }),
    ],
    channelAnalyticsFails: { 'c-refresh': 'refresh', 'c-down': 'platform timeout' },
  }),
  turns: [
    {
      say: 'Как дела у всех каналов за неделю?',
      model: [
        [['tool', 'analytics_channel', { channelId: 'c-expired' }]],
        [['tool', 'analytics_channel', { channelId: 'c-refresh' }]],
        [['tool', 'analytics_channel', { channelId: 'c-down' }]],
        [['tool', 'analytics_channel', { channelId: 'c-half' }]],
        [['text', 'Два канала надо переподключить, площадка третьего не ответила, четвёртый не подключён до конца.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs.map((one) => one.output)).toEqual([
      expect.objectContaining({ ok: false, code: 'ANALYTICS_CHANNEL_NEEDS_RECONNECT' }),
      expect.objectContaining({ ok: false, code: 'ANALYTICS_CHANNEL_NEEDS_RECONNECT' }),
      expect.objectContaining({ ok: false, code: 'ANALYTICS_UNAVAILABLE' }),
      expect.objectContaining({ ok: false, code: 'ANALYTICS_CHANNEL_OFF' }),
    ]);
    // Asked once each where the token was alive; never the expired or the
    // half-connected channel; no second try after «refresh me».
    expect(run.requests.filter(([name]) => name === 'analytics.platform')).toEqual([
      ['analytics.platform', 'c-refresh', '7'],
      ['analytics.platform', 'c-down', '7'],
    ]);
    // No refresh, no reconnection mark, no notification.
    expect(run.writes).toEqual([]);
  },
};
