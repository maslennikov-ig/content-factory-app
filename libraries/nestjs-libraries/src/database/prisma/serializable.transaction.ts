import { HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** The part of a Prisma client this helper uses. */
type TransactionRunner = {
  $transaction<T>(
    run: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' }
  ): Promise<T>;
};

/** Attempts before a write conflict is answered as «busy». */
export const SERIALIZABLE_ATTEMPTS = 3;

/**
 * One serializable transaction with a bounded retry
 * (`content-factory-next-qicl`: one copy instead of two, in
 * `UsersRepository` and `OrganizationRepository`).
 *
 * Serializable, because the writes that use it read a membership list and then
 * act on it; a concurrent change must lose, not slip between the read and the
 * write. `P2034` is Postgres refusing a write conflict, which is an instruction
 * to retry, not a failure to report; three attempts and then a plain «busy»
 * (503), so a person waiting on a button never waits forever. Any other error
 * leaves at once.
 */
export async function serializableWithRetry<T>(
  client: TransactionRunner,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
  busyMessage: string
): Promise<T> {
  for (let attempt = 0; attempt < SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(run, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code !== 'P2034') throw error;
      if (attempt === SERIALIZABLE_ATTEMPTS - 1) {
        throw new HttpException(busyMessage, 503);
      }
    }
  }

  throw new Error('Unreachable serializable retry state');
}
