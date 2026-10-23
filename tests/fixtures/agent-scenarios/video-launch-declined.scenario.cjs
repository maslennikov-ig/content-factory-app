'use strict';

const { IDS, ACCESS, videoRows, launchInput } = require('./video-world.cjs');

module.exports = {
  id: 'video-launch-declined',
  title: 'Отказ на API- и подписочной карточках не запускает видео',
  covers: ['video.launch', 'video.launch_v2'],
  world: videoRows(),
  turns: [
    { say: 'Покажи согласие на API-видео', model: [
      [['tool', 'video_preflight', { draftId: IDS.draft }]], [['tool', 'video_launch', launchInput()]],
    ] },
    { approve: false, model: [[['text', 'API-видео не запускаем.']]] },
    { say: 'Покажи цену моей выбранной подписки', model: [
      [['tool', 'video_preflight_v2', { draftId: IDS.draft, version: 1, access: ACCESS }]],
      [['tool', 'video_launch_v2', launchInput(true, 'msg-user-3')]],
    ] },
    { approve: false, model: [[['text', 'По подписке тоже не запускаем.']]] },
  ],
  check: (run) => {
    for (const index of [0, 2]) expect(run.turns[index].approvals).toHaveLength(1);
    for (const index of [1, 3]) {
      expect(run.turns[index].types).toContain('tool-output-denied');
      expect(run.turns[index].outputs).toEqual([]);
    }
    expect(run.world.video.jobs).toEqual([]);
    expect(run.requests.filter(([name]) => ['video.launch', 'video.launch-v2'].includes(name))).toEqual([]);
    expect(run.writes).toEqual([['video.preflight', IDS.apiPreflight], ['video.preflight-v2', IDS.accessPreflight]]);
  },
};
