const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
    '@contentfactory/nestjs-libraries/dtos/growth/public-growth-event': {},
  }
);
const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.repository':
      repositoryModule,
    '@contentfactory/nestjs-libraries/dtos/growth/public-growth-event': {
      parsePublicGrowthEvent: () => null,
      TRUSTED_GROWTH_EVENT_NAMES: [
        'registration_completed',
        'workspace_activated',
      ],
    },
  }
);

const TOTALS = {
  landing_view: 20,
  demo_started: 10,
  demo_completed: 4,
  signup_started: 5,
  registration_completed: 2,
  workspace_activated: 1,
};

function createReport(rows) {
  const groupByCalls = [];
  const Repository = repositoryModule.PublicGrowthRepository;
  const Service = serviceModule.PublicGrowthService;
  const repository = new Repository(
    {
      model: {
        publicGrowthDaily: {
          groupBy: async (query) => {
            groupByCalls.push(query);
            return rows;
          },
        },
      },
    },
    { model: {} }
  );
  return {
    service: new Service(repository),
    groupByCalls,
  };
}

function adminController(reportService) {
  const adminModule = loadTypeScriptModule(
    'apps/backend/src/api/routes/admin.controller.ts',
    {
      '@contentfactory/nestjs-libraries/user/user.from.request': {
        GetUserFromRequest: () => () => undefined,
      },
      '@contentfactory/nestjs-libraries/database/prisma/errors/errors.service':
        {
          ErrorsService: class ErrorsService {},
        },
      '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.service':
        {
          AdminStatsService: class AdminStatsService {},
        },
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
        UsersService: class UsersService {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
        {
          ProductEventsService: class ProductEventsService {},
        },
      '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service':
        serviceModule,
      '@contentfactory/helpers/auth/registration.approval': {
        registrationRequiresApproval: () => false,
      },
    },
    {
      // Compiled, not stubbed: the controller and the module that binds the
      // provider have to agree on the same token value, and a stub here would
      // let them drift apart without a red test.
      sources: {
        '@contentfactory/backend/api/routes/public-growth.token':
          'apps/backend/src/api/routes/public-growth.token.ts',
      },
    }
  );

  return {
    Controller: adminModule.AdminController,
    instance: new adminModule.AdminController({}, {}, {}, {}, reportService),
  };
}

describe('privacy-safe public growth aggregate report', () => {
  test('sums all dimensions by the exact six names and returns only fixed totals and ratios', async () => {
    const rows = Object.entries(TOTALS).map(([name, count]) => ({
      name,
      _sum: { count },
    }));
    const { service, groupByCalls } = createReport(rows);

    const report = await service.getAdminReport('2026-08-01', '2026-08-03');

    expect(groupByCalls).toEqual([
      {
        by: ['name'],
        where: {
          day: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lte: new Date('2026-08-03T00:00:00.000Z'),
          },
          name: { in: Object.keys(TOTALS) },
        },
        _sum: { count: true },
      },
    ]);
    expect(report).toEqual({
      totals: TOTALS,
      ratios: {
        demo_started_per_landing_view: 0.5,
        demo_completed_per_demo_started: 0.4,
        signup_started_per_landing_view: 0.25,
        registration_completed_per_signup_started: 0.4,
        workspace_activated_per_registration_completed: 0.5,
      },
    });
    expect(Object.keys(report.totals)).toHaveLength(6);
    expect(Object.keys(report.ratios)).toHaveLength(5);
    expect(JSON.stringify(report)).not.toMatch(
      /receipt|dedup|organization|user.?id|visitor|ip|referrer|user.?agent|locale|width|uiVersion|demoStep/i
    );
  });

  test('uses zero for every ratio whose denominator is zero', async () => {
    const { service } = createReport([
      { name: 'demo_completed', _sum: { count: 9 } },
      { name: 'registration_completed', _sum: { count: 7 } },
      { name: 'workspace_activated', _sum: { count: 2 } },
    ]);

    await expect(
      service.getAdminReport('2026-08-01', '2026-08-01')
    ).resolves.toEqual({
      totals: {
        landing_view: 0,
        demo_started: 0,
        demo_completed: 9,
        signup_started: 0,
        registration_completed: 7,
        workspace_activated: 2,
      },
      ratios: {
        demo_started_per_landing_view: 0,
        demo_completed_per_demo_started: 0,
        signup_started_per_landing_view: 0,
        registration_completed_per_signup_started: 0,
        workspace_activated_per_registration_completed: 2 / 7,
      },
    });
  });

  test.each([
    [undefined, '2026-08-03'],
    ['2026-08-01', undefined],
    ['2026-8-1', '2026-08-03'],
    ['2026-02-30', '2026-03-01'],
    ['not-a-date', '2026-08-03'],
    ['2026-08-03', '2026-08-01'],
    ['2025-08-01', '2026-08-03'],
  ])('rejects an invalid or unbounded range %p to %p', async (from, to) => {
    const { service, groupByCalls } = createReport([]);

    await expect(service.getAdminReport(from, to)).rejects.toMatchObject({
      status: 400,
    });
    expect(groupByCalls).toEqual([]);
  });

  test('refuses a non-super-admin before reading aggregates', async () => {
    let calls = 0;
    const { instance: controller } = adminController({
      getAdminReport: async () => {
        calls += 1;
      },
    });

    await expect(
      controller.getPublicGrowthReport(
        { id: 'ordinary-user', isSuperAdmin: false },
        '2026-08-01',
        '2026-08-03'
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
  });

  test('allows a super-admin to read the fixed report', async () => {
    const fixed = { totals: TOTALS, ratios: {} };
    const calls = [];
    const { Controller, instance: controller } = adminController({
      getAdminReport: async (...args) => {
        calls.push(args);
        return fixed;
      },
    });

    await expect(
      controller.getPublicGrowthReport(
        { id: 'super-admin', isSuperAdmin: true },
        '2026-08-01',
        '2026-08-03'
      )
    ).resolves.toBe(fixed);
    expect(calls).toEqual([['2026-08-01', '2026-08-03']]);
    expect(Reflect.getMetadata('path', Controller)).toBe('/admin');
    expect(
      Reflect.getMetadata('path', Controller.prototype.getPublicGrowthReport)
    ).toBe('/public-growth-report');
  });

  test('adds no public read route and never queries trusted receipts', () => {
    const publicController = fs.readFileSync(
      path.join(
        root,
        'apps/backend/src/api/routes/public-growth-events.controller.ts'
      ),
      'utf8'
    );
    const repository = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/public-growth/public-growth.repository.ts'
      ),
      'utf8'
    );

    expect(publicController).not.toMatch(/@Get\s*\(/);
    expect(repository).not.toMatch(
      /publicGrowthTrustedEvent\.(find|group|count)/
    );
  });
});
