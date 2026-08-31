import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  PublicGrowthEvent,
  TrustedGrowthEventName,
} from '@contentfactory/nestjs-libraries/dtos/growth/public-growth-event';

const MAX_WRITE_ATTEMPTS = 3;

const TRUSTED_RECEIPT_FIELDS = ['name', 'deduplicationKey'];

/**
 * The constraint Postgres reports for `@@unique([name, deduplicationKey])` on
 * `PublicGrowthTrustedEvent`. Prisma derives the name from the model and the
 * unique fields, so a rename or a `map:` in `schema.prisma` invalidates this
 * constant; `tests/public-growth-event.test.cjs` holds the two together.
 */
export const TRUSTED_RECEIPT_CONSTRAINT =
  'PublicGrowthTrustedEvent_name_deduplicationKey_key';

export const PUBLIC_GROWTH_REPORT_NAMES = [
  'landing_view',
  'demo_started',
  'demo_completed',
  'signup_started',
  'registration_completed',
  'workspace_activated',
] as const;

export type PublicGrowthReportName =
  (typeof PUBLIC_GROWTH_REPORT_NAMES)[number];

function prismaCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

/**
 * Recognizes the unique violation this receipt is allowed to swallow.
 *
 * Prisma serializes `meta.target` from an untagged enum, so one `P2002` has
 * three possible shapes: the violated column names as an array, the violated
 * constraint as a bare name, or `null` when the driver could read neither.
 * Which one arrives is a property of the connector and of what the database
 * put in the error detail, not of the conflict, so a genuine duplicate can
 * reach us in either concrete shape.
 *
 * Both are matched exactly. The `null` shape stays unrecognized on purpose: it
 * names no constraint, and this transaction also writes the daily aggregate,
 * whose own unique violation must keep being retried rather than reported as a
 * duplicate registration.
 */
function isTrustedReceiptDuplicate(error: unknown): boolean {
  if (prismaCode(error) !== 'P2002' || !error || typeof error !== 'object') {
    return false;
  }

  const meta = 'meta' in error ? error.meta : undefined;
  if (!meta || typeof meta !== 'object' || !('target' in meta)) return false;
  const target = meta.target;

  if (typeof target === 'string') return target === TRUSTED_RECEIPT_CONSTRAINT;
  if (!Array.isArray(target)) return false;

  const fields = target.filter(
    (field): field is string => typeof field === 'string'
  );
  return (
    fields.length === TRUSTED_RECEIPT_FIELDS.length &&
    TRUSTED_RECEIPT_FIELDS.every((field) => fields.includes(field))
  );
}

function isRetryableWriteConflict(error: unknown): boolean {
  const code = prismaCode(error);
  return (
    code === 'P2034' || (code === 'P2002' && !isTrustedReceiptDuplicate(error))
  );
}

@Injectable()
export class PublicGrowthRepository {
  constructor(
    private readonly _repository: PrismaRepository<any>,
    private readonly _transaction: PrismaTransaction
  ) {}

  private startOfUtcDay(now: Date) {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
  }

  private incrementDaily(
    model: any,
    event: PublicGrowthEvent | { name: TrustedGrowthEventName },
    now: Date
  ) {
    const day = this.startOfUtcDay(now);
    const dimensions = {
      locale: 'locale' in event ? event.locale || '' : '',
      widthRange: 'widthRange' in event ? event.widthRange || '' : '',
      uiVersion: 'uiVersion' in event ? event.uiVersion || '' : '',
      demoStep: 'demoStep' in event ? event.demoStep || '' : '',
    };
    return model.publicGrowthDaily.upsert({
      where: {
        day_name_locale_widthRange_uiVersion_demoStep: {
          day,
          name: event.name,
          ...dimensions,
        },
      },
      create: { day, name: event.name, ...dimensions, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  async getAggregateTotals(params: { from: Date; to: Date }) {
    const rows = await (
      this._repository.model as any
    ).publicGrowthDaily.groupBy({
      by: ['name'],
      where: {
        day: { gte: params.from, lte: params.to },
        name: { in: [...PUBLIC_GROWTH_REPORT_NAMES] },
      },
      _sum: { count: true },
    });

    const totals = Object.fromEntries(
      PUBLIC_GROWTH_REPORT_NAMES.map((name) => [name, 0])
    ) as Record<PublicGrowthReportName, number>;
    for (const row of rows) {
      if (
        (PUBLIC_GROWTH_REPORT_NAMES as readonly string[]).includes(row.name)
      ) {
        totals[row.name as PublicGrowthReportName] = row._sum?.count || 0;
      }
    }
    return totals;
  }

  async recordPublic(event: PublicGrowthEvent, now: Date) {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        await this.incrementDaily(this._repository.model as any, event, now);
        return { recorded: true };
      } catch (error) {
        if (
          !isRetryableWriteConflict(error) ||
          attempt === MAX_WRITE_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }

    throw new Error('Unreachable public growth aggregate retry state');
  }

  async recordTrusted(
    name: TrustedGrowthEventName,
    deduplicationKey: string,
    now: Date
  ) {
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      try {
        await (this._transaction.model as any).$transaction(
          async (transaction: any) => {
            await transaction.publicGrowthTrustedEvent.create({
              data: { name, deduplicationKey },
            });
            await this.incrementDaily(transaction, { name }, now);
          }
        );
        return { recorded: true };
      } catch (error) {
        if (isTrustedReceiptDuplicate(error)) {
          return { recorded: false };
        }
        if (
          !isRetryableWriteConflict(error) ||
          attempt === MAX_WRITE_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }

    throw new Error('Unreachable trusted growth event retry state');
  }
}
