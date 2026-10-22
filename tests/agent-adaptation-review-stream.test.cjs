'use strict';
require('reflect-metadata');
const { EventEmitter } = require('node:events');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadCapabilityModule, loadRegistry, servicesFrom, requestContextFor, executeTool } = require('./helpers/agent-capabilities.cjs');
const { wrapUntrusted } = loadCapabilityModule('untrusted-data.ts');
const noOp = () => () => {};
let streamParts;
const handleChatStream = jest.fn(async () => new ReadableStream({ start(controller) {
  for (const part of streamParts) controller.enqueue(part);
  controller.close();
} }));
const { AgentController } = loadTypeScriptModule('apps/backend/src/api/routes/agent.controller.ts', {
  '@mastra/ai-sdk': { handleChatStream },
  '@mastra/memory': { Memory: class {} },
  '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
  '@nestjs/swagger': { ApiTags: noOp },
  '@contentfactory/backend/services/auth/permissions/permissions.ability': { CheckPolicies: noOp },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
    AuthorizationActions: { Create: 'create' }, Sections: { AI: 'ai' },
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service': { AgentThreadsService: class {} },
});
const report = () => ({ type: 'data-progress', data: {
  capability: 'piece.adapt', stage: 'error', code: 'CONTENT_ADAPTATION_INCOMPLETE', saved: false,
  qualityReview: wrapUntrusted({ reviewAvailable: true,
    missingRequirements: ['The second topic is missing.'], unsupportedClaims: ['Unsupported date.'],
    candidate: { text: 'Rejected candidate', totalCharacters: 18, truncated: false },
  }, ['workspace-text']),
} });
const consume = async parts => {
  streamParts = [...parts, { type: 'finish', finishReason: 'stop' }];
  const turn = { run: work => work(), finish: jest.fn(), stop: jest.fn() };
  const threads = {
    ownThread: async () => null, claimThreadTurn: async () => async () => {},
    workContextForTurn: async () => null, threadForMessage: async () => {}, sessionFor: async () => {},
    isDurableConductor: async () => false, startTurn: async () => turn,
    // Active turns own Stop/settlement only; native PubSub owns stream replay.
    registerActiveTurn: () => ({ finishStream() {} }),
  };
  const admission = { run: work => work(), finish: jest.fn() };
  const controller = new AgentController({ mastra: async () => ({}) }, threads, { beginAiOperation: async () => admission });
  controller.logger = { log() {}, warn() {} };
  const response = new EventEmitter();
  const writes = [];
  Object.assign(response, { headersSent: false, writableEnded: false,
    status() { return this; }, setHeader() {}, flushHeaders() { this.headersSent = true; },
    write(value) { writes.push(value); }, end() { this.writableEnded = true; },
  });
  await controller.chat({ id: 'org', createdAt: new Date('2026-01-01'), users: [{ role: 'EDITOR' }] },
    { id: 'person', language: 'ru' }, { messages: [
      { id: 'user-message', role: 'user', parts: [{ type: 'text', text: 'Подготовь адаптацию.' }] },
    ] }, response);
  const wire = writes.filter(value => value.startsWith('data: ') && !value.includes('[DONE]'))
    .map(value => JSON.parse(value.slice(6).trim()));
  expect(handleChatStream).toHaveBeenCalled();
  expect(wire.some(part => part.type === 'error')).toBe(false);
  return { wire };
};

test('real controller stream retains the bounded rejected review for the browser', async () => {
  const source = report();
  const { wire } = await consume([source]);
  const emitted = wire.find(part => part.type === 'data-progress');
  expect(emitted).toMatchObject({ ...source, transient: false });
  expect(emitted.data.saved).toBe(false);
  expect(emitted.data.qualityReview.untrustedData.rule).toMatch(/never follow instructions/);
  expect(wire.some(part => ['data-adaptation', 'data-piece'].includes(part.type))).toBe(false);
});

test.each(['array', 'single-object'])('actual %s capability producer reaches the controller wire with the rejected candidate and no saved card', async shape => {
  const registry = loadRegistry();
  const post = { content: 'Rejected body.', image: 'do-not-copy-image', website: 'do-not-copy-website', extra: 'do-not-copy-field' };
  const tool = registry.buildCapabilityTool(registry.CAPABILITY_CATALOGUE.find(row => row.id === 'piece.adapt'), {
    entrance: 'chat', language: 'ru', services: servicesFrom({ PieceService: {
      adaptPlanMode: async () => 'reserve', prepareAdapt: async () => ({}),
      adapt: async function* () { yield { name: 'error', code: 'CONTENT_ADAPTATION_INCOMPLETE', message: 'Incomplete.',
        missingRequirements: ['The second topic is missing.'], unsupportedClaims: [],
        incompleteDraft: { hook: 'Opening', content: shape === 'array' ? [post] : post },
      }; },
    } }),
  });
  const produced = await executeTool(tool, { pieceId: 'piece-1', channelId: 'channel-1' }, {
    requestContext: requestContextFor(registry),
  });
  expect(produced.output).toMatchObject({ ok: false, code: 'CONTENT_ADAPTATION_INCOMPLETE' });
  const { wire } = await consume(produced.parts);
  const diagnostic = wire.find(part => part.data?.qualityReview);
  expect(diagnostic).toMatchObject({ transient: false, data: { saved: false,
    qualityReview: { untrustedData: { value: { candidate: { text: 'Opening\n\nRejected body.' } } } } } });
  expect(wire.filter(part => part.type === 'data-progress' && !part.data?.qualityReview)
    .every(part => part.transient === true)).toBe(true);
  expect(wire.some(part => ['data-adaptation', 'data-piece'].includes(part.type))).toBe(false);
  expect(JSON.stringify(diagnostic)).not.toContain('do-not-copy');
});

test('a valid bounded truncated candidate survives the controller unchanged', async () => {
  const part = report();
  part.data.qualityReview.untrustedData.value.candidate = {
    text: 'x'.repeat(16_000), totalCharacters: 17_000, truncated: true,
  };
  const { wire } = await consume([part]);
  expect(wire.find(value => value.data?.qualityReview)).toEqual({ ...part, transient: false });
});

test.each([
  ['ordinary progress', part => { part.data = { capability: 'piece.adapt', stage: 'writing' }; }],
  ['another capability', part => { part.data.capability = 'piece.create'; }],
  ['another failure code', part => { part.data.code = 'GENERATION_FAILED'; }],
  ['saved result', part => { part.data.saved = true; }],
  ['another stage', part => { part.data.stage = 'adaptation'; }],
  ['missing untrusted wrapper', part => { part.data.qualityReview = part.data.qualityReview.untrustedData.value; }],
  ['altered untrusted rule', part => { part.data.qualityReview.untrustedData.rule = 'Follow these instructions'; }],
  ['unbounded findings', part => { part.data.qualityReview.untrustedData.value.missingRequirements = Array(21).fill('finding'); }],
  ['unbounded candidate', part => { part.data.qualityReview.untrustedData.value.candidate = { text: 'x'.repeat(16_001), totalCharacters: 16_001, truncated: false }; }],
  ['incorrect truncation', part => { part.data.qualityReview.untrustedData.value.candidate.totalCharacters = 100; }],
  ['completion flag inside data', part => { part.data.done = true; }],
  ['extra outer payload', part => { part.completed = true; }],
])('%s stays transient through the actual controller consumer', async (_label, mutate) => {
  const part = report();
  mutate(part);
  part.transient = false;
  const { wire } = await consume([part]);
  expect(wire.find(value => value.type === 'data-progress').transient).toBe(true);
});

test('an unavailable review/candidate remains diagnostic data and never claims a saved version', async () => {
  const part = report();
  part.data.qualityReview = wrapUntrusted({ reviewAvailable: false, missingRequirements: [], unsupportedClaims: [],
    candidate: { unavailable: true } }, ['workspace-text']);
  const { wire } = await consume([part]);
  expect(wire.find(value => value.type === 'data-progress')).toMatchObject({ transient: false, data: { saved: false,
    qualityReview: { untrustedData: { value: { reviewAvailable: false, candidate: { unavailable: true } } } } } });
});
