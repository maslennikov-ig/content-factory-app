'use strict';

const { loadMediaCredits } = require('./helpers/media-credits.module.cjs');

function fixture({ conflicts = 0, databaseError } = {}) {
  const { SubscriptionRepository, SubscriptionService } = loadMediaCredits();
  const rows = [];
  const model = {
    credits: {
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `credit-${rows.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        rows.push(row);
        return row;
      }),
      delete: jest.fn(async ({ where }) => {
        rows.splice(
          rows.findIndex((row) => row.id === where.id),
          1
        );
      }),
      groupBy: jest.fn(async ({ where }) => [
        {
          _sum: {
            credits: rows
              .filter(
                (row) =>
                  row.organizationId === where.organizationId &&
                  row.type === where.type &&
                  row.createdAt >= where.createdAt.gte
              )
              .reduce((sum, row) => sum + row.credits, 0),
          },
        },
      ]),
    },
  };
  const transaction = {
    model: {
      $transaction: jest.fn(async (run) => {
        if (conflicts > 0) {
          conflicts -= 1;
          throw Object.assign(new Error('synthetic conflict'), {
            code: 'P2034',
          });
        }
        if (databaseError) throw databaseError;
        return run(model);
      }),
    },
  };
  const repository = new SubscriptionRepository(
    { model },
    null,
    null,
    { model },
    null,
    transaction
  );
  const service = new SubscriptionService(repository, null, null);
  const org = {
    id: 'synthetic',
    subscription: {
      subscriptionTier: 'STANDARD',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  };
  const provider = jest.fn(async () => 'synthetic answer');
  return { rows, model, transaction, service, org, provider };
}

const stripeBefore = process.env.STRIPE_PUBLISHABLE_KEY;
beforeEach(() => {
  process.env.STRIPE_PUBLISHABLE_KEY = 'synthetic-enabled-billing';
});
afterEach(() => {
  if (stripeBefore === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
  else process.env.STRIPE_PUBLISHABLE_KEY = stripeBefore;
  jest.useRealTimers();
});

test.each(['ai_images', 'ai_videos'])(
  '%s retries admission conflicts before one provider invocation',
  async (type) => {
    const test = fixture({ conflicts: 2 });
    await expect(
      test.service.useCredit(test.org, type, test.provider)
    ).resolves.toBe('synthetic answer');
    expect(test.transaction.model.$transaction).toHaveBeenCalledTimes(3);
    expect(test.provider).toHaveBeenCalledTimes(1);
    expect(test.rows).toHaveLength(1);
  }
);

test.each(['ai_images', 'ai_videos'])(
  '%s persistent admission conflicts stop after three attempts without provider work',
  async (type) => {
    const test = fixture({ conflicts: Infinity });
    await expect(
      test.service.useCredit(test.org, type, test.provider)
    ).rejects.toMatchObject({ code: 'P2034' });
    expect(test.transaction.model.$transaction).toHaveBeenCalledTimes(3);
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.rows).toEqual([]);
  }
);

test.each(['P1001', 'P2028'])(
  '%s database admission failure is not retried or sent to a provider',
  async (code) => {
    const error = Object.assign(new Error('synthetic database failure'), {
      code,
    });
    const test = fixture({ databaseError: error });
    await expect(
      test.service.useCredit(test.org, 'ai_images', test.provider)
    ).rejects.toBe(error);
    expect(test.transaction.model.$transaction).toHaveBeenCalledTimes(1);
    expect(test.provider).not.toHaveBeenCalled();
    expect(test.rows).toEqual([]);
  }
);

test('a provider callback failure carrying P2034 never replays external work', async () => {
  const subject = fixture();
  const error = Object.assign(new Error('synthetic callback failure'), {
    code: 'P2034',
  });
  subject.provider.mockRejectedValue(error);
  await expect(
    subject.service.useCredit(subject.org, 'ai_images', subject.provider)
  ).rejects.toBe(error);
  expect(subject.provider).toHaveBeenCalledTimes(1);
  expect(subject.transaction.model.$transaction).toHaveBeenCalledTimes(1);
  expect(subject.model.credits.delete).toHaveBeenCalledTimes(1);
  expect(subject.rows).toEqual([]);
});

test.each([
  ['ai_images', true],
  ['ai_videos', true],
  ['ai_videos', false],
])('%s FREE quota is still unavailable (billing=%s)', async (type, billed) => {
  const test = fixture();
  delete test.org.subscription;
  if (!billed) delete process.env.STRIPE_PUBLISHABLE_KEY;
  await expect(
    test.service.useCredit(test.org, type, test.provider)
  ).rejects.toMatchObject({ status: 402 });
  expect(test.provider).not.toHaveBeenCalled();
  expect(test.rows).toEqual([]);
});

test('unbilled inherited image counts retain their provider failure refund', async () => {
  const test = fixture();
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete test.org.subscription;
  const error = new Error('synthetic provider failure');
  test.provider.mockRejectedValue(error);
  await expect(
    test.service.useCredit(test.org, 'ai_images', test.provider)
  ).rejects.toBe(error);
  expect(test.transaction.model.$transaction).not.toHaveBeenCalled();
  expect(test.provider).toHaveBeenCalledTimes(1);
  expect(test.model.credits.delete).toHaveBeenCalledTimes(1);
  expect(test.rows).toEqual([]);
});

test('preview and admission share the existing subscription month anchor', async () => {
  jest.useFakeTimers({ now: new Date('2026-10-11T10:00:00.000Z') });
  const test = fixture();
  test.org.subscription.createdAt = new Date('2026-08-17T12:00:00.000Z');
  await expect(
    test.service.checkCredits(test.org, 'ai_images')
  ).resolves.toEqual({ credits: 1 });
  await test.service.useCredit(test.org, 'ai_images', test.provider);
  expect(
    test.model.credits.groupBy.mock.calls.map(([args]) =>
      args.where.createdAt.gte.toISOString()
    )
  ).toEqual(['2026-09-17T12:00:00.000Z', '2026-09-17T12:00:00.000Z']);
});
