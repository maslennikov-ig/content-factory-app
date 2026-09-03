const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
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

/**
 * The acting person, as the auth middleware would have set them. A real
 * `AsyncLocalStorage` rather than a constant, so a test can prove the ledger
 * reads the context at admission time instead of at construction.
 */
const actingUser = new AsyncLocalStorage();
const asMember = (userId, callback) => actingUser.run(userId, callback);

function loadUsage({ transaction, create, update, config }) {
  const active = new AsyncLocalStorage();
  const loaded = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
    {
      '@prisma/client': {
        Prisma: {
          TransactionIsolationLevel: { Serializable: 'Serializable' },
        },
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        AiProviderNotConfigured: class AiProviderNotConfigured extends require('@nestjs/common')
          .ServiceUnavailableException {
          constructor() {
            super({ code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE' });
          }
        },
        loadAiConfig: async () => config,
        getActiveAiConfig: (organizationId) =>
          active.getStore()?.organizationId === organizationId
            ? active.getStore().config
            : undefined,
        getActiveAiOrganizationId: () => active.getStore()?.organizationId,
        withActiveAiConfig: (organizationId, nextConfig, callback) =>
          active.run({ organizationId, config: nextConfig }, callback),
        setAiProviderSettingReader: () => undefined,
      },
      '@contentfactory/nestjs-libraries/user/acting.user': {
        getActingUserId: () => actingUser.getStore(),
      },
    }
  );
  const service = new loaded.AiUsageService({
    $transaction: transaction,
    aiUsageRecord: { create, update },
  });
  return Object.assign(service, {
    aiBillingPeriodStart: loaded.aiBillingPeriodStart,
  });
}

const included = {
  usageMode: 'included',
  provider: 'openai',
  apiKey: 'managed',
  textModel: 'managed-text',
  imageModel: 'managed-image',
  search: { enabled: false, apiKey: '' },
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

const prismaError = (code, message) =>
  Object.assign(new Error(message), { code });

const includedLedger = ({ rows = [], quota = 1, failedUpdates = 0 } = {}) => {
  const records = rows.map((row) => ({
    organizationId: 'organization-a',
    usageMode: 'included',
    operation: 'text_generation',
    provider: 'openai',
    model: 'managed-text',
    ...row,
  }));
  let nextId = records.length + 1;
  let remainingFailedUpdates = failedUpdates;
  const create = jest.fn(async ({ data }) => {
    const record = {
      id: `usage-${nextId++}`,
      createdAt: new Date(),
      ...data,
    };
    records.push(record);
    return record;
  });
  const update = jest.fn(async ({ where, data }) => {
    if (remainingFailedUpdates > 0) {
      remainingFailedUpdates -= 1;
      throw new Error('database unavailable');
    }
    Object.assign(
      records.find((record) => record.id === where.id),
      data
    );
    return {};
  });
  const matchesWhere = (record, where) => {
    if (where.organizationId && record.organizationId !== where.organizationId)
      return false;
    if (where.usageMode && record.usageMode !== where.usageMode) return false;
    if (where.status?.not && record.status === where.status.not) return false;
    if (where.createdAt?.gte && record.createdAt < where.createdAt.gte)
      return false;
    if (where.OR && !where.OR.some((part) => matchesWhere(record, part)))
      return false;
    return true;
  };
  const count = jest.fn(async ({ where }) =>
    records.filter((record) => matchesWhere(record, where)).length
  );
  const transaction = jest.fn((callback) =>
    callback({
      subscription: {
        findUnique: async () => ({
          includedAiMonthlyOperations: quota,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      },
      aiUsageRecord: { count, create },
    })
  );
  return {
    records,
    count,
    usage: loadUsage({ transaction, create, update, config: included }),
  };
};

/** An admission that never commits, so the whole retry budget is spent. */
const alwaysFailing = (code, message) => {
  const transaction = jest.fn(async () => {
    throw prismaError(code, message);
  });
  const usage = loadUsage({
    transaction,
    create: jest.fn(),
    update: jest.fn(),
    config: included,
  });
  usage.pauseBeforeRetry = jest.fn(async () => undefined);
  return { transaction, usage };
};

describe('AI operation usage seam', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('billing periods keep the original month-day anchor after a short month', () => {
    const usage = loadUsage({
      transaction: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      config: included,
    });
    const createdAt = new Date('2026-01-31T10:15:20.000Z');

    expect(
      usage
        .aiBillingPeriodStart(createdAt, new Date('2026-03-30T12:00:00.000Z'))
        .toISOString()
    ).toBe('2026-02-28T10:15:20.000Z');
    expect(
      usage
        .aiBillingPeriodStart(createdAt, new Date('2026-03-31T10:15:20.000Z'))
        .toISOString()
    ).toBe('2026-03-31T10:15:20.000Z');
  });

  test('included admission is serializable, retries bounded conflicts and stores no content', async () => {
    const ledgerCreate = jest.fn(async ({ data }) => ({
      id: 'usage-1',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    let attempts = 0;
    const transaction = jest.fn(async (callback, options) => {
      attempts += 1;
      expect(options).toMatchObject({ isolationLevel: 'Serializable' });
      if (attempts === 1)
        throw Object.assign(new Error('conflict'), { code: 'P2034' });
      return callback({
        subscription: {
          findUnique: async () => ({
            includedAiMonthlyOperations: 1,
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
          }),
        },
        aiUsageRecord: {
          count: async () => 0,
          create: ledgerCreate,
        },
      });
    });
    const usage = loadUsage({
      transaction,
      create: ledgerCreate,
      update,
      config: included,
    });

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'result'
      )
    ).resolves.toBe('result');

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(ledgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'organization-a',
        usageMode: 'included',
        operation: 'text_generation',
        provider: 'openai',
        model: 'managed-text',
        status: 'admitted',
      }),
    });
    const serialized = JSON.stringify(ledgerCreate.mock.calls[0]);
    expect(serialized).not.toMatch(/prompt|output|error|payload|token|cost/i);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-1' },
      data: expect.objectContaining({ status: 'succeeded' }),
    });
  });

  test('an admission orphaned by process loss returns included allowance after 24 hours', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-20T12:00:00.000Z') });
    const { usage } = includedLedger({
      rows: [
        {
          id: 'orphaned-admission',
          status: 'admitted',
          createdAt: new Date('2026-08-19T11:59:59.999Z'),
        },
      ],
    });

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'replacement result'
      )
    ).resolves.toBe('replacement result');
  });

  test('a swallowed final-status write failure returns included allowance after 24 hours', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-19T12:00:00.000Z') });
    const errorLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { usage } = includedLedger({ failedUpdates: 1 });

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'first result'
      )
    ).resolves.toBe('first result');
    jest.setSystemTime(new Date('2026-08-20T12:00:00.001Z'));
    const replacement = await usage
      .executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'replacement result'
      )
      .catch((error) => error);
    errorLog.mockRestore();

    expect(replacement).toBe('replacement result');
  });

  test('an unread and uncancelled model stream returns included allowance after 24 hours', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-19T12:00:00.000Z') });
    const { records, usage } = includedLedger();
    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(),
      doStream: jest.fn(async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'text-delta', delta: 'unread' });
            controller.close();
          },
        }),
      })),
    });

    await model.doStream({ prompt: [] });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('admitted');
    jest.setSystemTime(new Date('2026-08-20T12:00:00.001Z'));

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'replacement result'
      )
    ).resolves.toBe('replacement result');
  });

  test('the admission transaction bounds its own queue wait and run time', async () => {
    const { transaction, usage } = alwaysFailing('P2034', 'write conflict');

    await usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch(() => undefined);

    for (const [, options] of transaction.mock.calls) {
      expect(options).toEqual({
        isolationLevel: 'Serializable',
        maxWait: 1_000,
        timeout: 2_000,
      });
    }
  });

  test('an exhausted retry budget is a typed retryable admission failure', async () => {
    const { transaction, usage } = alwaysFailing('P2034', 'write conflict');

    const error = await usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch((caught) => caught);

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(usage.pauseBeforeRetry).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ name: 'AiAdmissionContended' });
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_ADMISSION_CONTENDED',
    });
    const message = JSON.stringify(error.getResponse());
    // Nothing internal, and no promise the next attempt will be admitted.
    expect(message).not.toMatch(/P2034|prisma|serializ|transaction/i);
    expect(message).not.toMatch(/shortly|in a moment|will succeed|guarantee/i);
    expect(message).toMatch(/no included allowance was used/i);
  });

  test('a transaction timeout ends on the same retryable admission path', async () => {
    const { transaction, usage } = alwaysFailing(
      'P2028',
      'Transaction already closed'
    );

    const error = await usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch((caught) => caught);

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ name: 'AiAdmissionContended' });
    expect(error.getStatus()).toBe(503);
  });

  test('a failure that is not contention is neither retried nor relabelled', async () => {
    const { transaction, usage } = alwaysFailing('P1001', 'server unreachable');

    const error = await usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch((caught) => caught);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(usage.pauseBeforeRetry).not.toHaveBeenCalled();
    expect(error).toMatchObject({ code: 'P1001' });
  });

  test('each retry is awaited before the next attempt opens a transaction', async () => {
    const releases = [];
    const transaction = jest.fn(async () => {
      throw prismaError('P2034', 'write conflict');
    });
    const usage = loadUsage({
      transaction,
      create: jest.fn(),
      update: jest.fn(),
      config: included,
    });
    usage.pauseBeforeRetry = jest.fn(
      () => new Promise((resolve) => releases.push(resolve))
    );

    const admitting = usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch((caught) => caught);

    await tick();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(releases).toHaveLength(1);

    // Still waiting: the second attempt must not start inside the same window
    // that the first one collided in.
    await tick();
    expect(transaction).toHaveBeenCalledTimes(1);

    releases[0]();
    await tick();
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(releases).toHaveLength(2);

    releases[1]();
    await expect(admitting).resolves.toMatchObject({
      name: 'AiAdmissionContended',
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  test('retry waits are full-jitter and exponential', async () => {
    const random = jest.spyOn(Math, 'random');

    random.mockReturnValue(0);
    const floor = alwaysFailing('P2034', 'write conflict');
    await floor.usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch(() => undefined);

    random.mockReturnValue(0.5);
    const midpoint = alwaysFailing('P2034', 'write conflict');
    await midpoint.usage
      .executeAiOperation('organization-a', 'text_generation', jest.fn())
      .catch(() => undefined);

    // Full jitter draws from [0, window), so the floor is a real zero rather
    // than a fixed head every caller would wake up on together.
    expect(floor.usage.pauseBeforeRetry.mock.calls).toEqual([[0], [0]]);
    expect(midpoint.usage.pauseBeforeRetry.mock.calls).toEqual([
      [12.5],
      [25],
    ]);
    random.mockRestore();
  });

  test('a real retry wait suspends for its drawn delay', async () => {
    const usage = loadUsage({
      transaction: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      config: included,
    });
    const started = Date.now();

    await usage.pauseBeforeRetry(30);

    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  test('zero included quota fails closed before the provider callback', async () => {
    const callback = jest.fn();
    const transaction = jest.fn(async (run) =>
      run({
        subscription: {
          findUnique: async () => ({
            includedAiMonthlyOperations: 0,
            createdAt: new Date(),
          }),
        },
        aiUsageRecord: { count: async () => 0, create: jest.fn() },
      })
    );
    const usage = loadUsage({
      transaction,
      create: jest.fn(),
      update: jest.fn(),
      config: included,
    });

    const error = await usage
      .executeAiOperation('organization-a', 'text_generation', callback)
      .catch((caught) => caught);
    expect(error).toMatchObject({ name: 'AiIncludedQuotaExceeded' });
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_INCLUDED_QUOTA_EXHAUSTED',
    });
    expect(JSON.stringify(error.getResponse())).toMatch(
      /connect a workspace API key/i
    );
    expect(JSON.stringify(error.getResponse())).not.toMatch(
      /wait|refresh|renew|reset/i
    );
    expect(callback).not.toHaveBeenCalled();
    // A settled quota answer is not contention, so it must not be retried.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  test('model construction does not finish admission before generate execution', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-model',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    let completeProvider;
    const providerResult = new Promise((resolve) => {
      completeProvider = resolve;
    });
    const doGenerate = jest.fn(() => providerResult);
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate,
      doStream: jest.fn(),
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();

    const executing = model.doGenerate({ prompt: [] });
    await new Promise((resolve) => setImmediate(resolve));
    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();

    completeProvider({ content: [] });
    await expect(executing).resolves.toEqual({ content: [] });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'usage-model' },
      data: { status: 'succeeded' },
    });
  });

  test('stream admission stays open until the provider stream fails', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-model-stream',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const providerError = new Error('provider stream failed');
    let providerPull = 0;
    const providerStream = new ReadableStream({
      pull(controller) {
        providerPull += 1;
        if (providerPull === 1) {
          controller.enqueue({ type: 'text-delta', delta: 'first' });
          return;
        }
        controller.error(providerError);
      },
    });
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(),
      doStream: jest.fn(async () => ({ stream: providerStream })),
    });

    const result = await model.doStream({ prompt: [] });
    expect(update).not.toHaveBeenCalled();
    const reader = result.stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    expect(update).not.toHaveBeenCalled();
    await expect(reader.read()).rejects.toBe(providerError);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'usage-model-stream' },
      data: { status: 'failed' },
    });
  });

  test('wrapped model stream successful EOF finalizes succeeded exactly once', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-model-stream-eof',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const providerStream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', delta: 'only' });
        controller.close();
      },
    });
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(),
      doStream: jest.fn(async () => ({ stream: providerStream })),
    });

    const result = await model.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-model-stream-eof' },
      data: { status: 'succeeded' },
    });
  });

  test('cancelling after the provider stream ended records the success that happened', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-model-stream-drained',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const sourceCancel = jest.fn(async () => undefined);
    const providerStream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-delta', delta: 'one' });
        controller.enqueue({ type: 'text-delta', delta: 'two' });
        controller.close();
      },
      cancel: sourceCancel,
    });
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(),
      doStream: jest.fn(async () => ({ stream: providerStream })),
    });

    const result = await model.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await expect(reader.read()).resolves.toMatchObject({ done: false });
    // The consumer received every chunk the provider produced and releases the
    // stream instead of issuing the read that would observe `done`.
    await reader.cancel('consumer finished reading');
    await tick();

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-model-stream-drained' },
      data: { status: 'succeeded' },
    });
  });

  test('wrapped model stream cancellation cancels its source and finalizes failed exactly once', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-model-stream-cancel',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    let releaseCancel;
    const sourceCancel = jest.fn(
      () =>
        new Promise((resolve) => {
          releaseCancel = resolve;
        })
    );
    const providerStream = new ReadableStream({
      pull() {
        return new Promise(() => undefined);
      },
      cancel: sourceCancel,
    });
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    const model = usage.wrapModelExecution('organization-a', 'copilot_chat', {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(),
      doStream: jest.fn(async () => ({ stream: providerStream })),
    });

    const result = await model.doStream({ prompt: [] });
    const reader = result.stream.getReader();
    const cancellation = reader.cancel('user stopped reading');
    await new Promise((resolve) => setImmediate(resolve));
    expect(sourceCancel).toHaveBeenCalledWith('user stopped reading');
    releaseCancel();
    await cancellation;
    await new Promise((resolve) => setImmediate(resolve));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-model-stream-cancel' },
      data: { status: 'failed' },
    });
  });

  test('a missing selected credential is a safe endpoint-facing 503', async () => {
    const callback = jest.fn();
    const usage = loadUsage({
      transaction: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      config: { ...included, apiKey: '' },
    });

    const error = await usage
      .executeAiOperation('organization-a', 'text_generation', callback)
      .catch((caught) => caught);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      code: 'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
    });
    expect(callback).not.toHaveBeenCalled();
  });

  test('workspace-key ledger never enters the managed quota transaction', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-workspace',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const transaction = jest.fn();
    const usage = loadUsage({
      transaction,
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    await usage.executeAiOperation(
      'organization-a',
      'image_generation',
      async () => 'image'
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ usageMode: 'workspace_key' }),
    });
  });

  test('a final ledger update failure does not turn provider success into a retryable failure', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-success',
      ...data,
    }));
    const update = jest.fn(async () => {
      throw new Error('database unavailable');
    });
    const errorLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => 'provider result'
      )
    ).resolves.toBe('provider result');
    expect(update).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      'Failed to finalize AI usage record status'
    );
    errorLog.mockRestore();
  });

  test('a final ledger update failure preserves the original provider error', async () => {
    const providerError = new Error('provider failed');
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-failed',
      ...data,
    }));
    const update = jest.fn(async () => {
      throw new Error('database unavailable');
    });
    const errorLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    await expect(
      usage.executeAiOperation(
        'organization-a',
        'text_generation',
        async () => {
          throw providerError;
        }
      )
    ).rejects.toBe(providerError);
    expect(update).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      'Failed to finalize AI usage record status'
    );
    errorLog.mockRestore();
  });

  test('nested consumers share one admitted product operation', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 'usage-root', ...data }));
    const update = jest.fn(async () => ({}));
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    await usage.executeAiOperation('organization-a', 'agent', () =>
      usage.executeAiOperation(
        'organization-a',
        'web_research',
        async () => 'nested result'
      )
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('a copilot model executed after the agent context closes keeps the single agent admission', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: `usage-${create.mock.calls.length}`,
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const providerModel = {
      specificationVersion: 'v2',
      provider: 'openai',
      modelId: 'managed-text',
      supportedUrls: {},
      doGenerate: jest.fn(async () => ({ content: [] })),
      doStream: jest.fn(),
    };
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    let deferredModel;

    await usage.executeAiOperation('organization-a', 'agent', async () => {
      deferredModel = await usage.prepareModelExecution(
        'organization-a',
        'copilot_chat',
        async () => providerModel
      );
      return 'response handler created';
    });
    await expect(deferredModel.doGenerate({ prompt: [] })).resolves.toEqual({
      content: [],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operation: 'agent' }),
    });
  });

  test('an active operation cannot switch tenant context', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 'usage-root', ...data }));
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update: jest.fn(async () => ({})),
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    await expect(
      usage.executeAiOperation('organization-a', 'agent', () =>
        usage.executeAiOperation(
          'organization-b',
          'web_research',
          async () => 'must not run'
        )
      )
    ).rejects.toMatchObject({ name: 'AiTenantContextMismatch' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('a streaming failure closes the privacy-safe ledger as failed', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-stream',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });
    const stream = usage.executeAiStreamOperation(
      'organization-a',
      'agent',
      async function* () {
        yield 'first';
        throw new Error('provider failed');
      }
    );

    await expect(
      (async () => {
        for await (const _item of stream) {
          // Consume the stream so its real failure path executes.
        }
      })()
    ).rejects.toThrow('provider failed');
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'usage-stream' },
      data: { status: 'failed' },
    });
  });

  test('breaking generic stream consumption closes its source and finalizes failed once', async () => {
    const create = jest.fn(async ({ data }) => ({
      id: 'usage-stream-break',
      ...data,
    }));
    const update = jest.fn(async () => ({}));
    let sourceFinalized = 0;
    async function* providerEvents() {
      try {
        yield 'first';
        yield 'must not continue';
      } finally {
        sourceFinalized += 1;
      }
    }
    const usage = loadUsage({
      transaction: jest.fn(),
      create,
      update,
      config: { ...included, usageMode: 'workspace_key', apiKey: 'workspace' },
    });

    for await (const item of usage.executeAiStreamOperation(
      'organization-a',
      'agent',
      () => providerEvents()
    )) {
      expect(item).toBe('first');
      break;
    }

    expect(sourceFinalized).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'usage-stream-break' },
      data: { status: 'failed' },
    });
  });
});

/**
 * `content-factory-next-saas.2.1`, step 3. The ledger used to carry an
 * organization and nothing else, so «who spent this» had no answer — not a
 * limit that could not be enforced, an amount that could not be shown.
 */
describe('who the operation is recorded against', () => {
  const workspaceKey = {
    ...included,
    usageMode: 'workspace_key',
    apiKey: 'workspace',
  };

  const ledger = () => {
    const create = jest.fn(async ({ data }) => ({ id: 'usage-1', ...data }));
    const update = jest.fn(async () => ({}));
    return {
      create,
      usage: loadUsage({
        transaction: jest.fn(),
        create,
        update,
        config: workspaceKey,
      }),
    };
  };

  test('an operation asked for by a member carries that member', async () => {
    const { create, usage } = ledger();

    await asMember('user-7', () =>
      usage.executeAiOperation('organization-a', 'text_generation', async () => 'ok')
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'organization-a',
        userId: 'user-7',
      }),
    });
  });

  test('a stream is recorded against the member who opened it', async () => {
    const { create, usage } = ledger();

    async function* provider() {
      yield 'chunk';
    }

    await asMember('user-9', async () => {
      for await (const item of usage.executeAiStreamOperation(
        'organization-a',
        'agent',
        () => provider()
      )) {
        expect(item).toBe('chunk');
      }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-9' }),
    });
  });

  /**
   * Scheduled autoposting and anything reached through the organization's API
   * key run with no session. Null says so; blaming whoever configured the
   * schedule would be worse than saying nothing.
   */
  test('work with nobody behind it is recorded against nobody', async () => {
    const { create, usage } = ledger();

    await usage.executeAiOperation('organization-a', 'autopost', async () => 'ok');

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: null }),
    });
  });

  /**
   * An included-mode admission is created inside a serializable transaction,
   * a different code path from the workspace-key insert above.
   */
  test('an included-quota admission carries the member too', async () => {
    const { usage, records } = includedLedger({ quota: 5 });

    await asMember('user-4', () =>
      usage.executeAiOperation('organization-a', 'text_generation', async () => 'ok')
    );

    expect(records.at(-1)).toMatchObject({ userId: 'user-4' });
  });
});
