'use strict';
const { IDS, measurementRows, summary } = require('./social-factory-measurement-world.cjs');
module.exports = {
  id: 'social-factory-measurement-learning-review', title: 'Вывод принимается и отзывается по версии; чужой и устаревший ID ничего не меняют', covers: ['campaign.findings', 'campaign.finding_review'], world: measurementRows(),
  turns: [
    { say: 'Какие проверяемые выводы уже применяются для Instagram?', model: [[['tool', 'campaign_findings', { channelId: 'c2' }]], [['text', 'Есть временная ассоциация с оговоркой и долей новых экспериментов.']]] },
    { say: 'Прими предложенный вывод, версия 1', model: [[['tool', 'campaign_finding_review', { findingId: IDS.proposed, expectedRevision: 1, action: 'accept' }]], [['text', 'Принят как временная рекомендация.']]] },
    { say: 'Отзови по старой версии и проверь чужой ID', model: [[['tool', 'campaign_finding_review', { findingId: IDS.proposed, expectedRevision: 1, action: 'withdraw' }]], [['tool', 'campaign_finding_review', { findingId: IDS.foreignFinding, expectedRevision: 1, action: 'withdraw' }]], [['text', 'Версия устарела, чужой вывод недоступен.']]] },
    { say: 'Отзови собственный вывод по актуальной версии 2 и перечитай планирование', model: [[['tool', 'campaign_finding_review', { findingId: IDS.proposed, expectedRevision: 2, action: 'withdraw' }]], [['tool', 'campaign_findings', { channelId: 'c2' }]], [['text', 'Отозванный вывод больше не используется.']]] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'campaign_findings')).toMatchObject({ findingIds: [IDS.accepted], explorationShare: 0.25 });
    expect(summary(run.turns[1], 'campaign_finding_review')).toMatchObject({ id: IDS.proposed, revision: 2, finding: { status: 'accepted', interpretation: 'association', sampleSize: 6 } });
    expect(run.turns[2].outputs.every(row => row.output.ok === false && row.output.code === 'FINDING_REVISION_CONFLICT')).toBe(true);
    expect(summary(run.turns[3], 'campaign_findings').findingIds).toEqual([IDS.accepted]);
    expect(run.writes.filter(([name]) => name === 'social.finding.reviewed')).toEqual([['social.finding.reviewed', IDS.proposed, 2, 'accepted'], ['social.finding.reviewed', IDS.proposed, 3, 'withdrawn']]);
    expect(run.world.socialFactoryMeasurement.findings.find(row => row.id === IDS.foreignFinding)).toMatchObject({ organizationId: 'org-2', revision: 1, payload: { status: 'accepted' } });
  },
};
