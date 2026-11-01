'use strict';
const { loadRegistry, servicesFrom, requestContextFor, executeTool } = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const registry = loadRegistry();
const { answerFitsCard, questionCardId } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/question-card.ts');
const context = () => ({ requestContext: requestContextFor(registry) });
const input = { pieceId: 'p1', instruction: 'Rewrite' };
const changes = [
  { id: 'a', excerpt: 'old', replacement: 'new', basket: 'show' },
  { id: 'b', excerpt: 'remove', replacement: '', basket: 'show' },
];
const makeTool = (accepted) => registry.buildCapabilityTool(
  registry.CAPABILITY_CATALOGUE.find((c) => c.id === 'piece.rewrite'),
  { services: servicesFrom({ PieceService: {
    reviewV2: async () => ({ token: 'private-token', verdict: 'review', changes }),
    previewReviewV2: (_org, _piece, _adaptation, input) => {
      expect(input).toEqual({ token: 'private-token', selectedIds: ['a', 'b'] });
      return { title: null, text: 'new\n' + 'long '.repeat(15000) };
    },
    acceptReviewV2: async (_org, _piece, _adaptation, body) => { accepted.push(body.selectedIds); },
  } }), language: 'ru', entrance: 'chat' }
);

test('full proposal is visible, bound to card, and only all or none can be decided', async () => {
  const accepted = [], tool = makeTool(accepted);
  const opened = await executeTool(tool, input, context());
  const stored = opened.suspended[0], shown = registry.questionCardView(stored);
  expect(shown.fullPreview).toEqual({ title: null, text: 'new\n' + 'long '.repeat(15000) });
  expect(shown.canDecideForPerson).toBe(false);
  expect(JSON.stringify(shown)).not.toContain('private-token');
  expect(questionCardId(stored)).not.toBe(questionCardId({ ...stored, fullPreview: { ...stored.fullPreview, text: 'tampered' } }));
  for (const invalid of [{ changeIds: ['a'] }, { changeIds: ['a', 'a'] }, { changeIds: ['a', 'unknown'] }, { decideForPerson: true }, { changeIds: [], decideForPerson: false }, {}]) {
    expect(answerFitsCard(stored, invalid)).toBe(false);
    const result = await executeTool(tool, input, { ...context(), suspendPayload: stored, resumeData: invalid });
    expect(result.output).toMatchObject({ code: 'REVIEW_SELECTION' });
  }
  for (const options of [[{ label: 'missing id' }], [{ id: 'a' }, { id: 'a' }], [null]]) {
    expect(answerFitsCard({ ...stored, options }, { changeIds: [] })).toBe(false);
  }
  expect(accepted).toEqual([]);
  for (const ids of [['b', 'a'], []]) {
    expect(answerFitsCard(stored, { changeIds: ids })).toBe(true);
    const result = await executeTool(tool, input, { ...context(), suspendPayload: stored, resumeData: { changeIds: ids } });
    expect(result.output.summary.outcome).toBe(ids.length ? 'applied' : 'kept-as-is');
  }
  expect(accepted).toEqual([['a', 'b']]);
});

test('legacy selection still accepts partial choices and delegation', async () => {
  const accepted = [], tool = makeTool(accepted);
  const { suspended } = await executeTool(tool, input, context());
  const { fullPreview, ...old } = suspended[0];
  old.canDecideForPerson = true;
  for (const answer of [{ changeIds: ['b'] }, { decideForPerson: true }]) {
    expect(answerFitsCard(old, answer)).toBe(true);
    await executeTool(tool, input, { ...context(), suspendPayload: old, resumeData: answer });
  }
  expect(accepted).toEqual([['b'], ['a', 'b']]);
});
