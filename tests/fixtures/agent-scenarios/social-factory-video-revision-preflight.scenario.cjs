'use strict';
const { IDS, manifest, intentId, digest, productionRow, videoRows, summary } = require('./social-factory-video-world.cjs');
const input = { manifest: manifest(), intentId };
module.exports = {
  id: 'social-factory-video-revision-preflight',
  title: 'Версия видео сохраняется один раз; бюджет проверяется до запуска, чужие проекты закрыты',
  covers: ['video.production_create', 'video.production_open', 'video.production_preflight'],
  world: videoRows({ productions: [productionRow({ id: IDS.foreign, intentId: intentId + '_foreign', organizationId: 'org-foreign', manifest: { ...manifest(), title: 'Чужой закрытый проект' } }),
    productionRow({ id: IDS.otherActor, intentId: intentId + '_other_actor', userId: 'user-other' })] }),
  turns: [{ say: 'Сохрани эту версию без запуска. Повтори тот же запрос, открой её и проверь сначала лимит 0,5 USD, затем согласованный мной лимит 3 USD.', model: [
    [['tool', 'video_production_create', input]], [['tool', 'video_production_create', input]],
    [['tool', 'video_production_open', { productionId: IDS.production }]],
    [['tool', 'video_production_preflight', { productionId: IDS.production, maxTotalUsd: 0.5 }]],
    [['tool', 'video_production_preflight', { productionId: IDS.production, maxTotalUsd: 3 }]],
    [['tool', 'video_production_open', { productionId: IDS.foreign }]],
    [['tool', 'video_production_preflight', { productionId: IDS.otherActor, maxTotalUsd: 3 }]],
    [['text', 'Версия сохранена, лимит 3 USD проходит проверку. Запуска не было; чужие данные и права другого пользователя недоступны.']],
  ] }],
  check(run) {
    const turn = run.turns[0], results = turn.outputs.map(row => row.output);
    expect(summary(turn, 'video_production_create')).toMatchObject({ id: IDS.production, revision: 1, digest, state: 'draft' });
    expect(summary(turn, 'video_production_open')).toMatchObject({ id: IDS.production, state: 'draft', jobs: [] });
    const checks = turn.outputs.filter(row => row.toolName === 'video_production_preflight');
    expect(checks[0].output.summary.untrustedData.value.approval).toMatchObject({ maxTotalUsd: 0.5, blockers: ['VIDEO_PRODUCTION_TOTAL_BUDGET_EXCEEDED'] });
    expect(checks[1].output.summary.untrustedData.value.approval).toMatchObject({ maxTotalUsd: 3, blockers: [], final: { payer: 'workspace_key' } });
    expect(results.slice(-2).map(row => row.code)).toEqual(['VIDEO_PRODUCTION_NOT_FOUND', 'VIDEO_PRODUCTION_ACTOR_MISMATCH']);
    expect(JSON.stringify(turn.outputs)).not.toContain('Чужой закрытый проект');
    expect(run.requests.filter(([name]) => name === 'production.create')).toEqual([['production.create', 'org-1', 'user-1', input], ['production.create', 'org-1', 'user-1', input]]);
    expect(run.writes).toEqual([['production.created', IDS.production, 1], ['production.preflight', IDS.production, 0.5], ['production.preflight', IDS.production, 3]]);
    expect(run.world.socialFactoryVideo.launches).toBe(0); expect(turn.approvals).toEqual([]);
  },
};
