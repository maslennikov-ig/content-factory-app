#!/usr/bin/env node

const LEGACY_ERROR_RETENTION_DAYS = 90;
const CLEANUP_BATCH_SIZE = 500;
const UNKNOWN_MESSAGE = '{"message":"Unknown Error"}';
const KNOWN_MESSAGE = '{"message":"Publishing failed"}';
const EMPTY_BODY = '{}';

function cleanupWhere(before) {
  const survivor = { createdAt: { gte: before } };
  // Must stay identical to `unknownErrorMessageWhere()` in
  // libraries/nestjs-libraries/.../errors/error-ledger.payload.ts. This is a
  // CommonJS operations script and cannot import the TypeScript helper;
  // tests/legacy-errors.retention.test.cjs holds the two to the same shape.
  const unknown = {
    message: { contains: 'Unknown Error', mode: 'insensitive' },
  };
  const unsafe = (safeMessage) => ({
    OR: [{ message: { not: safeMessage } }, { body: { not: EMPTY_BODY } }],
  });

  return {
    expired: { createdAt: { lt: before } },
    unsafeUnknown: { AND: [survivor, unknown, unsafe(UNKNOWN_MESSAGE)] },
    unsafeKnown: {
      AND: [survivor, { NOT: unknown }, unsafe(KNOWN_MESSAGE)],
    },
  };
}

/**
 * Walk one selector in bounded steps.
 *
 * A backlog of legacy Errors can be large, and `$transaction([...])` holds a
 * single database transaction open for the whole run: no statement timeout
 * applies to the batch form (`maxWait`/`timeout` are interactive-transaction
 * options only), so the work either completes or rolls back entirely after
 * holding row locks for its full duration.
 *
 * Each step here is instead its own bounded statement. Because every mutation
 * re-applies the same selector it was chosen by, and because a mutated row
 * stops matching that selector, the walk converges and an interrupted run
 * leaves exactly the untouched remainder for the next one: no row is acted on
 * twice, and the only rows left behind are the stalled ones the report names.
 */
async function walkInBatches(client, where, batchSize, mutate) {
  const stalled = [];
  let total = 0;

  for (;;) {
    const scoped = stalled.length
      ? { AND: [where, { id: { notIn: stalled } }] }
      : where;
    const rows = await client.errors.findMany({
      where: scoped,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!rows.length) {
      return { count: total, stalled: stalled.length };
    }

    const ids = rows.map((row) => row.id);
    const { count } = await mutate({ AND: [where, { id: { in: ids } }] });
    total += count;

    if (count === 0) {
      // Nothing in this page could be advanced — a row that keeps matching the
      // selector after being written to is poison. Set the page aside so one
      // such row cannot stop the rest of the backlog, and let the post-run
      // verification report the remainder instead of retrying it forever.
      stalled.push(...ids);
    }
  }
}

async function inspect(client, where) {
  const [expired, unsafeUnknown, unsafeKnown] = await Promise.all([
    client.errors.count({ where: where.expired }),
    client.errors.count({ where: where.unsafeUnknown }),
    client.errors.count({ where: where.unsafeKnown }),
  ]);
  return { expired, unsafeUnknown, unsafeKnown };
}

async function cleanupLegacyErrors(client, options = {}) {
  const apply = options.apply === true;
  const retentionDays = Number(
    options.retentionDays ?? LEGACY_ERROR_RETENTION_DAYS
  );
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new Error('retentionDays must be a positive integer');
  }

  const batchSize = Number(options.batchSize ?? CLEANUP_BATCH_SIZE);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize must be a positive integer');
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('now must be a valid date');
  }
  const before = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000
  );
  const where = cleanupWhere(before);

  if (!apply) {
    return {
      mode: 'dry-run',
      retentionDays,
      before: before.toISOString(),
      ...(await inspect(client, where)),
    };
  }

  // Expired rows go first: a row deleted for age never needs normalizing.
  const deleted = await walkInBatches(
    client,
    where.expired,
    batchSize,
    (scoped) => client.errors.deleteMany({ where: scoped })
  );
  const normalizedUnknown = await walkInBatches(
    client,
    where.unsafeUnknown,
    batchSize,
    (scoped) =>
      client.errors.updateMany({
        where: scoped,
        data: { message: UNKNOWN_MESSAGE, body: EMPTY_BODY },
      })
  );
  const normalizedKnown = await walkInBatches(
    client,
    where.unsafeKnown,
    batchSize,
    (scoped) =>
      client.errors.updateMany({
        where: scoped,
        data: { message: KNOWN_MESSAGE, body: EMPTY_BODY },
      })
  );

  return {
    mode: 'apply',
    retentionDays,
    before: before.toISOString(),
    batchSize,
    deleted: deleted.count,
    normalizedUnknown: normalizedUnknown.count,
    normalizedKnown: normalizedKnown.count,
    stalled: {
      expired: deleted.stalled,
      unsafeUnknown: normalizedUnknown.stalled,
      unsafeKnown: normalizedKnown.stalled,
    },
    verification: await inspect(client, where),
  };
}

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const retentionArgument = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--retention-days='));
  const retentionDays = retentionArgument
    ? Number(retentionArgument.split('=', 2)[1])
    : LEGACY_ERROR_RETENTION_DAYS;
  const batchArgument = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--batch-size='));
  const batchSize = batchArgument
    ? Number(batchArgument.split('=', 2)[1])
    : CLEANUP_BATCH_SIZE;
  const knownArguments = new Set([
    '--apply',
    ...(retentionArgument ? [retentionArgument] : []),
    ...(batchArgument ? [batchArgument] : []),
  ]);
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => !knownArguments.has(argument));
  if (unknownArguments.length) {
    throw new Error(`Unknown argument: ${unknownArguments[0]}`);
  }
  if (
    apply &&
    process.env.CF_CONFIRM_LEGACY_ERRORS_CLEANUP !== 'apply'
  ) {
    throw new Error(
      'Apply requires CF_CONFIRM_LEGACY_ERRORS_CLEANUP=apply'
    );
  }

  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient();
  try {
    const report = await cleanupLegacyErrors(client, {
      apply,
      retentionDays,
      batchSize,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (
      apply &&
      Object.values(report.verification).some((count) => count !== 0)
    ) {
      throw new Error('Post-apply verification found remaining work');
    }
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Legacy Errors cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  LEGACY_ERROR_RETENTION_DAYS,
  CLEANUP_BATCH_SIZE,
  cleanupLegacyErrors,
};
