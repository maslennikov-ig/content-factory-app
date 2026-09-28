'use strict';

/**
 * Review W3-20 F12, the residual paths of the key rule:
 * - an MCP client's free text reaches the services and the generation models
 *   with no chat door in front: the adapter redacts every string of the input
 *   with the door's own function before admission reads it;
 * - Mastra's refusal of arguments that fail the schema repeated them («…
 *   received 'sk-…'», «Provided arguments: …») into what the model reads and
 *   the transcript keeps: the adapter keeps the failing paths, never a value.
 */
const {
  IDENTITY,
  executeTool,
  fixtures,
  loadRegistry,
  permissionsService,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((one) => one.id === id);
const KEY = 'gsk_FAKEmcp0000FAKEmcp0000FAKEmcp00';

describe('MCP input is redacted like the chat door’s (F12)', () => {
  test.each(['mcp', 'chat'])('%s: piece.rename with a key in the title', async (entrance) => {
    const seen = [];
    const tool = registry.buildCapabilityTool(find('piece.rename'), {
      services: servicesFrom({
        PieceService: { updateTitle: async (...args) => (seen.push(args), { title: 'x' }) },
      }),
      language: 'en',
      entrance,
      ...(entrance === 'mcp' ? { gate: new registry.DoorPolicyGate(permissionsService()) } : {}),
    });
    const { output } = await executeTool(
      tool,
      { pieceId: 'p1', title: `Новое имя ${KEY}` },
      { requestContext: requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' }) }
    );
    expect(output.ok).toBe(true);
    // The chat's text is redacted at the door, before any tool; MCP has no
    // door, so the adapter does it.
    if (entrance === 'mcp') expect(JSON.stringify(seen)).not.toContain(KEY);
    if (entrance === 'mcp') expect(JSON.stringify(seen)).toContain('[KEY]');
  });
});

describe('an invalid argument is never echoed back (F12)', () => {
  const tool = registry.buildCapabilityTool(find('ai.key.enter'), {
    services: servicesFrom(fixtures()['ai.key.enter']?.services ?? {}),
    language: 'en',
    entrance: 'chat',
  });

  test('the model and the transcript read the failing path, not the value', async () => {
    const raw = await tool.execute(
      { field: 'sk-or-v1-FAKEFAKEFAKEFAKEFAKEFAKE7777' },
      { requestContext: requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' }) }
    );
    // What Mastra itself answers: the value, twice.
    expect(JSON.stringify(raw)).toContain('FAKE');
    const model = tool.toModelOutput(raw);
    expect(model.value).toMatchObject({ ok: false, code: 'CAPABILITY_INPUT_INVALID' });
    expect(model.value.reason).toContain('field');
    expect(JSON.stringify(model)).not.toContain('FAKE');
    expect(JSON.stringify(tool.transform.transcript.output({ output: raw }))).not.toContain('FAKE');
    expect(JSON.stringify(tool.transform.display.output({ output: raw }))).not.toContain('FAKE');
  });
});
