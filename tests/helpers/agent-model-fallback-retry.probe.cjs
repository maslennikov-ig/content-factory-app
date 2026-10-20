'use strict';

require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const assert = require('node:assert/strict');
const { z } = require('zod');
const { Mastra } = require('@mastra/core/mastra');
const { RequestContext } = require('@mastra/core/request-context');
const { InMemoryStore } = require('@mastra/core/storage');
const { Memory } = require('@mastra/memory');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

const ORG = { id: 'org-1', createdAt: '2026-01-01T00:00:00Z', users: [{ role: 'EDITOR' }] };
const USER = { id: 'user-1', language: 'ru' };
const identity = {
  organizationId: ORG.id,
  organizationCreatedAt: ORG.createdAt,
  userId: USER.id,
  role: 'EDITOR',
  language: 'ru',
  timeZone: 'UTC',
};

const usage = {
  inputTokens: { total: 12, noCache: 12 },
  outputTokens: { total: 8, text: 8 },
};

function makeTextStreamParts(text, modelId = 'mock-model') {
  return [
    { type: 'stream-start', warnings: [] },
    {
      type: 'response-metadata',
      id: 'resp-1',
      modelId,
      timestamp: new Date(0),
    },
    { type: 'text-start', id: 'txt-1' },
    { type: 'text-delta', id: 'txt-1', delta: text },
    { type: 'text-end', id: 'txt-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];
}

function makeConductorRequestContext(threadId = 'thread-1') {
  const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');
  return buildConductorContext({ identity, threadId });
}

function loadConductorStack() {
  const lifecycle = loadCapabilityModule('../conductor/agent-turn-lifecycle.ts');
  const adapter = loadCapabilityModule('mastra.adapter.ts', {
    mocks: { '../conductor/agent-turn-lifecycle': lifecycle },
  });
  const admission = loadCapabilityModule('capability.admission.ts');
  const { pieceRename } = loadCapabilityModule('catalogue/piece.capabilities.ts');
  const conductorModule = loadCapabilityModule('../conductor/conductor.agent.ts', {
    mocks: {
      '../capabilities/mastra.adapter': adapter,
      '../capabilities/capability.admission': admission,
    },
  });
  return {
    lifecycle,
    adapter,
    admission,
    conductorModule,
    sampleDoor: pieceRename.door,
  };
}

/**
 * A16 & A17: Native ModelSelectionProcessor with V4 MastraDecisionModel classifier:
 * - Confident simple request routes to `classify` model.
 * - Low-confidence request abstains (`below-threshold`) to the capable `agent` model.
 * - Classifier failure abstains (`error`) to the capable `agent` model with visible diagnostic.
 */
async function runA16AndA17ModelSelectionAndAbstention() {
  const { conductorModule, sampleDoor } = loadConductorStack();
  const capability = {
    id: 'piece.read',
    group: 'content',
    door: sampleDoor,
    risk: 'read',
    label: { ru: 'Прочитать заготовку', en: 'Read piece' },
    description: 'Reads a piece.',
    input: z.object({ id: z.string() }),
    untrusted: [],
    run: async (_ctx, input) => ({ id: input.id, title: 'Материал' }),
    summarize: (out) => out,
  };

  const agentModel = new MockLanguageModelV3({
    modelId: 'openai/gpt-5.4-agent',
    doStream: async () => ({
      stream: convertArrayToReadableStream(
        makeTextStreamParts('Ответ от основной модели agent.', 'openai/gpt-5.4-agent')
      ),
    }),
  });
  const classifyRoleModel = new MockLanguageModelV3({
    modelId: 'openai/gpt-5.4-nano-classify',
    doStream: async () => ({
      stream: convertArrayToReadableStream(
        makeTextStreamParts('Ответ от лёгкой модели classify.', 'openai/gpt-5.4-nano-classify')
      ),
    }),
  });

  let nextClassifierResponse = {
    choice: 'classify',
    probabilities: { classify: 0.92, agent: 0.08 },
  };
  let shouldClassifierThrow = false;

  const decisionModel = {
    specificationVersion: 'v4',
    provider: 'openrouter',
    modelId: 'openai/gpt-5.4-nano-classify',
    supportedQuestionTypes: ['choice', 'score', 'boolean'],
    doEvaluate(options) {
      return this.doDecide(options);
    },
    doDecide: async (options) => {
      if (shouldClassifierThrow) {
        throw new Error('classifier provider 503');
      }
      const qIds = Object.keys(options.questions);
      return {
        answers: {
          [qIds[0]]: {
            type: 'choice',
            choice: nextClassifierResponse.choice,
            probabilities: nextClassifierResponse.probabilities,
          },
        },
        usage: { inputTokens: 10, outputTokens: 6 },
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: 'openai/gpt-5.4-nano-classify',
        },
      };
    },
  };

  const decisions = [];
  const createProcessor = () =>
    conductorModule.createConductorModelSelectionProcessor({
      model: decisionModel,
      minProbability: 0.85,
      onDecision: (d) => decisions.push(d),
      choices: [
        {
          name: 'classify',
          model: classifyRoleModel,
          criteria: 'Short factual status check or greeting.',
        },
        {
          name: 'agent',
          model: agentModel,
          criteria: 'Complex content drafting, research, or planning.',
        },
      ],
    });

  // 1. Confident classification -> selects `classifyRoleModel`
  const processor1 = createProcessor();
  const state1 = {};
  await processor1.processInput({
    messages: [
      {
        id: 'm-1',
        role: 'user',
        createdAt: new Date(),
        content: {
          format: 2,
          parts: [{ type: 'text', text: 'Привет, сколько каналов подключено?' }],
        },
      },
    ],
    state: state1,
  });
  const step1 = processor1.processInputStep({
    stepNumber: 0,
    state: state1,
    model: agentModel,
  });

  // 2. Low confidence (0.60 < 0.85) -> abstains (`below-threshold`) and keeps `agentModel`
  nextClassifierResponse = {
    choice: 'classify',
    probabilities: { classify: 0.6, agent: 0.4 },
  };
  const processor2 = createProcessor();
  const state2 = {};
  await processor2.processInput({
    messages: [
      {
        id: 'm-2',
        role: 'user',
        createdAt: new Date(),
        content: {
          format: 2,
          parts: [{ type: 'text', text: 'Сделай обзор рынка и напиши 3 поста' }],
        },
      },
    ],
    state: state2,
  });
  const step2 = processor2.processInputStep({
    stepNumber: 0,
    state: state2,
    model: agentModel,
  });

  // 3. Classifier error -> abstains (`error`) and keeps `agentModel`
  shouldClassifierThrow = true;
  const processor3 = createProcessor();
  const state3 = {};
  await processor3.processInput({
    messages: [
      {
        id: 'm-3',
        role: 'user',
        createdAt: new Date(),
        content: {
          format: 2,
          parts: [{ type: 'text', text: 'Проверь состояние' }],
        },
      },
    ],
    state: state3,
  });
  const step3 = processor3.processInputStep({
    stepNumber: 0,
    state: state3,
    model: agentModel,
  });

  // 4. Verify end-to-end inside `buildConductorAgent` with `modelSelection`
  shouldClassifierThrow = false;
  nextClassifierResponse = {
    choice: 'classify',
    probabilities: { classify: 0.95, agent: 0.05 },
  };
  const store = new InMemoryStore();
  const memory = new Memory({
    storage: store,
    options: { generateTitle: false, semanticRecall: false },
  });
  const agent = conductorModule.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async () => [{ model: agentModel, maxRetries: 0 }],
    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
    modelSelection: async () => createProcessor(),
  });
  const mastra = new Mastra({
    agents: { [conductorModule.CONDUCTOR_AGENT_ID]: agent },
    storage: store,
  });
  const rc = makeConductorRequestContext('thread-a16-1');
  const streamOut = await mastra
    .getAgent(conductorModule.CONDUCTOR_AGENT_ID)
    .stream([{ role: 'user', content: 'Короткий вопрос' }], {
      requestContext: rc,
      memory: {
        thread: { id: 'thread-a16-1' },
        resource: 'org-1:user-1',
      },
    });
  let routedText = '';
  for await (const chunk of streamOut.fullStream) {
    if (chunk.type === 'text-delta') {
      routedText += chunk.payload?.text ?? chunk.textDelta ?? '';
    }
  }

  return {
    confidentStepModelId: step1.model?.modelId,
    lowConfidenceStepOverride: step2.model ?? null,
    errorStepOverride: step3.model ?? null,
    decisions: decisions.map((d) => ({
      choice: d.choice ?? null,
      abstained: d.abstained ?? null,
    })),
    routedText,
  };
}

/**
 * A17, A30, A31: Native ModelWithRetries[] fallback chain + StreamErrorRetryProcessor + TextUsageLedger + Stop during retry.
 */
async function runA30AndA31FallbackRetryStopAndAccounting() {
  const textChainMod = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.text-chain.ts'
  );
  const rolesMod = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.roles.ts'
  );

  let currentProviderRow = {
    usageMode: 'workspace_key',
    provider: 'openrouter',
    apiKey: 'sk-or-test',
    textModel: 'openai/gpt-5.4-primary',
    roleModels: {
      __textChain: JSON.stringify({
        version: 1,
        models: ['openai/gpt-5.4-backup-1', 'anthropic/claude-4-sonnet'],
        disabled: false,
        maxRetries: 1,
      }),
    },
    searchEnabled: true,
    searchProvider: 'tavily',
    searchTopic: 'general',
    searchDepth: 'advanced',
  };

  const configMod = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    {
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: {
          fixedDecryption: (v) => String(v).replace(/^enc:/, ''),
          fixedEncryption: (v) => `enc:${v}`,
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.roles': rolesMod,
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': textChainMod,
    }
  );
  configMod.setAiProviderSettingReader(async () => currentProviderRow);
  configMod.setInstanceAiDefaultsReader(async () => null);

  const httpCalls = [];
  const sseSuccessBody = (text, model) => {
    const chunks = [
      `data: ${JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model,
        choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 15, completion_tokens: 9, total_tokens: 24 },
      })}\n\n`,
      'data: [DONE]\n\n',
    ];
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
  };

  const fetchBehavior = (model) => {
    if (model === 'openai/gpt-5.4-primary') {
      return new Response(
        JSON.stringify({ error: { message: 'primary overloaded' } }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      );
    }
    if (model === 'openai/gpt-5.4-backup-1') {
      return new Response(
        JSON.stringify({ error: { message: 'backup-1 rate limited' } }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      sseSuccessBody('Ответ получен от третьей модели в цепочке.', model),
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }
    );
  };

  const clientsMod = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.clients.ts',
    {
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        ...configMod,
        requireActiveAiConfig: (orgId) => configMod.loadAiConfig(orgId),
        getActiveAiRole: () => 'agent',
      },
      '@contentfactory/nestjs-libraries/openai/ai.roles': rolesMod,
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': {
        ...textChainMod,
        createTextChainFetch: (source, _baseFetch, options) =>
          textChainMod.createTextChainFetch(
            source,
            async (_url, init) => {
              const parsed = JSON.parse(String(init.body));
              httpCalls.push({
                model: parsed.model,
                serviceTier: parsed.service_tier ?? 'standard',
              });
              return fetchBehavior(parsed.model);
            },
            options
          ),
      },
    }
  );

  const { conductorModule, sampleDoor } = loadConductorStack();
  const capability = {
    id: 'piece.read',
    group: 'content',
    door: sampleDoor,
    risk: 'read',
    label: { ru: 'Прочитать заготовку', en: 'Read piece' },
    description: 'Reads a piece.',
    input: z.object({ id: z.string() }),
    untrusted: [],
    run: async (_ctx, input) => ({ id: input.id, title: 'Материал' }),
    summarize: (out) => out,
  };

  const store = new InMemoryStore();
  const memory = new Memory({
    storage: store,
    options: { generateTitle: false, semanticRecall: false },
  });

  const entries = await clientsMod.getMastraAgentModelEntries('org-1', 'agent');
  const agent = conductorModule.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async (_id, requestContext) => {
      const resolved = await clientsMod.getMastraAgentModelEntries('org-1', 'agent');
      if (requestContext) {
        conductorModule.setConductorModelMaxRetries(
          requestContext,
          resolved.policy.maxRetries
        );
      }
      return resolved.entries;
    },
    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
  });
  const mastra = new Mastra({
    agents: { [conductorModule.CONDUCTOR_AGENT_ID]: agent },
    storage: store,
  });

  // Execute inside runWithUsageLedger so all attempts across retries and fallback models are recorded in one ledger
  let streamOutputText = '';
  const ledger = new textChainMod.TextUsageLedger();
  const ledgerResult = await textChainMod.runWithUsageLedger(ledger, async () => {
    const rc = makeConductorRequestContext('thread-fallback-1');
    const activeAgent = mastra.getAgent(conductorModule.CONDUCTOR_AGENT_ID);
    const output = await activeAgent.stream(
      [{ role: 'user', content: 'Проверь резервную цепочку моделей' }],
      {
        requestContext: rc,
        maxSteps: 2,
        memory: {
          thread: { id: 'thread-fallback-1' },
          resource: 'org-1:user-1',
        },
      }
    );
    for await (const chunk of output.fullStream) {
      if (chunk.type === 'text-delta') {
        streamOutputText += chunk.payload?.text ?? chunk.textDelta ?? '';
      }
    }
    return ledger.calls;
  });

  // Verify A31: Stop / abortSignal during retry immediately stops further retries/fallbacks
  const abortController = new AbortController();
  let abortedAttempts = 0;
  const abortingModel1 = new MockLanguageModelV3({
    modelId: 'openai/gpt-5.4-abort-1',
    doStream: async () => {
      abortedAttempts += 1;
      abortController.abort(new Error('user_stopped'));
      const err = new Error('HTTP 503 Service Unavailable');
      err.statusCode = 503;
      throw err;
    },
  });
  const abortingModel2 = new MockLanguageModelV3({
    modelId: 'openai/gpt-5.4-abort-2',
    doStream: async () => {
      abortedAttempts += 1;
      return {
        stream: convertArrayToReadableStream(
          makeTextStreamParts('Should never run after Stop')
        ),
      };
    },
  });

  const abortAgent = conductorModule.buildConductorAgent({
    services: () => ({}),
    gate: { check: async () => ({ allowed: true, policies: [] }) },
    model: async (_id, requestContext) => {
      if (requestContext) {
        conductorModule.setConductorModelMaxRetries(requestContext, 3);
      }
      return [
        { model: abortingModel1, maxRetries: 0, enabled: true },
        { model: abortingModel2, maxRetries: 0, enabled: true },
      ];
    },
    memory,
    capabilities: [capability],
    snapshot: async () => ({ channels: [] }),
  });
  const abortMastra = new Mastra({
    agents: { [conductorModule.CONDUCTOR_AGENT_ID]: abortAgent },
    storage: store,
  });
  await textChainMod.runWithAiExecutionUsage(
    { signal: abortController.signal },
    async () => {
      const rc = makeConductorRequestContext('thread-abort-1');
      try {
        const out = await abortMastra
          .getAgent(conductorModule.CONDUCTOR_AGENT_ID)
          .stream([{ role: 'user', content: 'Останови во время повтора' }], {
            requestContext: rc,
            abortSignal: abortController.signal,
            memory: {
              thread: { id: 'thread-abort-1' },
              resource: 'org-1:user-1',
            },
          });
        for await (const _chunk of out.fullStream) {
          /* drain until abort */
        }
      } catch {
        /* Expected abort termination */
      }
    }
  );

  // Verify explicit empty fallback (textFallbackDisabled: true)
  currentProviderRow = {
    ...currentProviderRow,
    roleModels: {
      __textChain: JSON.stringify({
        version: 1,
        models: [],
        disabled: true,
        maxRetries: 1,
      }),
    },
  };
  configMod.resetAiConfigCache();
  const disabledEntries = await clientsMod.getMastraAgentModelEntries('org-1', 'agent');

  return {
    configuredModelEntriesCount: entries.entries.length,
    configuredMaxRetries: entries.policy.maxRetries,
    httpCallsCount: httpCalls.length,
    httpAttemptModels: httpCalls.map((c) => c.model),
    ledgerAttempts: ledgerResult.map((a) => ({
      attempt: a.attempt,
      model: a.model,
      failed: Boolean(a.failed),
      serviceTier: a.serviceTier,
    })),
    streamOutputText,
    abortedAttempts,
    disabledFallbackEntriesCount: disabledEntries.entries.length,
  };
}

async function runA29WorkspaceSettingsRoundTrip() {
  const secretShapes = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/conductor/secret-shapes.ts'
  );
  const aiRoles = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.roles.ts'
  );
  const textChainMod = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.text-chain.ts'
  );

  const row = {
    current: {
      usageMode: 'workspace_key',
      provider: 'openrouter',
      apiKey: 'sk-or-v1-test',
      textModel: 'openai/gpt-5.4',
      imageModel: null,
      roleModels: {},
      searchEnabled: false,
      searchProvider: 'tavily',
      searchApiKeys: {},
    },
  };

  const config = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    {
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: { fixedDecryption: (value) => `decrypted:${value}` },
      },
      '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': textChainMod,
    }
  );
  config.setAiProviderSettingReader(async () => row.current);
  config.setInstanceAiDefaultsReader(async () => null);

  const { AiProviderService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.service.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class {},
      },
      '@contentfactory/helpers/auth/auth.service': {
        AuthService: { fixedEncryption: (value) => `encrypted:${value}` },
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': config,
      '@contentfactory/nestjs-libraries/openai/ai.roles': aiRoles,
      '@contentfactory/nestjs-libraries/openai/ai.text-chain': textChainMod,
      '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes': secretShapes,
    },
    {
      sources: {
        '@contentfactory/nestjs-libraries/openai/ai.usage.service':
          'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
        '@contentfactory/nestjs-libraries/openai/ai.search-tasks':
          'libraries/nestjs-libraries/src/openai/ai.search-tasks.ts',
      },
    }
  );

  const service = new AiProviderService({
    aiProviderSetting: {
      findUnique: async () => row.current,
      upsert: async ({ update }) => {
        row.current = { ...row.current, ...update };
      },
    },
    aiUsageRecord: { count: async () => 0, groupBy: async () => [] },
  });

  const savedOpenRouter = await service.updateSettings('org-1', {
    usageMode: 'workspace_key',
    provider: 'openrouter',
    textModel: 'openai/gpt-5.4',
    textFallbackModels: ['openai/gpt-5.4-mini', 'anthropic/claude-4-sonnet'],
    textMaxRetries: 3,
  });

  const savedOpenAi = await service.updateSettings('org-1', {
    usageMode: 'workspace_key',
    provider: 'openai',
    apiKey: 'sk-proj-openai-1',
    textModel: 'gpt-5.4',
    textFallbackModels: ['gpt-5.4-mini', 'anthropic/claude-4-sonnet'],
    textMaxRetries: 2,
  });

  const savedDisabled = await service.updateSettings('org-1', {
    usageMode: 'workspace_key',
    provider: 'openai',
    textModel: 'gpt-5.4',
    textFallbackDisabled: true,
    textMaxRetries: 1,
  });

  return {
    openRouterFallbacks: savedOpenRouter.textChain.fallbackModels,
    openRouterMaxRetries: savedOpenRouter.textChain.maxRetries,
    openAiCompatibleFallbacks: savedOpenAi.textChain.fallbackModels,
    openAiUnavailableReasons: savedOpenAi.textChain.unavailableModels,
    disabledFallbacks: savedDisabled.textChain.fallbackModels,
    disabledFlag: savedDisabled.textFallbackDisabled,
  };
}

async function main() {
  const a16AndA17 = await runA16AndA17ModelSelectionAndAbstention();
  const a30AndA31 = await runA30AndA31FallbackRetryStopAndAccounting();
  const a29 = await runA29WorkspaceSettingsRoundTrip();
  console.log(JSON.stringify({ a16AndA17, a30AndA31, a29 }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
