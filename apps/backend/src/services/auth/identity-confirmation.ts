import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { createHash, randomBytes } from 'node:crypto';

export const IDENTITY_CONFIRMATION_TTL_SECONDS = 20 * 60;

/**
 * What is waiting for someone to prove they read the mailbox.
 *
 * The password is already hashed here. The plain one exists for the length of
 * the request that offered it and is never written down: not into this record,
 * not into the email, not into the link. The link carries a random token and
 * nothing else, so the token is the only thing worth stealing, and it dies
 * twenty minutes after it is issued or the moment it is spent.
 */
export type PendingLocalIdentity = {
  userId: string;
  providerIdentifier: string;
  passwordHash: string;
};

/**
 * Redis holds the digest of the token, never the token. Anyone who can read the
 * keyspace — a backup, an operator, a log of slow commands — learns that a
 * confirmation is outstanding and for whom, but cannot rebuild the link.
 */
function confirmationKey(token: string) {
  return `auth:identity-confirmation:${createHash('sha256')
    .update(token)
    .digest('hex')}`;
}

export async function issueIdentityConfirmation(pending: PendingLocalIdentity) {
  const token = randomBytes(32).toString('base64url');
  await ioRedis.set(
    confirmationKey(token),
    JSON.stringify(pending),
    'EX',
    IDENTITY_CONFIRMATION_TTL_SECONDS
  );
  return token;
}

/**
 * Reads without spending. A link opened by the wrong account must not destroy
 * the record the right account is still waiting to use, so consumption is a
 * separate, explicit step taken only once the row exists.
 */
export async function readIdentityConfirmation(
  token: string
): Promise<PendingLocalIdentity | null> {
  if (!token) return null;

  const stored = await ioRedis.get(confirmationKey(token));
  if (!stored) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }

  const pending = parsed as Partial<PendingLocalIdentity>;
  if (
    typeof pending?.userId !== 'string' ||
    typeof pending?.providerIdentifier !== 'string' ||
    typeof pending?.passwordHash !== 'string' ||
    !pending.userId ||
    !pending.providerIdentifier ||
    !pending.passwordHash
  ) {
    return null;
  }

  return {
    userId: pending.userId,
    providerIdentifier: pending.providerIdentifier,
    passwordHash: pending.passwordHash,
  };
}

export async function discardIdentityConfirmation(token: string) {
  if (!token) return;
  await ioRedis.del(confirmationKey(token));
}
