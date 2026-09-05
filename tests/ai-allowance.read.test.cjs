'use strict';

/**
 * `content-factory-next-fn33.28.3`: reading what is left of the AI allowance.
 *
 * The reading side only. Nothing here admits an operation or writes a row, and
 * that is the point: the screen asks this before every paid button, so it must
 * be cheap and it must not touch the ledger.
 *
 * Two claims matter beyond the arithmetic. The count uses the same predicate
 * admission uses, so what a person is shown is what the next click will meet.
 * And the organisation is the caller's own: named in the `where`, and refused
 * outright when an operation for another workspace is in flight.
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const active = new AsyncLocalStorage();

const loadUsage = ({ config, subscription, organization, count }) => {
  const counts = [];
  const loaded = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
      },
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaService: class {},
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        AiProviderNotConfigured: class extends Error {},
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
        getActingUserId: () => undefined,
      },
    }
  );

  const service = new loaded.AiUsageService({
    subscription: { findUnique: async () => subscription ?? null },
    organization: { findUnique: async () => organization ?? null },
    aiUsageRecord: {
      count: async (query) => {
        counts.push(query);
        return count ?? 0;
      },
    },
  });

  return { service, counts, module: loaded };
};

/**
 * `apiKey` здесь не украшение: с `content-factory-next-fn33.28.9` дверь сначала
 * отвечает на вопрос «а есть ли чем позвать модель», и пустой ключ — это
 * `unavailable`, а не нулевой остаток. Оба рабочих режима ключ несут.
 */
const includedConfig = {
  usageMode: 'included',
  provider: 'openai',
  apiKey: 'operator-key',
};
const workspaceConfig = {
  usageMode: 'workspace_key',
  provider: 'openai',
  apiKey: 'workspace-key',
};

describe('reading the AI allowance', () => {
  test('an included allowance answers with what is used, the ceiling and the reset', async () => {
    const { service, counts } = loadUsage({
      config: includedConfig,
      subscription: {
        includedAiMonthlyOperations: 10,
        createdAt: new Date('2026-01-04T09:00:00.000Z'),
      },
      count: 3,
    });

    const allowance = await service.readAllowance('organization-a');

    expect(allowance).toEqual({
      mode: 'included',
      used: 3,
      limit: 10,
      remaining: 7,
      resetsAt: expect.any(String),
    });
    expect(counts).toHaveLength(1);
    expect(counts[0].where).toEqual(
      expect.objectContaining({
        organizationId: 'organization-a',
        usageMode: 'included',
      })
    );
  });

  test('the count is the one admission uses, including the stale-admission window', async () => {
    const { service, counts } = loadUsage({
      config: includedConfig,
      subscription: {
        includedAiMonthlyOperations: 10,
        createdAt: new Date('2026-01-04T09:00:00.000Z'),
      },
      count: 1,
    });

    await service.readAllowance('organization-a');

    expect(counts[0].where.OR).toEqual([
      { status: { not: 'admitted' } },
      { createdAt: { gte: expect.any(Date) } },
    ]);
  });

  test('a workspace key is answered in words, with no ledger read at all', async () => {
    const { service, counts } = loadUsage({
      config: workspaceConfig,
      subscription: {
        includedAiMonthlyOperations: 10,
        createdAt: new Date('2026-01-04T09:00:00.000Z'),
      },
      count: 3,
    });

    expect(await service.readAllowance('organization-a')).toEqual({
      mode: 'workspace_key',
    });
    expect(counts).toEqual([]);
  });

  test('no key at all is said in words, not counted as a spent allowance', async () => {
    // Свежее пространство: режим включённый, ключа у оператора нет. До
    // `content-factory-next-fn33.28.9` это отвечало нулями, и подсказка читала
    // их как «лимит исчерпан» человеку, который ничего не потратил.
    const { service, counts } = loadUsage({
      config: { usageMode: 'included', provider: 'openai', apiKey: '' },
      subscription: null,
      organization: { createdAt: new Date('2026-02-15T00:00:00.000Z') },
      count: 0,
    });

    expect(await service.readAllowance('organization-a')).toEqual({
      mode: 'unavailable',
    });
    // Считать нечего, поэтому в книгу учёта дверь не ходит вовсе.
    expect(counts).toEqual([]);
  });

  test('a workspace whose administrator never saved a key is unavailable too', async () => {
    const { service } = loadUsage({
      config: { usageMode: 'workspace_key', provider: 'openai', apiKey: '' },
      subscription: null,
      organization: { createdAt: new Date('2026-02-15T00:00:00.000Z') },
    });

    expect(await service.readAllowance('organization-a')).toEqual({
      mode: 'unavailable',
    });
  });

  test('no subscription is an honest zero, not an invented allowance', async () => {
    const { service, counts } = loadUsage({
      config: includedConfig,
      subscription: null,
      organization: { createdAt: new Date('2026-02-15T00:00:00.000Z') },
      count: 4,
    });

    expect(await service.readAllowance('organization-a')).toEqual(
      expect.objectContaining({ limit: 0, used: 0, remaining: 0 })
    );
    expect(counts).toEqual([]);
  });

  test('another workspace cannot be read from inside one workspace’s operation', async () => {
    const { service } = loadUsage({
      config: includedConfig,
      subscription: {
        includedAiMonthlyOperations: 10,
        createdAt: new Date('2026-01-04T09:00:00.000Z'),
      },
      count: 0,
    });

    await active.run(
      { organizationId: 'organization-a', config: includedConfig },
      async () => {
        await expect(service.readAllowance('organization-b')).rejects.toThrow(
          'An AI operation cannot cross organizations.'
        );
      }
    );
  });

  test('the reset date is the next period start, month lengths included', () => {
    const { module } = loadUsage({ config: includedConfig });
    const anchor = new Date('2026-01-31T09:00:00.000Z');

    // February is 28 days long and the anchor is the 31st: the period that
    // holds 10 February ends on the 28th, not on a date February does not have.
    expect(
      module
        .aiBillingPeriodEnd(anchor, new Date('2026-02-10T00:00:00.000Z'))
        .toISOString()
    ).toBe('2026-02-28T09:00:00.000Z');
    expect(
      module
        .aiBillingPeriodEnd(anchor, new Date('2026-03-01T00:00:00.000Z'))
        .toISOString()
    ).toBe('2026-03-31T09:00:00.000Z');
  });
});
