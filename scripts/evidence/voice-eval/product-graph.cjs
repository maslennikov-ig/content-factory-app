'use strict';

/**
 * The product's own generation node, run outside the application.
 *
 * The stand must generate through the code that ships, not through a copy of
 * its prompt. A copy would have to be updated by hand every time the voice
 * block changes, and the first time somebody forgot, the stand would be
 * measuring a prompt the product no longer sends — which is a more expensive
 * way of judging by eye.
 *
 * So `AgentGraphService` is loaded from source with its database-bound
 * collaborators replaced and its two model factories redirected at a client
 * the caller builds. Everything that decides what the model reads — the voice
 * directives, the re-injection, the untrusted-material block, the language
 * instruction, the structured-output schema — is the shipped code.
 *
 * `ref` loads the file from a git commit instead of the working tree. That is
 * how the historical variant stays honest after `pl1.2` changes the voice
 * block: it is the historical file, read from the commit, rather than a frozen
 * paraphrase of it that nobody can diff.
 */

const { loadWithMocks, REPO } = require('../../../tests/helpers/load-ts-with-mocks.cjs');

const SERVICE = 'libraries/nestjs-libraries/src/agent/agent.graph.service.ts';

const standMocks = (chatModel) => ({
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
    PostsService: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {
    MediaService: class {},
  },
  '@contentfactory/nestjs-libraries/upload/upload.factory': {
    UploadFactory: { createStorage: () => ({}) },
  },
  '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
    GeneratorDto: class {},
  },
  '@contentfactory/nestjs-libraries/openai/generation.error': {
    generationError: (error) => error,
  },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async () => chatModel,
    getImageModel: async () => ({ invoke: async () => '' }),
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
    executeAiStreamOperation: (organizationId, operation, factory) => factory(),
  },
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    WebSearchNotConfigured: class extends Error {},
  },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
    { ContentContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    { BrandProfileContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
    { ContentSourceRegistryService: class {} },
});

/**
 * @param chatModel anything with `withStructuredOutput`; every `getChatModel`
 *   call in the graph returns it
 * @param ref optional git ref the service is read from
 */
function loadAgentGraph({ chatModel, ref }) {
  const { AgentGraphService } = loadWithMocks(
    SERVICE,
    standMocks(chatModel),
    ref
  );
  // Восьмым — реестр источников (`content-factory-next-ec48.1`). Стенд
  // ничего не сохраняет: он судит промпт, а не поход в веб.
  return {
    service: new AgentGraphService({}, {}, {}, {}, {}, {}, null, null),
    AgentGraphService,
  };
}

module.exports = { loadAgentGraph, SERVICE, REPO };
