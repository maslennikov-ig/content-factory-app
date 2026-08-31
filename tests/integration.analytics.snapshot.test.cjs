const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve(
  __dirname,
  '../libraries/nestjs-libraries/src/integrations/analytics.snapshot.ts'
);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', compiled)(
  loaded.exports,
  require,
  loaded
);
const { mergeAnalyticsSnapshots, utcAnalyticsDay } = loaded.exports;

function loadTypeScriptModule(relativePath, mocks = {}) {
  const moduleFilename = path.resolve(__dirname, '..', relativePath);
  const moduleCompiled = ts.transpileModule(
    fs.readFileSync(moduleFilename, 'utf8'),
    {
      fileName: moduleFilename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }
  ).outputText;
  const moduleLoaded = { exports: {} };
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
    moduleCompiled
  )(
    moduleLoaded.exports,
    localRequire,
    moduleLoaded,
    moduleFilename,
    path.dirname(moduleFilename)
  );
  return moduleLoaded.exports;
}

const { AnalyticsSnapshotService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/analytics.snapshot.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        warn() {}
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/analytics.snapshot': loaded.exports,
  }
);

describe('integration analytics snapshots', () => {
  test('uses a stable UTC day bucket', () => {
    expect(
      utcAnalyticsDay(new Date('2026-08-13T23:59:59+03:00')).toISOString()
    ).toBe('2026-08-13T00:00:00.000Z');
  });

  test('merges stored days with today and computes real percentage change', () => {
    const result = mergeAnalyticsSnapshots(
      [
        {
          label: 'Subscribers',
          percentageChange: 0,
          data: [{ total: '120', date: '2026-08-13' }],
        },
      ],
      [
        {
          metric: 'Subscribers',
          value: 100,
          bucket: new Date('2026-08-11T00:00:00.000Z'),
        },
        {
          metric: 'Subscribers',
          value: 110,
          bucket: new Date('2026-08-12T00:00:00.000Z'),
        },
        {
          metric: 'Subscribers',
          value: 115,
          bucket: new Date('2026-08-13T00:00:00.000Z'),
        },
      ],
      7,
      new Date('2026-08-13T14:00:00.000Z')
    );

    expect(result).toEqual([
      {
        label: 'Subscribers',
        percentageChange: 20,
        data: [
          { total: '100', date: '2026-08-11' },
          { total: '110', date: '2026-08-12' },
          { total: '120', date: '2026-08-13' },
        ],
      },
    ]);
  });

  test('leaves a live metric unchanged when it has no stored history', () => {
    const live = [
      {
        label: 'Followers',
        percentageChange: 3,
        data: [{ total: '50', date: '2026-08-13' }],
      },
    ];
    expect(
      mergeAnalyticsSnapshots(live, [], 7, new Date('2026-08-13T14:00:00.000Z'))
    ).toEqual(live);
  });

  test('upserts one UTC snapshot per capable integration and isolates failures', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      integration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'telegram-a',
            internalId: 'channel-a',
            providerIdentifier: 'telegram',
            token: '-1001',
          },
          {
            id: 'telegram-b',
            internalId: 'channel-b',
            providerIdentifier: 'telegram-failing',
            token: '-1002',
          },
          {
            id: 'provider-without-snapshots',
            internalId: 'channel-c',
            providerIdentifier: 'unsupported',
            token: 'token',
          },
        ]),
      },
      integrationAnalyticsSnapshot: { upsert },
    };
    const manager = {
      getSocialIntegration(identifier) {
        if (identifier === 'telegram') {
          return {
            analyticsSnapshot: async () => [
              { metric: 'Subscribers', value: 123 },
            ],
          };
        }
        if (identifier === 'telegram-failing') {
          return {
            analyticsSnapshot: async () => {
              throw new Error('unavailable');
            },
          };
        }
        return {};
      },
    };
    const service = new AnalyticsSnapshotService(prisma, manager);

    await expect(
      service.captureAll(new Date('2026-08-13T23:30:00.000Z'))
    ).resolves.toEqual({ collected: 1, failed: 1 });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        integrationId_metric_bucket: {
          integrationId: 'telegram-a',
          metric: 'Subscribers',
          bucket: new Date('2026-08-13T00:00:00.000Z'),
        },
      },
      create: {
        integrationId: 'telegram-a',
        metric: 'Subscribers',
        value: 123,
        bucket: new Date('2026-08-13T00:00:00.000Z'),
      },
      update: { value: 123 },
    });
  });

  test('keeps a provider day that cannot be parsed off the time axis', () => {
    const result = mergeAnalyticsSnapshots(
      [
        {
          label: 'Subscribers',
          percentageChange: 0,
          data: [
            { total: '120', date: '2026-08-13' },
            { total: '130', date: 'Invalid Date' },
          ],
        },
      ],
      [
        {
          metric: 'Subscribers',
          value: 100,
          bucket: new Date('2026-08-12T00:00:00.000Z'),
        },
      ],
      7,
      new Date('2026-08-13T14:00:00.000Z')
    );

    // A point with no usable date has no place on a time axis: passing it
    // through put a literal "Invalid Date" at the edge of the chart and folded
    // its total into the headline figure.
    expect(result[0].data).toEqual([
      { date: '2026-08-12', total: '100' },
      { date: '2026-08-13', total: '120' },
    ]);
    // And it must not become the series boundary either.
    expect(result[0].percentageChange).toBe(20);
  });

  test('growth from an empty audience scales with the gain', () => {
    const change = (first, last) =>
      mergeAnalyticsSnapshots(
        [],
        [
          {
            metric: 'Subscribers',
            value: first,
            bucket: new Date('2026-08-12T00:00:00.000Z'),
          },
          {
            metric: 'Subscribers',
            value: last,
            bucket: new Date('2026-08-13T00:00:00.000Z'),
          },
        ],
        7,
        new Date('2026-08-13T14:00:00.000Z')
      )[0].percentageChange;

    expect(change(0, 0)).toBe(0);
    expect(change(0, 5)).toBeGreaterThan(change(0, 1));
  });

  test('uses new versioned Temporal contracts', () => {
    const workflow = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/orchestrator/src/workflows/integration.analytics.snapshot.workflow.v1.ts'
      ),
      'utf8'
    );
    const activity = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/orchestrator/src/activities/analytics.activity.v1.ts'
      ),
      'utf8'
    );

    expect(workflow).toContain('integrationAnalyticsSnapshotWorkflowV1');
    expect(activity).toContain('captureIntegrationAnalyticsSnapshotsV1');
  });
});

class ScheduleAlreadyRunning extends Error {}

const { AnalyticsScheduleRegisterV1, analyticsSnapshotScheduleIdV1 } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/temporal/analytics.schedule.register.v1.ts',
    {
      '@nestjs/common': {
        Global: () => (target) => target,
        Injectable: () => (target) => target,
        Module: () => (target) => target,
      },
      '@temporalio/client': { ScheduleAlreadyRunning },
      'nestjs-temporal-core': { TemporalService: class {} },
    }
  );

describe('the daily analytics schedule', () => {
  const createTemporal = (create) => {
    const update = jest.fn().mockResolvedValue(undefined);
    const getHandle = jest.fn(() => ({ update }));
    return {
      update,
      getHandle,
      temporal: {
        client: {
          getRawClient: () => ({ schedule: { create, getHandle } }),
        },
      },
    };
  };

  beforeEach(() => {
    process.env.RUN_CRON = 'true';
  });
  afterEach(() => {
    delete process.env.RUN_CRON;
  });

  test('registers a daily UTC schedule that never overlaps itself', async () => {
    const create = jest.fn().mockResolvedValue({});
    const { temporal } = createTemporal(create);

    await new AnalyticsScheduleRegisterV1(temporal).onModuleInit();

    const [[options]] = create.mock.calls;
    expect(options).toMatchObject({
      scheduleId: analyticsSnapshotScheduleIdV1,
      spec: { calendars: [{ hour: 0, minute: 15 }], timezone: 'UTC' },
      policies: { overlap: 'SKIP' },
      action: {
        type: 'startWorkflow',
        workflowType: 'integrationAnalyticsSnapshotWorkflowV1',
      },
    });
  });

  test('a changed cadence reaches a deployment that already has the schedule', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new ScheduleAlreadyRunning('already there'));
    const { temporal, getHandle, update } = createTemporal(create);

    await new AnalyticsScheduleRegisterV1(temporal).onModuleInit();

    expect(getHandle).toHaveBeenCalledWith(analyticsSnapshotScheduleIdV1);
    const [[updateFn]] = update.mock.calls;
    expect(updateFn({ state: { paused: false } })).toMatchObject({
      state: { paused: false },
      spec: { calendars: [{ hour: 0, minute: 15 }], timezone: 'UTC' },
      policies: { overlap: 'SKIP' },
    });
  });

  test('an unexpected registration failure is not swallowed', async () => {
    const create = jest.fn().mockRejectedValue(new Error('temporal is down'));
    const { temporal } = createTemporal(create);

    await expect(
      new AnalyticsScheduleRegisterV1(temporal).onModuleInit()
    ).rejects.toThrow('temporal is down');
  });
});
