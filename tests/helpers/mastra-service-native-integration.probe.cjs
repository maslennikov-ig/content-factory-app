'use strict';

require('reflect-metadata');
const assert = require('node:assert/strict');
const { PostgresStore } = require('@mastra/pg');
const { Pool } = require('pg');
const { isDurableAgent } = require('@mastra/core/agent/durable');
const { RedisServerCache } = require('@mastra/redis');
const { RedisStreamsPubSub } = require('@mastra/redis-streams');
const Redis = require('ioredis');
const { z } = require('zod');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');

const IDENTITY = {
  organizationId: 'org-service',
  userId: 'user-service',
  role: 'ADMIN',
  organizationCreatedAt: '2026-01-01T00:00:00.000Z',
  language: 'ru',
  timeZone: 'Europe/Moscow',
};
const usage = {
  inputTokens: { total: 5, noCache: 5 },
  outputTokens: { total: 5, text: 5 },
};

async function createRuntime(options = {}) {
  const schemaName =
    options.schemaName || `cf_service_native_${Date.now()}_${process.pid}`;
  const pgUrl =
    process.env.CF_TEST_PG_URL ||
    'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
  process.env.REDIS_URL =
    process.env.CF_TEST_REDIS_URL || 'redis://127.0.0.1:6380';
  const namespaceUrl = new URL(pgUrl);
  namespaceUrl.searchParams.set('application_name', schemaName);
  process.env.MASTRA_DATABASE_URL = namespaceUrl.toString();
  const namespace = createHash('sha256')
    .update(process.env.MASTRA_DATABASE_URL)
    .digest('hex')
    .slice(0, 16);
  const storagePool = new Pool({
    connectionString: namespaceUrl.toString(),
  });
  const storage = new PostgresStore({
    id: schemaName,
    pool: storagePool,
    schemaName,
  });
  await storage.init();
  const redis = new Redis(process.env.REDIS_URL);
  await redis.ping();
  const executionModule = loadCapabilityModule(
    '../conductor/conductor.execution.ts'
  );
  const contextModule = loadCapabilityModule(
    '../conductor/conductor.context.ts'
  );
  const queuedInputModule = loadCapabilityModule(
    '../conductor/native-queued-input.ts'
  );
  const registry = loadCapabilityModule('capability.registry.ts');
  const attempts = [];
  const membershipReads = [];
  const admissions = [];
  const control = () =>
    options.controlPath
      ? JSON.parse(fs.readFileSync(options.controlPath, 'utf8'))
      : { mode: options.mode || 'success', active: options.active !== false };
  const audit = (event) => {
    const entry = { pid: process.pid, at: Date.now(), ...event };
    if (options.auditPath)
      fs.appendFileSync(options.auditPath, `${JSON.stringify(entry)}\n`);
    return entry;
  };
  const models = new Map();
  const modelFor = (modelId) => {
    if (models.has(modelId)) return models.get(modelId);
    if (options.modelFactory) {
      const supplied = options.modelFactory(modelId);
      models.set(modelId, supplied);
      return supplied;
    }
    const model = new MockLanguageModelV3({
      modelId,
      async doStream(args) {
        const attempt = audit({
          type: 'model',
          modelId,
          toolNames: (args.tools ?? []).map((tool) => tool.name),
          hasToolResult: JSON.stringify(args.prompt).includes(
            'fixture-accepted'
          ),
          ...(process.env.CF_SERVICE_DEBUG_SKILL
            ? {
                skillTool: (args.tools ?? []).find(
                  (tool) => tool.name === 'skill'
                ),
              }
            : {}),
        });
        attempts.push(attempt);
        await options.onAttempt?.(attempt, args);
        const mode = control().mode;
        if (mode === 'hang') {
          await new Promise((_resolve, reject) => {
            args.abortSignal?.addEventListener(
              'abort',
              () =>
                reject(
                  Object.assign(new Error('Aborted hanging provider.'), {
                    name: 'AbortError',
                  })
                ),
              { once: true }
            );
          });
        }
        if (mode === 'outage')
          throw Object.assign(new Error('Provider unavailable'), {
            statusCode: 503,
          });
        if (
          ['tool', 'outage-after-tool', 'approval', 'question'].includes(
            mode
          ) &&
          !attempt.hasToolResult
        ) {
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: 'save-service-fixture',
                toolName: 'fixture_persist',
                input: '{}',
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]),
          };
        }
        if (mode === 'outage-after-tool') {
          return {
            stream: new ReadableStream({
              start(stream) {
                stream.enqueue({ type: 'stream-start', warnings: [] });
                stream.enqueue({ type: 'text-start', id: 'partial' });
                stream.enqueue({
                  type: 'text-delta',
                  id: 'partial',
                  delta: 'Interrupted draft.',
                });
                setTimeout(
                  () =>
                    stream.error(
                      Object.assign(
                        new Error('Provider unavailable after partial text.'),
                        { statusCode: 503 }
                      )
                    ),
                  10
                );
              },
            }),
          };
        }
        if (mode === 'permanent-error')
          throw Object.assign(new Error('Provider authentication rejected.'), {
            statusCode: 401,
          });
        if (
          (options.skill || process.env.CF_SERVICE_DEBUG_SKILL) &&
          attempts.length === 1
        ) {
          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: 'activate-service-skill',
                toolName: 'skill',
                input: JSON.stringify({ name: 'content' }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                usage,
              },
            ]),
          };
        }
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 'answer' },
            {
              type: 'text-delta',
              id: 'answer',
              delta: 'Service native answer.',
            },
            { type: 'text-end', id: 'answer' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage,
            },
          ]),
        };
      },
    });
    models.set(modelId, model);
    return model;
  };
  class PrismaService {}
  const capability = {
    ...registry.CAPABILITY_CATALOGUE.find(
      (entry) =>
        entry.risk ===
        (options.fixtureMode === 'approval'
          ? 'confirm'
          : options.fixtureMode === 'question'
          ? 'input'
          : 'read')
    ),
    id: 'fixture.persist',
    group: 'content',
    risk:
      options.fixtureMode === 'approval'
        ? 'confirm'
        : options.fixtureMode === 'question'
        ? 'input'
        : 'read',
    label: { ru: 'Фикстура', en: 'Fixture' },
    description: 'Fixture operation.',
    input: z.object({}),
    untrusted: [],
    describeApproval:
      options.fixtureMode === 'approval'
        ? async () => 'Apply the synthetic service fixture.'
        : undefined,
    beforeApproval: undefined,
    approvalContent: undefined,
    ...(options.fixtureMode === 'question'
      ? {
          suspendSchema: z.object({ question: z.string() }),
          resumeSchema: z.object({ answer: z.string() }),
        }
      : {}),
    run: async (ctx) => {
      if (options.fixtureMode === 'question' && !ctx.resumeData?.answer) {
        await ctx.suspend?.({ question: 'Which synthetic answer?' });
        return;
      }
      audit({ type: 'tool', id: 'fixture-accepted' });
      if (options.fixtureRun) return options.fixtureRun(ctx);
      return { id: 'fixture-accepted' };
    },
    summarize: (result) => result,
  };
  const catalogue = { ...registry, CAPABILITY_CATALOGUE: [capability] };
  const clients = {
    getRoutedMastraModelEntries: async (_organizationId, _role, _task, options) => ({
      entries: [options?.modelId || 'primary', 'fallback-1', 'fallback-2'].map(
        (modelId) => ({ model: modelFor(modelId), maxRetries: 0 })
      ),
      policy: { maxRetries: 0 },
    }),
    getMastraAiSdkProvider: async () => ({ chat: modelFor }),
    getModelForRole: async () => 'primary',
    getClassifyDecisionModel: async () => {
      throw new Error('Unexpected classifier');
    },
    getMastraVoice: async () => {
      throw new Error('Unexpected voice');
    },
  };
  const { MastraService } = loadCapabilityModule('../mastra.service.ts', {
    mocks: {
      '@mastra/core/evals': require('@mastra/core/evals'),
      '@contentfactory/nestjs-libraries/chat/mastra.store': {
        pStore: storage,
        closeMastraStore: async () => {},
      },
      '@contentfactory/nestjs-libraries/redis/redis.service': {
        ioRedis: redis,
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService,
      },
      '@contentfactory/nestjs-libraries/openai/ai.clients': clients,
      '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry':
        catalogue,
      '../capabilities/capability.registry': catalogue,
      './conductor.execution': executionModule,
      './conductor/conductor.execution': executionModule,
      './conductor/native-queued-input': queuedInputModule,
      '../capabilities/catalogue/overview.capabilities': {
        readWorkspaceSnapshot: async () => ({ channels: [] }),
      },
      '@contentfactory/nestjs-libraries/chat/capabilities/door-policy': {
        DoorPolicyGate: class {
          async check() {
            return { allowed: true, policies: [] };
          }
        },
      },
    },
  });
  const membership = {
    role: 'EDITOR',
    disabled: false,
    user: { activated: true, blockedAt: null },
    organization: { createdAt: new Date(IDENTITY.organizationCreatedAt) },
  };
  const aiUsage = {
    prepareModelExecution: async (_org, _operation, factory) => factory(),
    beginAiOperation: async (organizationId, operation, role) => {
      const entry = { organizationId, operation, role, finishes: [] };
      admissions.push(entry);
      return {
        run: (work) => work(),
        voidUnstarted: async () => {
          entry.voided = true;
        },
        finish: async (completed) => {
          entry.finishes.push(completed);
        },
      };
    },
  };
  const service = new MastraService(
    {
      get: (token) =>
        token === PrismaService
          ? {
              userOrganization: {
                findUnique: async (query) => {
                  membershipReads.push(query);
                  return {
                    ...membership,
                    user: {
                      ...membership.user,
                      activated: control().active !== false,
                    },
                  };
                },
              },
            }
          : {},
    },
    aiUsage
  );
  if (options.fixtureSelectedContext)
    service.resolveWorkContext = async (_identity, context) => {
      audit({ type: 'context', selectedId: context.id });
      return {
        context,
        data: { title: `Fresh selected ${context.id}` },
        truncated: false,
      };
    };
  const mastra = await service.mastra();
  mastra.addGateway({
    id: 'service-fixture',
    name: 'Synthetic service fixture',
    handlesModel: (id) => id.startsWith('mock-provider/'),
    fetchProviders: async () => ({
      'mock-provider': {
        name: 'Synthetic fixture',
        gateway: 'service-fixture',
        apiKeyEnvVar: [],
        models: ['primary', 'selected-primary', 'fallback-1', 'fallback-2'],
      },
    }),
    buildUrl: () => undefined,
    getApiKey: async () => 'synthetic',
    resolveLanguageModel: ({ modelId }) => modelFor(modelId),
  });
  const agent = await service.conductor();
  const controller = await service.controller();
  const memory = await agent.getMemory();
  return {
    schemaName,
    pgUrl,
    namespace,
    service,
    mastra,
    agent,
    controller,
    memory,
    storage,
    storagePool,
    redis,
    attempts,
    membershipReads,
    admissions,
    aiUsage,
    queuedInputModule,
    contextModule,
    executionModule,
    audit,
    async close({ drop = false } = {}) {
      await service.onApplicationShutdown();
      await storagePool.end();
      if (mastra?.pubsub?.close) await mastra.pubsub.close();
      if (drop) {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(
            cursor,
            'MATCH',
            `cf:mastra*:${namespace}*`,
            'COUNT',
            200
          );
          if (keys.length) await redis.del(...keys);
          cursor = next;
        } while (cursor !== '0');
      }
      await redis.quit();
      if (drop) {
        const cleanup = new PostgresStore({
          id: `${schemaName}-cleanup`,
          connectionString: pgUrl,
          schemaName,
        });
        await cleanup.db.none(`DROP SCHEMA "${schemaName}" CASCADE`);
        await cleanup.close();
      }
    },
  };
}

async function main() {
  const runtime = await createRuntime();
  const {
    mastra,
    agent,
    service,
    memory,
    attempts,
    membershipReads,
    contextModule,
    executionModule,
  } = runtime;
  try {
    assert.equal(isDurableAgent(agent), true);
    assert.equal(agent.cache instanceof RedisServerCache, true);
    assert.equal(mastra.pubsub instanceof RedisStreamsPubSub, true);
    const threadId = 'service-native-thread';
    await memory.createThread({
      threadId,
      resourceId: 'org-service:user-service',
      title: 'Service native integration',
    });
    const requestContext = contextModule.buildConductorContext({
      identity: IDENTITY,
      threadId,
      requestId: 'logical-service-1',
    });
    const session = await service.sessionFor(IDENTITY, threadId, {
      bindThread: true,
      requestContext,
    });
    assert.equal(session.machinery.getAgent(), agent);
    assert.equal(session.thread.getId(), threadId);
    session.model.set({ modelId: 'selected-primary' });
    const execution = new executionModule.ConductorExecution({
      requestId: 'logical-service-1',
      native: true,
    });
    await execution.run(() =>
      session.sendMessage({ content: 'Ответь коротко.', requestContext })
    );
    assert.equal(attempts[0].modelId, 'selected-primary');
    assert.equal(membershipReads.length > 0, true);
    if (process.env.CF_SERVICE_DEBUG_SKILL)
      assert.equal(
        attempts.length,
        2,
        'The built-in skill tool must execute and reach the following native model step.'
      );
    const currentThread = await memory.getThreadById({ threadId });
    assert.equal(
      currentThread.metadata.assistantNativeRun.logicalRequestId,
      'logical-service-1'
    );
    return {
      baseline: {
        sameDurableControllerInstance: true,
        redisCache: true,
        redisPubsub: true,
        selectedModel: attempts[0].modelId,
        membershipRechecked: true,
        nativePointer: currentThread.metadata.assistantNativeRun,
        builtinPermissions: session.permissions.getRules(),
      },
      attemptCount: attempts.length,
      ...(process.env.CF_SERVICE_DEBUG_SKILL ? { attempts } : {}),
    };
  } finally {
    await runtime.close({ drop: true });
  }
}

module.exports = { createRuntime, IDENTITY };

if (require.main === module)
  main()
    .then((report) => {
      console.log(JSON.stringify(report));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
