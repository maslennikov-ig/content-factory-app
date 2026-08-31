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

const parser = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.update.parser.ts'
);

class TelegramBot {}
const telegramLog = [];

const { TelegramUpdatesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Logger: class {
        error(...args) {
          telegramLog.push(['error', ...args]);
        }
        warn(...args) {
          telegramLog.push(['warn', ...args]);
        }
        log(...args) {
          telegramLog.push(['log', ...args]);
        }
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/telegram.update.parser':
      parser,
    '@contentfactory/helpers/utils/timer': { timer: async () => undefined },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'consumer-a',
    },
    // Redaction has its own suite in `telegram.log.redaction.test.cjs`, which
    // also guards that every log call here goes through it. Passing the value
    // straight back keeps these assertions about consumer behaviour.
    '@contentfactory/nestjs-libraries/services/redact.sensitive': {
      redactSensitive: (value) => value,
    },
    'node-telegram-bot-api': { __esModule: true, default: TelegramBot },
  }
);

const createTransaction = () => {
  const failureAttempts = new Map();
  return {
    telegramUpdateConsumerLease: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    telegramUpdateReceipt: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramSupportRelayOutbox: {
      create: jest.fn().mockResolvedValue({}),
    },
    telegramPostMetric: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramDiscussionMessage: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    telegramUpdateFailureState: {
      upsert: jest.fn(async ({ where }) => {
        const attempts = (failureAttempts.get(where.updateId) || 0) + 1;
        failureAttempts.set(where.updateId, attempts);
        return { attempts };
      }),
      deleteMany: jest.fn(async ({ where }) => ({
        count: failureAttempts.delete(where.updateId) ? 1 : 0,
      })),
    },
  };
};

const createService = (transaction, extraPrisma = {}) => {
  const prisma = {
    $transaction: (callback) => callback(transaction),
    ...extraPrisma,
  };
  return new TelegramUpdatesService(prisma);
};

/**
 * A harness for one turn of the poll loop: the lease, the cursor, the long
 * poll and the batch. `leaseResults` is consumed in order, so a test can hand
 * the lease away between the two ownership checks.
 */
const createPollingHarness = ({
  leaseResults = [],
  updates = [],
  maxUpdateId = null,
} = {}) => {
  const transaction = createTransaction();
  const remainingLeases = [...leaseResults];
  const prisma = {
    $transaction: (callback) => callback(transaction),
    telegramUpdateConsumerLease: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn(async () => remainingLeases.shift() || { count: 1 }),
    },
    telegramUpdateReceipt: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn(async () => ({ _max: { updateId: maxUpdateId } })),
      create: jest.fn().mockResolvedValue({}),
    },
    telegramPostMetric: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramDiscussionMessage: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramUpdateFailureState: {
      upsert: jest.fn().mockResolvedValue({ attempts: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramSupportRelayOutbox: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const getUpdates = jest.fn(async () => updates);
  const service = new TelegramUpdatesService(prisma);
  service.bot = { getUpdates };

  return { service, prisma, transaction, getUpdates };
};

const reactionUpdate = (updateId) => ({
  update_id: updateId,
  message_reaction_count: {
    chat: { id: -10020 },
    message_id: 42,
    reactions: [{ total_count: 4 }],
  },
});

const createSharedLeasePrisma = () => {
  const state = {
    lease: null,
    receipts: new Set(),
    appliedUpdateIds: [],
    afterCommit: null,
  };
  const updateLease = async ({ where, data }) => {
    const expectedOwner =
      where.ownerId ||
      where.OR?.find((condition) => condition.ownerId)?.ownerId;
    const ownerMatches = state.lease?.ownerId === expectedOwner;
    const expired = where.OR?.some(
      (condition) =>
        condition.leaseUntil?.lt &&
        state.lease &&
        state.lease.leaseUntil < condition.leaseUntil.lt
    );
    if (!ownerMatches && !expired) {
      return { count: 0 };
    }
    state.lease = {
      ownerId: data.ownerId,
      leaseUntil: data.leaseUntil || state.lease.leaseUntil,
    };
    return { count: 1 };
  };
  const transaction = {
    telegramUpdateConsumerLease: { updateMany: jest.fn(updateLease) },
    telegramUpdateReceipt: {
      create: jest.fn(async ({ data }) => {
        if (state.receipts.has(data.updateId)) {
          throw { code: 'P2002', meta: { target: ['updateId'] } };
        }
        state.receipts.add(data.updateId);
        return {};
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramSupportRelayOutbox: {
      create: jest.fn().mockResolvedValue({}),
    },
    telegramPostMetric: {
      upsert: jest.fn(async ({ where }) => {
        state.appliedUpdateIds.push(
          where.channelChatId_channelMessageId.channelMessageId === '42'
            ? [...state.receipts].at(-1)
            : null
        );
        return {};
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    telegramDiscussionMessage: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    telegramUpdateFailureState: {
      upsert: jest.fn().mockResolvedValue({ attempts: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: async (callback) => {
      const effectsBefore = state.appliedUpdateIds.length;
      const result = await callback(transaction);
      if (state.afterCommit && state.appliedUpdateIds.length > effectsBefore) {
        const afterCommit = state.afterCommit;
        state.afterCommit = null;
        await afterCommit();
      }
      return result;
    },
    telegramUpdateConsumerLease: {
      upsert: jest.fn(async ({ create }) => {
        if (!state.lease) {
          state.lease = {
            ownerId: create.ownerId,
            leaseUntil: create.leaseUntil,
          };
        }
        return state.lease;
      }),
      updateMany: jest.fn(updateLease),
    },
    telegramUpdateReceipt: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn(async () => ({
        _max: {
          updateId: state.receipts.size ? Math.max(...state.receipts) : null,
        },
      })),
    },
    telegramPostMetric: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramDiscussionMessage: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    telegramSupportRelayOutbox: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return { prisma, state, transaction };
};

describe('persistent Telegram update consumer', () => {
  test('queues one payload-free relay row with the private update receipt', async () => {
    const transaction = createTransaction();
    const service = createService(transaction);

    await expect(
      service.processLeasedUpdate({
        update_id: 101,
        message: {
          chat: { id: 7001, type: 'private' },
          message_id: 17,
          text: 'private support text must stay in Telegram',
          document: { file_id: 'attachment-must-not-be-stored' },
        },
      })
    ).resolves.toBe(true);

    expect(transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith({
      data: { updateId: 101 },
    });
    expect(transaction.telegramSupportRelayOutbox.create).toHaveBeenCalledTimes(
      1
    );
    expect(transaction.telegramSupportRelayOutbox.create).toHaveBeenCalledWith({
      data: {
        updateId: 101,
        sourceChatId: '7001',
        sourceMessageId: 17,
      },
    });
  });

  test.each([
    [
      'valid /connect',
      {
        chat: { id: 7001, type: 'private' },
        message_id: 18,
        text: '/connect safe_word',
      },
    ],
    [
      'group',
      {
        chat: { id: -10, type: 'group' },
        message_id: 19,
        text: 'group message',
      },
    ],
    [
      'supergroup',
      {
        chat: { id: -11, type: 'supergroup' },
        message_id: 20,
        text: 'discussion message',
      },
    ],
  ])('does not relay a %s message', async (_kind, message) => {
    const transaction = createTransaction();
    const service = createService(transaction);

    await service.processLeasedUpdate({
      update_id: message.message_id,
      message,
    });

    expect(
      transaction.telegramSupportRelayOutbox.create
    ).not.toHaveBeenCalled();
  });

  test('does not relay a channel post', async () => {
    const transaction = createTransaction();
    const service = createService(transaction);

    await service.processLeasedUpdate({
      update_id: 21,
      channel_post: {
        chat: { id: -10012, type: 'channel' },
        message_id: 21,
        text: 'channel post',
      },
    });

    expect(
      transaction.telegramSupportRelayOutbox.create
    ).not.toHaveBeenCalled();
  });

  test('retries a failed relay and marks it delivered only after Telegram accepts it', async () => {
    const previousOwner = process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
    process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID = '9001';
    try {
      const pending = {
        updateId: 111,
        sourceChatId: '7001',
        sourceMessageId: 27,
      };
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const update = jest.fn().mockResolvedValue({});
      const service = createService(createTransaction(), {
        telegramSupportRelayOutbox: {
          findMany: jest.fn().mockResolvedValue([pending]),
          updateMany,
          update,
        },
      });
      const forwardMessage = jest
        .fn()
        .mockRejectedValueOnce(new Error('protected content'))
        .mockResolvedValueOnce({ message_id: 88 });
      service.bot = { forwardMessage };

      await service.deliverPendingSupportMessages();
      expect(updateMany).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({
        where: { updateId: 111 },
        data: {
          attemptCount: { increment: 1 },
          lastAttemptAt: expect.any(Date),
        },
      });

      await service.deliverPendingSupportMessages();
      expect(forwardMessage).toHaveBeenCalledTimes(2);
      expect(forwardMessage).toHaveBeenLastCalledWith('9001', '7001', 27);
      expect(updateMany).toHaveBeenCalledWith({
        where: { updateId: 111, deliveredAt: null },
        data: {
          attemptCount: { increment: 1 },
          lastAttemptAt: expect.any(Date),
          deliveredAt: expect.any(Date),
        },
      });
    } finally {
      if (previousOwner === undefined) {
        delete process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
      } else {
        process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID = previousOwner;
      }
    }
  });

  test('a fresh relay is not starved behind more than one batch of permanent failures', async () => {
    const previousOwner = process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
    process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID = '9001';
    try {
      const failedAt = new Date('2026-08-20T08:00:00.000Z');
      const rows = Array.from({ length: 51 }, (_, index) => ({
        updateId: index + 1,
        sourceChatId: `blocked-${index + 1}`,
        sourceMessageId: index + 1,
        lastAttemptAt: failedAt,
      }));
      rows.push({
        updateId: 100,
        sourceChatId: 'fresh',
        sourceMessageId: 100,
        lastAttemptAt: null,
      });
      const findMany = jest.fn(async ({ orderBy, take }) => {
        const selected = [...rows];
        if (Array.isArray(orderBy) && orderBy[0]?.lastAttemptAt) {
          selected.sort((left, right) => {
            if (left.lastAttemptAt === null) return -1;
            if (right.lastAttemptAt === null) return 1;
            return (
              left.lastAttemptAt.getTime() - right.lastAttemptAt.getTime() ||
              left.updateId - right.updateId
            );
          });
        } else {
          selected.sort((left, right) => left.updateId - right.updateId);
        }
        return selected.slice(0, take).map(({ lastAttemptAt, ...relay }) => relay);
      });
      const service = createService(createTransaction(), {
        telegramSupportRelayOutbox: {
          findMany,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest.fn().mockResolvedValue({}),
        },
      });
      const forwardMessage = jest.fn(async (_owner, sourceChatId) => {
        if (sourceChatId !== 'fresh') {
          throw new Error('permanently unforwardable');
        }
        return { message_id: 101 };
      });
      service.bot = { forwardMessage };

      await service.deliverPendingSupportMessages();

      expect(forwardMessage).toHaveBeenCalledWith('9001', 'fresh', 100);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [
            { lastAttemptAt: { sort: 'asc', nulls: 'first' } },
            { updateId: 'asc' },
          ],
          take: 50,
        })
      );
    } finally {
      if (previousOwner === undefined) {
        delete process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
      } else {
        process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID = previousOwner;
      }
    }
  });

  test('keeps the queue and continues consuming when the support owner is not configured', async () => {
    const previousOwner = process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
    delete process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
    telegramLog.length = 0;
    try {
      const harness = createPollingHarness({
        updates: [
          {
            update_id: 121,
            message: {
              chat: { id: 7001, type: 'private' },
              message_id: 31,
              text: 'queued while configuration is absent',
            },
          },
        ],
      });

      await expect(harness.service.pollOnce()).resolves.toBeUndefined();

      expect(harness.getUpdates).toHaveBeenCalled();
      expect(
        harness.transaction.telegramSupportRelayOutbox.create
      ).toHaveBeenCalledWith({
        data: { updateId: 121, sourceChatId: '7001', sourceMessageId: 31 },
      });
      expect(
        telegramLog.some(
          ([level, message]) =>
            level === 'warn' &&
            String(message).includes('TELEGRAM_SUPPORT_OWNER_CHAT_ID')
        )
      ).toBe(true);
    } finally {
      if (previousOwner === undefined) {
        delete process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID;
      } else {
        process.env.TELEGRAM_SUPPORT_OWNER_CHAT_ID = previousOwner;
      }
    }
  });

  test('deduplicates update_id before applying an absolute reaction count', async () => {
    const transaction = createTransaction();
    const service = createService(transaction);

    await expect(service.processLeasedUpdate(reactionUpdate(201))).resolves.toBe(
      true
    );

    expect(transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith({
      data: { updateId: 201 },
    });
    expect(transaction.telegramPostMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channelChatId_channelMessageId: {
            channelChatId: '-10020',
            channelMessageId: '42',
          },
        },
        update: expect.objectContaining({ reactionCount: 4 }),
      })
    );
  });

  test('ignores an already processed update without mutating metrics twice', async () => {
    const transaction = createTransaction();
    transaction.telegramUpdateReceipt.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['updateId'] },
    });
    const service = createService(transaction);

    await expect(service.processLeasedUpdate({ update_id: 201 })).resolves.toBe(
      false
    );
    expect(transaction.telegramPostMetric.upsert).not.toHaveBeenCalled();
  });

  test('a unique-constraint clash elsewhere is a failure, not a duplicate', async () => {
    const transaction = createTransaction();
    transaction.telegramPostMetric.upsert.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['channelChatId', 'channelMessageId'] },
    });
    const service = createService(transaction);

    await expect(service.processLeasedUpdate(reactionUpdate(202))).rejects.toEqual(
      expect.objectContaining({ code: 'P2002' })
    );
  });

  test('an outbox updateId clash is not mistaken for a duplicate receipt', async () => {
    const transaction = createTransaction();
    transaction.telegramSupportRelayOutbox.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        modelName: 'TelegramSupportRelayOutbox',
        target: ['updateId'],
      },
    });
    const service = createService(transaction);

    await expect(
      service.processLeasedUpdate({
        update_id: 203,
        message: {
          chat: { id: 7001, type: 'private' },
          message_id: 33,
          text: 'must not be silently discarded',
        },
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'P2002' }));
  });

  test('maps the discussion root and counts a nested reply against the channel post', async () => {
    const transaction = createTransaction();
    const service = createService(transaction);

    await service.processLeasedUpdate({
      update_id: 202,
      message: {
        chat: { id: -10030 },
        message_id: 8,
        is_automatic_forward: true,
        forward_origin: {
          type: 'channel',
          chat: { id: -10020 },
          message_id: 42,
        },
      },
    });

    expect(transaction.telegramDiscussionMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          channelChatId: '-10020',
          channelMessageId: '42',
          discussionMessageId: '8',
        }),
      })
    );

    transaction.telegramDiscussionMessage.findUnique.mockResolvedValue({
      channelChatId: '-10020',
      channelMessageId: '42',
    });
    await service.processLeasedUpdate({
      update_id: 203,
      message: {
        chat: { id: -10030 },
        message_id: 10,
        reply_to_message: { message_id: 9 },
      },
    });

    expect(transaction.telegramPostMetric.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channelChatId_channelMessageId: {
            channelChatId: '-10020',
            channelMessageId: '42',
          },
        },
        create: expect.objectContaining({ commentCount: 1 }),
        update: { commentCount: { increment: 1 } },
      })
    );
  });

  test('counts a comment on a post whose metric row was never created', async () => {
    const transaction = createTransaction();
    transaction.telegramDiscussionMessage.findUnique.mockResolvedValue({
      channelChatId: '-10020',
      channelMessageId: '42',
    });
    const service = createService(transaction);

    await expect(
      service.processLeasedUpdate({
        update_id: 204,
        message: {
          chat: { id: -10030 },
          message_id: 11,
          reply_to_message: { message_id: 9 },
        },
      })
    ).resolves.toBe(true);

    expect(transaction.telegramPostMetric.update).not.toHaveBeenCalled();
  });

  test('resumes after the last receipt and asks only for the consumed kinds', async () => {
    const { service, getUpdates, transaction } = createPollingHarness({
      maxUpdateId: 41,
    });

    await service.pollOnce();

    expect(getUpdates).toHaveBeenCalledWith({
      offset: 42,
      timeout: 20,
      allowed_updates: ['message', 'channel_post', 'message_reaction_count'],
    });
    expect(
      transaction.telegramUpdateFailureState.deleteMany
    ).toHaveBeenCalledWith({ where: { updateId: { lte: 41 } } });
  });

  test('renews the lease part-way through a long batch and stops if it is gone', async () => {
    // A hundred updates, each its own transaction, can outlast a forty-five
    // second lease. The batch has to notice rather than keep writing under a
    // lease another replica already owns.
    const updates = [301, 302, 303, 304].map(reactionUpdate);
    const { service, transaction, prisma } = createPollingHarness({
      // Taken, still held after the long poll, then lost at the renewal.
      leaseResults: [{ count: 1 }, { count: 1 }, { count: 0 }],
      updates,
    });

    let clock = Date.now();
    // Every reading moves eight seconds, so the fifteen-second renewal point
    // falls between the first and the second update rather than before either.
    jest.spyOn(Date, 'now').mockImplementation(() => {
      clock += 8_000;
      return clock;
    });

    try {
      await service.pollOnce();
    } finally {
      Date.now.mockRestore();
    }

    // Three lease calls: the initial one, the post-poll check, the renewal.
    expect(prisma.telegramUpdateConsumerLease.updateMany).toHaveBeenCalledTimes(
      3
    );
    // The first update was applied under a lease this consumer still held; the
    // rest of the batch was abandoned when the renewal failed.
    expect(transaction.telegramUpdateReceipt.create).toHaveBeenCalledTimes(1);
    expect(transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith({
      data: { updateId: 301 },
    });
    expect(
      transaction.telegramUpdateFailureState.deleteMany
    ).toHaveBeenCalledWith({ where: { updateId: 301 } });
  });

  test('does not touch the batch when the lease was lost during the long poll', async () => {
    const { service, transaction, getUpdates } = createPollingHarness({
      leaseResults: [{ count: 1 }, { count: 0 }],
      updates: [reactionUpdate(301)],
    });

    await service.pollOnce();

    expect(getUpdates).toHaveBeenCalled();
    expect(transaction.telegramUpdateReceipt.create).not.toHaveBeenCalled();
  });

  test('one unprocessable update stops blocking every later update', async () => {
    const harness = createPollingHarness({
      updates: [reactionUpdate(401), reactionUpdate(402)],
    });
    let failures = 0;
    harness.transaction.telegramUpdateReceipt.create.mockImplementation(
      async ({ data }) => {
        if (data.updateId === 401 && failures++ < 3) {
          throw new Error('permanently broken update');
        }
        return {};
      }
    );

    await harness.service.pollOnce();
    await harness.service.pollOnce();
    expect(harness.prisma.telegramUpdateReceipt.create).not.toHaveBeenCalled();
    expect(
      harness.transaction.telegramUpdateReceipt.create
    ).not.toHaveBeenCalledWith({ data: { updateId: 402 } });

    await harness.service.pollOnce();

    expect(
      harness.transaction.telegramUpdateReceipt.create
    ).toHaveBeenCalledWith({
      data: { updateId: 401 },
    });
    expect(
      harness.transaction.telegramUpdateReceipt.create
    ).toHaveBeenCalledWith({ data: { updateId: 402 } });
  });

  test('continues a failed update across a new service instance and writes it off at the limit', async () => {
    const transaction = createTransaction();
    let failures = 0;
    transaction.telegramUpdateReceipt.create.mockImplementation(async () => {
      if (failures++ < 3) {
        throw new Error('permanently broken update');
      }
      return {};
    });
    const prisma = {
      $transaction: (callback) => callback(transaction),
      telegramUpdateConsumerLease: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      telegramUpdateReceipt: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        aggregate: jest.fn().mockResolvedValue({ _max: { updateId: null } }),
        create: jest.fn().mockResolvedValue({}),
      },
      telegramPostMetric: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      telegramDiscussionMessage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      telegramSupportRelayOutbox: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const makeService = (ownerId) => {
      const service = new TelegramUpdatesService(prisma);
      service.consumerId = ownerId;
      service.bot = { getUpdates: jest.fn(async () => [reactionUpdate(501)]) };
      return service;
    };

    const firstService = makeService('owner-a');
    await firstService.pollOnce();
    await firstService.pollOnce();
    const replacementService = makeService('owner-b');
    await replacementService.pollOnce();

    expect(transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith({
      data: { updateId: 501 },
    });
    expect(transaction.telegramUpdateFailureState.upsert).toHaveBeenCalledTimes(
      3
    );
    expect(
      transaction.telegramUpdateFailureState.upsert
    ).toHaveBeenNthCalledWith(3, {
      where: { updateId: 501 },
      create: { updateId: 501, ownerId: 'owner-b', attempts: 1 },
      update: { ownerId: 'owner-b', attempts: { increment: 1 } },
      select: { attempts: true },
    });
    expect(
      transaction.telegramUpdateFailureState.deleteMany
    ).toHaveBeenCalledWith({ where: { updateId: 501 } });
  });

  test('does not persist a failure after ownership was lost during processing', async () => {
    const harness = createPollingHarness({
      leaseResults: [{ count: 1 }, { count: 1 }],
      updates: [reactionUpdate(502)],
    });
    harness.transaction.telegramUpdateReceipt.create.mockRejectedValue(
      new Error('broken update')
    );
    harness.transaction.telegramUpdateConsumerLease.updateMany.mockResolvedValue(
      { count: 0 }
    );

    await harness.service.pollOnce();

    expect(
      harness.transaction.telegramUpdateConsumerLease.updateMany
    ).toHaveBeenCalled();
    expect(
      harness.transaction.telegramUpdateFailureState.upsert
    ).not.toHaveBeenCalled();
  });

  test('does not apply or clear an update after ownership was lost before its transaction', async () => {
    const harness = createPollingHarness({
      leaseResults: [{ count: 1 }, { count: 1 }],
      updates: [reactionUpdate(503)],
    });
    harness.transaction.telegramUpdateConsumerLease.updateMany.mockResolvedValue(
      { count: 0 }
    );

    await harness.service.pollOnce();

    expect(
      harness.transaction.telegramUpdateReceipt.create
    ).not.toHaveBeenCalled();
    expect(
      harness.transaction.telegramUpdateFailureState.deleteMany
    ).not.toHaveBeenCalled();
  });

  // What this proves is the receipt's unique index: `createSharedLeasePrisma`
  // keeps a `Set` of update ids and raises P2002 on a repeat, and that alone
  // is enough to make it pass. Breaking `fenceLease` outright leaves it green.
  // The fence is covered separately, at the bottom of this file, against a
  // transaction double that can roll back.
  test('clock-skew takeover cannot duplicate effects before or during a fetched batch', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-17T10:00:00.000Z') });
    try {
      const postPoll = createSharedLeasePrisma();
      const firstOwner = new TelegramUpdatesService(postPoll.prisma);
      const secondOwner = new TelegramUpdatesService(postPoll.prisma);
      firstOwner.consumerId = 'owner-a';
      secondOwner.consumerId = 'owner-b';
      secondOwner.bot = {
        getUpdates: jest.fn(async () => [reactionUpdate(601)]),
      };
      firstOwner.bot = {
        getUpdates: jest.fn(async () => {
          jest.setSystemTime(new Date('2026-08-17T10:01:00.000Z'));
          await secondOwner.pollOnce();
          jest.setSystemTime(new Date('2026-08-17T10:00:00.000Z'));
          return [reactionUpdate(601)];
        }),
      };

      await firstOwner.pollOnce();

      expect(postPoll.state.appliedUpdateIds).toEqual([601]);
      expect(
        postPoll.prisma.telegramUpdateConsumerLease.updateMany
      ).toHaveBeenCalledTimes(4);

      const midBatch = createSharedLeasePrisma();
      const batchOwner = new TelegramUpdatesService(midBatch.prisma);
      const takeoverOwner = new TelegramUpdatesService(midBatch.prisma);
      batchOwner.consumerId = 'owner-a';
      takeoverOwner.consumerId = 'owner-b';
      batchOwner.bot = {
        getUpdates: jest.fn(async () => [
          reactionUpdate(701),
          reactionUpdate(702),
        ]),
      };
      midBatch.state.afterCommit = async () => {
        jest.setSystemTime(new Date('2026-08-17T10:01:00.000Z'));
        expect(await takeoverOwner.acquireLease()).toBe(true);
        await takeoverOwner.processLeasedUpdate(reactionUpdate(701));
        await takeoverOwner.processLeasedUpdate(reactionUpdate(702));
      };

      await batchOwner.pollOnce();

      expect(midBatch.state.appliedUpdateIds).toEqual([701, 702]);
      expect(midBatch.state.receipts).toEqual(new Set([701, 702]));
      expect(
        midBatch.prisma.telegramUpdateConsumerLease.updateMany
      ).toHaveBeenCalledTimes(4);
      expect(
        midBatch.transaction.telegramUpdateReceipt.create
      ).toHaveBeenCalledTimes(3);
      expect(
        midBatch.transaction.telegramPostMetric.upsert
      ).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('bounds both the receipt log and the stored engagement table', async () => {
    const { service, prisma } = createPollingHarness();

    await service.pollOnce();

    const [[receiptCleanup]] =
      prisma.telegramUpdateReceipt.deleteMany.mock.calls;
    const [[metricCleanup]] = prisma.telegramPostMetric.deleteMany.mock.calls;
    const [[mappingCleanup]] =
      prisma.telegramDiscussionMessage.deleteMany.mock.calls;

    expect(receiptCleanup.where.createdAt.lt).toBeInstanceOf(Date);
    expect(metricCleanup.where.updatedAt.lt).toBeInstanceOf(Date);
    // Receipts exist only to deduplicate; engagement is read from the post
    // statistics screen for far longer, so it must outlive them.
    expect(metricCleanup.where.updatedAt.lt.getTime()).toBeLessThan(
      receiptCleanup.where.createdAt.lt.getTime()
    );
    // The discussion mapping is useless once the metric it points at is gone,
    // and it gains a row per comment forever if nothing prunes it.
    expect(mappingCleanup.where.createdAt.lt.getTime()).toBe(
      metricCleanup.where.updatedAt.lt.getTime()
    );
  });

  test('prunes only delivered relay metadata after the receipt retention window', async () => {
    const { service, prisma } = createPollingHarness();

    await service.pollOnce();

    const [[receiptCleanup]] =
      prisma.telegramUpdateReceipt.deleteMany.mock.calls;
    expect(
      prisma.telegramSupportRelayOutbox.deleteMany
    ).toHaveBeenCalledWith({
      where: { deliveredAt: { lt: expect.any(Date) } },
    });
    const [[relayCleanup]] =
      prisma.telegramSupportRelayOutbox.deleteMany.mock.calls;
    expect(relayCleanup.where.deliveredAt.lt.getTime()).toBe(
      receiptCleanup.where.createdAt.lt.getTime()
    );
    expect(relayCleanup.where).not.toHaveProperty('createdAt');
  });

  test('returns the stored per-post engagement totals by Telegram chat and message', async () => {
    const transaction = createTransaction();
    const findUnique = jest.fn().mockResolvedValue({
      reactionCount: 7,
      commentCount: 3,
      updatedAt: new Date('2026-08-13T10:00:00.000Z'),
    });
    const service = createService(transaction, {
      telegramPostMetric: { findUnique },
    });

    await expect(service.getPostMetrics('-10020', '42')).resolves.toEqual({
      reactions: 7,
      comments: 3,
      collectedAt: '2026-08-13T10:00:00.000Z',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        channelChatId_channelMessageId: {
          channelChatId: '-10020',
          channelMessageId: '42',
        },
      },
      select: {
        reactionCount: true,
        commentCount: true,
        updatedAt: true,
      },
    });
  });

  test('keeps the connection endpoint on the shared consumer', () => {
    const provider = fs.readFileSync(
      path.resolve(
        __dirname,
        '../libraries/nestjs-libraries/src/integrations/social/telegram.provider.ts'
      ),
      'utf8'
    );
    const controller = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/backend/src/api/routes/integrations.controller.ts'
      ),
      'utf8'
    );

    // A second poller would compete with this one for the same updates, and
    // Telegram hands each update to whoever asks first.
    expect(provider).not.toContain('.getUpdates(');
    expect(controller).toContain('_telegramUpdatesService.getConnection');
  });

  test('wires stored engagement into the post statistics screen', () => {
    const statisticsScreen = fs.readFileSync(
      path.resolve(
        __dirname,
        '../apps/frontend/src/components/launches/statistics.tsx'
      ),
      'utf8'
    );

    // The backend half of this path is covered behaviourally in
    // telegram.post.statistics.test.cjs; the screen itself is owned by the
    // frontend and is only checked here for the wiring.
    expect(statisticsScreen).toContain('statisticsData?.telegram');
    expect(statisticsScreen).toContain("'telegram_reactions'");
    expect(statisticsScreen).toContain("'telegram_comments'");
  });
});

/**
 * A `$transaction` double that does not flatten.
 *
 * The rest of this file stubs `$transaction` as a direct call of its callback,
 * so a test can say what was *attempted* but nothing about what a rollback
 * would leave behind — and the fence is only worth anything if a refusal
 * discards the writes that followed it. Here every model call is appended to
 * one ordered log, writes are staged, and the staged state is merged into the
 * committed store only when the callback resolves. A rejected callback throws
 * its stage away.
 *
 * What this still cannot model is PostgreSQL's row lock: the `updateMany` in
 * `fenceLease` holds the lease row until the transaction ends, and only a real
 * database can show that a takeover blocks on it. What it does prove is the
 * half that lives in this file — the fence runs first, inside the same
 * transaction, on the transactional client, and a lost lease commits nothing.
 */
const createTransactionalPrisma = ({
  leaseOwner = 'owner-a',
  failSupportRelayCreate = false,
} = {}) => {
  const committed = {
    leaseOwner,
    receipts: new Set(),
    supportRelays: new Map(),
    metrics: [],
    failures: new Map(),
  };
  const log = [];
  let openTransactions = 0;

  const stagedClient = (staged) => ({
    telegramUpdateConsumerLease: {
      updateMany: jest.fn(async ({ where, data }) => {
        log.push(['lease.updateMany', where.ownerId]);
        if (staged.leaseOwner !== where.ownerId) {
          return { count: 0 };
        }
        staged.leaseOwner = data.ownerId;
        return { count: 1 };
      }),
    },
    telegramUpdateReceipt: {
      create: jest.fn(async ({ data }) => {
        log.push(['receipt.create', data.updateId]);
        if (staged.receipts.has(data.updateId)) {
          throw { code: 'P2002', meta: { target: ['updateId'] } };
        }
        staged.receipts.add(data.updateId);
        return {};
      }),
      update: jest.fn(async ({ where }) => {
        log.push(['receipt.update', where.updateId]);
        return {};
      }),
    },
    telegramSupportRelayOutbox: {
      create: jest.fn(async ({ data }) => {
        log.push(['supportRelay.create', data.updateId]);
        if (failSupportRelayCreate) {
          throw new Error('outbox unavailable');
        }
        staged.supportRelays.set(data.updateId, data);
        return {};
      }),
    },
    telegramPostMetric: {
      upsert: jest.fn(async ({ where }) => {
        const key = where.channelChatId_channelMessageId;
        log.push(['metric.upsert', key.channelMessageId]);
        staged.metrics.push(key.channelMessageId);
        return {};
      }),
    },
    telegramDiscussionMessage: {
      upsert: jest.fn(async () => {
        log.push(['discussion.upsert']);
        return {};
      }),
      findUnique: jest.fn(async () => null),
    },
    telegramUpdateFailureState: {
      upsert: jest.fn(async ({ where }) => {
        const attempts = (staged.failures.get(where.updateId) || 0) + 1;
        log.push(['failure.upsert', where.updateId, attempts]);
        staged.failures.set(where.updateId, attempts);
        return { attempts };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        log.push(['failure.deleteMany', JSON.stringify(where.updateId)]);
        const updateId = where.updateId;
        if (typeof updateId === 'object') {
          let count = 0;
          for (const key of [...staged.failures.keys()]) {
            if (key <= updateId.lte) {
              staged.failures.delete(key);
              count += 1;
            }
          }
          return { count };
        }
        return { count: staged.failures.delete(updateId) ? 1 : 0 };
      }),
    },
  });

  const prisma = {
    $transaction: async (callback) => {
      // Serial by construction: the double models one connection, and a test
      // that interleaved two would be describing a lock it cannot implement.
      expect(openTransactions).toBe(0);
      openTransactions += 1;
      const staged = {
        leaseOwner: committed.leaseOwner,
        receipts: new Set(committed.receipts),
        supportRelays: new Map(committed.supportRelays),
        metrics: [...committed.metrics],
        failures: new Map(committed.failures),
      };
      try {
        const result = await callback(stagedClient(staged));
        Object.assign(committed, staged);
        log.push(['commit']);
        return result;
      } catch (error) {
        log.push(['rollback']);
        throw error;
      } finally {
        openTransactions -= 1;
      }
    },
    // Present so an accidental non-transactional fence would show up as a call
    // here rather than silently passing.
    telegramUpdateConsumerLease: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  return { prisma, committed, log };
};

const ownershipLost = (error) =>
  error?.constructor?.name === 'TelegramLeaseOwnershipLost';

describe('the lease fence, driven through a transaction that can roll back', () => {
  test('an outbox write failure rolls back the private-message receipt too', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-a',
      failSupportRelayCreate: true,
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    await expect(
      service.processLeasedUpdate({
        update_id: 805,
        message: {
          chat: { id: 7001, type: 'private' },
          message_id: 35,
          text: 'must not be acknowledged without its outbox row',
        },
      })
    ).rejects.toThrow('outbox unavailable');

    expect(log).toEqual([
      ['lease.updateMany', 'owner-a'],
      ['receipt.create', 805],
      ['supportRelay.create', 805],
      ['rollback'],
    ]);
    expect(committed.receipts.size).toBe(0);
    expect(committed.supportRelays.size).toBe(0);
  });

  test('an update is refused when the lease changed hands, and its transaction leaves nothing', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-b',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    // 801 was never seen, so the receipt's unique index cannot be what stops
    // this: the only thing standing in the way is the fence.
    expect(committed.receipts.has(801)).toBe(false);
    const error = await service
      .processLeasedUpdate(reactionUpdate(801))
      .then(() => null, (thrown) => thrown);

    expect(ownershipLost(error)).toBe(true);
    // The fence is the first statement in the transaction and nothing follows.
    expect(log).toEqual([['lease.updateMany', 'owner-a'], ['rollback']]);
    expect(committed.receipts.size).toBe(0);
    expect(committed.metrics).toEqual([]);
    // The fence went through the transactional client, not the pooled one.
    expect(prisma.telegramUpdateConsumerLease.updateMany).not.toHaveBeenCalled();
  });

  test('the same update applies for the owner that still holds the lease', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-a',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    await expect(
      service.processLeasedUpdate(reactionUpdate(801))
    ).resolves.toBe(true);

    expect(log).toEqual([
      ['lease.updateMany', 'owner-a'],
      ['receipt.create', 801],
      ['metric.upsert', '42'],
      ['failure.deleteMany', '801'],
      ['commit'],
    ]);
    expect(committed.receipts).toEqual(new Set([801]));
    expect(committed.metrics).toEqual(['42']);
  });

  test('a retry counter is not persisted under a lease this consumer lost', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-b',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    await expect(service.recordFailedAttempt(802)).resolves.toBeNull();

    expect(log).toEqual([['lease.updateMany', 'owner-a'], ['rollback']]);
    expect(committed.failures.size).toBe(0);
  });

  test('a write-off is refused under a lost lease, so the cursor does not move', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-b',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    await expect(service.writeOffUpdate(803)).resolves.toBe(false);

    expect(log).toEqual([['lease.updateMany', 'owner-a'], ['rollback']]);
    // Writing the receipt is what moves the cursor past an update nobody
    // applied; under a lost lease it must not happen.
    expect(committed.receipts.size).toBe(0);
  });

  test('clearing completed retry state is refused under a lost lease', async () => {
    const { prisma, committed, log } = createTransactionalPrisma({
      leaseOwner: 'owner-b',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';
    committed.failures.set(700, 2);

    await expect(service.clearCompletedFailureStates(900)).resolves.toBe(false);

    expect(log).toEqual([['lease.updateMany', 'owner-a'], ['rollback']]);
    expect(committed.failures.get(700)).toBe(2);
  });

  test('no entry point applies an update without fencing the lease first', async () => {
    const { prisma, committed } = createTransactionalPrisma({
      leaseOwner: 'owner-b',
    });
    const service = new TelegramUpdatesService(prisma);
    service.consumerId = 'owner-a';

    // Whatever this class calls its update-applying methods, every one of them
    // has to refuse under a lease it does not hold. A public sibling that
    // skipped the fence is exactly the hole this guards.
    const entryPoints = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service)
    ).filter((name) => /^process/.test(name));

    expect(entryPoints).not.toEqual([]);
    for (const name of entryPoints) {
      const error = await Promise.resolve(service[name](reactionUpdate(804)))
        .then(() => null, (thrown) => thrown);
      expect([name, ownershipLost(error)]).toEqual([name, true]);
    }
    expect(committed.receipts.size).toBe(0);
    expect(committed.metrics).toEqual([]);
  });
});

test('the retry-state table carries no index no query can use', () => {
  const schema = fs.readFileSync(
    path.resolve(
      __dirname,
      '../libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );
  const model = schema.match(
    /model TelegramUpdateFailureState \{([\s\S]*?)\n\}/
  );
  const service = fs.readFileSync(
    path.resolve(
      __dirname,
      '../libraries/nestjs-libraries/src/integrations/telegram.updates.service.ts'
    ),
    'utf8'
  );

  expect(model).not.toBeNull();
  // Every access to this table is by `updateId`, which is its primary key:
  // `ownerId` and `updatedAt` are written and never read back, so an index on
  // them only costs a write on the hot path of the consumer.
  expect(model[1]).toContain('updateId  Int      @id');
  expect(model[1]).not.toContain('@@index');
  expect(service).not.toMatch(
    /telegramUpdateFailureState\.[a-zA-Z]+\(\{[\s\S]{0,200}?(ownerId|updatedAt):[\s\S]{0,40}?\}\s*,?\s*(orderBy|where)/
  );
});

/**
 * The support relay arrived after `/connect`, statistics and discussions were
 * already in production, and it brought a table of its own. The deploy runbook
 * starts the new container before applying the schema, so there is a real
 * window where that table does not exist yet — and one operator forgetting the
 * apply step would make the window permanent. None of the older Telegram
 * features may go down with it.
 */
describe('a missing support relay table degrades only the relay', () => {
  const missingTable = () =>
    Object.assign(new Error('The table does not exist'), { code: 'P2021' });

  const privateMessage = (updateId) => ({
    update_id: updateId,
    message: {
      chat: { id: 5551234, type: 'private' },
      message_id: 17,
      text: 'мне нужна помощь',
    },
  });

  beforeEach(() => {
    telegramLog.length = 0;
  });

  test('keeps polling and keeps consuming updates', async () => {
    const harness = createPollingHarness({ updates: [reactionUpdate(900)] });
    harness.prisma.telegramSupportRelayOutbox.deleteMany.mockRejectedValue(
      missingTable()
    );

    await harness.service.pollOnce();

    // The long poll happened and the reaction was applied: the consumer is
    // alive, not spinning on a rejected prune.
    expect(harness.getUpdates).toHaveBeenCalledTimes(1);
    expect(harness.transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith(
      { data: { updateId: 900 } }
    );
    expect(harness.transaction.telegramPostMetric.upsert).toHaveBeenCalled();
    // The queue is not read while the table is gone.
    expect(
      harness.prisma.telegramSupportRelayOutbox.findMany
    ).not.toHaveBeenCalled();
  });

  test('names the table once instead of on every poll', async () => {
    const harness = createPollingHarness();
    harness.prisma.telegramSupportRelayOutbox.deleteMany.mockRejectedValue(
      missingTable()
    );

    await harness.service.pollOnce();
    await harness.service.pollOnce();

    const complaints = telegramLog.filter(
      ([level, message]) =>
        level === 'error' &&
        String(message).includes('TelegramSupportRelayOutbox does not exist')
    );
    expect(complaints).toHaveLength(1);
    // The message has to be actionable on its own, in a log with nothing else
    // in it.
    expect(String(complaints[0][1])).toContain('apply the Prisma schema');
  });

  test('consumes a private message instead of writing it off', async () => {
    const harness = createPollingHarness({ updates: [privateMessage(901)] });
    harness.prisma.telegramSupportRelayOutbox.deleteMany.mockRejectedValue(
      missingTable()
    );

    await harness.service.pollOnce();

    // No insert was attempted, so the transaction — and with it the receipt
    // that moves the cursor — survived.
    expect(
      harness.transaction.telegramSupportRelayOutbox.create
    ).not.toHaveBeenCalled();
    expect(harness.transaction.telegramUpdateReceipt.create).toHaveBeenCalledWith(
      { data: { updateId: 901 } }
    );
    expect(
      harness.transaction.telegramUpdateFailureState.upsert
    ).not.toHaveBeenCalled();
  });

  test('resumes on the next poll once the schema is applied', async () => {
    const harness = createPollingHarness({ updates: [privateMessage(902)] });
    harness.prisma.telegramSupportRelayOutbox.deleteMany.mockRejectedValueOnce(
      missingTable()
    );

    await harness.service.pollOnce();
    expect(
      harness.transaction.telegramSupportRelayOutbox.create
    ).not.toHaveBeenCalled();

    // Second turn: the prune succeeds, so the relay is live again without a
    // restart.
    harness.getUpdates.mockResolvedValueOnce([privateMessage(903)]);
    await harness.service.pollOnce();

    expect(
      harness.transaction.telegramSupportRelayOutbox.create
    ).toHaveBeenCalledWith({
      data: { updateId: 903, sourceChatId: '5551234', sourceMessageId: 17 },
    });
    expect(
      telegramLog.some(
        ([level, message]) =>
          level === 'log' && String(message).includes('support relay resumed')
      )
    ).toBe(true);
  });

  test('still fails loudly on a prune error that is not a missing table', async () => {
    const harness = createPollingHarness();
    harness.prisma.telegramSupportRelayOutbox.deleteMany.mockRejectedValue(
      Object.assign(new Error('connection reset'), { code: 'P1001' })
    );

    // A broken database must not be mistaken for a feature that is merely not
    // deployed yet.
    await expect(harness.service.pollOnce()).rejects.toThrow(
      'connection reset'
    );
    expect(
      telegramLog.some(([, message]) =>
        String(message).includes('TelegramSupportRelayOutbox does not exist')
      )
    ).toBe(false);
  });
});
