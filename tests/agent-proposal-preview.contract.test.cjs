const {
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const registry = loadRegistry();
const build = (id, services) =>
  registry.buildCapabilityTool(
    registry.CAPABILITY_CATALOGUE.find((c) => c.id === id),
    { services: servicesFrom(services), language: 'ru', entrance: 'chat' }
  );
const context = () => ({ requestContext: requestContextFor(registry) });
test('full replacement is exposed before selection without signed proposal or snapshot', async () => {
  const before = 'Old paragraph.\n\n' + 'old '.repeat(6000),
    after = 'New overview.\n\n' + 'new '.repeat(6000);
  const asked = await executeTool(
    build('piece.rewrite', {
      PieceService: {
        reviewV2: async () => ({
          token: 'private-token',
          verdict: 'review',
          changes: [
            {
              id: 'c1',
              excerpt: before,
              replacement: after,
              why: 'New period',
              basket: 'show',
              target: 'body',
            },
          ],
        }),
      },
    }),
    { pieceId: 'p1', instruction: 'Update period' },
    context()
  );
  const card = registry.questionCardView(asked.suspended[0]);
  expect(card.options[0].preview).toEqual({
    before,
    after,
    reason: 'New period',
    target: 'text',
  });
  expect(card.options[0].label.length).toBeLessThan(200);
  expect(JSON.stringify(card)).not.toContain('private-token');
  const { readQuestion } = loadTypeScriptModule(
    'apps/frontend/src/components/agents/agent.contract.ts'
  );
  expect(readQuestion('piece_rewrite', card, {}).options[0].preview).toEqual(
    card.options[0].preview
  );
});
test('nested extra preview keys do not escape the server or enter the screen question', () => {
  const payload = {
    kind: 'selection',
    question: 'Changes',
    answerKey: 'changeIds',
    options: [
      {
        id: 'c1',
        label: 'Change',
        selected: true,
        preview: { before: 'A', after: 'B', token: 'never-expose' },
      },
    ],
    canDecideForPerson: true,
    token: 'secret',
  };
  const shown = registry.questionCardView(payload);
  expect(JSON.stringify(shown)).not.toContain('never-expose');
  expect(JSON.stringify(shown)).not.toContain('secret');
});
test('research completion has final applied state and zero waiting choices', async () => {
  const tool = build('piece.research', {
    PieceService: { acceptCoreResearch: async () => ({}) },
  });
  const { output } = await executeTool(
    tool,
    { pieceId: 'p1' },
    {
      ...context(),
      resumeData: { factKeys: ['f1'] },
      suspendPayload: {
        kind: 'selection',
        question: 'Facts',
        answerKey: 'factKeys',
        options: [{ id: 'f1', label: 'Fact', selected: true }],
        canDecideForPerson: true,
        snapshotKey: 'private-snapshot',
        level: 'standard',
      },
    }
  );
  expect(output.summary).toMatchObject({
    outcome: 'applied',
    applied: true,
    kept: 1,
    factsCard: 'answered',
    waitingOnCard: 0,
  });
  expect(output.summary.note).toMatch(/already saved/i);
});


test.each(['empty', 'needs_clarification'])('a %s research outcome never creates a phantom answered choice', async (periodStatus) => {
  const { output } = await executeTool(build('piece.research', { PieceService: {
    researchCore: async () => ({ level: 'standard', summary: { periodStatus, gaps: [] } }),
  } }), { pieceId: 'p1' }, context());
  expect(output.summary).toMatchObject({ applied: false, factsCard: 'not_shown', waitingOnCard: 0, periodStatus });
  const { answeredSelectionOf } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  expect(answeredSelectionOf(output)).toBe(false);
});
