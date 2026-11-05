'use strict';
const { IDS, approval, productionRow, videoRows, summary } = require('./social-factory-video-world.cjs');
const sentReceipt = { requestId: 'existing-provider-scene-request' }, savedReceipt = { requestId: 'existing-final-provider-request', status: 'completed' };
module.exports = {
  id: 'social-factory-video-stop-storage-recovery',
  title: 'Остановка отменяет только неотправленное; повтор сохранения сохраняет старую квитанцию без регенерации',
  covers: ['video.production_stop', 'video.production_retry_save'],
  world: videoRows({ productions: [productionRow({ state: 'approved', approval: approval(), jobs: [
    { id: IDS.sceneJob, state: 'queued', receipt: sentReceipt, generationAttempt: 0, costUsd: null, reservedUsd: 1, costCertainty: 'unknown' },
    { id: IDS.unsentJob, state: 'accepted', receipt: null, generationAttempt: 0 },
    { id: IDS.finalJob, state: 'awaiting_assets', receipt: null, generationAttempt: 0 },
  ] }), productionRow({ id: IDS.recovery, state: 'needs_attention', approval: approval(), jobs: [
    { id: IDS.finalJob, state: 'save_failed', receipt: savedReceipt, generationAttempt: 0, resultMediaId: null },
  ] })] }),
  turns: [{ say: 'Останови неотправленное у первого проекта. У второго сохрани уже готовый результат прежнего задания, не генерируй заново.', model: [
    [['tool', 'video_production_stop', { productionId: IDS.production }]],
    [['tool', 'video_production_retry_save', { productionId: IDS.recovery, jobId: IDS.finalJob }]],
    [['tool', 'video_production_retry_save', { productionId: IDS.recovery, jobId: 'foreign-job' }]],
    [['tool', 'video_production_retry_save', { productionId: IDS.recovery, jobId: IDS.finalJob }]],
    [['text', 'Неотправленные действия остановлены. Сохранение прежнего результата возобновлено; нового готового файла пока нет. Чужое задание не затронуто.']],
  ] }],
  check(run) {
    expect(summary(run.turns[0], 'video_production_stop')).toMatchObject({ state: 'stopped', jobs: [
      { id: IDS.sceneJob, state: 'queued', receipt: sentReceipt, costUsd: null, costCertainty: 'unknown' }, { id: IDS.unsentJob, state: 'canceled', costUsd: 0 }, { id: IDS.finalJob, state: 'canceled', costUsd: 0 },
    ] });
    expect(summary(run.turns[0], 'video_production_retry_save')).toMatchObject({ id: IDS.recovery, state: 'approved', result: null,
      jobs: [{ id: IDS.finalJob, state: 'saving', receipt: savedReceipt, generationAttempt: 0 }] });
    expect(run.turns[0].outputs.slice(-2).map(row => row.output.code)).toEqual(['VIDEO_PRODUCTION_JOB_NOT_FOUND', 'VIDEO_SAVE_RETRY_UNAVAILABLE']);
    expect(run.requests.filter(([name]) => name === 'production.retry-save')[0]).toEqual(['production.retry-save', 'org-1', 'user-1', IDS.recovery, IDS.finalJob]);
    expect(run.requests.filter(([name]) => ['production.create', 'production.launch'].includes(name))).toEqual([]);
    expect(run.writes).toEqual([['production.stopped', IDS.production], ['production.retry-save', IDS.recovery, IDS.finalJob]]);
    expect(run.world.socialFactoryVideo.storageRetries).toBe(1); expect(run.world.socialFactoryVideo.launches).toBe(0);
    expect(run.world.socialFactoryVideo.productions[0].jobs[0].receipt).toEqual(sentReceipt);
  },
};
