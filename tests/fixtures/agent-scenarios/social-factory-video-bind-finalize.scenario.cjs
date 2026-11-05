'use strict';
const { IDS, SOURCE_REVISION, manifest, approval, productionRow, measuredResult, videoRows, summary } = require('./social-factory-video-world.cjs');
const op = (id, itemId, productionId) => ({ id, organizationId: 'org-1', campaignId: IDS.campaign, itemId, pieceId: IDS.piece, contentRevision: 4, state: 'needs_video', productionId });
const item = id => ({ id, organizationId: 'org-1', campaignId: IDS.campaign, contentRevision: 4, state: 'needs_input', approval: { digest: 'old-approval' } });
const completed = productionRow({ id: IDS.completed, state: 'completed', approval: approval(),
  jobs: [{ id: IDS.finalJob, state: 'completed', resultMediaId: IDS.media }], result: measuredResult(), inspection: { complete: true, issues: [] } });
const rejected = productionRow({ id: IDS.rejected, state: 'completed', approval: { ...approval(), finalJobId: 'rejected-final-job' },
  jobs: [{ id: 'rejected-final-job', state: 'completed', resultMediaId: IDS.media }], result: measuredResult(), inspection: { complete: false, issues: [{ code: 'duration_mismatch' }] } });
const bind = { campaignId: IDS.campaign, itemId: IDS.item, operationId: IDS.operation,
  manifest: { ...manifest(), pieceRevision: 'model-supplied-stale-revision' }, intentId: 'social_factory_video_binding_001' };
module.exports = {
  id: 'social-factory-video-bind-finalize',
  title: 'Привязка использует текущий источник; приёмка сохраняет измеренное видео один раз и не скрывает замечания',
  covers: ['campaign.bind_video', 'campaign.finalize_video'],
  world: videoRows({ productions: [completed, rejected],
    operations: [op(IDS.operation, IDS.item), op(IDS.finalOperation, IDS.finalItem, IDS.completed), op(IDS.rejectedOperation, IDS.rejectedItem, IDS.rejected)],
    items: [item(IDS.item), item(IDS.finalItem), item(IDS.rejectedItem)] }),
  turns: [{ say: 'Привяжи сохранённый сценарий первого материала без запуска. Прими готовые результаты двух других, но сохрани замечания проверки. Повторная приёмка не должна создавать ещё один черновик.', model: [
    [['tool', 'campaign_bind_video', bind]],
    [['tool', 'campaign_finalize_video', { operationId: IDS.finalOperation }]],
    [['tool', 'campaign_finalize_video', { operationId: IDS.finalOperation }]],
    [['tool', 'campaign_finalize_video', { operationId: IDS.rejectedOperation }]],
    [['tool', 'campaign_bind_video', { ...bind, itemId: IDS.finalItem }]],
    [['text', 'Первый сценарий привязан без запуска. Измеренное видео второго сохранено; третий требует правки по проверке. Повторная приёмка ничего не перегенерировала.']],
  ] }],
  check(run) {
    const turn = run.turns[0], data = run.world.socialFactoryVideo;
    expect(summary(turn, 'campaign_bind_video')).toMatchObject({ id: IDS.production, state: 'draft', manifest: { pieceId: IDS.piece, pieceRevision: SOURCE_REVISION } });
    const saved = summary(turn, 'campaign_finalize_video');
    expect(saved).toMatchObject({ state: 'ready', inspection: { complete: true }, material: { derivationId: 'sf-final-native-draft',
      assets: [{ mediaId: IDS.media, durationSeconds: 29.4, width: 1080, height: 1920, provenance: { jobId: IDS.finalJob }, videoEvidence: { metadata: { source: 'mp4_bytes' } } }] } });
    const finals = turn.outputs.filter(row => row.toolName === 'campaign_finalize_video').map(row => row.output.summary.untrustedData.value);
    expect(finals[1]).toMatchObject({ state: 'ready', regenerated: false });
    expect(finals[2]).toMatchObject({ state: 'needs_revision', inspection: { complete: false, issues: [{ code: 'duration_mismatch' }] } });
    expect(turn.outputs.at(-1).output).toMatchObject({ ok: false, code: 'CAMPAIGN_VIDEO_SCOPE' });
    expect(data.items[0]).toEqual(item(IDS.item));
    expect(data.items[1]).toMatchObject({ state: 'ready', contentRevision: 5 }); expect(data.items[1].approval).toBeUndefined();
    expect(data.items[2]).toMatchObject({ state: 'needs_input', contentRevision: 5 });
    expect(data.nativeSaves).toBe(1); expect(data.launches).toBe(0); expect(data.storageRetries).toBe(0);
    expect(run.requests.find(([name]) => name === 'campaign.bind-video')).toEqual(['campaign.bind-video', 'org-1', 'user-1', IDS.campaign, IDS.item, bind]);
    expect(run.requests.filter(([name]) => name === 'campaign.finalize-video').every(row => row[1] === 'org-1' && row[2] === 'user-1')).toBe(true);
    expect(run.writes).toEqual([['production.created', IDS.production, 1], ['campaign.video-bound', IDS.item, IDS.production],
      ['campaign.video-native-saved', IDS.finalItem, IDS.media], ['campaign.video-finalized', IDS.finalItem, 'ready', 5],
      ['campaign.video-finalized', IDS.rejectedItem, 'needs_revision', 5]]);
  },
};
