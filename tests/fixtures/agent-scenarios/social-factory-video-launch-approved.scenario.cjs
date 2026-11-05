'use strict';
const { IDS, digest, approval, productionRow, videoRows, summary } = require('./social-factory-video-world.cjs');
const input = { productionId: IDS.production, approvalId: approval().id, digest };
module.exports = {
  id: 'social-factory-video-launch-approved',
  title: 'Запуск видео ждёт подтверждения точной версии и бюджета; согласие создаёт сохранённые задания один раз',
  covers: ['video.production_launch'],
  world: videoRows({ productions: [productionRow({ state: 'preflight', approval: approval() })] }),
  turns: [
    { say: 'Покажи согласие на сохранённую видеоверсию с лимитом 3 USD.', model: [[['tool', 'video_production_launch', input]]] },
    { approve: true, model: [[['text', 'Согласованная версия передана в очередь. Готовый ролик ещё не получен.']]] },
  ],
  check(run) {
    const [asked, accepted] = run.turns;
    expect(asked.approvals).toEqual([expect.objectContaining({ toolName: 'video_production_launch', reason: 'Запустить «Как подготовить мастерскую»: до 3 USD' })]);
    expect(asked.outputs).toEqual([]);
    expect(asked.data.find(row => row.type === 'data-tool-call-approval').data.args).toEqual(input);
    expect(summary(accepted, 'video_production_launch')).toMatchObject({ id: IDS.production, state: 'approved', digest, result: null,
      approval: { id: input.approvalId, maxTotalUsd: 3, final: { payer: 'workspace_key' } },
      jobs: [{ id: IDS.sceneJob, state: 'accepted', receipt: null }, { id: IDS.finalJob, state: 'awaiting_assets', receipt: null }] });
    expect(run.requests.filter(([name]) => name === 'production.launch')).toEqual([['production.launch', 'org-1', 'user-1', IDS.production, { approvalId: input.approvalId, digest }]]);
    expect(run.writes).toEqual([['production.launched', IDS.production, input.approvalId]]);
    expect(run.world.socialFactoryVideo.launches).toBe(1); expect(run.world.socialFactoryVideo.nativeSaves).toBe(0);
  },
};
