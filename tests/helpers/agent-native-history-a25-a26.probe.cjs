'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { InMemoryStore } = require('@mastra/core/storage');
const { PostgresStore } = require('@mastra/pg');
const { UnsupportedFileHandler } = require('@mastra/core/processors');
const {
  RequestContext,
  MASTRA_THREAD_ID_KEY,
  MASTRA_RESOURCE_ID_KEY,
} = require('@mastra/core/request-context');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

const BASE = 'libraries/nestjs-libraries/src/chat/';
const mocks = {
  '../conductor/conductor.execution': {
    currentConductorExecution: () => {
      throw new Error('History must not admit a paid operation');
    },
  },
};

async function runA26() {
  const { createConductorMemory } = loadTypeScriptModule(
    `${BASE}conductor/conductor.memory.ts`,
    mocks
  );
  const { seedCapabilityContext } = loadTypeScriptModule(
    `${BASE}capabilities/capability.context.ts`,
    mocks
  );
  const memory = createConductorMemory(new InMemoryStore());
  const tool = memory.listTools().readConversationHistory;
  const identity = {
    organizationId: 'org',
    organizationCreatedAt: '2026-01-01T00:00:00Z',
    userId: 'user',
    role: 'EDITOR',
    language: 'en',
    timeZone: 'UTC',
  };
  await memory.createThread({
    threadId: 'thread-a26',
    resourceId: 'org:user',
    title: 'Attachments and active history',
  });

  const pngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const pdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoK';

  await memory.saveMessages({
    messages: [
      {
        id: 'msg-with-attachments',
        threadId: 'thread-a26',
        resourceId: 'org:user',
        role: 'user',
        createdAt: new Date('2026-01-01T00:00:01Z'),
        content: {
          format: 2,
          parts: [
            { type: 'text', text: 'Here are the brand slide and the PDF brief.' },
            {
              type: 'file',
              mimeType: 'image/png',
              filename: 'slide.png',
              data: pngDataUrl,
            },
            {
              type: 'file',
              mimeType: 'application/pdf',
              filename: 'brief.pdf',
              data: pdfDataUrl,
            },
          ],
        },
      },
    ],
  });

  const requestContext = new RequestContext();
  seedCapabilityContext(requestContext, identity);
  requestContext.set(MASTRA_THREAD_ID_KEY, 'thread-a26');
  requestContext.set(MASTRA_RESOURCE_ID_KEY, 'org:user');

  const listed = await tool.execute({ page: 0 }, { requestContext });
  assert.equal(listed.ok, true);
  const recalledMsg = listed.messages.untrustedData.value[0];
  assert.equal(recalledMsg.id, 'msg-with-attachments');
  assert.deepEqual(recalledMsg.attachments, [
    { partIndex: 1, type: 'file', mediaType: 'image/png', filename: 'slide.png' },
    { partIndex: 2, type: 'file', mediaType: 'application/pdf', filename: 'brief.pdf' },
  ]);

  const viewedImage = await tool.execute(
    {
      page: 0,
      messageId: 'msg-with-attachments',
      partIndex: 1,
      viewAttachment: true,
    },
    { requestContext }
  );
  assert.equal(viewedImage.ok, true);
  assert.equal(viewedImage.attachment.mediaType, 'image/png');
  assert.equal(viewedImage.attachment.filename, 'slide.png');
  const imageModelOutput = tool.toModelOutput(viewedImage);
  assert.equal(imageModelOutput.type, 'content');
  assert.equal(imageModelOutput.value.length, 2);
  assert.equal(imageModelOutput.value[0].type, 'text');
  assert.deepEqual(imageModelOutput.value[1], {
    type: 'media',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    mediaType: 'image/png',
  });

  const viewedPdf = await tool.execute(
    {
      page: 0,
      messageId: 'msg-with-attachments',
      partIndex: 2,
      viewAttachment: true,
    },
    { requestContext }
  );
  assert.equal(viewedPdf.ok, true);
  assert.equal(viewedPdf.attachment.mediaType, 'application/pdf');
  const pdfModelOutput = tool.toModelOutput(viewedPdf);
  assert.equal(pdfModelOutput.type, 'content');
  assert.equal(pdfModelOutput.value[1].mediaType, 'application/pdf');

  // Active turn messages via context.agent.getMessages()
  const withActive = await tool.execute(
    { page: 0, includeActive: true },
    {
      requestContext,
      agent: {
        getMessages: () => [
          {
            id: 'active-turn-msg',
            threadId: 'thread-a26',
            resourceId: 'org:user',
            role: 'user',
            createdAt: new Date('2026-01-01T00:00:05Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'In-flight user turn message' }],
            },
          },
          {
            id: 'foreign-active-msg',
            threadId: 'other-thread',
            resourceId: 'other:user',
            role: 'user',
            createdAt: new Date('2026-01-01T00:00:06Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'MUST_NOT_LEAK_ACTIVE' }],
            },
          },
        ],
      },
    }
  );
  assert.equal(withActive.ok, true);
  const activeIds = withActive.messages.untrustedData.value.map((m) => m.id);
  assert.deepEqual(activeIds, ['msg-with-attachments', 'active-turn-msg']);

  // UnsupportedFileHandler fallback when provider rejects inline PDF/file mediaType
  const handler = new UnsupportedFileHandler();
  const state = {};
  const prompt = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Read this file' },
        {
          type: 'file',
          data: 'JVBERi0xLjQK',
          mediaType: 'application/pdf',
          filename: 'brief.pdf',
        },
      ],
    },
  ];
  const fakeMessageList = {
    get: {
      all: {
        db: () => [
          {
            id: 'm1',
            role: 'user',
            content: {
              format: 2,
              parts: [
                {
                  type: 'file',
                  mimeType: 'application/pdf',
                  filename: 'brief.pdf',
                  data: pdfDataUrl,
                },
              ],
            },
          },
        ],
      },
    },
  };
  const unsupportedError = Object.assign(
    new Error('file part media type application/pdf is not supported'),
    {
      name: 'AI_UnsupportedFunctionalityError',
      functionality: 'file part media type application/pdf',
    }
  );
  const apiErrorDecision = await handler.processAPIError({
    error: unsupportedError,
    messageList: fakeMessageList,
    retryCount: 0,
    state,
  });
  assert.deepEqual(apiErrorDecision, { retry: true });
  const rewritten = await handler.processLLMRequest({
    prompt,
    messageList: fakeMessageList,
    requestContext,
    state,
  });
  assert.ok(rewritten && Array.isArray(rewritten.prompt));
  const rewrittenParts = rewritten.prompt[0].content;
  assert.equal(rewrittenParts.some((part) => part.type === 'file'), false);
  assert.equal(
    rewrittenParts.some(
      (part) => part.type === 'text' && /application\/pdf|brief\.pdf/i.test(part.text)
    ),
    true
  );

  return {
    attachmentsListed: recalledMsg.attachments.length,
    multimodalImage: imageModelOutput.value[1].mediaType,
    multimodalPdf: pdfModelOutput.value[1].mediaType,
    activeIncluded: activeIds.includes('active-turn-msg'),
    unsupportedFileFallback: true,
  };
}

async function runA25() {
  const { createConductorMemory } = loadTypeScriptModule(
    `${BASE}conductor/conductor.memory.ts`,
    mocks
  );
  const { seedCapabilityContext } = loadTypeScriptModule(
    `${BASE}capabilities/capability.context.ts`,
    mocks
  );
  const schemaName = `cf_test_a25_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const defaultConnectionString =
    process.env.CF_TEST_PG_URL ||
    'postgresql://cf-dev:cf-dev-pwd@127.0.0.1:5433/cf-dev-db';
  const isTcpPortReachable = (host, port) =>
    new Promise((resolve) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.setTimeout(500);
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  const acquireTestPostgres = async () => {
    const parsed = new URL(defaultConnectionString);
    const host = parsed.hostname || '127.0.0.1';
    const port = Number(parsed.port || 5432);
    if (await isTcpPortReachable(host, port)) {
      return { url: defaultConnectionString, cleanup: async () => undefined };
    }
    const containerName = `cf-on0i-a25-pg-${process.pid}-${Date.now()}`;
    const run = spawnSync(
      'docker',
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--publish',
        '127.0.0.1::5432',
        '--env',
        'POSTGRES_USER=postgres',
        '--env',
        'POSTGRES_PASSWORD=postgres',
        '--env',
        'POSTGRES_DB=postgres',
        'postgres:17-alpine',
      ],
      { encoding: 'utf8', timeout: 60_000 }
    );
    if (run.status !== 0) {
      throw new Error(`Failed to start disposable PostgreSQL: ${run.stderr || run.stdout}`);
    }
    const portRes = spawnSync('docker', ['port', containerName, '5432/tcp'], {
      encoding: 'utf8',
    });
    const mappedPort = Number(
      (portRes.stdout || '').trim().split('\n')[0].split(':').pop()
    );
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      const logs = spawnSync('docker', ['logs', containerName], { encoding: 'utf8' });
      const initialized = `${logs.stdout || ''}${logs.stderr || ''}`.includes(
        'PostgreSQL init process complete; ready for start up.'
      );
      const check =
        initialized &&
        (await isTcpPortReachable('127.0.0.1', mappedPort)) &&
        spawnSync(
          'docker',
          [
            'exec',
            containerName,
            'psql',
            '-h',
            '127.0.0.1',
            '-U',
            'postgres',
            '-d',
            'postgres',
            '-c',
            'SELECT 1',
          ],
          { encoding: 'utf8' }
        ).status === 0;
      if (check) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
      throw new Error('Disposable PostgreSQL did not become ready');
    }
    const url = `postgresql://postgres:postgres@127.0.0.1:${mappedPort}/postgres`;
    return {
      url,
      cleanup: async () => {
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8' });
      },
    };
  };
  const pgHandle = await acquireTestPostgres();
  const connectionString = pgHandle.url;
  const store = new PostgresStore({
    id: `a25-${schemaName}`,
    connectionString,
    schemaName,
  });
  await store.init();
  try {
    const memory = createConductorMemory(store);
    const supportsAtomic = await memory.supportsAtomicWorkingMemoryMerge();
    assert.equal(supportsAtomic, true);

    await memory.createThread({
      threadId: 'thread-a25',
      resourceId: 'org-a25:user-a25',
      title: 'Atomic working memory test',
    });

    const updateTool = memory.listTools().updateWorkingMemory;
    const requestContext = new RequestContext();
    seedCapabilityContext(requestContext, {
      organizationId: 'org-a25',
      organizationCreatedAt: '2026-01-01T00:00:00Z',
      userId: 'user-a25',
      role: 'EDITOR',
      language: 'ru',
      timeZone: 'Europe/Moscow',
    });
    requestContext.set(MASTRA_THREAD_ID_KEY, 'thread-a25');
    requestContext.set(MASTRA_RESOURCE_ID_KEY, 'org-a25:user-a25');

    const toolCtx = {
      requestContext,
      memory,
      agent: {
        threadId: 'thread-a25',
        resourceId: 'org-a25:user-a25',
      },
    };

    await updateTool.execute(
      { memory: { answerLength: 'short' } },
      toolCtx
    );

    // Concurrent updates to different keys must both survive without clobbering
    await Promise.all([
      updateTool.execute(
        { memory: { usualChannelId: 'channel-telegram-1' } },
        toolCtx
      ),
      updateTool.execute(
        { memory: { usualAvatarId: 'avatar-founder-1' } },
        toolCtx
      ),
    ]);

    // Empty extraction/merge must not erase existing working memory
    await memory.mergeWorkingMemory({
      threadId: 'thread-a25',
      resourceId: 'org-a25:user-a25',
      workingMemory: {},
    });

    const rawWorkingMemory = await memory.getWorkingMemory({
      threadId: 'thread-a25',
      resourceId: 'org-a25:user-a25',
    });
    const parsed = JSON.parse(rawWorkingMemory);
    assert.deepEqual(parsed, {
      answerLength: 'short',
      usualChannelId: 'channel-telegram-1',
      usualAvatarId: 'avatar-founder-1',
    });

    return {
      supportsAtomic,
      mergedKeys: Object.keys(parsed).sort(),
      preservedOnEmptyMerge: true,
    };
  } finally {
    await store.db.none(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => undefined);
    await store.close().catch(() => undefined);
    await pgHandle.cleanup().catch(() => undefined);
  }
}

async function main() {
  const mode = process.argv[2] || 'all';
  const result = {};
  if (mode === 'all' || mode === 'a26') {
    result.a26 = await runA26();
  }
  if (mode === 'all' || mode === 'a25') {
    result.a25 = await runA25();
  }
  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  process.stderr.write(error.stack ?? String(error));
  process.exitCode = 1;
});
