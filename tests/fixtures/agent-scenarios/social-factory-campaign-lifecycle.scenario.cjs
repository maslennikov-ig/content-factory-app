'use strict';
const { IDS, CREATION, campaignRows, summary, payload } = require('./social-factory-world.cjs');
const foreign = { organizationId: 'org-foreign', kind: 'campaign', id: 'foreign-campaign', revision: 1, payload: { id: 'foreign-campaign', name: 'Foreign private campaign', itemIds: [] } };
module.exports = {
  id: 'social-factory-campaign-lifecycle',
  title: 'Кампания сохраняет точное число материалов, повтор не размножает их, чужой ID не читается',
  covers: ['campaign.create', 'campaign.open', 'campaign.list', 'campaign.stop'],
  world: campaignRows({ seed: 'none', records: [foreign] }),
  turns: [
    { say: 'Создай два поста в канале про работу на две недели', model: [
      [['tool', 'campaign_create', CREATION]],
      [['tool', 'campaign_open', { campaignId: IDS.campaign }], ['tool', 'campaign_list', {}]],
      [['text', 'План из двух материалов сохранён. Публикаций пока нет.']],
    ] },
    { say: 'Повтори запрос на два поста в том же канале, затем останови кампанию. Чужая кампания недоступна.', model: [
      [['tool', 'campaign_create', CREATION]],
      [['tool', 'campaign_open', { campaignId: 'foreign-campaign' }]],
      [['tool', 'campaign_stop', { campaignId: IDS.campaign }]],
      [['text', 'Кампания остановлена; чужая кампания не открыта.']],
    ] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'campaign_create')).toMatchObject({ id: IDS.campaign, mode: 'collaborative', state: 'active', total: 2 });
    expect(summary(run.turns[0], 'campaign_open')).toMatchObject({ id: IDS.campaign, total: 2 });
    expect(summary(run.turns[0], 'campaign_list').campaigns).toEqual([expect.objectContaining({ id: IDS.campaign, total: 2 })]);
    expect(run.turns[1].outputs.find((one) => one.toolName === 'campaign_open').output).toMatchObject({ ok: false, code: 'SOCIAL_FACTORY_NOT_FOUND' });
    expect(summary(run.turns[1], 'campaign_stop')).toMatchObject({ state: 'stopped', total: 2 });
    expect(payload(run, 'campaign', IDS.campaign)).toMatchObject({ actorId: 'user-1', state: 'stopped', itemIds: expect.arrayContaining([IDS.first, IDS.second]) });
    const items = run.world.socialFactory.records.filter((one) => one.organizationId === 'org-1' && one.kind === 'campaign_item');
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.payload).toMatchObject({ contentRevision: 1, state: 'cancelled' });
    expect(run.world.socialFactory.records.find((one) => one.organizationId === 'org-foreign')).toEqual(foreign);
    expect(run.requests.filter(([name]) => name === 'campaign.create').map(([, org, actor, input]) => [org, actor, input.actorId, input.requestId])).toEqual([
      ['org-1', 'user-1', 'user-1', CREATION.requestId], ['org-1', 'user-1', 'user-1', CREATION.requestId],
    ]);
    expect(run.world.socialFactory.attempts).toEqual([]);
    expect(run.turns.flatMap((one) => one.approvals)).toEqual([]);
  },
};
