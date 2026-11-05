'use strict';
const { IDS, measurementRows, proposalInput } = require('./social-factory-measurement-world.cjs');
const world = measurementRows({ helixa: { connected: true, unavailable: false, projectId: IDS.project, organizationId: 'helixa-org-1', proposals: [] } });
const proposal = proposalInput(world.socialFactoryMeasurement);
module.exports = {
  id: 'social-factory-measurement-proposal-stale', title: 'Изменённый после карточки вывод не отправляется в Helixa по старому согласию', role: 'ADMIN', covers: ['campaign.propose_finding'], world, endsPending: true,
  turns: [
    { say: 'Предложи зарегистрированный принятый вывод в Helixa', model: [[['tool', 'campaign_propose_finding', proposal]]] },
    { approve: true, before(rows) { const finding = rows.socialFactoryMeasurement.findings.find(row => row.id === IDS.accepted); finding.revision = 2; finding.payload.statement = 'Уточнённый после карточки вывод с другой областью применимости.'; }, model: [[['tool', 'campaign_propose_finding', proposal]]] },
  ],
  check(run) {
    expect(run.turns[0].approvals).toEqual([expect.objectContaining({ toolName: 'campaign_propose_finding' })]);
    expect(run.turns[1].outputs[0].output).toMatchObject({ ok: false, code: 'APPROVAL_CONTENT_CHANGED' });
    expect(run.writes).toEqual([]); expect(run.world.socialFactoryMeasurement.helixa.proposals).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'SocialFactoryHelixaExchangeService.proposeRegisteredFinding')).toEqual([]);
  },
};
