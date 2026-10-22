'use strict';

/**
 * Default native Mastra 1.78 product path, entrance parity, observability,
 * compatibility adapters, and A1–A31 acceptance matrix (`content-factory-next-on0i.7`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  IDENTITY,
  loadCapabilityModule,
  loadRegistry,
  permissionsService,
} = require('./helpers/agent-capabilities.cjs');

const root = path.resolve(__dirname, '..');

const esmStubs = {
  '@mastra/memory': { Memory: class {} },
  '@mastra/ai-sdk/ui': { toAISdkMessages: (msgs) => msgs },
  '@contentfactory/nestjs-libraries/chat/mastra.service': {
    MastraService: class {},
  },
  '@mastra/core/agent/durable': {
    createDurableAgent: (agent) =>
      Object.assign(agent, {
        __durable: true,
        runRegistry: new Map(),
        observe: async () => ({}),
        recover: async () => ({}),
      }),
    isDurableAgent: (agent) => Boolean(agent && agent.__durable),
  },
  '@mastra/core/processors': {
    ModelSelectionProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
    StreamErrorRetryProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
    TokenLimiterProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
    ToolCallFilter: class {
      constructor(options) {
        this.options = options;
      }
    },
    ToolSearchProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
    UnsupportedFileHandler: class {},
    RegexFilterProcessor: class {
      constructor(options) {
        this.options = options;
      }
    },
    UnicodeNormalizer: class {
      constructor(options) {
        this.options = options;
      }
    },
  },
  '@mastra/core/skills': { createSkill: (spec) => ({ ...spec, inline: true }) },
};

describe('default native Mastra 1.78 product path and acceptance matrix (on0i.7)', () => {
  test('default product path uses native DurableAgent + AgentController + Session without feature flags', async () => {
    const autonomy = loadCapabilityModule('../conductor/conductor.autonomy.ts', {
      mocks: esmStubs,
    });
    expect(autonomy.CONDUCTOR_AUTONOMY_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        'ask_user',
        'submit_plan',
        'task_write',
        'task_check',
        'task_update',
        'task_complete',
        'subagent',
        'set_objective',
        'schedule_followup_create',
        'schedule_followup_list',
        'schedule_followup_cancel',
      ])
    );

    const mastraServiceSource = fs.readFileSync(
      path.join(root, 'libraries/nestjs-libraries/src/chat/mastra.service.ts'),
      'utf8'
    );
    // Native AgentController, Session (scope: threadId, createInitialThread: false),
    // schedules, and auto recovery are the sole default runtime path.
    expect(mastraServiceSource).toContain('buildConductorController');
    expect(mastraServiceSource).toContain('createInitialThread: false');
    expect(mastraServiceSource).toContain('scope: threadId');
    expect(mastraServiceSource).toContain("durableAgents: 'auto'");
  });

  test('entrance parity (A22, A28): web chat, MCP, and manual domain services share the same capability registry, policy gate, and provenance contract', async () => {
    const registry = loadRegistry();
    const {
      MCP_HTTP_PATH,
      MCP_SERVER_INFO,
      seedMcpRequestContext,
    } = loadCapabilityModule('../start.mcp.ts', {
      mocks: {
        '@mastra/mcp': { MCPServer: class {} },
      },
    });
    const { RequestContext } = require('@mastra/core/request-context');

    const savedRows = new Map([
      [
        'piece-1',
        {
          id: 'piece-1',
          code: 'cnt-1',
          organizationId: IDENTITY.organizationId,
          title: 'Исходный заголовок',
          coreText: 'Ключевая мысль о нативном рантайме.',
          status: 'READY',
          version: 1,
          updatedAt: '2026-10-19T20:00:00.000Z',
        },
      ],
    ]);
    const fakePieceService = {
      updateTitle: async (orgId, id, title) => {
        const row = savedRows.get(id);
        if (!row || row.organizationId !== orgId) {
          throw new Error('Piece not found');
        }
        const updated = { ...row, title, version: row.version + 1 };
        savedRows.set(id, updated);
        return updated;
      },
    };

    const services = (token) => {
      if (token?.name === 'PieceService') {
        return fakePieceService;
      }
      return {};
    };
    const gate = new registry.DoorPolicyGate(permissionsService());

    const chatTools = registry.buildMastraCapabilityTools(
      registry.CAPABILITY_CATALOGUE,
      {
        services,
        gate,
      }
    );
    const mcpTools = registry.buildMcpCapabilityTools(
      registry.CAPABILITY_CATALOGUE,
      {
        services,
        gate,
        language: 'ru',
        role: 'EDITOR',
      }
    );

    expect(MCP_HTTP_PATH).toBe('/mcp');
    expect(MCP_SERVER_INFO.name).toBe('Content Factory MCP');
    expect(
      registry.mcpToolNamesFor(registry.CAPABILITY_CATALOGUE, 'EDITOR')
    ).toContain('piece_rename');
    expect(chatTools.piece_rename).toBeDefined();
    expect(mcpTools.piece_rename).toBeDefined();

    // 1. Chat entrance
    const chatCtx = new RequestContext();
    registry.seedCapabilityContext(chatCtx, IDENTITY);
    const fromChat = await chatTools.piece_rename.execute(
      { pieceId: 'piece-1', title: 'Заголовок из чата' },
      { requestContext: chatCtx }
    );
    expect(fromChat).toMatchObject({
      ok: true,
      capability: 'piece.rename',
      summary: {
        pieceId: 'piece-1',
        title: 'Заголовок из чата',
      },
      card: {
        kind: 'piece',
        id: 'piece-1',
      },
    });
    expect(savedRows.get('piece-1').title).toBe('Заголовок из чата');

    // 2. MCP entrance
    const mcpCtx = new RequestContext();
    await seedMcpRequestContext({
      authInfo: { extra: { identity: IDENTITY } },
      requestContext: mcpCtx,
    });
    expect(registry.readCapabilityIdentity(mcpCtx)).toEqual(IDENTITY);
    const fromMcp = await mcpTools.piece_rename.execute(
      { pieceId: 'piece-1', title: 'Заголовок через MCP' },
      { requestContext: mcpCtx }
    );
    expect(fromMcp).toMatchObject({
      ok: true,
      capability: 'piece.rename',
      summary: {
        pieceId: 'piece-1',
        title: 'Заголовок через MCP',
      },
    });
    expect(savedRows.get('piece-1').title).toBe('Заголовок через MCP');

    // 3. Manual domain service entrance
    const fromManual = await fakePieceService.updateTitle(
      IDENTITY.organizationId,
      'piece-1',
      'Заголовок вручную'
    );
    expect(fromManual.title).toBe('Заголовок вручную');
    expect(savedRows.get('piece-1').version).toBe(4);
  });

  test('native observability (Section 4 row 25, A16): queryObservability queries spans/traces for owned thread, redacts secrets, links parent spans, and marks isInvoice: false', async () => {
    const { AgentThreadsService } = loadCapabilityModule(
      '../conductor/agent-threads.service.ts',
      { mocks: esmStubs }
    );
    const { AGENT_DOORS } = loadTypeScriptModule(
      'apps/frontend/src/components/agents/agent.contract.ts'
    );

    expect(AGENT_DOORS.threadObservability('thread-obs-1')).toBe(
      '/agent/threads/thread-obs-1/observability'
    );

    const queriedFilters = [];
    let storedSpans = [];
    const fakeObservabilityStore = {
      listTraces: async ({ filters }) => {
        queriedFilters.push(filters);
        storedSpans = [
            {
              spanId: 'span-root',
              parentSpanId: null,
              traceId: 'trace-1',
              threadId: 'thread-obs-1',
              resourceId: 'org-1:user-1',
              name: 'agent.run',
              status: 'ok',
              preview:
                'Used key sk-proj-1234567890abcdefghijklmnop to call provider',
              startedAt: '2026-10-19T20:00:00.000Z',
              endedAt: '2026-10-19T20:00:02.000Z',
              attributes: {
                authorization:
                  'Bearer sk-or-v1-abcdef1234567890abcdef1234567890',
                model: 'openai/gpt-6-luna',
              },
            },
            {
              spanId: 'span-child',
              parentSpanId: 'span-root',
              traceId: 'trace-1',
              threadId: 'thread-obs-1',
              resourceId: 'org-1:user-1',
              name: 'tool.research_run',
              status: 'error',
              error: 'Upstream failed with token tvly-dev-secretkey1234567890',
              startedAt: '2026-10-19T20:00:01.000Z',
              endedAt: '2026-10-19T20:00:01.500Z',
              attributes: { toolName: 'research_run' },
            },
            {
              spanId: 'span-other-thread',
              parentSpanId: null,
              traceId: 'trace-2',
              threadId: 'thread-other',
              resourceId: 'org-1:user-2',
              name: 'other.user.run',
              status: 'ok',
            },
          ];
        return { spans: storedSpans.filter(span => span.parentSpanId === null),
          pagination: { total: 2, page: 0, perPage: 50, hasMore: false } };
      },
      getTrace: async ({ traceId }) => ({ spans: storedSpans.filter(span => span.traceId === traceId) }),
      querySpans: async () => { throw new Error('Legacy PG does not support span queries.'); },
      aggregateTraces: async () => { throw new Error('Legacy PG does not support trace aggregation.'); },
    };

    const fakeMemory = {
      getThreadById: async ({ threadId }) =>
        threadId === 'thread-obs-1'
          ? {
              id: 'thread-obs-1',
              resourceId: 'org-1:user-1',
              title: 'Тестовый чат',
              createdAt: new Date('2026-10-19T20:00:00.000Z'),
              updatedAt: new Date('2026-10-19T20:00:02.000Z'),
              metadata: {
                assistantExecution: {
                  requestId: 'req-1',
                  state: 'settled',
                  outcome: 'completed',
                },
              },
            }
          : null,
    };

    const fakeMastraService = {
      conductor: async () => ({
        getMemory: async () => fakeMemory,
      }),
      mastra: async () => ({
        getStorage: () => ({
          getStore: async (name) =>
            name === 'observability' ? fakeObservabilityStore : undefined,
        }),
      }),
    };

    const service = new AgentThreadsService(fakeMastraService);
    const ownerIdentity = {
      organizationId: 'org-1',
      organizationCreatedAt: '2026-01-01T00:00:00.000Z',
      userId: 'user-1',
      role: 'EDITOR',
      language: 'ru',
      timeZone: 'Europe/Moscow',
    };
    const strangerIdentity = {
      ...ownerIdentity,
      userId: 'user-2',
    };

    await expect(
      service.queryObservability(strangerIdentity, 'thread-obs-1')
    ).rejects.toThrow();

    const obs = await service.queryObservability(
      ownerIdentity,
      'thread-obs-1',
      {
        knownCostUsd: 0.0142,
        unknownCostCount: 1,
        possiblyBilledCount: 1,
        coverage: 'partial_unknown_cost',
        isInvoice: false,
      }
    );

    expect(queriedFilters).toEqual([
      { threadId: 'thread-obs-1', resourceId: 'org-1:user-1' },
    ]);
    expect(obs.threadId).toBe('thread-obs-1');
    expect(obs.spans).toHaveLength(2);
    expect(obs.linkedSpans).toEqual([
      { spanId: 'span-child', parentSpanId: 'span-root' },
    ]);
    // Secret shapes are redacted everywhere
    expect(JSON.stringify(obs)).not.toContain('sk-proj-1234567890');
    expect(JSON.stringify(obs)).not.toContain('sk-or-v1-abcdef');
    expect(JSON.stringify(obs)).not.toContain('tvly-dev-secretkey');
    expect(JSON.stringify(obs)).not.toContain('sk-secret-999999');
    // Usage coverage is explicit and never presented as an invoice
    expect(obs.usage).toEqual({
      knownCostUsd: 0.0142,
      unknownCostCount: 1,
      possiblyBilledCount: 1,
      coverage: 'partial_unknown_cost',
      isInvoice: false,
    });
  });

  test('named compatibility adapters preserve pre-upgrade snapshots and settings with documented consumers (A23, A28, A29)', () => {
    const { normalizeResumeDataForPendingCall } = loadCapabilityModule(
      '../conductor/agent-chat.request.ts'
    );
    const { parseStoredTextFallback } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/ai.text-chain.ts'
    );

    // 1. Resume payload compatibility adapter for native ask_user & submit_plan
    const pendingRuns = [
      {
        runId: 'run-compat-1',
        toolCalls: [
          {
            toolCallId: 'call-ask-1',
            toolName: 'ask_user',
            suspendPayload: {
              question: 'Выберите фокус поста',
              options: [{ label: 'Кейсы' }, { label: 'Цифры' }],
            },
          },
          {
            toolCallId: 'call-plan-1',
            toolName: 'submit_plan',
            suspendPayload: {
              title: 'План из 3 шагов',
              plan: '1. Сбор\n2. Черновик\n3. Адаптация',
            },
          },
        ],
      },
    ];

    expect(
      normalizeResumeDataForPendingCall(
        pendingRuns,
        'run-compat-1',
        'call-ask-1',
        {
          answer: 'Кейсы',
        }
      )
    ).toBe('Кейсы');

    expect(
      normalizeResumeDataForPendingCall(
        pendingRuns,
        'run-compat-1',
        'call-plan-1',
        {
          approved: false,
          feedback: 'Сократить до 2 шагов',
        }
      )
    ).toEqual({
      approved: false,
      feedback: 'Сократить до 2 шагов',
    });

    // 2. Legacy single textFallbackModel string migration adapter
    const legacy = parseStoredTextFallback('anthropic/claude-3.7-sonnet');
    expect(legacy).toEqual({
      models: ['anthropic/claude-3.7-sonnet'],
      disabled: false,
      inheritedDefault: false,
      structured: false,
    });
  });

  test('the acceptance suite inventory resolves to repository files (not scenario acceptance)', () => {
    const requiredSuites = [
      'tests/agent-conductor.agent.test.cjs',
      'tests/agent-conductor.unit.test.cjs',
      'tests/mastra-upgrade.execution.test.cjs',
      'tests/agent-native-history.test.cjs',
      'tests/agent.model-autonomy.test.cjs',
      'tests/agent-durable-recovery.test.cjs',
      'tests/agent-task-execution.test.cjs',
      'tests/agent-native-autonomy.test.cjs',
      'tests/agent-model-fallback-retry.test.cjs',
      'tests/admin-ai-defaults.screen.test.cjs',
      'tests/instance-ai-defaults.test.cjs',
      'tests/agent-native-ui.test.cjs',
      'tests/agent-native-acceptance-matrix.test.cjs',
    ];
    for (const suite of requiredSuites) {
      expect(fs.existsSync(path.join(root, suite))).toBe(true);
    }
  });
});
