'use strict';

const { createHash } = require('node:crypto');
const { IDS, ACCESS, videoRows, summary, launchInput } = require('./video-world.cjs');

module.exports = {
  id: 'video-subscription-launch-approved',
  title: 'Выбранная подписка сохраняется в согласии; кредиты не подменяются API-ценой',
  covers: ['video.access_v2', 'video.preflight_v2', 'video.launch_v2'],
  world: videoRows(),
  turns: [
    { say: 'Хочу создать видео через мою выбранную подписку Higgsfield; сначала покажи цену и согласие', model: [
      [['tool', 'video_access_v2', {}]],
      [['tool', 'video_preflight_v2', { draftId: IDS.draft, version: 1, access: ACCESS }]],
      [['tool', 'video_launch_v2', launchInput(true)]],
    ] },
    { approve: true, model: [[['text', 'Задание принято по согласованной подписке.']]] },
  ],
  check: (run) => {
    const [asked, approved] = run.turns;
    expect(asked.approvals).toHaveLength(1);
    expect(asked.approvals[0]).toMatchObject({ toolName: 'video_launch_v2' });
    expect(asked.approvals[0].reason).toContain('8 higgsfield_credit');
    expect(asked.outputs.map((one) => one.toolName)).toEqual(['video_access_v2', 'video_preflight_v2']);
    expect(summary(asked, 'video_preflight_v2')).toMatchObject({ access: ACCESS, version: 1, quote: { amount: '8', unit: 'higgsfield_credit' }, perJob: '10', providerBillingCap: false });
    expect(summary(approved, 'video_launch_v2')).toMatchObject({ id: IDS.subscriptionJob, state: 'accepted', access: ACCESS });
    const hex = createHash('sha256').update(JSON.stringify(['org-1', 'user-1', IDS.accessPreflight])).digest('hex');
    expect(run.requests.filter(([name]) => name === 'video.launch-v2')).toEqual([['video.launch-v2', 'org-1', 'user-1', {
      preflightId: IDS.accessPreflight, intentId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    }]]);
    expect(run.requests.filter(([name]) => name === 'video.saved-approval-v2')).toEqual([['video.saved-approval-v2', 'org-1', 'user-1', IDS.accessPreflight]]);
    expect(run.requests.filter(([name]) => name === 'video.launch')).toEqual([]);
    expect(run.writes).toEqual([['video.preflight-v2', IDS.accessPreflight], ['video.launched', IDS.subscriptionJob, IDS.accessPreflight]]);
  },
};
