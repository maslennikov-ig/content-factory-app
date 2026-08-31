require('reflect-metadata');

const { Logger } = require('@nestjs/common');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

let stripeClient;
let requestNumber = 0;
class StripeClient {
  constructor() {
    return stripeClient;
  }
}

const dtoModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/product-events/product-event.dto.ts'
);
const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
    '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto':
      dtoModule,
  }
);
const serviceModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/product-events/product-events.service.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.repository':
      repositoryModule,
    '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto':
      dtoModule,
  }
);

function loadStripeService() {
  return loadTypeScriptModule(
    'libraries/nestjs-libraries/src/services/stripe.service.ts',
    {
      stripe: StripeClient,
      '@prisma/client': {},
      '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
        { SubscriptionService: class SubscriptionService {} },
      '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service':
        { OrganizationService: class OrganizationService {} },
      '@contentfactory/nestjs-libraries/database/prisma/users/users.service': {
        UsersService: class UsersService {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service':
        serviceModule,
      '@contentfactory/nestjs-libraries/services/make.is': {
        makeId: () => `request-${++requestNumber}`,
      },
      '@contentfactory/nestjs-libraries/dtos/billing/billing.subscribe.dto': {
        BillingSubscribeDto: class BillingSubscribeDto {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
        pricing: {},
      },
      '@contentfactory/helpers/auth/auth.service': { AuthService: {} },
    }
  ).StripeService;
}

function productEventsStore({ eventFailure } = {}) {
  const rows = [];
  let failure = eventFailure;
  const repository = new repositoryModule.ProductEventsRepository({
    model: {
      productEvent: {
        create: async ({ data }) => {
          if (failure) throw failure;
          if (
            rows.some(
              (row) =>
                row.organizationId === data.organizationId &&
                row.deduplicationKey === data.deduplicationKey
            )
          ) {
            throw Object.assign(new Error('duplicate event'), { code: 'P2002' });
          }
          rows.push(data);
          return data;
        },
      },
    },
  });
  return {
    rows,
    service: new serviceModule.ProductEventsService(repository),
    setFailure: (nextFailure) => {
      failure = nextFailure;
    },
  };
}

function createService({
  updateFailure,
  eventFailure,
  organization = { id: 'org-1' },
  actor = { userId: 'owner-1' },
  organizationFailure,
  actorFailure,
} = {}) {
  requestNumber = 0;
  const subscription = {
    id: 'sub_123',
    status: 'active',
    cancel_at_period_end: false,
    latest_invoice: { status: 'paid' },
    metadata: {},
  };
  stripeClient = {
    subscriptions: {
      list: async () => ({ data: [subscription] }),
      update: async (_id, body) => {
        if (updateFailure) throw updateFailure;
        subscription.cancel_at_period_end = body.cancel_at_period_end;
        subscription.metadata = {
          ...subscription.metadata,
          ...body.metadata,
        };
        return { cancel_at: 1_800_000_000 };
      },
      cancel: async () => {
        subscription.status = 'canceled';
        return subscription;
      },
    },
  };
  const events = productEventsStore({ eventFailure });
  const StripeService = loadStripeService();
  const service = new StripeService(
    {
      deleteSubscription: async () => undefined,
    },
    {
      getOrgById: async () => ({ id: 'org-1', paymentId: 'cus_123' }),
      getOrgByCustomerId: async () => {
        if (organizationFailure) throw organizationFailure;
        return organization;
      },
      getProductEventActor: async () => {
        if (actorFailure) throw actorFailure;
        return actor;
      },
    },
    {},
    events.service
  );
  return { service, events, subscription };
}

describe('server-owned cancel_subscription event', () => {
  test('a successful cancellation records one private idempotent event', async () => {
    const { service, events } = createService();

    await service.setToCancel('org-1', 'user-1');

    expect(events.rows).toEqual([
      {
        name: 'cancel_subscription',
        properties: {},
        deduplicationKey: 'cancel_subscription:sub_123:request-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
  });

  test('a failed Stripe transition records no cancellation event', async () => {
    const { service, events } = createService({
      updateFailure: new Error('Stripe unavailable'),
    });

    await expect(service.setToCancel('org-1', 'user-1')).rejects.toThrow(
      'Stripe unavailable'
    );
    expect(events.rows).toEqual([]);
  });

  test('an analytics outage cannot reverse or fail a completed cancellation', async () => {
    const { service, events, subscription } = createService({
      eventFailure: new Error('ProductEvent table unavailable'),
    });

    const logged = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    try {
      await expect(
        service.setToCancel('org-1', 'user-1')
      ).resolves.toMatchObject({ id: 'request-1' });
      expect(subscription.cancel_at_period_end).toBe(true);

      events.setFailure(null);
      await service.recordCancellationFromWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            cancel_at_period_end: true,
            metadata: { cancellationTransitionId: 'request-1' },
          },
        },
      });
      await service.recordCancellationFromWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            cancel_at_period_end: true,
            metadata: { cancellationTransitionId: 'request-1' },
          },
        },
      });

      expect(events.rows).toEqual([
        {
          name: 'cancel_subscription',
          properties: {},
          deduplicationKey: 'cancel_subscription:sub_123:request-1',
          organizationId: 'org-1',
          userId: 'owner-1',
        },
      ]);
      expect(JSON.stringify(events.rows)).not.toContain('@');
    } finally {
      logged.mockRestore();
    }
  });

  test('a webhook storage outage propagates so Stripe retries it', async () => {
    const { service } = createService({
      eventFailure: new Error('ProductEvent table unavailable'),
    });

    await expect(
      service.recordCancellationFromWebhook({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            metadata: { cancellationTransitionId: 'request-1' },
          },
        },
      })
    ).rejects.toThrow('ProductEvent table unavailable');
  });

  test.each([
    ['no organization', { organization: null }, {}],
    ['no event actor', { actor: null }, {}],
    // A redelivery of this same event will never grow a customer field, so
    // throwing here would only spend Stripe's three-day retry budget and risk
    // the endpoint being disabled for invoice and subscription events too.
    ['no Stripe customer id', {}, { customer: null }],
  ])(
    'treats %s as terminal after the billing mutation',
    async (_name, setup, object) => {
      const { service, events } = createService(setup);
      const logged = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      try {
        await expect(
          service.recordCancellationFromWebhook({
            type: 'customer.subscription.deleted',
            data: {
              object: {
                id: 'sub_123',
                customer: 'cus_123',
                metadata: { cancellationTransitionId: 'request-1' },
                ...object,
              },
            },
          })
        ).resolves.toEqual({ recorded: false });
        expect(events.rows).toEqual([]);
        expect(logged).toHaveBeenCalled();
      } finally {
        logged.mockRestore();
      }
    }
  );

  test.each([
    [
      'organization lookup',
      { organizationFailure: new Error('Organization table unavailable') },
      'Organization table unavailable',
    ],
    [
      'event actor lookup',
      { actorFailure: new Error('Membership table unavailable') },
      'Membership table unavailable',
    ],
  ])('propagates %s storage failure so Stripe retries', async (_name, setup, message) => {
    const { service } = createService(setup);

    await expect(
      service.recordCancellationFromWebhook({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            metadata: { cancellationTransitionId: 'request-1' },
          },
        },
      })
    ).rejects.toThrow(message);
  });

  test('an ordinary subscription update does not create a cancellation event', async () => {
    const { service, events } = createService();

    await service.recordCancellationFromWebhook({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          cancel_at_period_end: false,
        },
      },
    });

    expect(events.rows).toEqual([]);
  });

  test('cancel, uncancel, then cancel records two distinct transitions', async () => {
    const { service, events, subscription } = createService();

    await service.setToCancel('org-1', 'user-1');
    await service.setToCancel('org-1', 'user-1');
    await service.setToCancel('org-1', 'user-1');

    expect(subscription.cancel_at_period_end).toBe(true);
    expect(events.rows.map((row) => row.deduplicationKey)).toEqual([
      'cancel_subscription:sub_123:request-1',
      'cancel_subscription:sub_123:request-3',
    ]);

    await service.recordCancellationFromWebhook({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          customer: 'cus_123',
          metadata: { cancellationTransitionId: 'request-3' },
        },
      },
    });
    expect(events.rows).toHaveLength(2);
  });
});

describe('Stripe webhook cancellation recovery seam', () => {
  function loadController() {
    return loadTypeScriptModule('apps/backend/src/api/routes/stripe.controller.ts', {
      '@nestjs/common': {
        Controller: () => (target) => target,
        Post: () => () => undefined,
        Req: () => () => undefined,
        HttpException: class HttpException extends Error {},
      },
      '@nestjs/swagger': { ApiTags: () => (target) => target },
      '@contentfactory/nestjs-libraries/services/stripe.service': {
        StripeService: class StripeService {},
      },
    }).StripeController;
  }

  test.each([
    ['customer.subscription.updated', 'updateSubscription'],
    ['customer.subscription.deleted', 'deleteSubscription'],
  ])('awaits %s persistence and cancellation recovery', async (type, handler) => {
    const event = {
      type,
      data: { object: { metadata: { service: 'content-factory' } } },
    };
    const stripeService = {
      validateRequest: () => event,
      [handler]: jest.fn(async () => ({ ok: true })),
      recordCancellationFromWebhook: jest.fn(async () => ({ recorded: true })),
    };
    const controller = new (loadController())(stripeService);

    await expect(
      controller.stripe({ rawBody: Buffer.from('event'), headers: {} })
    ).resolves.toEqual({ ok: true });
    expect(stripeService[handler]).toHaveBeenCalledWith(event);
    expect(stripeService.recordCancellationFromWebhook).toHaveBeenCalledWith(event);
  });

  test('propagates recovery failure so Stripe retries the webhook', async () => {
    const event = {
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { service: 'content-factory' } } },
    };
    const stripeService = {
      validateRequest: () => event,
      deleteSubscription: jest.fn(async () => undefined),
      recordCancellationFromWebhook: jest.fn(async () => {
        throw new Error('ProductEvent table unavailable');
      }),
    };
    const controller = new (loadController())(stripeService);

    await expect(
      controller.stripe({ rawBody: Buffer.from('event'), headers: {} })
    ).rejects.toThrow();
  });
});
