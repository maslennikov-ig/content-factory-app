'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadRegistry, servicesFrom, executeTool, requestContextFor } = require('./helpers/agent-capabilities.cjs');

const { PieceService } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts', {
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.clients': { WEB_SEARCH_MAX_SOURCE_CHARS: 8000, getChatModel: () => { throw Error('Unexpected model call'); } },
  './piece.repository': { PieceRepository: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
});
const registry = loadRegistry();

function setup(coreOverrides = {}) {
  const requests = [];
  const channel = { id: 'c1', name: 'Channel', providerIdentifier: 'telegram', contentLanguage: 'ru', writingProfile: null, additionalSettings: null };
  const repository = {
    getPiece: async () => ({ id: 'p1', kind: 'CORE', title: 'Digest', body: 'Saved core.', archivedAt: null, tags: null,
      brief: { brief: { thesis: 'Digest', position: null, disagreement: null, audience: null, facts: [], origins: {}, questions: [], options: {} }, answers: [], writtenBy: 'model', ...coreOverrides } }),
    listPieceIds: async () => [{ id: 'p1' }], listIntegrations: async () => [channel],
    adaptationsByPiece: async () => [{ id: 'old', integrationId: 'c1' }],
  };
  const pieces = new PieceService(repository, { start: async function* (_org, request) {
    requests.push(request);
    yield { name: 'error', code: 'GENERATION_FAILED', message: 'Controlled stop before generation.' };
  } }, { getSocialIntegration: () => ({ maxLength: () => 4096, maxCaptionLength: () => 1024, editor: 'html' }) });
  const prepared = jest.spyOn(pieces, 'prepareAdapt');
  const tool = registry.buildCapabilityTool(registry.CAPABILITY_CATALOGUE.find(c => c.id === 'piece.adapt'), {
    language: 'ru', entrance: 'chat', gate: { check: async () => ({ allowed: true, policies: [] }) },
    services: servicesFrom({ PieceService: pieces, IntegrationService: { getIntegrationsForChannelList: async () => [channel] } }),
  });
  const call = fields => executeTool(tool, { pieceId: 'p1', channelId: 'c1', ...fields }, { requestContext: requestContextFor(registry) });
  return { call, prepared, requests };
}

test.each([
  [{}, undefined, undefined],
  [{ lengthPolicy: 'auto' }, { lengthPolicy: 'auto' }, 'auto'],
  [{ lengthPolicy: 'range', lengthRange: { idealMin: 1200, idealMax: 2500, hardMax: 3000 } },
    { lengthPolicy: 'range', lengthRange: { idealMin: 1200, idealMax: 2500, hardMax: 3000 } },
    { idealMin: 1200, idealMax: 2500, hardMax: 3000 }],
  [{ lengthPolicy: 'range', lengthRange: { idealMax: 2000 } },
    { lengthPolicy: 'range', lengthRange: { idealMin: null, idealMax: 2000 } },
    { idealMin: null, idealMax: 2000, hardMax: null }],
])('tool forwards %j through the real PieceService', async (fields, overrides, expectedPolicy) => {
  const built = setup();
  await built.call(fields);
  expect(built.prepared).toHaveBeenCalled();
  expect(built.prepared.mock.calls[0][2].overrides).toEqual(overrides);
  expect(built.requests).toHaveLength(1);
  expect(built.requests[0].intake.post?.lengthPolicy).toEqual(expectedPolicy);
  expect(built.requests[0].intake.channel.writingProfile.lengthPolicy).toEqual({ idealMin: 500, idealMax: 1000, hardMax: 1500 });
});

test.each([
  { lengthPolicy: 'range' },
  { lengthPolicy: 'auto', lengthRange: { idealMax: 1000 } },
  { lengthRange: { idealMax: 1000 } },
  { lengthPolicy: 'range', lengthRange: { idealMin: 1200, idealMax: 1000 } },
  { lengthPolicy: 'range', lengthRange: { idealMax: 1000, hardMax: 900 } },
  { lengthPolicy: 'range', lengthRange: { idealMax: 49 } },
  { lengthPolicy: 'range', lengthRange: { idealMax: 1000, hardMax: 100001 } },
  { lengthPolicy: 'range', lengthRange: { idealMin: 50.5, idealMax: 1000 } },
])('invalid input %j never reaches the service', async fields => {
  const built = setup();
  const { output } = await built.call(fields);
  expect(output.ok === false || output.error === true).toBe(true);
  expect(built.prepared).not.toHaveBeenCalled();
  expect(built.requests).toHaveLength(0);
});


test('labelled author replies survive saved-core loading and reach adaptation separately from source facts', async () => {
  const contextMaterial = JSON.stringify({ author_comments: [
    { update: 'Native sessions', origin: 'author_reply', text: 'Для меня важно, что можно продолжить задачу после разрыва.' },
    { update: 'Background tools', origin: 'author_reply', skipped: true },
  ] });
  const built = setup({ contextMaterial });
  await built.call({ lengthPolicy: 'auto' });
  expect(built.requests[0].intake.contextMaterial).toBe(contextMaterial);
  expect(built.requests[0].intake.answers).toBeUndefined();
});

test('delegated editorial controls and author-selected link reach the existing generation hints', async () => {
  const built = setup();
  const input = {
    length: 'longer', emojiLevel: 'few', hashtagPolicy: 'end_1_3', linkPolicy: 'inline', ctaKind: 'comment',
    takeaway: 'Читатели понимают главное изменение.', postLink: 'https://example.org/official', postLinkText: 'Официальное описание',
  };
  await built.call(input);
  expect(built.prepared.mock.calls[0][2].overrides).toEqual(input);
  expect(built.requests[0].intake.post).toEqual({
    length: 'longer', emojiLevel: 'few', hashtagPolicy: 'end_1_3', linkPolicy: 'inline', ctaKind: 'comment',
    takeaway: 'Читатели понимают главное изменение.',
  });
  expect(built.requests[0].intake.authorLink).toEqual({ url: 'https://example.org/official', forPost: true, text: 'Официальное описание' });
});

test('the author can explicitly omit the post link and the one-post length policy takes precedence', async () => {
  const built = setup();
  await built.call({ postLink: 'none', length: 'shorter', lengthPolicy: 'auto' });
  expect(built.requests[0].intake.authorLink).toEqual({ url: null, forPost: true });
  expect(built.requests[0].intake.post).toEqual({ lengthPolicy: 'auto' });
});

test.each([
  { postLink: 'javascript:alert(1)' },
  { postLink: 'https://example.org/contains whitespace' },
  { postLinkText: 'x'.repeat(81) },
  { takeaway: 'x'.repeat(501) },
  { length: 'arbitrary' },
])('invalid editorial field %j never reaches the service', async fields => {
  const built = setup();
  const { output } = await built.call(fields);
  expect(output.ok === false || output.error === true).toBe(true);
  expect(built.prepared).not.toHaveBeenCalled();
});
