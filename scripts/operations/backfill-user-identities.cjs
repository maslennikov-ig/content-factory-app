#!/usr/bin/env node

function normalizeIdentifier(user) {
  const raw =
    user.providerName === 'LOCAL' ? user.email : user.providerId || '';
  const trimmed = raw.trim();
  return user.providerName === 'LOCAL' ? trimmed.toLowerCase() : trimmed;
}

async function backfillUserIdentities(client, options = {}) {
  const apply = options.apply === true;
  if (apply && options.authWritesDisabled !== true) {
    throw new Error(
      'Refusing to apply until auth writes are disabled for the maintenance window'
    );
  }
  const [users, existingIdentities] = await Promise.all([
    client.user.findMany({
      select: {
        id: true,
        email: true,
        providerName: true,
        providerId: true,
      },
      orderBy: { id: 'asc' },
    }),
    client.userIdentity.findMany({
      select: {
        userId: true,
        provider: true,
        providerIdentifier: true,
      },
    }),
  ]);

  const existingByKey = new Map(
    existingIdentities.map((identity) => [
      `${identity.provider}\u0000${identity.providerIdentifier}`,
      identity,
    ])
  );
  const desiredByKey = new Map();
  const conflicts = [];
  const identities = [];

  for (const user of users) {
    const providerIdentifier = normalizeIdentifier(user);
    const key = `${user.providerName}\u0000${providerIdentifier}`;
    if (!providerIdentifier) {
      conflicts.push({
        type: 'missing-provider-identifier',
        userId: user.id,
        provider: user.providerName,
      });
      continue;
    }

    const existing = existingByKey.get(key);
    if (existing) {
      if (existing.userId !== user.id) {
        conflicts.push({
          type: 'identity-owned-by-another-user',
          userId: user.id,
          ownerUserId: existing.userId,
          provider: user.providerName,
          providerIdentifier,
        });
      }
      continue;
    }

    const desiredOwner = desiredByKey.get(key);
    if (desiredOwner && desiredOwner !== user.id) {
      conflicts.push({
        type: 'duplicate-legacy-identity',
        userId: user.id,
        ownerUserId: desiredOwner,
        provider: user.providerName,
        providerIdentifier,
      });
      continue;
    }

    desiredByKey.set(key, user.id);
    identities.push({
      userId: user.id,
      provider: user.providerName,
      providerIdentifier,
    });
  }

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: users.length,
    existing: existingIdentities.length,
    planned: identities.length,
    conflicts,
    identities,
    applied: 0,
  };

  if (!apply) return report;
  if (conflicts.length) {
    const error = new Error(
      `Refusing to apply user identity backfill with ${conflicts.length} conflict(s)`
    );
    error.report = report;
    throw error;
  }

  if (identities.length) {
    await client.$transaction((tx) =>
      tx.userIdentity.createMany({ data: identities })
    );
    report.applied = identities.length;
  }
  report.verification = await backfillUserIdentities(client);
  if (
    report.verification.planned !== 0 ||
    report.verification.conflicts.length !== 0
  ) {
    const error = new Error('Post-apply user identity verification failed');
    error.report = report;
    throw error;
  }
  return report;
}

/**
 * What the operator sees.
 *
 * The planned rows are every email address of every account on the deployment.
 * A dry-run is something an operator runs repeatedly, pipes into a file and
 * pastes into a ticket, so printing that list by default puts the whole user
 * table wherever the terminal output lands. Counts answer the question the
 * runbook actually asks — is `planned` what you expect, is `conflicts` empty —
 * and the addresses are one flag away when a conflict has to be chased down.
 *
 * Conflicts stay in full: there are few of them, each one blocks the apply, and
 * naming the account is the only way to fix it.
 */
function printableReport(report, { includeIdentities }) {
  const { identities, verification, ...rest } = report;
  return {
    ...rest,
    ...(includeIdentities
      ? { identities }
      : { identitiesWithheld: identities.length }),
    ...(verification
      ? {
          verification: printableReport(verification, { includeIdentities }),
        }
      : {}),
  };
}

const FLAGS = ['--apply', '--auth-writes-disabled', '--print-identities'];

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const authWritesDisabled = argv.includes('--auth-writes-disabled');
  const includeIdentities = argv.includes('--print-identities');
  const unknown = argv.filter((argument) => !FLAGS.includes(argument));
  if (unknown.length) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }

  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient();
  try {
    const report = await backfillUserIdentities(client, {
      apply,
      authWritesDisabled,
    });
    process.stdout.write(
      `${JSON.stringify(
        printableReport(report, { includeIdentities }),
        null,
        2
      )}\n`
    );
  } finally {
    await client.$disconnect();
  }
}

module.exports = {
  backfillUserIdentities,
  normalizeIdentifier,
  printableReport,
};

if (require.main === module) {
  main().catch((error) => {
    if (error.report) {
      process.stderr.write(
        `${JSON.stringify(
          printableReport(error.report, {
            includeIdentities: process.argv.includes('--print-identities'),
          }),
          null,
          2
        )}\n`
      );
    }
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
