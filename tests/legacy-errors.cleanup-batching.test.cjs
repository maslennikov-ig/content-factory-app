const path = require('node:path');

const cleanupScript = path.resolve(
  __dirname,
  '..',
  'scripts/operations/cleanup-legacy-errors.cjs'
);

const NOW = new Date('2026-08-18T12:00:00.000Z');
const EXPIRED_AT = new Date('2026-01-01T00:00:00.000Z');
const SURVIVING_AT = new Date('2026-08-01T00:00:00.000Z');
const UNKNOWN_MESSAGE = '{"message":"Unknown Error"}';
const KNOWN_MESSAGE = '{"message":"Publishing failed"}';

// A minimal Prisma selector evaluator. It deliberately throws on any operator
// the cleanup script does not already emit, so the fake cannot silently drift
// away from the query it is standing in for.
function fieldMatches(value, condition) {
  if (
    condition === null ||
    typeof condition !== 'object' ||
    condition instanceof Date
  ) {
    return value === condition;
  }

  return Object.entries(condition).every(([operator, operand]) => {
    switch (operator) {
      case 'mode':
        return true;
      case 'lt':
        return value < operand;
      case 'gte':
        return value >= operand;
      case 'not':
        return value !== operand;
      case 'in':
        return operand.includes(value);
      case 'notIn':
        return !operand.includes(value);
      case 'contains': {
        const haystack =
          condition.mode === 'insensitive' ? String(value).toLowerCase() : String(value);
        const needle =
          condition.mode === 'insensitive' ? String(operand).toLowerCase() : String(operand);
        return haystack.includes(needle);
      }
      default:
        throw new Error(`unsupported selector operator: ${operator}`);
    }
  });
}

function matches(row, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return condition.every((each) => matches(row, each));
    if (key === 'OR') return condition.some((each) => matches(row, each));
    if (key === 'NOT') return !matches(row, condition);
    return fieldMatches(row[key], condition);
  });
}

function createStore(rows, options = {}) {
  const table = new Map(rows.map((row) => [row.id, { ...row }]));
  const mutations = [];
  let mutationCount = 0;

  const select = (where) =>
    [...table.values()]
      .filter((row) => matches(row, where))
      .sort((left, right) => (left.id < right.id ? -1 : 1));

  const beginMutation = (kind, size) => {
    mutationCount += 1;
    if (options.failAfterMutations === mutationCount - 1 && !options.failed) {
      options.failed = true;
      throw new Error('connection reset mid-run');
    }
    mutations.push({ kind, size });
  };

  return {
    mutations,
    snapshot: () => select({}),
    client: {
      errors: {
        count: async ({ where }) => select(where).length,
        findMany: async ({ where, take }) =>
          select(where)
            .slice(0, take)
            .map(({ id }) => ({ id })),
        deleteMany: async ({ where }) => {
          const doomed = select(where);
          beginMutation('delete', doomed.length);
          for (const row of doomed) table.delete(row.id);
          return { count: doomed.length };
        },
        updateMany: async ({ where, data }) => {
          // A poison row matches the selector but cannot be written: it stands
          // in for a row another writer keeps touching, or one the update
          // silently fails to advance.
          const targets = select(where).filter(
            (row) => !(options.poison || []).includes(row.id)
          );
          beginMutation('update', targets.length);
          for (const row of targets) Object.assign(table.get(row.id), data);
          return { count: targets.length };
        },
      },
      $transaction: () => {
        throw new Error(
          'the whole backlog must not run inside a single transaction'
        );
      },
    },
  };
}

function backlog(size) {
  const rows = [];
  const pad = (index) => String(index).padStart(5, '0');

  for (let index = 0; index < size; index += 1) {
    const id = `row-${pad(index)}`;
    switch (index % 4) {
      case 0:
        // Past retention: must be deleted whatever it contains.
        rows.push({
          id,
          createdAt: EXPIRED_AT,
          message: 'Unknown Error: token=abc',
          body: '{"content":"draft"}',
        });
        break;
      case 1:
        // Surviving, unknown-classified, not yet minimized.
        rows.push({
          id,
          createdAt: SURVIVING_AT,
          message: 'An unknown error occurred while publishing',
          body: '{"accessToken":"secret"}',
        });
        break;
      case 2:
        // Surviving, known-classified, not yet minimized.
        rows.push({
          id,
          createdAt: SURVIVING_AT,
          message: 'Provider rejected the media',
          body: '{"content":"draft"}',
        });
        break;
      default:
        // Already minimized: a correct run must leave these untouched.
        rows.push({
          id,
          createdAt: SURVIVING_AT,
          message: index % 8 === 3 ? UNKNOWN_MESSAGE : KNOWN_MESSAGE,
          body: '{}',
        });
    }
  }

  return rows;
}

describe('legacy error cleanup batching', () => {
  test('walks the backlog in bounded statements instead of one transaction', async () => {
    const { cleanupLegacyErrors } = require(cleanupScript);
    const store = createStore(backlog(1000));

    const outcome = await cleanupLegacyErrors(store.client, {
      apply: true,
      now: NOW,
      batchSize: 40,
    });

    expect(outcome).toMatchObject({
      mode: 'apply',
      batchSize: 40,
      deleted: 250,
      normalizedUnknown: 250,
      normalizedKnown: 250,
      verification: { expired: 0, unsafeUnknown: 0, unsafeKnown: 0 },
    });

    // The point of the fix: no statement is allowed to grow with the backlog.
    expect(store.mutations.length).toBeGreaterThan(3);
    for (const mutation of store.mutations) {
      expect(mutation.size).toBeLessThanOrEqual(40);
    }

    // Already-minimized survivors are never rewritten.
    const rewritten = store.mutations.reduce(
      (total, mutation) => total + mutation.size,
      0
    );
    expect(rewritten).toBe(750);

    const remaining = store.snapshot();
    expect(remaining).toHaveLength(750);
    for (const row of remaining) {
      expect(row.body).toBe('{}');
      expect([UNKNOWN_MESSAGE, KNOWN_MESSAGE]).toContain(row.message);
      expect(row.createdAt).toBe(SURVIVING_AT);
    }
  });

  test('a batch size larger than the backlog still bounds each statement', async () => {
    const { cleanupLegacyErrors } = require(cleanupScript);
    const store = createStore(backlog(20));

    await cleanupLegacyErrors(store.client, {
      apply: true,
      now: NOW,
      batchSize: 500,
    });

    for (const mutation of store.mutations) {
      expect(mutation.size).toBeLessThanOrEqual(500);
    }
    expect(store.snapshot()).toHaveLength(15);
  });

  test('dry-run reports exactly the set an apply run acts on', async () => {
    const { cleanupLegacyErrors } = require(cleanupScript);
    const rows = backlog(400);

    const inspected = await cleanupLegacyErrors(createStore(rows).client, {
      now: NOW,
    });
    const applied = await cleanupLegacyErrors(createStore(rows).client, {
      apply: true,
      now: NOW,
      batchSize: 17,
    });

    expect(inspected.mode).toBe('dry-run');
    expect(inspected.before).toBe(applied.before);
    expect({
      expired: applied.deleted,
      unsafeUnknown: applied.normalizedUnknown,
      unsafeKnown: applied.normalizedKnown,
    }).toEqual({
      expired: inspected.expired,
      unsafeUnknown: inspected.unsafeUnknown,
      unsafeKnown: inspected.unsafeKnown,
    });
  });

  test('an interrupted run resumes without acting on more or fewer rows', async () => {
    const { cleanupLegacyErrors } = require(cleanupScript);
    const rows = backlog(400);

    const uninterrupted = createStore(rows);
    const whole = await cleanupLegacyErrors(uninterrupted.client, {
      apply: true,
      now: NOW,
      batchSize: 25,
    });

    const interrupted = createStore(rows, { failAfterMutations: 6 });
    await expect(
      cleanupLegacyErrors(interrupted.client, {
        apply: true,
        now: NOW,
        batchSize: 25,
      })
    ).rejects.toThrow('connection reset mid-run');

    const partial = interrupted.mutations.reduce(
      (total, mutation) => total + mutation.size,
      0
    );
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(300);

    const resumed = await cleanupLegacyErrors(interrupted.client, {
      apply: true,
      now: NOW,
      batchSize: 25,
    });

    // Resuming picks up exactly the remainder: the two runs together act on
    // the same rows a single run would, and land on the same final table.
    expect(partial + resumed.deleted + resumed.normalizedUnknown + resumed.normalizedKnown).toBe(
      whole.deleted + whole.normalizedUnknown + whole.normalizedKnown
    );
    expect(resumed.verification).toEqual({
      expired: 0,
      unsafeUnknown: 0,
      unsafeKnown: 0,
    });
    expect(interrupted.snapshot()).toEqual(uninterrupted.snapshot());
  });

  test('a poison row is set aside and reported, never retried forever', async () => {
    const { cleanupLegacyErrors } = require(cleanupScript);
    const rows = backlog(200);
    // Two rows that will keep matching the unknown selector after every write.
    const poison = ['row-00001', 'row-00005'];
    const store = createStore(rows, { poison });

    const outcome = await cleanupLegacyErrors(store.client, {
      apply: true,
      now: NOW,
      batchSize: 10,
    });

    // The rest of the backlog still completes: one stuck row must not hold up
    // the other forty-eight unknown rows, the known rows or the deletions.
    expect(outcome.deleted).toBe(50);
    expect(outcome.normalizedUnknown).toBe(48);
    expect(outcome.normalizedKnown).toBe(50);

    // And the remainder is surfaced rather than silently retried. `main()`
    // turns a non-zero verification into a non-zero exit.
    expect(outcome.stalled).toEqual({
      expired: 0,
      unsafeUnknown: poison.length,
      unsafeKnown: 0,
    });
    expect(outcome.verification).toEqual({
      expired: 0,
      unsafeUnknown: poison.length,
      unsafeKnown: 0,
    });

    const survivors = store.snapshot().filter((row) => poison.includes(row.id));
    expect(survivors).toHaveLength(poison.length);
    for (const row of survivors) {
      expect(row.message).toBe('An unknown error occurred while publishing');
    }
  });

  test('rejects a batch size that would defeat the bound', async () => {
    const { cleanupLegacyErrors, CLEANUP_BATCH_SIZE } = require(cleanupScript);
    expect(CLEANUP_BATCH_SIZE).toBeGreaterThan(0);

    for (const batchSize of [0, -1, 1.5, Number.NaN]) {
      await expect(
        cleanupLegacyErrors(createStore([]).client, {
          apply: true,
          now: NOW,
          batchSize,
        })
      ).rejects.toThrow('batchSize must be a positive integer');
    }
  });
});
