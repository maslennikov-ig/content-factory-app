'use strict';
const { IDS, measurementRows, summary, artifact, proposalInput } = require('./social-factory-measurement-world.cjs');
const world = measurementRows(); const prepared = artifact(world.socialFactoryMeasurement); const proposal = proposalInput(world.socialFactoryMeasurement);
module.exports = {
  id: 'social-factory-measurement-helixa', title: 'Helixa: нет подключения и нет свежего ответа — честные состояния; предложение только после карточки', role: 'ADMIN', covers: ['campaign.finding_feedback', 'campaign.propose_finding', 'helixa.read'], world,
  turns: [
    { say: 'Прочитай утверждение компании из Helixa', model: [[['tool', 'helixa_read', { operation: 'knowledge.read', projectId: IDS.project, resourceIds: [IDS.baseClaim] }]], [['text', 'Явное подключение Helixa не настроено.']]] },
    { say: 'Подключение настроено, проверь две записи CRM', before(rows) { rows.socialFactoryMeasurement.helixa.connected = true; }, model: [[['tool', 'helixa_read', { operation: 'crm.outcomes.read', projectId: IDS.project, resourceIds: ['crm-deal-1', 'private-deal'] }]], [['text', 'Есть выигранная сделка, её сумма не подтверждает оплату; источник CRM не доказывает связь с кликом. Вторая запись недоступна.']]] },
    { say: 'Helixa перестала отвечать, перепроверь компанию', before(rows) { rows.socialFactoryMeasurement.helixa.unavailable = true; }, model: [[['tool', 'helixa_read', { operation: 'knowledge.read', projectId: IDS.project, resourceIds: [IDS.baseClaim] }]], [['text', 'Свежие данные недоступны; прежнюю копию использовать нельзя.']]] },
    { say: 'Подготовь артефакт принятого вывода и предложи зарегистрированный вариант в Helixa', before(rows) { rows.socialFactoryMeasurement.helixa.unavailable = false; }, model: [[['tool', 'campaign_finding_feedback', { findingId: IDS.accepted }]], [['tool', 'campaign_propose_finding', proposal]]] },
    { approve: true, model: [[['text', 'Helixa приняла предложение кандидатом; подтверждённые факты компании не заменены.']]] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'helixa_read')).toMatchObject({ status: 'not_connected', eraseCurrentCopy: true });
    const crm = summary(run.turns[1], 'helixa_read').response.data.outcomes;
    expect(crm[0]).toMatchObject({ statusClass: 'won', dealValue: { amountMinor: 125000, currency: 'USD' }, payment: { status: 'unavailable' }, trackingAttribution: { status: 'unavailable' }, attributionSourceSemantics: 'crm_lead_source' });
    expect(crm[1]).toEqual({ id: 'private-deal', status: 'unavailable', eraseCurrentCopy: true });
    expect(summary(run.turns[2], 'helixa_read')).toEqual({ status: 'unavailable', reason: 'helixa_fresh_evidence_unavailable', eraseCurrentCopy: true });
    expect(summary(run.turns[3], 'campaign_finding_feedback')).toMatchObject({ sha256: prepared.sha256, findingRevision: 1, registrationRequired: true });
    expect(run.turns[3].outputs.map(row => row.toolName)).toEqual(['campaign_finding_feedback']);
    expect(run.turns[3].approvals).toEqual([expect.objectContaining({ toolName: 'campaign_propose_finding' })]);
    expect(run.turns[3].data.find(row => row.type === 'data-tool-call-approval').data.args).toEqual(proposal);
    expect(summary(run.turns[4], 'campaign_propose_finding')).toMatchObject({ status: 'available', response: { operation: 'knowledge.propose', data: { reviewState: 'candidate', revision: 1 } } });
    expect(run.writes).toEqual([['helixa.finding.proposed', IDS.accepted, proposal.commandId, prepared.sha256]]);
    expect(run.world.socialFactoryMeasurement.claimedLeads).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'SocialFactoryHelixaExchangeService.proposeRegisteredFinding')).toHaveLength(1);
    expect(run.requests.filter(([name]) => name === 'SocialFactoryHelixaExchangeService.exchange').every(row => row[1] === 'org-1')).toBe(true);
  },
};
