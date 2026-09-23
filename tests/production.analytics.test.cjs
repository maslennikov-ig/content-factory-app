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
      // Правило держателя слота (`97dq.57`): без вытесненных версий.
      '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-plan': {
        supersededDraftPostIds: async () => [],
      },
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

    const shell = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/frontend/src/components/platform-analytics/analytics.screen.tsx'
      ),
      'utf8'
    );
    expect(shell).not.toContain('<h1');
    expect(shell).toContain('<TabList');
    expect(shell).toContain("t('analytics_sections', 'Analytics sections')");
  });

  /* «Впереди N дней» (`97dq.59`). */
  const loadAhead = () =>
    loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/posts/production.analytics.ts'
    );
  const planned = (integrationId, iso, state = 'DRAFT', plan = 'reserve') => ({
    integrationId,
    publishDate: new Date(iso),
    state,
    plan,
  });

  test('days ahead: consecutive days from today holding a reserved or queued post, per channel and together', () => {
    const { calculatePlanAhead } = loadAhead();
    const now = new Date('2026-09-24T07:00:00.000Z'); // 10:00 in Moscow
    const result = calculatePlanAhead({
      now,
      timeZone: 'Europe/Moscow',
      channels: [
        { id: 'tg', name: 'AiDevTeam' },
        { id: 'test', name: 'Тестовая группа' },
        { id: 'vk', name: 'Сообщество AiDev' },
      ],
      posts: [
        planned('tg', '2026-09-24T06:20:00.000Z', 'DRAFT', 'reserve'),
        planned('tg', '2026-09-25T06:20:00.000Z', 'QUEUE', 'autopilot'),
        planned('tg', '2026-09-26T06:20:00.000Z', 'QUEUE', null),
        // 00:30 Moscow on the 27th is 21:30 UTC on the 26th: the reader's day counts.
        planned('tg', '2026-09-26T21:30:00.000Z', 'DRAFT', 'autopilot'),
        planned('tg', '2026-09-29T06:20:00.000Z', 'QUEUE', null),
        planned('test', '2026-09-24T11:00:00.000Z', 'QUEUE', null),
        planned('test', '2026-09-25T11:00:00.000Z', 'DRAFT', 'reserve'),
        // An unplanned draft and an error hold nothing.
        planned('vk', '2026-09-24T11:00:00.000Z', 'DRAFT', 'draft'),
        planned('vk', '2026-09-25T11:00:00.000Z', 'ERROR', null),
      ],
    });
    expect(result).toMatchObject({
      version: 'plan-ahead/v1',
      today: '2026-09-24',
      timeZone: 'Europe/Moscow',
      days: 4,
      until: '2026-09-27',
      emptyFrom: '2026-09-28',
    });
    expect(result.channels).toEqual([
      { integrationId: 'tg', name: 'AiDevTeam', days: 4, until: '2026-09-27', emptyFrom: '2026-09-28' },
      { integrationId: 'test', name: 'Тестовая группа', days: 2, until: '2026-09-25', emptyFrom: '2026-09-26' },
      { integrationId: 'vk', name: 'Сообщество AiDev', days: 0, until: null, emptyFrom: '2026-09-24' },
    ]);
    expect(result.strip).toHaveLength(14);
    expect(result.strip.slice(0, 6).map((day) => day.filled)).toEqual([
      true, true, true, true, false, true,
    ]);
  });

  test('days ahead: today is covered by a post already out; a gap today is zero; a bad zone reads as UTC', () => {
    const { calculatePlanAhead, planAheadTimeZone } = loadAhead();
    const now = new Date('2026-09-24T18:00:00.000Z');
    expect(
      calculatePlanAhead({
        now,
        timeZone: 'UTC',
        channels: [{ id: 'tg', name: 'A' }],
        posts: [
          planned('tg', '2026-09-24T09:00:00.000Z', 'PUBLISHED', null),
          planned('tg', '2026-09-25T09:00:00.000Z', 'QUEUE', null),
          // Published is not «ahead» on a later day.
          planned('tg', '2026-09-26T09:00:00.000Z', 'PUBLISHED', null),
        ],
      }).days
    ).toBe(2);
    expect(
      calculatePlanAhead({
        now,
        timeZone: 'UTC',
        channels: [],
        posts: [planned('tg', '2026-09-25T09:00:00.000Z', 'QUEUE', null)],
      })
    ).toMatchObject({ days: 0, until: null, emptyFrom: '2026-09-24' });
    expect(planAheadTimeZone('Mars/Olympus')).toBe('UTC');
    expect(planAheadTimeZone('')).toBe('UTC');
    expect(planAheadTimeZone('Europe/Moscow')).toBe('Europe/Moscow');
  });

  test('days ahead: the repository reads this tenant, live channels, the window, without superseded drafts', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        integrationId: 'int-a',
        publishDate: new Date('2026-09-25T09:00:00.000Z'),
        state: 'DRAFT',
        contentDerivations: [{ plan: 'reserve' }],
      },
    ]);
    const { PostsRepository } = loadPostsRepository();
    const repository = new PostsRepository(
      { model: { post: { findMany } } },
      {},
      {},
      {},
      {},
      {}
    );
    const from = new Date('2026-09-23T00:00:00.000Z');
    const to = new Date('2026-11-25T00:00:00.000Z');
    const rows = await repository.getPlanAheadPosts('org-a', from, to, ['int-a']);
    const [[query]] = findMany.mock.calls;
    expect(query.where).toMatchObject({
      organizationId: 'org-a',
      deletedAt: null,
      parentPostId: null,
      publishDate: { gte: from, lte: to },
      state: { in: ['QUEUE', 'DRAFT', 'PUBLISHED'] },
      integration: { deletedAt: null, organizationId: 'org-a', id: { in: ['int-a'] } },
    });
    expect(query.select.contentDerivations.where).toEqual({ organizationId: 'org-a' });
    expect(query.select).not.toHaveProperty('content');
    expect(rows).toEqual([
      {
        integrationId: 'int-a',
        publishDate: new Date('2026-09-25T09:00:00.000Z'),
        state: 'DRAFT',
        plan: 'reserve',
      },
    ]);
  });

  test('days ahead: the door is read-only, sits before `/:integration`, and the matrix names it', () => {
    const controller = fs.readFileSync(
      path.resolve(__dirname, '../apps/backend/src/api/routes/analytics.controller.ts'),
      'utf8'
    );
    expect(controller.indexOf("@Get('/ahead')")).toBeGreaterThan(-1);
    expect(controller.indexOf("@Get('/ahead')")).toBeLessThan(
      controller.indexOf("@Get('/:integration')")
    );
    expect(controller).not.toMatch(/@Post|@Put|@Delete/);
    const matrix = fs.readFileSync(
      path.resolve(__dirname, '../docs/product/roles-matrix.md'),
      'utf8'
    );
    expect(matrix).toContain('`GET /analytics/ahead`');
  });

  test('Производство carries the plan-ahead card: big number, 14-day strip, «?»', () => {
    const screen = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/platform-analytics/production.analytics.tsx'),
      'utf8'
    );
    expect(screen).toContain('<PlanAheadCard');
    const card = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/launches/plan-ahead.tsx'),
      'utf8'
    );
    expect(card).toContain('data-plan-ahead-strip');
    expect(card).toContain('<Hint label={copy.aheadHintLabel}>{copy.aheadCardHint}</Hint>');
  });
});
