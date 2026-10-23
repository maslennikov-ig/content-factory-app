'use strict';

const { IDS, job, videoRows, summary } = require('./video-world.cjs');
const JOBS = [job(IDS.apiJob, 'api', 'save_failed'), job(IDS.subscriptionJob, 'subscription', 'save_failed'),
  job(IDS.resumeJob, 'subscription', 'reauth_required'), job(IDS.unknownJob, 'subscription', 'submission_unknown')];

module.exports = {
  id: 'video-save-recovery',
  title: 'Повтор сохранения и чтение прежнего задания сохраняют квитанции без новой генерации',
  covers: ['video.retry-save', 'video.retry_save_v2', 'video.resume_v2', 'video.status_v2'],
  world: videoRows({ jobs: JOBS }),
  turns: [
    { say: 'Повтори сохранение двух готовых видео и возобнови статус прежнего задания после переподключения', model: [
      [['tool', 'video_retry-save', { jobId: IDS.apiJob }]],
      [['tool', 'video_retry_save_v2', { jobId: IDS.subscriptionJob }]],
      [['tool', 'video_resume_v2', { jobId: IDS.resumeJob }]],
      [['text', 'Сохраняем прежние результаты и проверяем прежнее задание.']],
    ] },
    { say: 'Что с заданием, ответ по которому потерялся?', model: [
      [['tool', 'video_status_v2', { jobId: IDS.unknownJob }]],
      [['text', 'Исход отправки неизвестен; новую генерацию не запускаем.']],
    ] },
  ],
  check: (run) => {
    expect(summary(run.turns[0], 'video_retry-save')).toMatchObject({ id: IDS.apiJob, state: 'saving' });
    expect(summary(run.turns[0], 'video_retry_save_v2')).toMatchObject({ id: IDS.subscriptionJob, state: 'saving' });
    expect(summary(run.turns[0], 'video_resume_v2')).toMatchObject({ id: IDS.resumeJob, state: 'queued' });
    expect(summary(run.turns[1], 'video_status_v2')).toMatchObject({ id: IDS.unknownJob, state: 'submission_unknown' });
    expect(run.world.video.jobs.map(({ id, receipt }) => ({ id, receipt }))).toEqual(JOBS.map(({ id, receipt }) => ({ id, receipt })));
    expect(run.requests.filter(([name]) => name === 'video.action-v2')).toEqual([
      ['video.action-v2', 'org-1', 'user-1', IDS.subscriptionJob, 'retry-save'],
      ['video.action-v2', 'org-1', 'user-1', IDS.resumeJob, 'resume'],
    ]);
    expect(run.requests.filter(([name]) => ['video.launch', 'video.launch-v2'].includes(name))).toEqual([]);
    expect(run.writes).toEqual([['video.retry-save', IDS.apiJob], ['video.action-v2', IDS.subscriptionJob, 'retry-save'], ['video.action-v2', IDS.resumeJob, 'resume']]);
  },
};
