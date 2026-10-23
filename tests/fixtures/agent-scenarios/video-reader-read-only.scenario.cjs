'use strict';

const { IDS, SOURCE, draft, job, videoRows, summary } = require('./video-world.cjs');

module.exports = {
  id: 'video-reader-read-only',
  title: 'Пользователь читает сохранённое видео без запуска и чужих записей',
  role: 'USER',
  covers: ['video.catalog', 'video.drafts', 'video.draft', 'video.jobs', 'video.status', 'video.access_v2', 'video.jobs_v2', 'video.status_v2'],
  world: videoRows({
    drafts: [draft(), { ...draft(), id: IDS.foreignDraft, organizationId: 'org-foreign', brief: { prompt: 'Чужой сценарий' } }],
    jobs: [job(IDS.apiJob, 'api'), job(IDS.subscriptionJob, 'subscription'), { ...job(IDS.unknownJob, 'api'), organizationId: 'org-foreign' }],
  }),
  turns: [
    { say: 'Покажи возможности и сохранённые сценарии видео', model: [
      [['tool', 'video_catalog', {}], ['tool', 'video_access_v2', {}]],
      [['tool', 'video_drafts', { pieceId: IDS.piece }], ['tool', 'video_draft', { draftId: IDS.draft }]],
      [['text', 'Сценарий сохранён; можно его прочитать.']],
    ] },
    { say: 'Открой готовые результаты', model: [
      [['tool', 'video_jobs', { pieceId: IDS.piece }], ['tool', 'video_jobs_v2', { pieceId: IDS.piece }]],
      [['tool', 'video_status', { jobId: IDS.apiJob }], ['tool', 'video_status_v2', { jobId: IDS.subscriptionJob }]],
      [['text', 'Оба результата уже сохранены в медиатеке.']],
    ] },
  ],
  check: (run) => {
    for (const turn of run.turns) for (const output of turn.outputs) expect(output.output.ok).toBe(true);
    expect(summary(run.turns[0], 'video_catalog').catalog.routes[0].provider).toBe('higgsfield');
    expect(summary(run.turns[0], 'video_access_v2').connections.map((one) => one.id)).toEqual([IDS.connection]);
    expect(summary(run.turns[0], 'video_drafts').drafts.map((one) => one.id)).toEqual([IDS.draft]);
    expect(summary(run.turns[0], 'video_draft').brief.prompt).toBe(SOURCE);
    expect(summary(run.turns[1], 'video_jobs').jobs.map((one) => one.id)).toEqual([IDS.apiJob]);
    expect(summary(run.turns[1], 'video_jobs_v2').jobs.map((one) => one.id)).toEqual([IDS.apiJob, IDS.subscriptionJob]);
    for (const tool of ['video_status', 'video_status_v2']) expect(summary(run.turns[1], tool)).toMatchObject({ state: 'completed', result: { id: IDS.media } });
    expect(run.firstCall.tools.filter((name) => name.startsWith('video_')).sort()).toEqual([
      'video_catalog', 'video_drafts', 'video_draft', 'video_jobs', 'video_status', 'video_access_v2', 'video_jobs_v2', 'video_status_v2',
    ].sort());
    expect(run.writes).toEqual([]);
    expect(JSON.stringify(run.turns.map((turn) => turn.outputs))).not.toContain('Чужой сценарий');
    expect(run.requests.filter(([name]) => name.startsWith('video.')).every(([, org]) => org === 'org-1')).toBe(true);
  },
};
