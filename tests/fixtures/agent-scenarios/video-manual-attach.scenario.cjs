'use strict';

const { IDS, SOURCE, videoRows, summary } = require('./video-world.cjs');

module.exports = {
  id: 'video-manual-attach',
  title: 'Ручное видео прикрепляется к сохранённой версии, внешняя стоимость остаётся неизвестной',
  covers: ['video.manual_v2', 'video.jobs_v2', 'video.status_v2'],
  world: videoRows(),
  turns: [
    { say: 'Прикрепи уже загруженное мной видео к этой версии сценария', model: [
      [['tool', 'video_manual_v2', { draftId: IDS.draft, version: 1, mediaId: IDS.media }]],
      [['tool', 'video_jobs_v2', { pieceId: IDS.piece }], ['tool', 'video_status_v2', { jobId: IDS.manualJob }]],
      [['text', 'Готовое видео прикреплено; его внешняя стоимость неизвестна.']],
    ] },
  ],
  check: (run) => {
    for (const tool of ['video_manual_v2', 'video_status_v2']) expect(summary(run.turns[0], tool)).toMatchObject({
      id: IDS.manualJob, state: 'completed', access: { kind: 'manual' }, result: { id: IDS.media },
      cost: { amount: null, unit: null, certainty: 'external_unknown' },
    });
    expect(summary(run.turns[0], 'video_jobs_v2').jobs.map((one) => one.id)).toEqual([IDS.manualJob]);
    expect(run.requests.find(([name]) => name === 'video.manual-v2')).toEqual(['video.manual-v2', 'org-1', 'user-1', { draftId: IDS.draft, version: 1, mediaId: IDS.media }]);
    expect(run.writes).toEqual([['video.attached', IDS.manualJob, IDS.media]]);
    expect(run.world.video.jobs[0].draftVersion).toBe(1);
    expect(run.world.pieces[0].body).toBe(SOURCE);
    expect(run.turns[0].approvals).toEqual([]);
    expect(run.requests.filter(([name]) => ['video.launch', 'video.launch-v2'].includes(name))).toEqual([]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent']);
  },
};
