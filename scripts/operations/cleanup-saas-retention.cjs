#!/usr/bin/env node

const SAAS_RAW_RETENTION_DAYS = 90;
const TARGET_VARIABLE = 'CF_SAAS_RETENTION_TARGET';

function retentionWhere(before) {
  return { createdAt: { lt: before } };
}

/**
 * Names the instance `DATABASE_URL` points at, as `host:port/database`.
 *
 * The user, the password and every query parameter are deliberately left out:
 * the operator pastes this value into a runbook, a cron definition and an
 * incident ticket, so it has to stay safe to write down.
 */
function resolveDatabaseTarget(environment) {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) return null;

  let url;
  let database;
  try {
    url = new URL(databaseUrl);
    database = decodeURIComponent(url.pathname).replace(/^\//, '');
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL');
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new Error('DATABASE_URL is not a PostgreSQL connection URL');
  }
  if (!database) throw new Error('DATABASE_URL names no database');
  // A socket connection carries no hostname and names its directory in `host`.
  const host = url.hostname || url.searchParams.get('host') || '';
  if (!host) throw new Error('DATABASE_URL names no host');

  return `${host}:${url.port || '5432'}/${database}`;
}

/**
 * Second barrier for an apply. `CF_CONFIRM_SAAS_RETENTION` proves the operator
 * meant to delete; this proves they know where. A stale shell, an inherited
 * container environment or a copied cron line can point `DATABASE_URL` at
 * another instance, and this delete is not recoverable from here.
 */
function assertExpectedTarget(environment) {
  const target = resolveDatabaseTarget(environment);
  if (!target) {
    throw new Error('Apply requires DATABASE_URL to name the target database');
  }

  const expected = environment[TARGET_VARIABLE];
  if (!expected) {
    throw new Error(
      `Apply requires ${TARGET_VARIABLE} to name the expected database; ` +
        `DATABASE_URL resolves to "${target}"`
    );
  }
  if (expected !== target) {
    throw new Error(
      `Apply target mismatch: DATABASE_URL points at "${target}" but ` +
        `${TARGET_VARIABLE} expects "${expected}"`
    );
  }

  return target;
}

async function inspect(client, where) {
  const [publicGrowthTrustedEvents, aiUsageRecords] = await Promise.all([
    client.publicGrowthTrustedEvent.count({ where }),
    client.aiUsageRecord.count({ where }),
  ]);
  return { publicGrowthTrustedEvents, aiUsageRecords };
}

async function cleanupSaasRetention(client, options = {}) {
  const apply = options.apply === true;
  const environment = options.environment || process.env;
  const retentionDays = SAAS_RAW_RETENTION_DAYS;

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error('now must be a valid date');
  }
  const before = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const where = retentionWhere(before);

  if (!apply) {
    // The dry-run mutates nothing, so it needs no confirmation. It reports the
    // resolved target instead, which is where the operator reads the value the
    // apply will demand.
    return {
      mode: 'dry-run',
      retentionDays,
      before: before.toISOString(),
      target: resolveDatabaseTarget(environment),
      ...(await inspect(client, where)),
    };
  }

  const target = assertExpectedTarget(environment);

  const [deletedGrowth, deletedAiUsage] = await client.$transaction(
    async (transaction) =>
      Promise.all([
        transaction.publicGrowthTrustedEvent.deleteMany({ where }),
        transaction.aiUsageRecord.deleteMany({ where }),
      ])
  );

  return {
    mode: 'apply',
    retentionDays,
    before: before.toISOString(),
    target,
    deletedPublicGrowthTrustedEvents: deletedGrowth.count,
    deletedAiUsageRecords: deletedAiUsage.count,
    verification: await inspect(client, where),
  };
}

function parseCleanupArguments(arguments_) {
  const knownArguments = new Set(['--apply']);
  const unknownArgument = arguments_.find(
    (argument) => !knownArguments.has(argument)
  );
  if (unknownArgument) throw new Error(`Unknown argument: ${unknownArgument}`);
  return { apply: arguments_.includes('--apply') };
}

function assertApplyConfirmation(apply, environment) {
  if (apply && environment.CF_CONFIRM_SAAS_RETENTION !== 'apply') {
    throw new Error('Apply requires CF_CONFIRM_SAAS_RETENTION=apply');
  }
}

async function main() {
  const { apply } = parseCleanupArguments(process.argv.slice(2));
  assertApplyConfirmation(apply, process.env);
  // Refuse a misdirected apply before opening a connection to the instance it
  // was misdirected at. `cleanupSaasRetention` checks again before it deletes.
  if (apply) assertExpectedTarget(process.env);

  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient();
  try {
    const report = await cleanupSaasRetention(client, {
      apply,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (
      apply &&
      Object.values(report.verification).some((count) => count !== 0)
    ) {
      throw new Error('Post-apply verification found remaining raw rows');
    }
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`SaaS retention cleanup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  SAAS_RAW_RETENTION_DAYS,
  assertApplyConfirmation,
  assertExpectedTarget,
  cleanupSaasRetention,
  parseCleanupArguments,
  resolveDatabaseTarget,
};
