const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

function loadCleanup() {
  return require(path.join(
    repositoryRoot,
    'scripts/operations/cleanup-saas-retention.cjs'
  ));
}

const PRODUCTION_ENVIRONMENT = {
  DATABASE_URL:
    'postgresql://retention-user:retention-password@db.example.internal:6432/content-factory?schema=public',
  CF_SAAS_RETENTION_TARGET: 'db.example.internal:6432/content-factory',
};

describe('SaaS raw telemetry retention', () => {
  test('the operator CLI keeps the 90-day policy fixed', () => {
    const { assertApplyConfirmation, parseCleanupArguments } = loadCleanup();

    expect(parseCleanupArguments([])).toEqual({ apply: false });
    expect(parseCleanupArguments(['--apply'])).toEqual({ apply: true });
    expect(() => parseCleanupArguments(['--retention-days=89'])).toThrow(
      'Unknown argument: --retention-days=89'
    );
    expect(() => assertApplyConfirmation(true, {})).toThrow(
      'Apply requires CF_CONFIRM_SAAS_RETENTION=apply'
    );
    expect(() =>
      assertApplyConfirmation(true, { CF_CONFIRM_SAAS_RETENTION: 'apply' })
    ).not.toThrow();
    expect(() => assertApplyConfirmation(false, {})).not.toThrow();
  });

  test('defaults to a non-mutating 90-day dry-run for raw rows only', async () => {
    const { cleanupSaasRetention, SAAS_RAW_RETENTION_DAYS } = loadCleanup();
    const mutations = [];
    const countQueries = [];
    const client = {
      publicGrowthTrustedEvent: {
        count: async (query) => {
          countQueries.push(['growth', query]);
          return 3;
        },
        deleteMany: async (query) => mutations.push(['growth', query]),
      },
      aiUsageRecord: {
        count: async (query) => {
          countQueries.push(['ai', query]);
          return 4;
        },
        deleteMany: async (query) => mutations.push(['ai', query]),
      },
      publicGrowthDaily: {
        count: async () => {
          throw new Error('daily aggregates are outside raw retention');
        },
        deleteMany: async () => mutations.push(['daily']),
      },
    };

    const result = await cleanupSaasRetention(client, {
      now: new Date('2026-08-19T12:00:00.000Z'),
      environment: { DATABASE_URL: PRODUCTION_ENVIRONMENT.DATABASE_URL },
    });

    expect(SAAS_RAW_RETENTION_DAYS).toBe(90);
    expect(result).toEqual({
      mode: 'dry-run',
      retentionDays: 90,
      before: '2026-05-21T12:00:00.000Z',
      target: 'db.example.internal:6432/content-factory',
      publicGrowthTrustedEvents: 3,
      aiUsageRecords: 4,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /retention-user|retention-password/
    );
    expect(countQueries).toEqual([
      [
        'growth',
        { where: { createdAt: { lt: new Date('2026-05-21T12:00:00.000Z') } } },
      ],
      [
        'ai',
        { where: { createdAt: { lt: new Date('2026-05-21T12:00:00.000Z') } } },
      ],
    ]);
    expect(mutations).toEqual([]);
  });

  test('apply deletes both raw models in one transaction and retains the cutoff boundary', async () => {
    const { cleanupSaasRetention } = loadCleanup();
    const mutations = [];
    let transactionCalls = 0;
    const counts = [0, 0];
    const transaction = {
      publicGrowthTrustedEvent: {
        deleteMany: async (query) => {
          mutations.push(['growth', query]);
          return { count: 3 };
        },
      },
      aiUsageRecord: {
        deleteMany: async (query) => {
          mutations.push(['ai', query]);
          return { count: 4 };
        },
      },
    };
    const client = {
      publicGrowthTrustedEvent: { count: async () => counts.shift() },
      aiUsageRecord: { count: async () => counts.shift() },
      $transaction: async (operation) => {
        transactionCalls += 1;
        return operation(transaction);
      },
    };

    const result = await cleanupSaasRetention(client, {
      apply: true,
      now: new Date('2026-08-19T12:00:00.000Z'),
      environment: PRODUCTION_ENVIRONMENT,
    });

    expect(transactionCalls).toBe(1);
    expect(mutations).toEqual([
      [
        'growth',
        { where: { createdAt: { lt: new Date('2026-05-21T12:00:00.000Z') } } },
      ],
      [
        'ai',
        { where: { createdAt: { lt: new Date('2026-05-21T12:00:00.000Z') } } },
      ],
    ]);
    expect(result).toEqual({
      mode: 'apply',
      retentionDays: 90,
      before: '2026-05-21T12:00:00.000Z',
      target: 'db.example.internal:6432/content-factory',
      deletedPublicGrowthTrustedEvents: 3,
      deletedAiUsageRecords: 4,
      verification: {
        publicGrowthTrustedEvents: 0,
        aiUsageRecords: 0,
      },
    });
  });

  test('propagates an apply failure so the transaction can roll back', async () => {
    const { cleanupSaasRetention } = loadCleanup();
    let inspected = false;
    const client = {
      publicGrowthTrustedEvent: {
        count: async () => {
          inspected = true;
          return 0;
        },
      },
      aiUsageRecord: { count: async () => 0 },
      $transaction: async (operation) =>
        operation({
          publicGrowthTrustedEvent: {
            deleteMany: async () => ({ count: 3 }),
          },
          aiUsageRecord: {
            deleteMany: async () => {
              throw new Error('AI retention unavailable');
            },
          },
        }),
    };

    await expect(
      cleanupSaasRetention(client, {
        apply: true,
        now: new Date('2026-08-19T12:00:00.000Z'),
        environment: PRODUCTION_ENVIRONMENT,
      })
    ).rejects.toThrow('AI retention unavailable');
    expect(inspected).toBe(false);
  });
});

// A run against the wrong instance is not recoverable from this script, and
// `CF_CONFIRM_SAAS_RETENTION` only proves the operator meant to delete
// something — not where. These cover the second barrier: the operator names the
// instance they believe they are on, and the script refuses unless the resolved
// `DATABASE_URL` target is that same instance.
describe('SaaS retention apply target', () => {
  function refusingClient() {
    const refuse = (label) => () => {
      throw new Error(`${label} must not run against an unconfirmed target`);
    };
    return {
      publicGrowthTrustedEvent: {
        count: refuse('count'),
        deleteMany: refuse('deleteMany'),
      },
      aiUsageRecord: {
        count: refuse('count'),
        deleteMany: refuse('deleteMany'),
      },
      $transaction: refuse('$transaction'),
    };
  }

  async function applyWith(environment) {
    const { cleanupSaasRetention } = loadCleanup();
    return cleanupSaasRetention(refusingClient(), {
      apply: true,
      now: new Date('2026-08-19T12:00:00.000Z'),
      environment,
    });
  }

  test('describes a connection by host, port and database only', () => {
    const { resolveDatabaseTarget } = loadCleanup();

    expect(
      resolveDatabaseTarget({
        DATABASE_URL: PRODUCTION_ENVIRONMENT.DATABASE_URL,
      })
    ).toBe('db.example.internal:6432/content-factory');
    expect(
      resolveDatabaseTarget({
        DATABASE_URL: 'postgresql://user:pw@localhost/cf-dev-db',
      })
    ).toBe('localhost:5432/cf-dev-db');
    expect(
      resolveDatabaseTarget({
        DATABASE_URL: 'postgres:///content-factory?host=/var/run/postgresql',
      })
    ).toBe('/var/run/postgresql:5432/content-factory');
    expect(resolveDatabaseTarget({})).toBeNull();
  });

  test.each([
    ['not-a-url', 'DATABASE_URL is not a valid connection URL'],
    [
      'mysql://user:pw@host:3306/db',
      'DATABASE_URL is not a PostgreSQL connection URL',
    ],
    ['postgresql://user:pw@host:5432/', 'DATABASE_URL names no database'],
    ['postgresql:///content-factory', 'DATABASE_URL names no host'],
  ])(
    'refuses to describe an unusable connection string: %s',
    (databaseUrl, message) => {
      const { resolveDatabaseTarget } = loadCleanup();

      expect(() =>
        resolveDatabaseTarget({ DATABASE_URL: databaseUrl })
      ).toThrow(message);
    }
  );

  test('refuses to apply when no expected target is named', async () => {
    await expect(
      applyWith({ DATABASE_URL: PRODUCTION_ENVIRONMENT.DATABASE_URL })
    ).rejects.toThrow(
      'Apply requires CF_SAAS_RETENTION_TARGET to name the expected database; DATABASE_URL resolves to "db.example.internal:6432/content-factory"'
    );
  });

  test('refuses to apply when DATABASE_URL is absent', async () => {
    await expect(
      applyWith({
        CF_SAAS_RETENTION_TARGET: 'db.example.internal:6432/content-factory',
      })
    ).rejects.toThrow(
      'Apply requires DATABASE_URL to name the target database'
    );
  });

  test.each([
    [
      'a different host',
      'postgresql://u:p@staging.example.internal:6432/content-factory',
    ],
    [
      'a different port',
      'postgresql://u:p@db.example.internal:5432/content-factory',
    ],
    [
      'a different database',
      'postgresql://u:p@db.example.internal:6432/content-factory-staging',
    ],
  ])(
    'refuses to apply against %s than the operator named',
    async (_case, databaseUrl) => {
      const promise = applyWith({
        DATABASE_URL: databaseUrl,
        CF_SAAS_RETENTION_TARGET:
          PRODUCTION_ENVIRONMENT.CF_SAAS_RETENTION_TARGET,
      });

      await expect(promise).rejects.toThrow('Apply target mismatch');
      await expect(promise).rejects.toThrow(
        'CF_SAAS_RETENTION_TARGET expects "db.example.internal:6432/content-factory"'
      );
    }
  );

  test('keeps credentials out of the refusal an operator pastes into a ticket', async () => {
    const error = await applyWith({
      DATABASE_URL:
        'postgresql://retention-user:retention-password@staging.example.internal:6432/content-factory',
      CF_SAAS_RETENTION_TARGET: PRODUCTION_ENVIRONMENT.CF_SAAS_RETENTION_TARGET,
    }).catch((thrown) => thrown);

    expect(error.message).toContain(
      'staging.example.internal:6432/content-factory'
    );
    expect(error.message).not.toMatch(/retention-user|retention-password/);
  });

  test('leaves the dry-run usable without naming a target', async () => {
    const { cleanupSaasRetention } = loadCleanup();
    const client = {
      publicGrowthTrustedEvent: { count: async () => 1 },
      aiUsageRecord: { count: async () => 2 },
      publicGrowthDaily: {
        count: async () => {
          throw new Error('daily aggregates are outside raw retention');
        },
      },
    };

    await expect(
      cleanupSaasRetention(client, {
        now: new Date('2026-08-19T12:00:00.000Z'),
        environment: {},
      })
    ).resolves.toMatchObject({ mode: 'dry-run', target: null });
  });
});

// The daily delete filters on `createdAt` alone across the whole table. Both
// composite indexes on `AiUsageRecord` lead with `organizationId`, so neither
// can serve that predicate; without a leading `createdAt` index the delete
// scans the table sequentially inside the transaction.
describe('raw telemetry retention indexes', () => {
  const schema = fs.readFileSync(
    path.join(
      repositoryRoot,
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );
  const modelOf = (name) =>
    schema.match(new RegExp(`model ${name}\\s*{([\\s\\S]*?)\\n}`))?.[1] || '';

  test.each(['PublicGrowthTrustedEvent', 'AiUsageRecord'])(
    'the retention predicate on %s is served by a leading createdAt index',
    (model) => {
      expect(modelOf(model)).toContain('@@index([createdAt])');
    }
  );
});
