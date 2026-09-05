const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const loadPostsRepository = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    {
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize': {
        // Статический импорт с ff7cfe3c (fn33.28.7); этим тестам контекст не нужен.
        validateContentContextForDraft: async () => {
          throw new Error('content context is not part of this test');
        },
        writeContentContextDraftProvenance: async () => undefined,
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class {},
      },
      '@nestjs/common': {
        Injectable: () => (target) => target,
        Logger: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': {},
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {},
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {},
      '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {},
      '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
        {
          safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }),
        },
      '@prisma/client': {
        APPROVED_SUBMIT_FOR_ORDER: {},
        CreationMethod: {},
        State: {},
      },
    }
  );

describe('production analytics', () => {
  test('calculates volume, failure rate, lead time, origins and reasons', () => {
    const { calculateProductionAnalytics } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts'
    );

    const result = calculateProductionAnalytics([
      {
        state: 'PUBLISHED',
        creationMethod: 'WEB',
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
        publishDate: new Date('2026-08-11T00:00:00.000Z'),
        updatedAt: new Date('2026-08-11T00:00:00.000Z'),
        error: null,
        errors: [],
      },
      {
        state: 'PUBLISHED',
        creationMethod: 'AUTOPOST',
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        publishDate: new Date('2026-08-11T12:00:00.000Z'),
        updatedAt: new Date('2026-08-11T12:00:00.000Z'),
        error: null,
        errors: [],
      },
      {
        state: 'ERROR',
        creationMethod: 'MCP',
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        publishDate: new Date('2026-08-12T01:00:00.000Z'),
        updatedAt: new Date('2026-08-12T01:00:00.000Z'),
        error: 'Telegram rejected the message',
        errors: [{ message: 'Older transport error' }],
      },
      {
        state: 'DRAFT',
        creationMethod: 'WEB',
        createdAt: new Date('2026-08-12T00:00:00.000Z'),
        publishDate: new Date('2026-08-12T00:00:00.000Z'),
        updatedAt: new Date('2026-08-12T00:00:00.000Z'),
        error: null,
        errors: [],
      },
    ]);

    expect(result.summary).toEqual({
      publishedVolume: 2,
      failureCount: 1,
      failureRate: 33.3,
      averageLeadTimeHours: 18,
    });
    expect(result.originMix).toEqual([
      { origin: 'AUTOPOST', count: 1, percentage: 33.3 },
      { origin: 'MCP', count: 1, percentage: 33.3 },
      { origin: 'WEB', count: 1, percentage: 33.3 },
    ]);
    expect(result.failureReasons).toEqual([
      { reason: 'Telegram rejected the message', count: 1 },
    ]);
  });

  test('uses a bounded UTC window and returns zeros for no attempts', () => {
    const { calculateProductionAnalytics, productionAnalyticsWindow } =
      loadTypeScriptModule(
        'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts'
      );

    expect(
      productionAnalyticsWindow(7, new Date('2026-08-13T14:22:00.000Z'))
    ).toEqual({
      from: new Date('2026-08-07T00:00:00.000Z'),
      to: new Date('2026-08-13T14:22:00.000Z'),
    });
    expect(calculateProductionAnalytics([])).toEqual({
      summary: {
        publishedVolume: 0,
        failureCount: 0,
        failureRate: 0,
        averageLeadTimeHours: 0,
      },
      originMix: [],
      failureReasons: [],
    });
  });

  test('a post edited after publication keeps its original lead time', () => {
    const { calculateProductionAnalytics } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts'
    );

    const result = calculateProductionAnalytics([
      {
        state: 'PUBLISHED',
        creationMethod: 'WEB',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        publishDate: new Date('2026-08-01T02:00:00.000Z'),
        // A correction typed a week later; it is not part of the lead time.
        updatedAt: new Date('2026-08-08T00:00:00.000Z'),
        error: null,
        errors: [],
      },
    ]);

    expect(result.summary.averageLeadTimeHours).toBe(2);
  });

  test('the repository asks Postgres only for this tenant and this window', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { PostsRepository } = loadPostsRepository();
    const repository = new PostsRepository(
      { model: { post: { findMany } } },
      {},
      {},
      {},
      {},
      {}
    );

    const from = new Date('2026-08-07T00:00:00.000Z');
    const to = new Date('2026-08-13T14:22:00.000Z');
    await repository.getProductionAnalyticsPosts('org-a', from, to, 'int-a');

    const [[query]] = findMany.mock.calls;
    expect(query.where).toMatchObject({
      organizationId: 'org-a',
      deletedAt: null,
      parentPostId: null,
      publishDate: { gte: from, lte: to },
      state: { in: ['PUBLISHED', 'ERROR'] },
      integrationId: 'int-a',
    });
    expect(query.select).toMatchObject({
      state: true,
      creationMethod: true,
      createdAt: true,
      publishDate: true,
    });
  });

  test('keeps the analytics screen local', () => {
    const screen = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/frontend/src/components/platform-analytics/production.analytics.tsx'
      ),
      'utf8'
    );

    expect(screen).toContain("fetch('/analytics/production?");
    expect(screen).toContain('production_analytics_published_volume');
    expect(screen).toContain('production_analytics_failure_rate');
    expect(screen).toContain('production_analytics_lead_time');
    expect(screen).toContain('production_analytics_origin_mix');
  });
});
