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

/** The holder rule as the repository sees it; each test sets its answer. */
let supersededCalls = [];
let supersededAnswer = [];
const loadPostsRepository = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    {
      // Правило держателя слота (`97dq.57`): без вытесненных версий.
      '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-plan': {
        supersededDraftPostIds: async (...args) => {
          supersededCalls.push(args.slice(1));
          return supersededAnswer;
        },
      },
      // Поиск по словам в списке постов (odb8.4.1): настоящий разбор, без моков.
      '@contentfactory/nestjs-libraries/content-intelligence/search-terms':
        loadTypeScriptModule(
          'libraries/nestjs-libraries/src/content-intelligence/search-terms.ts'
        ),
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
      version: 'plan-ahead/v2',
      today: '2026-09-24',
      timeZone: 'Europe/Moscow',
      days: 4,
      until: '2026-09-27',
      emptyFrom: '2026-09-28',
      // `97dq.73`: the counts the owner asked for.
      reserved: 3,
      queued: 4,
      planned: 7,
      planUntil: '2026-09-29',
      published7d: 0,
      daysWithPosts: 5,
    });
    const none = { published7d: 0 };
    expect(result.channels).toEqual([
      { integrationId: 'tg', name: 'AiDevTeam', days: 4, until: '2026-09-27', emptyFrom: '2026-09-28', reserved: 2, queued: 3, planned: 5, planUntil: '2026-09-29', ...none },
      { integrationId: 'test', name: 'Тестовая группа', days: 2, until: '2026-09-25', emptyFrom: '2026-09-26', reserved: 1, queued: 1, planned: 2, planUntil: '2026-09-25', ...none },
      { integrationId: 'vk', name: 'Сообщество AiDev', days: 0, until: null, emptyFrom: '2026-09-24', reserved: 0, queued: 0, planned: 0, planUntil: null, ...none },
    ]);
    expect(result.strip[0]).toEqual({ date: '2026-09-24', filled: true, reserved: 1, queued: 1, published: 0 });
    expect(result.strip[3]).toEqual({ date: '2026-09-27', filled: true, reserved: 1, queued: 0, published: 0 });
    expect(result.strip[4]).toEqual({ date: '2026-09-28', filled: false, reserved: 0, queued: 0, published: 0 });
    expect(result.strip).toHaveLength(14);
    expect(result.strip.slice(0, 6).map((day) => day.filled)).toEqual([
      true, true, true, true, false, true,
    ]);
  });

  test('plan ahead: published in the last 7 days per channel; counts and «План до» are not capped by the streak horizon', () => {
    const { calculatePlanAhead } = loadAhead();
    const result = calculatePlanAhead({
      now: new Date('2026-09-24T12:00:00.000Z'),
      timeZone: 'UTC',
      horizon: 10,
      channels: [{ id: 'tg', name: 'A' }, { id: 'vk', name: 'B' }],
      posts: [
        planned('tg', '2026-09-24T09:00:00.000Z', 'PUBLISHED', null),
        planned('tg', '2026-09-18T09:00:00.000Z', 'PUBLISHED', null),
        // Eight days back is outside «за 7 дней».
        planned('tg', '2026-09-16T09:00:00.000Z', 'PUBLISHED', null),
        planned('vk', '2026-09-20T09:00:00.000Z', 'PUBLISHED', null),
        planned('vk', '2026-10-30T09:00:00.000Z', 'QUEUE', null),
      ],
    });
    // Second review, item 3: a queued post 36 days out, past a 10-day horizon, still counts.
    expect(result).toMatchObject({ published7d: 3, planned: 1, queued: 1, planUntil: '2026-10-30', daysWithPosts: 1 });
    expect(result.strip[0]).toMatchObject({ published: 1, filled: true });
    expect(result.channels.map((one) => [one.integrationId, one.published7d, one.planUntil])).toEqual([
      ['tg', 2, null],
      ['vk', 1, '2026-10-30'],
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

  test('days ahead: the repository reads this tenant, live enabled channels, the window, without superseded drafts', async () => {
    supersededCalls = [];
    supersededAnswer = ['p-old'];
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'p-new',
        integrationId: 'int-a',
        publishDate: new Date('2026-09-25T09:00:00.000Z'),
        state: 'DRAFT',
        contentDerivations: [{ plan: 'reserve' }],
      },
      {
        id: 'p-old',
        integrationId: 'int-a',
        publishDate: new Date('2026-09-26T09:00:00.000Z'),
        state: 'DRAFT',
        contentDerivations: [{ plan: 'reserve' }],
      },
      {
        id: 'p-q',
        integrationId: 'int-b',
        publishDate: new Date('2026-09-26T09:00:00.000Z'),
        state: 'QUEUE',
        contentDerivations: [],
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
    const rows = await repository.getPlanAheadPosts('org-a', from, to, ['int-a', 'int-b']);
    const [[query]] = findMany.mock.calls;
    expect(query.where).toMatchObject({
      organizationId: 'org-a',
      deletedAt: null,
      parentPostId: null,
      publishDate: { gte: from, lte: to },
      state: { in: ['QUEUE', 'DRAFT', 'PUBLISHED'] },
      // Second review, item 2: a disabled channel is in neither the table nor the totals.
      integration: { deletedAt: null, disabled: false, organizationId: 'org-a', id: { in: ['int-a', 'int-b'] } },
    });
    expect(query.select.contentDerivations.where).toEqual({ organizationId: 'org-a' });
    expect(query.select).not.toHaveProperty('content');
    // Item 11: the holder rule is asked once, only for the channels with drafts,
    // and only about this read's own drafts (97dq.65, F12).
    expect(supersededCalls).toEqual([['org-a', ['int-a'], { id: { in: ['p-new', 'p-old'] } }]]);
    expect(rows).toEqual([
      {
        integrationId: 'int-a',
        publishDate: new Date('2026-09-25T09:00:00.000Z'),
        state: 'DRAFT',
        plan: 'reserve',
      },
      {
        integrationId: 'int-b',
        publishDate: new Date('2026-09-26T09:00:00.000Z'),
        state: 'QUEUE',
        plan: null,
      },
    ]);

    // No drafts in the answer: no holder read. No end: the whole future.
    supersededCalls = [];
    findMany.mockClear();
    findMany.mockResolvedValueOnce([
      { id: 'p-q', integrationId: 'int-b', publishDate: new Date('2027-03-01T09:00:00.000Z'), state: 'QUEUE', contentDerivations: [] },
    ]);
    await repository.getPlanAheadPosts('org-a', from, null);
    expect(findMany.mock.calls[0][0].where.publishDate).toEqual({ gte: from });
    expect(supersededCalls).toEqual([]);
  });

  test('plan ahead: a disabled channel is out of the totals as well as the table, so they add up', async () => {
    supersededCalls = [];
    supersededAnswer = [];
    const channels = [
      { id: 'on', name: 'On', disabled: false },
      { id: 'off', name: 'Off', disabled: true },
    ];
    const posts = [
      { id: 'a', integrationId: 'on', publishDate: new Date('2026-09-25T09:00:00.000Z'), state: 'QUEUE', contentDerivations: [] },
      { id: 'b', integrationId: 'off', publishDate: new Date('2026-09-26T09:00:00.000Z'), state: 'QUEUE', contentDerivations: [] },
      { id: 'c', integrationId: 'off', publishDate: new Date('2026-09-27T09:00:00.000Z'), state: 'DRAFT', contentDerivations: [{ plan: 'reserve' }] },
    ];
    // A fake that honours the one filter this test is about.
    const disabledOf = (id) => channels.find((one) => one.id === id).disabled;
    const model = {
      post: {
        findMany: async ({ where }) =>
          posts.filter((row) => where.integration.disabled === undefined || disabledOf(row.integrationId) === where.integration.disabled),
      },
      integration: {
        findMany: async ({ where }) =>
          channels.filter((one) => where.disabled === undefined || one.disabled === where.disabled).map(({ id, name }) => ({ id, name })),
      },
    };
    const { PostsRepository } = loadPostsRepository();
    const repository = new PostsRepository({ model }, {}, {}, {}, {}, {});
    const { calculatePlanAhead } = loadAhead();
    const result = calculatePlanAhead({
      now: new Date('2026-09-24T09:00:00.000Z'),
      timeZone: 'UTC',
      posts: await repository.getPlanAheadPosts('org-a', new Date('2026-09-16T00:00:00.000Z'), null),
      channels: await repository.getPlanAheadChannels('org-a'),
    });
    expect(result.channels.map((one) => one.integrationId)).toEqual(['on']);
    expect(result.planned).toBe(1);
    expect(result.planned).toBe(result.channels.reduce((sum, one) => sum + one.planned, 0));
    expect(result.planUntil).toBe('2026-09-25');
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

  test('Производство carries the plan ahead (97dq.73): KPIs, 14-day strip, per-channel table', () => {
    const screen = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/platform-analytics/production.analytics.tsx'),
      'utf8'
    );
    expect(screen).toContain('<PlanAheadOverview');
    // The reader's language, not a hard-coded English one (audit §9).
    expect(screen).not.toMatch(/locale="en"/);
    const overview = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/launches/plan-ahead.tsx'),
      'utf8'
    );
    expect(overview).toContain('data-plan-ahead-strip');
    expect(overview).toContain('data-plan-ahead-table');
    // The streak wording is gone.
    const copy = fs.readFileSync(
      path.resolve(__dirname, '../apps/frontend/src/components/launches/calendar-planning.copy.ts'),
      'utf8'
    );
    expect(copy).not.toMatch(/закрашено|дней впереди|впереди пусто/);
  });
});
