'use strict';

/**
 * Runs the capability hooks inside a real Mastra `Agent` with a scripted
 * model and prints what happened as JSON (`content-factory-next-kcxz.6`).
 *
 * A child process of `tests/agent-capabilities.hooks.test.cjs`: the agent
 * module reaches ESM-only packages the jest runner cannot load. No network,
 * no database, no paid call — the model is a script and the services are
 * fakes from `agent-capabilities.cjs`.
 */

const { Agent } = require('@mastra/core/agent');
const {
  IDENTITY,
  fixtures,
  loadRegistry,
  permissionsService,
  servicesFrom,
  requestContextFor,
} = require('./agent-capabilities.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;

const usage = {
  inputTokens: { total: 1, noCache: 1 },
  outputTokens: { total: 1, text: 1 },
};

/** A v3 language model: first step the given tool calls at once, then text. */
const scripted = (calls, seen) => {
  let step = 0;
  return {
    specificationVersion: 'v3',
    provider: 'scripted',
    modelId: 'scripted',
    supportedUrls: {},
    doStream: async () => {
      throw new Error('The scripted model only generates.');
    },
    doGenerate: async (options) => {
      step += 1;
      if (step > 1 && seen) {
        // What the model is shown for each tool result on the next step.
        for (const message of options.prompt) {
          if (message.role !== 'tool') continue;
          for (const part of message.content) seen.push(part.output);
        }
      }
      return step === 1
        ? {
            content: calls.map(([toolName, input], index) => ({
              type: 'tool-call',
              toolCallId: `call-${index}`,
              toolName,
              input: JSON.stringify(input),
            })),
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
            warnings: [],
          }
        : {
            content: [{ type: 'text', text: 'Готово.' }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
            warnings: [],
          };
    },
  };
};

const allowAll = { check: async () => ({ allowed: true, policies: [] }) };
const outcomesOf = (result) =>
  result.toolResults.map((entry) => (entry.payload ?? entry).result);

const paidCap = async () => {
  const all = fixtures();
  const intake = all['piece.create'].services.IntakeService;
  let runs = 0;
  const tools = registry.buildMastraCapabilityTools(catalogue, {
    services: servicesFrom({
      IntakeService: {
        ...intake,
        prepare: async (...args) => {
          runs += 1;
          return intake.prepare(...args);
        },
      },
    }),
    language: 'ru',
  });
  const agent = new Agent({
    id: 'capability-paid-cap',
    name: 'capability-paid-cap',
    instructions: 'test',
    model: scripted([
      ['piece_create', { text: 'первая мысль' }],
      ['piece_create', { text: 'вторая мысль' }],
      ['piece_create', { text: 'третья мысль' }],
    ]),
    tools,
    hooks: registry.createCapabilityHooks(catalogue, allowAll),
  });
  const result = await agent.generate('напиши три заготовки', {
    requestContext: requestContextFor(registry),
    maxSteps: 3,
  });
  return { runs, outcomes: outcomesOf(result) };
};

const roleRefusal = async () => {
  let calls = 0;
  const seen = [];
  const tools = registry.buildMastraCapabilityTools(catalogue, {
    services: servicesFrom({
      PieceService: { updateTitle: async () => void (calls += 1) },
    }),
    language: 'ru',
  });
  const agent = new Agent({
    id: 'capability-role',
    name: 'capability-role',
    instructions: 'test',
    model: scripted([['piece_rename', { pieceId: 'p1', title: 'Новое' }]], seen),
    tools,
    hooks: registry.createCapabilityHooks(
      catalogue,
      new registry.DoorPolicyGate(permissionsService())
    ),
  });
  const result = await agent.generate('переименуй', {
    requestContext: requestContextFor(registry, { ...IDENTITY, role: 'USER' }),
    maxSteps: 3,
  });
  const modelSaw = seen[0]?.value ?? seen[0] ?? null;
  return { calls, outcomes: outcomesOf(result), modelSaw };
};

(async () => {
  const report = { paidCap: await paidCap(), roleRefusal: await roleRefusal() };
  process.stdout.write(JSON.stringify(report));
})().catch((error) => {
  process.stderr.write(String(error?.stack || error));
  process.exit(1);
});
