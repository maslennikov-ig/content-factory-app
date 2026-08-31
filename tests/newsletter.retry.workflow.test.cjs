require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

describe('versioned newsletter retry activity', () => {
  function loadActivity(newsletterRegister) {
    let activityModule;
    expect(() => {
      activityModule = loadTypeScriptModule(
        'apps/orchestrator/src/activities/newsletter.activity.v1.ts',
        {
          '@nestjs/common': {
            Injectable: () => (target) => target,
          },
          'nestjs-temporal-core': {
            Activity: () => (target) => target,
            ActivityMethod: () => () => undefined,
          },
          '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
            UsersService: class UsersService {},
          },
          '@contentfactory/nestjs-libraries/newsletter/newsletter.service': {
            NewsletterService: { register: newsletterRegister },
          },
        }
      );
    }).not.toThrow();
    return activityModule;
  }

  test('reloads stored consent and delivers without putting an address in workflow input', async () => {
    const register = jest.fn(async () => undefined);
    const activityModule = loadActivity(register);
    if (!activityModule) return;
    const consentedAt = new Date('2026-08-18T09:00:00.000Z');
    const leaseExpiresAt = new Date('2099-08-18T12:00:00.000Z');
    const activity = new activityModule.NewsletterActivityV1({
      getUserById: async () => ({
        id: 'user-1',
        email: 'reader@example.com',
        newsletterConsentAt: consentedAt,
        newsletterConsentSource: 'registration',
        newsletterDeliveryPendingAt: consentedAt,
        newsletterDeliveryLeaseId: 'lease-1',
        newsletterDeliveryLeaseExpiresAt: leaseExpiresAt,
      }),
      markNewsletterDelivered: jest.fn(async () => ({ count: 1 })),
      clearNewsletterDeliveryPending: jest.fn(async () => ({ count: 1 })),
    });

    await expect(
      activity.deliverNewsletterSubscriptionV1({
        userId: 'user-1',
        pendingAt: consentedAt.toISOString(),
        leaseId: 'lease-1',
      })
    ).resolves.toEqual({ delivered: true });
    expect(register).toHaveBeenCalledWith('reader@example.com', {
      source: 'registration',
      consentedAt,
    });
    expect(activity.users.markNewsletterDelivered).toHaveBeenCalledWith(
      'user-1',
      consentedAt,
      'lease-1'
    );
  });

  test.each([
    null,
    {
      id: 'user-1',
      email: 'reader@example.com',
      newsletterConsentAt: null,
      newsletterConsentSource: null,
      newsletterDeliveryPendingAt: new Date('2026-08-18T09:00:00.000Z'),
      newsletterDeliveryLeaseId: 'lease-1',
      newsletterDeliveryLeaseExpiresAt: new Date('2099-08-18T09:00:00.000Z'),
    },
  ])('never delivers without a current stored consent: %p', async (user) => {
    const register = jest.fn(async () => undefined);
    const activityModule = loadActivity(register);
    if (!activityModule) return;
    const users = {
      getUserById: async () => user,
      markNewsletterDelivered: jest.fn(async () => ({ count: 1 })),
      clearNewsletterDeliveryPending: jest.fn(async () => ({ count: 1 })),
    };
    const activity = new activityModule.NewsletterActivityV1(users);

    await expect(
      activity.deliverNewsletterSubscriptionV1({
        userId: 'user-1',
        pendingAt:
          user?.newsletterDeliveryPendingAt?.toISOString() ??
          '2026-08-18T09:00:00.000Z',
        leaseId: 'lease-1',
      })
    ).resolves.toEqual({ delivered: false });
    expect(register).not.toHaveBeenCalled();
    expect(users.clearNewsletterDeliveryPending).toHaveBeenCalledTimes(
      user ? 1 : 0
    );
    if (user) {
      expect(users.clearNewsletterDeliveryPending).toHaveBeenCalledWith(
        user.id,
        user.newsletterDeliveryPendingAt,
        'lease-1'
      );
    }
  });

  test('a completed or duplicate delivery does not call Listmonk again', async () => {
    const register = jest.fn(async () => undefined);
    const activityModule = loadActivity(register);
    const users = {
      getUserById: async () => ({
        id: 'user-1',
        email: 'reader@example.com',
        newsletterConsentAt: new Date('2026-08-18T09:00:00.000Z'),
        newsletterConsentSource: 'registration',
        newsletterDeliveryPendingAt: null,
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      }),
      markNewsletterDelivered: jest.fn(async () => ({ count: 0 })),
      clearNewsletterDeliveryPending: jest.fn(async () => ({ count: 0 })),
    };

    await expect(
      new activityModule.NewsletterActivityV1(users).deliverNewsletterSubscriptionV1({
        userId: 'user-1',
        pendingAt: '2026-08-18T09:00:00.000Z',
        leaseId: 'lease-1',
      })
    ).resolves.toEqual({ delivered: false });
    expect(register).not.toHaveBeenCalled();
  });

  test('a stale activity cannot deliver or clear a newer pending transition', async () => {
    const register = jest.fn(async () => undefined);
    const activityModule = loadActivity(register);
    const newerPendingAt = new Date('2026-08-18T10:00:00.000Z');
    const users = {
      getUserById: async () => ({
        id: 'user-1',
        email: 'reader@example.com',
        newsletterConsentAt: newerPendingAt,
        newsletterConsentSource: 'registration',
        newsletterDeliveryPendingAt: newerPendingAt,
        newsletterDeliveryLeaseId: 'lease-new',
        newsletterDeliveryLeaseExpiresAt: new Date('2099-08-18T10:00:00.000Z'),
      }),
      markNewsletterDelivered: jest.fn(async () => ({ count: 0 })),
      clearNewsletterDeliveryPending: jest.fn(async () => ({ count: 0 })),
    };

    await expect(
      new activityModule.NewsletterActivityV1(users).deliverNewsletterSubscriptionV1({
        userId: 'user-1',
        pendingAt: '2026-08-18T09:00:00.000Z',
        leaseId: 'lease-old',
      })
    ).resolves.toEqual({ delivered: false });
    expect(register).not.toHaveBeenCalled();
    expect(users.clearNewsletterDeliveryPending).not.toHaveBeenCalled();
    expect(users.markNewsletterDelivered).not.toHaveBeenCalled();
  });

  test('a provider failure keeps the lease for the bounded Temporal retry', async () => {
    const register = jest.fn(async () => {
      throw new Error('Listmonk unavailable');
    });
    const activityModule = loadActivity(register);
    const pendingAt = new Date('2026-08-18T09:00:00.000Z');
    const user = {
      id: 'user-1',
      email: 'reader@example.com',
      newsletterConsentAt: pendingAt,
      newsletterConsentSource: 'registration',
      newsletterDeliveryPendingAt: pendingAt,
      newsletterDeliveryLeaseId: 'lease-1',
      newsletterDeliveryLeaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    const users = {
      getUserById: async () => user,
      markNewsletterDelivered: jest.fn(async () => ({ count: 1 })),
      clearNewsletterDeliveryPending: jest.fn(async () => ({ count: 1 })),
    };

    await expect(
      new activityModule.NewsletterActivityV1(users).deliverNewsletterSubscriptionV1({
        userId: user.id,
        pendingAt: pendingAt.toISOString(),
        leaseId: 'lease-1',
      })
    ).rejects.toThrow('Listmonk unavailable');
    expect(users.markNewsletterDelivered).not.toHaveBeenCalled();
    expect(users.clearNewsletterDeliveryPending).not.toHaveBeenCalled();
    expect(user.newsletterDeliveryLeaseId).toBe('lease-1');
  });
});

function loadNewsletterActivity(newsletterRegister) {
  return loadTypeScriptModule(
    'apps/orchestrator/src/activities/newsletter.activity.v1.ts',
    {
      '@nestjs/common': { Injectable: () => (target) => target },
      'nestjs-temporal-core': {
        Activity: () => (target) => target,
        ActivityMethod: () => () => undefined,
      },
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
        UsersService: class UsersService {},
      },
      '@contentfactory/nestjs-libraries/newsletter/newsletter.service': {
        NewsletterService: { register: newsletterRegister },
      },
    }
  ).NewsletterActivityV1;
}

describe('durable newsletter reconciliation', () => {
  function loadReconciler() {
    return loadTypeScriptModule(
      'apps/backend/src/services/newsletter/newsletter-delivery-retry.service.v1.ts',
      {
        '@nestjs/common': {
          Injectable: () => (target) => target,
          Logger: class Logger {
            warn() {}
            error() {}
          },
        },
        '@nestjs/schedule': { Interval: () => () => undefined },
        'nestjs-temporal-core': { TemporalService: class TemporalService {} },
        '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
          UsersService: class UsersService {},
        },
      }
    ).NewsletterDeliveryRetryServiceV1;
  }

  test('a persisted pending consent is scheduled and delivered once after recovery', async () => {
    const consentedAt = new Date('2026-08-18T09:00:00.000Z');
    const leaseId = `newsletter-delivery-v1:user-1:${consentedAt.getTime()}`;
    const record = {
      id: 'user-1',
      email: 'reader@example.com',
      newsletterConsentAt: consentedAt,
      newsletterConsentSource: 'registration',
      newsletterDeliveryPendingAt: consentedAt,
      newsletterDeliveryLeaseId: null,
      newsletterDeliveryLeaseExpiresAt: null,
    };
    let temporalAvailable = false;
    const starts = [];
    const register = jest.fn(async () => undefined);
    const users = {
      listPendingNewsletterDeliveries: jest.fn(async (limit) => {
        expect(limit).toBe(100);
        const now = new Date();
        return record.newsletterDeliveryPendingAt &&
          (!record.newsletterDeliveryLeaseExpiresAt ||
            record.newsletterDeliveryLeaseExpiresAt < now)
          ? [
              {
                id: record.id,
                newsletterDeliveryPendingAt:
                  record.newsletterDeliveryPendingAt,
              },
            ]
          : [];
      }),
      claimNewsletterDelivery: async (
        _userId,
        pendingAt,
        leaseId,
        leaseExpiresAt,
        now
      ) => {
        if (
          record.newsletterDeliveryPendingAt !== pendingAt ||
          (record.newsletterDeliveryLeaseExpiresAt &&
            record.newsletterDeliveryLeaseExpiresAt >= now)
        ) {
          return { count: 0 };
        }
        record.newsletterDeliveryLeaseId = leaseId;
        record.newsletterDeliveryLeaseExpiresAt = leaseExpiresAt;
        return { count: 1 };
      },
      releaseNewsletterDeliveryLease: async (_userId, pendingAt, leaseId) => {
        if (
          record.newsletterDeliveryPendingAt === pendingAt &&
          record.newsletterDeliveryLeaseId === leaseId
        ) {
          record.newsletterDeliveryLeaseId = null;
          record.newsletterDeliveryLeaseExpiresAt = null;
          return { count: 1 };
        }
        return { count: 0 };
      },
      getUserById: async () => record,
      markNewsletterDelivered: async (_userId, pendingAt, leaseId) => {
        if (
          record.newsletterDeliveryPendingAt === pendingAt &&
          record.newsletterDeliveryLeaseId === leaseId
        ) {
          record.newsletterDeliveryPendingAt = null;
          record.newsletterDeliveryLeaseId = null;
          record.newsletterDeliveryLeaseExpiresAt = null;
          return { count: 1 };
        }
        return { count: 0 };
      },
      clearNewsletterDeliveryPending: async (_userId, pendingAt, leaseId) => {
        if (
          record.newsletterDeliveryPendingAt === pendingAt &&
          record.newsletterDeliveryLeaseId === leaseId
        ) {
          record.newsletterDeliveryPendingAt = null;
          record.newsletterDeliveryLeaseId = null;
          record.newsletterDeliveryLeaseExpiresAt = null;
          return { count: 1 };
        }
        return { count: 0 };
      },
    };
    const Activity = loadNewsletterActivity(register);
    const activity = new Activity(users);
    const temporal = {
      client: {
        getRawClient: () => ({
          workflow: {
            start: async (...args) => {
              if (!temporalAvailable) throw new Error('Temporal unavailable');
              starts.push(args);
              await activity.deliverNewsletterSubscriptionV1(args[1].args[0]);
              return { workflowId: args[1].workflowId };
            },
          },
        }),
      },
    };
    const service = new (loadReconciler())(users, temporal);

    await expect(service.reconcilePending()).resolves.toEqual({
      pending: 1,
      scheduled: 0,
    });
    expect(record.newsletterDeliveryLeaseId).toBeNull();
    temporalAvailable = true;
    await expect(service.reconcilePending()).resolves.toEqual({
      pending: 1,
      scheduled: 1,
    });
    expect(starts).toEqual([
      [
        'newsletterSubscriptionRetryWorkflowV1',
        {
          args: [
            {
              userId: 'user-1',
              pendingAt: consentedAt.toISOString(),
              leaseId,
            },
          ],
          taskQueue: 'main',
          workflowId: `newsletter-subscription-v1:user-1:${consentedAt.getTime()}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
        },
      ],
    ]);
    expect(JSON.stringify(starts)).not.toContain('@');
    expect(register).toHaveBeenCalledTimes(1);
    await expect(service.reconcilePending()).resolves.toEqual({
      pending: 0,
      scheduled: 0,
    });
    await expect(
      activity.deliverNewsletterSubscriptionV1({
        userId: 'user-1',
        pendingAt: consentedAt.toISOString(),
        leaseId,
      })
    ).resolves.toEqual({ delivered: false });
    expect(register).toHaveBeenCalledTimes(1);

    const newerPendingAt = new Date('2026-08-19T09:00:00.000Z');
    record.newsletterConsentAt = newerPendingAt;
    record.newsletterDeliveryPendingAt = newerPendingAt;
    record.newsletterDeliveryLeaseId = null;
    record.newsletterDeliveryLeaseExpiresAt = null;
    await expect(service.reconcilePending()).resolves.toEqual({
      pending: 1,
      scheduled: 1,
    });
    expect(starts[1][1]).toMatchObject({
      args: [
        {
          userId: 'user-1',
          pendingAt: newerPendingAt.toISOString(),
          leaseId: `newsletter-delivery-v1:user-1:${newerPendingAt.getTime()}`,
        },
      ],
      workflowId: `newsletter-subscription-v1:user-1:${newerPendingAt.getTime()}`,
    });
    expect(starts[1][1].workflowId).not.toBe(starts[0][1].workflowId);
    expect(register).toHaveBeenCalledTimes(2);
  });

  test('only the bounded pending batch is handed to Temporal', async () => {
    const starts = [];
    const service = new (loadReconciler())(
      {
        listPendingNewsletterDeliveries: async () =>
          Array.from({ length: 100 }, (_, index) => ({
            id: `user-${index}`,
            newsletterDeliveryPendingAt: new Date(
              `2026-08-18T09:${String(index % 60).padStart(2, '0')}:00.000Z`
            ),
          })),
        claimNewsletterDelivery: async () => ({ count: 1 }),
        releaseNewsletterDeliveryLease: async () => ({ count: 1 }),
      },
      {
        client: {
          getRawClient: () => ({
            workflow: {
              start: async (...args) => starts.push(args),
            },
          }),
        },
      }
    );

    await service.reconcilePending();
    expect(starts).toHaveLength(100);
  });

  test('concurrent scheduling claims one transition only once', async () => {
    const pendingAt = new Date('2026-08-18T09:00:00.000Z');
    const record = {
      newsletterDeliveryLeaseId: null,
      newsletterDeliveryLeaseExpiresAt: null,
    };
    const starts = [];
    const users = {
      claimNewsletterDelivery: async (
        _userId,
        _pendingAt,
        leaseId,
        leaseExpiresAt
      ) => {
        if (record.newsletterDeliveryLeaseExpiresAt) return { count: 0 };
        record.newsletterDeliveryLeaseId = leaseId;
        record.newsletterDeliveryLeaseExpiresAt = leaseExpiresAt;
        return { count: 1 };
      },
      releaseNewsletterDeliveryLease: async () => ({ count: 1 }),
    };
    const service = new (loadReconciler())(users, {
      client: {
        getRawClient: () => ({
          workflow: { start: async (...args) => starts.push(args) },
        }),
      },
    });

    const results = await Promise.all([
      service.schedule('user-1', pendingAt),
      service.schedule('user-1', pendingAt),
    ]);
    expect(results.filter((result) => result.scheduled)).toHaveLength(1);
    expect(starts).toHaveLength(1);
  });

  test('active leases on the first hundred do not starve a newer pending row', async () => {
    const future = new Date('2099-01-01T00:00:00.000Z');
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `user-${index}`,
      newsletterDeliveryPendingAt: new Date(
        `2026-08-18T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`
      ),
      newsletterDeliveryLeaseId: index < 100 ? `failed-${index}` : null,
      newsletterDeliveryLeaseExpiresAt: index < 100 ? future : null,
    }));
    const starts = [];
    const users = {
      listPendingNewsletterDeliveries: async (limit) =>
        records
          .filter(
            (record) =>
              !record.newsletterDeliveryLeaseExpiresAt ||
              record.newsletterDeliveryLeaseExpiresAt < new Date()
          )
          .slice(0, limit),
      claimNewsletterDelivery: async (
        userId,
        pendingAt,
        leaseId,
        leaseExpiresAt
      ) => {
        const record = records.find(
          (candidate) =>
            candidate.id === userId &&
            candidate.newsletterDeliveryPendingAt === pendingAt
        );
        if (!record || record.newsletterDeliveryLeaseExpiresAt) {
          return { count: 0 };
        }
        record.newsletterDeliveryLeaseId = leaseId;
        record.newsletterDeliveryLeaseExpiresAt = leaseExpiresAt;
        return { count: 1 };
      },
      releaseNewsletterDeliveryLease: async () => ({ count: 1 }),
    };
    const service = new (loadReconciler())(users, {
      client: {
        getRawClient: () => ({
          workflow: {
            start: async (...args) => starts.push(args),
          },
        }),
      },
    });

    await expect(service.reconcilePending()).resolves.toEqual({
      pending: 1,
      scheduled: 1,
    });
    expect(starts[0][1].args[0].userId).toBe('user-100');
  });

  test('an expired lease is reclaimed with the stable transition token', async () => {
    const pendingAt = new Date('2026-08-18T09:00:00.000Z');
    const record = {
      id: 'user-stale',
      newsletterDeliveryPendingAt: pendingAt,
      newsletterDeliveryLeaseId: 'dead-worker',
      newsletterDeliveryLeaseExpiresAt: new Date('2000-01-01T00:00:00.000Z'),
    };
    const starts = [];
    const users = {
      listPendingNewsletterDeliveries: async () => [record],
      claimNewsletterDelivery: async (
        _userId,
        _pendingAt,
        leaseId,
        leaseExpiresAt,
        now
      ) => {
        expect(
          record.newsletterDeliveryLeaseExpiresAt.getTime()
        ).toBeLessThan(now.getTime());
        record.newsletterDeliveryLeaseId = leaseId;
        record.newsletterDeliveryLeaseExpiresAt = leaseExpiresAt;
        return { count: 1 };
      },
      releaseNewsletterDeliveryLease: async () => ({ count: 1 }),
    };
    const service = new (loadReconciler())(users, {
      client: {
        getRawClient: () => ({
          workflow: { start: async (...args) => starts.push(args) },
        }),
      },
    });

    await service.reconcilePending();
    expect(starts[0][1].args[0]).toMatchObject({
      userId: 'user-stale',
      leaseId: `newsletter-delivery-v1:user-stale:${pendingAt.getTime()}`,
    });
    expect(record.newsletterDeliveryLeaseId).toBe(
      `newsletter-delivery-v1:user-stale:${pendingAt.getTime()}`
    );
  });
});

describe('newsletter pending-delivery persistence contract', () => {
  function loadUsersRepository() {
    return loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/users/users.repository.ts',
      {
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
          PrismaRepository: class PrismaRepository {},
          PrismaTransaction: class PrismaTransaction {},
        },
        '@nestjs/common': {
          Injectable: () => (target) => target,
          HttpException: class HttpException extends Error {},
        },
        '@prisma/client': {
          Provider: { LOCAL: 'LOCAL' },
          Role: { SUPERADMIN: 'SUPERADMIN' },
        },
        '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
        '@contentfactory/nestjs-libraries/dtos/users/user.details.dto': {},
        '@contentfactory/nestjs-libraries/dtos/users/email-notifications.dto': {},
        '@contentfactory/nestjs-libraries/services/make.is': {
          makeId: () => 'id',
        },
        '@contentfactory/nestjs-libraries/database/prisma/users/user-identity': {
          legacyIdentityIdentifier: (value) => value,
          normalizeIdentityIdentifier: (_provider, value) => value,
        },
      }
    ).UsersRepository;
  }

  test('scans a bounded indexed pending set and clears it after delivery', async () => {
    const pendingAt = new Date('2026-08-18T09:00:00.000Z');
    const now = new Date('2026-08-18T10:00:00.000Z');
    const leaseExpiresAt = new Date('2026-08-18T13:00:00.000Z');
    const findMany = jest.fn(async () => [
      { id: 'user-1', newsletterDeliveryPendingAt: pendingAt },
    ]);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const UsersRepository = loadUsersRepository();
    const repository = new UsersRepository(
      { model: { user: { findMany, updateMany } } },
      { model: {} }
    );

    await expect(
      repository.listPendingNewsletterDeliveries(100, now)
    ).resolves.toEqual([
      { id: 'user-1', newsletterDeliveryPendingAt: pendingAt },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        newsletterConsentAt: { not: null },
        newsletterConsentSource: { not: null },
        newsletterDeliveryPendingAt: { not: null },
        OR: [
          { newsletterDeliveryLeaseExpiresAt: null },
          { newsletterDeliveryLeaseExpiresAt: { lt: now } },
        ],
      },
      select: {
        id: true,
        newsletterDeliveryPendingAt: true,
      },
      orderBy: [
        { newsletterDeliveryPendingAt: 'asc' },
        { id: 'asc' },
      ],
      take: 100,
    });

    await repository.claimNewsletterDelivery(
      'user-1',
      pendingAt,
      'lease-1',
      leaseExpiresAt,
      now
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        newsletterConsentAt: { not: null },
        newsletterDeliveryPendingAt: pendingAt,
        OR: [
          { newsletterDeliveryLeaseExpiresAt: null },
          { newsletterDeliveryLeaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        newsletterDeliveryLeaseId: 'lease-1',
        newsletterDeliveryLeaseExpiresAt: leaseExpiresAt,
      },
    });

    await repository.markNewsletterDelivered('user-1', pendingAt, 'lease-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        newsletterConsentAt: { not: null },
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: 'lease-1',
      },
      data: {
        newsletterDeliveryPendingAt: null,
        newsletterDeliveredAt: expect.any(Date),
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });

    await repository.clearNewsletterDeliveryPending(
      'user-1',
      pendingAt,
      'lease-1'
    );
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'user-1',
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: 'lease-1',
      },
      data: {
        newsletterDeliveryPendingAt: null,
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });

    await repository.releaseNewsletterDeliveryLease(
      'user-1',
      pendingAt,
      'lease-1'
    );
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'user-1',
        newsletterDeliveryPendingAt: pendingAt,
        newsletterDeliveryLeaseId: 'lease-1',
      },
      data: {
        newsletterDeliveryLeaseId: null,
        newsletterDeliveryLeaseExpiresAt: null,
      },
    });
  });
});
describe('newsletterSubscriptionRetryWorkflowV1 contract', () => {
  test('uses the new activity with bounded retries', async () => {
    let proxyOptions;
    const activityCalls = [];
    let workflowModule;
    expect(() => {
      workflowModule = loadTypeScriptModule(
        'apps/orchestrator/src/workflows/newsletter.subscription.retry.workflow.v1.ts',
        {
          '@temporalio/workflow': {
            proxyActivities: (options) => {
              proxyOptions = options;
              return {
                deliverNewsletterSubscriptionV1: async (input) => {
                  activityCalls.push(input);
                  return { delivered: true };
                },
              };
            },
          },
          '@contentfactory/orchestrator/activities/newsletter.activity.v1': {
            NewsletterActivityV1: class NewsletterActivityV1 {},
          },
        }
      );
    }).not.toThrow();
    if (!workflowModule) return;

    await expect(
      workflowModule.newsletterSubscriptionRetryWorkflowV1({
        userId: 'user-1',
        pendingAt: '2026-08-18T09:00:00.000Z',
        leaseId: 'lease-1',
      })
    ).resolves.toEqual({ delivered: true });
    expect(activityCalls).toEqual([
      {
        userId: 'user-1',
        pendingAt: '2026-08-18T09:00:00.000Z',
        leaseId: 'lease-1',
      },
    ]);
    expect(proxyOptions).toEqual({
      startToCloseTimeout: '30 seconds',
      retry: {
        maximumAttempts: 8,
        initialInterval: '1 minute',
        backoffCoefficient: 2,
        maximumInterval: '1 hour',
      },
    });
  });
});
