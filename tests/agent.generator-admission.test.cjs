'use strict';

// Exercise the shipped generator's start and real admission/ALS seam. Only
// Prisma, configuration resolution and compiled graph events are synthetic;
// no provider, database, HTTP request or application is started here.
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');
const { modelFor } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.roles.ts'
);
const { AgentGraphService } = loadAgentGraph({ chatModel: {} });
const ORG = 'generator-test-org';
const USER = 'generator-test-user';
const CONFIG = {
  usageMode: 'workspace_key',
  provider: 'openai',
  apiKey: 'INERT_NO_PROVIDER',
  textModel: 'fallback-text',
  imageModel: 'fallback-image',
  roleModels: {
    agent: 'conductor-model',
    draft: 'writer-model',
    extract: 'extract-model',
  },
  search: { enabled: false, apiKey: '' },
};

function harness({ failure = false } = {}) {
  const aiConfig = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.provider.config.ts',
    { '@contentfactory/helpers/auth/auth.service': { AuthService: class {} } }
  );
  const acting = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/user/acting.user.ts'
  );
  const rows = [];
  const { AiUsageService } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        ...aiConfig,
        loadAiConfig: async () => CONFIG,
      },
      '@contentfactory/nestjs-libraries/user/acting.user': acting,
    }
  );
  const usage = new AiUsageService({
    aiUsageRecord: {
      create: async ({ data }) => {
        const row = { id: `row-${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }) =>
        Object.assign(
          rows.find((row) => row.id === where.id),
          data
        ),
    },
  });
  const { runPaidCapability } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/capabilities/paid-adapter.ts',
    { '@contentfactory/nestjs-libraries/openai/ai.provider.config': aiConfig }
  );
  const seen = [];
  let graphClosed = false;
  const compiled = {
    streamEvents: async function* () {
      try {
        seen.push({
          role: aiConfig.getActiveAiRole(),
          model: modelFor(aiConfig.getActiveAiRole(), CONFIG),
          user: acting.getActingUserId(),
        });
        expect(await aiConfig.requireActiveAiConfig(ORG)).toBe(CONFIG);
        yield { name: 'generator-test-event' };
        if (failure) throw new Error('SYNTHETIC_GRAPH_FAILURE');
      } finally {
        graphClosed = true;
      }
    },
  };
  const fluent = {
    addNode() {
      return this;
    },
    addEdge() {
      return this;
    },
    addConditionalEdges() {
      return this;
    },
    compile() {
      return compiled;
    },
  };
  const originalState = AgentGraphService.state;
  AgentGraphService.state = () => fluent;
  const service = new AgentGraphService(
    {},
    {},
    {},
    usage,
    {
      build: async () => ({
        contractVersion: 'content-context/v1',
        contentContextSnapshotId: 'synthetic-snapshot',
        status: 'READY',
        generationPolicy: 'ALLOW_USER_ONLY',
        profile: {
          mode: 'resolved',
          versionId: 'synthetic-version',
          versionNumber: 1,
        },
        facts: [],
        evidence: [],
        selectionHash: 'synthetic-hash',
      }),
    },
    { resolve: async () => ({ effectiveVoice: {} }) },
    null,
    null
  );
  const stream = () =>
    service.start(
      ORG,
      {
        research: 'Synthetic owned material',
        format: 'one_long',
        language: 'ru',
        isPicture: false,
      },
      { draftOnly: true }
    );
  const drain = async () => {
    for await (const _event of stream()) {
      /* Drive the real generator. */
    }
  };
  const outer = (callback) =>
    acting.runAsActingUser(USER, async () => {
      const admission = await usage.beginAiOperationWithConfig(
        ORG,
        'agent',
        CONFIG,
        'agent'
      );
      try {
        const result = await admission.run(callback);
        await admission.finish(true);
        return result;
      } catch (error) {
        await admission.finish(false, error);
        throw error;
      }
    });
  const assertRows = (pairs, statuses) => {
    expect(rows.map((row) => [row.operation, row.role])).toEqual(pairs);
    expect(rows.map((row) => row.status)).toEqual(statuses);
    expect(
      rows.every((row) => row.organizationId === ORG && row.userId === USER)
    ).toBe(true);
  };
  return {
    rows,
    usage,
    acting,
    aiConfig,
    seen,
    outer,
    drain,
    stream,
    runPaidCapability,
    assertRows,
    graphClosed: () => graphClosed,
    restore: () => {
      AgentGraphService.state = originalState;
    },
  };
}

test('ordinary generation admits one text operation and selects the writer model', async () => {
  const h = harness();
  try {
    await h.acting.runAsActingUser(USER, h.drain);
    h.assertRows([['text_generation', 'draft']], ['succeeded']);
    expect(h.seen).toEqual([
      { role: 'draft', model: 'writer-model', user: USER },
    ]);
  } finally {
    h.restore();
  }
});

test.each([false, true])(
  'paid chat adaptation preserves one conductor admission (interview=%s)',
  async (interview) => {
    const h = harness();
    try {
      await h.outer(async () => {
        expect(h.aiConfig.getActiveAiRole()).toBe('agent');
        await h.runPaidCapability(async () => {
          expect(h.aiConfig.getActiveAiConfig(ORG)).toBeUndefined();
          if (interview)
            await h.usage.executeAiOperation(
              ORG,
              'intake',
              async () => [],
              'extract'
            );
          await h.drain();
        });
        expect(h.aiConfig.getActiveAiRole()).toBe('agent');
      });
      const pairs = [
        ['agent', 'agent'],
        ...(interview ? [['intake', 'extract']] : []),
        ['text_generation', 'draft'],
      ];
      h.assertRows(
        pairs,
        pairs.map(() => 'succeeded')
      );
      expect(h.rows.filter((row) => row.operation === 'agent')).toHaveLength(1);
      expect(h.rows.length).toBeLessThanOrEqual(3);
      expect(h.seen).toEqual([
        { role: 'draft', model: 'writer-model', user: USER },
      ]);
    } finally {
      h.restore();
    }
  }
);

test('generation failure closes both admissions once and makes no retry', async () => {
  const h = harness({ failure: true });
  try {
    await expect(h.outer(() => h.runPaidCapability(h.drain))).rejects.toThrow(
      'SYNTHETIC_GRAPH_FAILURE'
    );
    h.assertRows(
      [
        ['agent', 'agent'],
        ['text_generation', 'draft'],
      ],
      ['failed', 'failed']
    );
    expect(h.seen).toHaveLength(1);
    expect(h.graphClosed()).toBe(true);
  } finally {
    h.restore();
  }
});

test('returning the ordinary generation stream finalizes its single admission as failed', async () => {
  const h = harness();
  try {
    await h.acting.runAsActingUser(USER, async () => {
      const iterator = h.stream();
      let event;
      do {
        event = await iterator.next();
      } while (!event.done && event.value.name !== 'generator-test-event');
      expect(event.done).toBe(false);
      await iterator.return();
    });
    h.assertRows([['text_generation', 'draft']], ['failed']);
    expect(h.graphClosed()).toBe(true);
  } finally {
    h.restore();
  }
});
