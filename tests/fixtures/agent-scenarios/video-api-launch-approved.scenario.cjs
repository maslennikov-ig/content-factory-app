'use strict';

const { createHash } = require('node:crypto');
const { IDS, videoRows, summary, launchInput } = require('./video-world.cjs');

module.exports = {
  id: 'video-api-launch-approved',
  title: 'API-видео запускается после карточки и отменяется по прежнему заданию',
  covers: ['video.preflight', 'video.launch', 'video.cancel'],
  world: videoRows(),
  turns: [
    { say: 'Проверь сохранённый сценарий и предложи запуск через API за счёт пространства', model: [
      [['tool', 'video_preflight', { draftId: IDS.draft }]],
      [['tool', 'video_launch', launchInput()]],
    ] },
    { approve: true, model: [[['text', 'Задание принято.']]] },
    { say: 'Останови это задание', before: (rows) => {
      rows.video.jobs[0].state = 'queued';
      rows.video.jobs[0].receipt = { requestId: 'existing-api-receipt' };
    }, model: [[['tool', 'video_cancel', { jobId: IDS.apiJob }]], [['text', 'Отмена подтверждена.']]] },
  ],
  check: (run) => {
    const [asked, approved, canceled] = run.turns;
    expect(asked.approvals).toHaveLength(1);
    expect(asked.approvals[0]).toMatchObject({ toolName: 'video_launch' });
    expect(asked.approvals[0].reason).toContain('0.25 USD');
    expect(asked.outputs.map((one) => one.toolName)).toEqual(['video_preflight']);
    expect(summary(approved, 'video_launch')).toMatchObject({ id: IDS.apiJob, state: 'accepted', access: { kind: 'api', payer: 'workspace_key' } });
    expect(summary(canceled, 'video_cancel')).toMatchObject({ id: IDS.apiJob, state: 'canceled' });
    expect(run.requests.filter(([name]) => name === 'video.launch')).toEqual([['video.launch', 'org-1', 'user-1', {
      draftId: IDS.draft, version: 1, preflightId: IDS.apiPreflight,
      intentId: createHash('sha256').update(JSON.stringify(['org-1', 'user-1', IDS.apiPreflight])).digest('hex'),
    }]]);
    expect(run.writes).toEqual([['video.preflight', IDS.apiPreflight], ['video.launched', IDS.apiJob, IDS.apiPreflight], ['video.canceled', IDS.apiJob]]);
    expect(run.world.video.jobs).toHaveLength(1);
    expect(run.world.video.jobs[0].receipt).toEqual({ requestId: 'existing-api-receipt' });
  },
};
