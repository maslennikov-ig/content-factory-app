'use strict';

/**
 * `kcxz.38`: a check's notes rows keep the text (no safe rewrite, a
 * replacement that would repeat the post, a never-say word nobody covered).
 * The chat card offers only what can be accepted, so the notes reach the agent
 * in the summary (`leftAsIs`) and the agent says them in words.
 */

const {
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((capability) => capability.id === id);
const build = (id, services) =>
  registry.buildCapabilityTool(find(id), {
    services: servicesFrom(services),
    language: 'ru',
    entrance: 'chat',
  });
const context = () => ({ requestContext: requestContextFor(registry) });
const input = { pieceId: 'p1', adaptationId: 'a1', check: 'ai_traces' };
const note = {
  id: 'never-say-1',
  excerpt: 'синергию',
  replacement: 'синергию',
  why: 'Слово из списка аватара «никогда не говорить»',
  basket: 'show',
};
const change = {
  id: 'c1',
  excerpt: 'В современном быстро меняющемся мире, ',
  replacement: '',
  why: 'Пустой штамп',
  basket: 'show',
};
const services = (changes, accepted = []) => ({
  PieceService: {
    reviewV2: async () => ({ token: 't', verdict: 'review', changes }),
    acceptReviewV2: async (organizationId, pieceId, adaptationId, body) => {
      accepted.push(body.selectedIds);
      return {};
    },
  },
});

describe('review notes reach the agent (kcxz.38)', () => {
  test('only notes: nothing to accept, the notes are said', async () => {
    const { output } = await executeTool(build('adaptation.review', services([note])), input, context());
    expect(output.summary).toMatchObject({
      outcome: 'nothing-to-change',
      offered: 0,
      leftAsIs: ['«синергию» — Слово из списка аватара «никогда не говорить»'],
    });
    expect(output.summary.leftAsIsNote).toContain('do not claim they were fixed');
    // release check 27.09 P2-a: «одна фраза осталась без правок» named nothing.
    expect(output.summary.leftAsIsNote).toContain('quote each left-as-is phrase verbatim');
  });

  test('a card with a change and a note: the note rides on the stored card, not on the options', async () => {
    const accepted = [];
    const tool = build('adaptation.review', services([change, note], accepted));
    const asked = await executeTool(tool, input, context());
    const card = asked.suspended[0];
    expect(card.options.map((option) => option.id)).toEqual(['c1']);
    const { output } = await executeTool(tool, input, {
      ...context(),
      resumeData: { decideForPerson: true },
      suspendPayload: card,
    });
    expect(accepted).toEqual([['c1']]);
    expect(output.summary).toMatchObject({ outcome: 'applied', applied: 1, leftAsIs: [expect.stringContaining('синергию')] });
  });
});

test('the notes stay on the server: the card the browser gets has none', () => {
  expect(registry.questionCardView({ kind: 'selection', options: [], notes: ['«x»'] })).not.toHaveProperty('notes');
});
