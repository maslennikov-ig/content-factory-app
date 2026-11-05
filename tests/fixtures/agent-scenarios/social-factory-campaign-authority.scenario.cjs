'use strict';
const { IDS, GRANT, campaignRows, readyItem, approvalDigest, summary, payload } = require('./social-factory-world.cjs');
const digest = approvalDigest(readyItem());
module.exports = {
  id: 'social-factory-campaign-authority',
  title: 'Разрешение, режим и согласование требуют карточек; очередь не выдаётся за публикацию',
  covers: ['campaign.grant', 'campaign.mode', 'campaign.approve', 'campaign.deliver', 'campaign.reconcile', 'campaign.revoke', 'campaign.decide_editorial', 'channel.editorial_profile', 'channel.discover'],
  role: 'ADMIN',
  world: campaignRows(),
  turns: [
    { say: 'Покажи профиль канала и темы из своего брифа без поиска в интернете', model: [
      [['tool', 'channel_editorial_profile', { channelId: 'c1' }]],
      [['tool', 'channel_discover', { channelId: 'c1', sourceIds: [], allowWebSearch: false }]],
      [['text', 'Аудитория задана владельцем, сравнительные показатели неизвестны.']],
    ] },
    { say: 'Разрешаю подготовку и редакционные решения в этом канале в пределах пяти долларов, покажи точные права', model: [[['tool', 'campaign_grant', GRANT]]] },
    { approve: true, model: [[['text', 'Ограниченное разрешение сохранено.']]] },
    { say: 'Переведи эту кампанию в автопилот по сохранённому разрешению', model: [[['tool', 'campaign_mode', { campaignId: IDS.campaign, mode: 'autopilot', grantId: IDS.grant }]]] },
    { approve: true, model: [[['text', 'Режим кампании изменён.']]] },
    { say: 'Выбери редакционный заход, не добавляя фактов о компании', model: [
      [['tool', 'campaign_decide_editorial', { campaignId: IDS.campaign, grantId: IDS.grant, requestId: 'scenario-editorial-question', question: 'С чего начать материал о повестке?' }]],
      [['text', 'Начать с одного практического шага; это редакционное предположение.']],
    ] },
    { say: 'Согласуй показанный первый материал ровно второй версии', model: [[['tool', 'campaign_approve', { campaignId: IDS.campaign, itemId: IDS.first, expectedContentRevision: 2, digest }]]] },
    { approve: true, model: [[['text', 'Согласована показанная версия.']]] },
    { say: 'Поставь согласованную версию в календарь', model: [[['tool', 'campaign_deliver', { campaignId: IDS.campaign, itemId: IDS.first, requestId: 'scenario-schedule', action: 'schedule', expectedContentRevision: 2, approvalDigest: digest, grantId: IDS.grant }]]] },
    { approve: true, model: [[['text', 'Материал запланирован. Подтверждения публикации нет.']]] },
    { say: 'Проверь существующий результат без повторной отправки и отзови разрешение', model: [
      [['tool', 'campaign_reconcile', { campaignId: IDS.campaign, itemId: IDS.first }]],
      [['tool', 'campaign_revoke', { grantId: IDS.grant }]],
      [['text', 'В очереди был материал без публикационного чека. Разрешение отозвано.']],
    ] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'channel_editorial_profile')).toMatchObject({ revision: 1, profile: { channelId: 'c1' }, facts: expect.arrayContaining([{ key: 'audience', value: 'Руководители команд', provenance: 'owner_asserted', scope: 'channel', evidenceIds: [] }]) });
    expect(summary(run.turns[0], 'channel_discover')).toMatchObject({ discoveryId: 'offline-discovery', candidates: [{ channelId: 'c1', performance: { availability: 'unknown' } }], findingIds: [] });
    for (const [index, tool] of [[1, 'campaign_grant'], [3, 'campaign_mode'], [6, 'campaign_approve'], [8, 'campaign_deliver']]) {
      expect(run.turns[index].approvals).toHaveLength(1);
      expect(run.turns[index].approvals[0]).toMatchObject({ toolName: tool });
      expect(run.turns[index].outputs).toEqual([]);
    }
    expect(summary(run.turns[2], 'campaign_grant')).toMatchObject({ grantId: IDS.grant, mode: 'autopilot', channelIds: ['c1'] });
    expect(summary(run.turns[5], 'campaign_decide_editorial').decision).toMatchObject({ kind: 'editorial', factStatus: 'inferred', actorId: 'user-1', evidence: [] });
    expect(summary(run.turns[9], 'campaign_deliver').delivery).toMatchObject({ state: 'scheduled', postId: `scheduled-${IDS.first}` });
    expect(summary(run.turns[10], 'campaign_reconcile')).toEqual({ itemId: IDS.first, state: 'scheduled', receipt: null, resent: false });
    expect(payload(run, 'grant', IDS.grant)).toMatchObject({ actorId: 'user-1', revokedAt: expect.any(String) });
    expect(payload(run, 'campaign_item', IDS.first)).toMatchObject({ state: 'cancelled', contentRevision: 2, approval: { actorId: 'user-1', digest } });
    expect(payload(run, 'campaign_item', IDS.first).publication).toBeUndefined();
    expect(payload(run, 'campaign_item', IDS.second)).toMatchObject({ state: 'ready', contentRevision: 2 });
    const delivered = run.requests.filter(([name]) => name === 'campaign.deliver');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toEqual(['campaign.deliver', 'org-1', 'user-1', expect.objectContaining({ authority: 'user', actorId: 'user-1', expectedContentRevision: 2, approvalDigest: digest }), 'ru']);
    expect(run.world.socialFactory.cancellations).toEqual([IDS.campaign]);
    expect(run.world.socialFactory.attempts).toEqual([]);
  },
};
