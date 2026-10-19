'use strict';

/** Real intake generator through the native piece.create tool adapter. */
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadRegistry, requestContextFor, servicesFrom, executeTool, IDENTITY } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const intakePath = 'libraries/nestjs-libraries/src/content-intelligence/intake/intake.service.ts';
let modelAnswers;
const modelCalls = [];
const { IntakeService } = loadWithMocks(intakePath, {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
    getChatModel: async (_org, _temperature, _tokens, role) => ({ withStructuredOutput: () => ({ invoke: async prompt => {
      modelCalls.push({ role, prompt });
      if (!modelAnswers.length) throw new Error('Unexpected model call');
      return modelAnswers.shift();
    } }) }),
  },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const now = new Date('2026-10-18T09:00:00Z');
const original = 'Подготовь новую заготовку по подтверждённым изменениям продукта.';
const request = (invalidBoundary = false) => ({ version: 'intake-request/v1', goal: original,
  requestedOutputs: ['новая заготовка'], evidenceNeeds: ['Проверенные изменения из первичных источников'],
  constraints: { research: 'required', ...(invalidBoundary ? { temporal: { mode: 'delta', eventInterval: { start: '2026-10-16', end: '2026-10-09' } } } : {}) } });
const brief = () => ({ goal: original, thesis: 'Проверенные изменения продукта', position: null,
  disagreement: null, audience: 'читатели канала', format: 'auto', facts: [],
  origins: { thesis: 'model', audience: 'model' }, options: {}, questions: [] });

const composed = status => {
  const emitted = [];
  const writes = jest.fn(async () => { throw new Error('An incomplete research outcome must not write'); });
  const research = jest.fn(async () => {
    if (status === 'failed') throw new Error('Retrieval unavailable');
    return { provider: 'tavily', facts: [], sources: [] };
  });
  const service = new IntakeService({}, { research }, {}, {}, { listFacts: async () => [] },
    { resolve: async () => ({ effectiveVoice: null }) }, { recordCore: writes }, {}, {},
    { executeAiOperation: async (_org, _operation, callback) => callback() }, () => now,
    undefined, () => null, null, undefined, null);
  const nativeRun = service.run.bind(service);
  jest.spyOn(service, 'run').mockImplementation(async function* (...args) {
    for await (const event of nativeRun(...args)) { emitted.push(event); yield event; }
  });
  const prepare = jest.spyOn(service, 'prepare');
  const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === 'piece.create');
  const tool = registry.buildCapabilityTool(capability, {
    services: servicesFrom({ IntakeService: service }), language: 'ru', entrance: 'chat',
  });
  return { service, tool, emitted, research, writes, prepare };
};

beforeEach(() => { modelAnswers = [brief()]; modelCalls.length = 0; });

test.each(['empty', 'failed', 'needs_clarification'])('actual intake %s outcome survives piece.create without a facts card or false piece', async status => {
  const { tool, emitted, research, writes, prepare } = composed(status);
  const meaning = request(status === 'needs_clarification');
  // Native tools carry the original words. The existing extraction call
  // supplies understanding instead of a second nested model serialization.
  modelAnswers = [{ ...brief(), understanding: meaning }];
  const execution = await executeTool(tool, { text: original, inputKind: 'instruction', research: 'standard' }, {
    requestContext: requestContextFor(registry),
  });
  // The service itself emits no selection-required/piece event in these cases.
  const ready = emitted.find(event => event.name === 'research-ready');
  expect(ready).toBeDefined();
  expect(ready.summary.status).toBe(status);
  expect(ready.summary.requestedScope).toEqual({ goal: original, evidenceNeeds: meaning.evidenceNeeds });
  expect(ready.summary.gaps.length).toBeGreaterThan(0);
  expect(emitted.some(event => event.name === 'research-selection-required' || event.name === 'piece')).toBe(false);
  expect(emitted.at(-1)).toEqual({ name: 'done', pieceId: null });
  expect(research).toHaveBeenCalledTimes(status === 'needs_clarification' ? 0 : 1);
  expect(writes).not.toHaveBeenCalled();
  expect(modelCalls.map(call => call.role)).toEqual(['extract']);
  expect(prepare).toHaveBeenCalledWith(IDENTITY.organizationId,
    expect.objectContaining({ input: original }), { researchSelectionPolicy: 'model' });
  expect(modelCalls[0].prompt).toContain(original);
  // The real registry/adapter must expose that outcome before the model decides
  // whether to refine search, resolve ambiguity or report the remaining gap.
  expect(execution.output).toMatchObject({ ok: true, capability: 'piece.create', summary: {
    outcome: 'research-ready', waitingOnCard: 0, snapshotKey: null, status,
    evidence: { untrustedData: { sources: ['search-result', 'fetched-page'], value: {
      facts: [], summary: { status, gaps: ready.summary.gaps, requestedScope: ready.summary.requestedScope },
    } } },
  } });
  expect(execution.output.summary).not.toHaveProperty('pieceId');
  expect(execution.output.summary).not.toHaveProperty('facts');
  expect(execution.output.summary).not.toHaveProperty('gaps');
  expect(execution.suspended).toEqual([]);
  expect(execution.parts.some(part => part.kind === 'piece' || part.kind === 'selection')).toBe(false);
  expect(JSON.stringify(execution.model)).toContain(status);
  expect(JSON.stringify(execution.model)).toContain(ready.summary.gaps[0]);
});
