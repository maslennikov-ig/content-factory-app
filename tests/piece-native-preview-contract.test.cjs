'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

const { conductorInstructions } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/conductor.instructions.ts'
);
const { CONDUCTOR_SKILL_SPECS } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts',
  { '@mastra/core/skills': { createSkill: (spec) => spec } }
);
const registry = loadRegistry();

describe('existing-piece edits use the native preview flow', () => {
  const content = CONDUCTOR_SKILL_SPECS.find((skill) => skill.name === 'content').instructions;

  test('the always-loaded instructions recover from a text-only preview in prior history', () => {
    const instructions = conductorInstructions({
      language: 'ru',
      now: new Date('2026-10-17T10:00:00.000Z'),
      snapshot: { pieces: [{ id: 'p1', code: 'cnt-45' }] },
    });

    expect(instructions).toMatch(/requested edit to an existing saved, non-empty core/i);
    expect(instructions).toMatch(/piece\.rewrite/);
    expect(instructions).toMatch(/native[^\n]*(proposal|selection)[^\n]*card/i);
    expect(instructions).toMatch(/free-form[^\n]*preview/i);
    expect(instructions).toMatch(/type[^\n]*«Принять»|«Принять»[^\n]*type/i);
    expect(instructions).toMatch(/text-only preview in assistant history/i);
    expect(instructions).toMatch(/typing «Принять» for it changes nothing/i);
    expect(instructions).toMatch(/without asking for it again/i);
    expect(instructions).toMatch(/wait for the native card’s choice/i);
    expect(instructions).toMatch(/tool is unavailable[^\n]*explain why/i);
    expect(instructions).toMatch(/reading or discussing[^\n]*not an edit/i);
    expect(instructions).toMatch(/piece\.create[^\n]*piece\.answer/);
    expect(instructions).toMatch(/title changes[^\n]*piece\.rename/);
    expect(instructions).toMatch(/piece\.core\.edit[^\n]*complete replacement/);
    expect(instructions).toMatch(/never bypass role, access or quota/i);
  });

  test('the content skill routes exact core changes and preserves full verbatim replacement', () => {
    expect(content).toMatch(/edit an existing[^\n]*core[^\n]*piece\.rewrite/i);
    expect(content).toMatch(/exact sentence[^\n]*verbatim|verbatim[^\n]*exact sentence/i);
    expect(content).toMatch(/native[^\n]*(selection|proposal)[^\n]*card/i);
    expect(content).toMatch(/typing «Принять» for it changes nothing/i);
    expect(content).toMatch(/wait for the native card’s choice/i);
    expect(content).toMatch(/complete replacement[^\n]*verbatim|complete core[^\n]*verbatim/i);
    expect(content).toMatch(/piece\.core\.edit/);
    expect(content).toMatch(/reading or discussing is not an edit/i);
    expect(content).toMatch(/new pieces and their questions/i);
    expect(content).toMatch(/`piece\.create` then `piece\.answer`/);
    expect(content).toMatch(/title changes[^\n]*piece\.rename/);
  });

  test('piece.rewrite suspends on the signed before/after selection and writes only selected ids', async () => {
    const proposal = {
      token: 'signed-proposal-token',
      verdict: 'rewrite',
      changes: [{
        id: 'change-1',
        basket: 'show',
        excerpt: 'Исходный core.',
        replacement: 'Исходный core. Точная добавленная фраза.',
        why: 'Добавлена запрошенная фраза.',
      }],
    };
    const calls = {
      reviewV2: jest.fn(async () => proposal),
      acceptReviewV2: jest.fn(async () => undefined),
    };
    const capability = registry.CAPABILITY_CATALOGUE.find((item) => item.id === 'piece.rewrite');
    const tool = registry.buildCapabilityTool(capability, {
      services: servicesFrom({ PieceService: calls }),
      language: 'ru',
      entrance: 'chat',
    });
    const requestContext = requestContextFor(registry);
    const instruction = 'Append exactly this sentence verbatim: «Точная добавленная фраза.»';

    const opened = await executeTool(tool, { pieceId: 'p1', instruction }, { requestContext });

    expect(calls.reviewV2).toHaveBeenCalledWith(
      'org-1', 'p1', undefined, { instruction }, 'ru'
    );
    expect(opened.output).toBeUndefined();
    expect(opened.suspended).toHaveLength(1);
    expect(opened.suspended[0]).toMatchObject({
      kind: 'selection',
      answerKey: 'changeIds',
      canDecideForPerson: true,
      token: 'signed-proposal-token',
      options: [{
        id: 'change-1',
        selected: true,
        preview: {
          before: 'Исходный core.',
          after: 'Исходный core. Точная добавленная фраза.',
          target: 'text',
        },
      }],
    });
    expect(calls.acceptReviewV2).not.toHaveBeenCalled();

    const accepted = await executeTool(tool, { pieceId: 'p1', instruction }, {
      requestContext,
      resumeData: { changeIds: ['change-1'] },
      suspendPayload: opened.suspended[0],
    });

    expect(calls.reviewV2).toHaveBeenCalledTimes(1);
    expect(calls.acceptReviewV2).toHaveBeenCalledWith('org-1', 'p1', undefined, {
      token: 'signed-proposal-token',
      selectedIds: ['change-1'],
    });
    expect(accepted.suspended).toEqual([]);
  });
});
