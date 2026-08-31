import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import {
  PRODUCT_EVENT_NAMES,
  ProductEventName,
} from '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto';

export interface ProductEventWrite {
  name: ProductEventName;
  properties: Record<string, unknown>;
  deduplicationKey: string;
  organizationId: string;
  userId: string;
}

/**
 * A client picks its own deduplication key, so the tenant uniqueness index
 * stops repeats of one key and nothing else. Without a ceiling one signed-in
 * organization can keep writing new keys for as long as the throttler lets it.
 * Server-emitted events (register, channel_added) are never counted against it.
 */
export const CLIENT_DAILY_ORGANIZATION_QUOTA = 500;

/** Product events answer questions about the recent past; older rows are pruned. */
export const PRODUCT_EVENT_RETENTION_DAYS = 400;

@Injectable()
export class ProductEventsRepository {
  private readonly _logger = new Logger(ProductEventsRepository.name);

  constructor(private _productEvent: PrismaRepository<any>) {}

  async record(event: ProductEventWrite, options?: { dailyQuota?: number }) {
    const model = (this._productEvent.model as any).productEvent;

    if (options?.dailyQuota !== undefined) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const used = await model.count({
        where: {
          organizationId: event.organizationId,
          createdAt: { gte: since },
        },
      });
      if (used >= options.dailyQuota) {
        this._logger.warn(
          `Product event quota reached for organization ${event.organizationId}`
        );
        return { recorded: false };
      }
    }

    try {
      await model.create({ data: event });
      return { recorded: true };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return { recorded: false };
      }
      throw error;
    }
  }

  async pruneOlderThan(days: number) {
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await (
      this._productEvent.model as any
    ).productEvent.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return { deleted: count, before };
  }

  async getAdminReport(params: { from: Date; to: Date }) {
    const prisma = this._productEvent.model as any;
    const model = prisma.productEvent;
    const rangeWhere = {
      createdAt: { gte: params.from, lte: params.to },
    };
    const registeredFilter = {
      name: 'register',
      createdAt: rangeWhere.createdAt,
    };
    // The screen promises "registered in this period, connected their first
    // channel": both halves of the cohort are bounded by the same window, so
    // the answer cannot silently include a channel connected outside it.
    const activatedFilter = {
      name: 'channel_added',
      createdAt: rangeWhere.createdAt,
    };

    const [registeredOrganizations, activatedOrganizations, grouped, recent] =
      await Promise.all([
        prisma.organization.count({
          where: {
            productEvents: { some: registeredFilter },
          },
        }),
        prisma.organization.count({
          where: {
            AND: [
              { productEvents: { some: registeredFilter } },
              { productEvents: { some: activatedFilter } },
            ],
          },
        }),
        model.groupBy({
          by: ['name'],
          where: rangeWhere,
          _count: { _all: true },
          _max: { createdAt: true },
        }),
        model.findMany({
          where: rangeWhere,
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            name: true,
            organizationId: true,
            userId: true,
            createdAt: true,
          },
        }),
      ]);

    const groupedByName = new Map(
      grouped.map((event: any) => [event.name, event])
    );
    return {
      range: {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
      },
      activation: {
        registeredOrganizations,
        activatedOrganizations,
        ratePercentage: registeredOrganizations
          ? Math.round(
              (activatedOrganizations / registeredOrganizations) * 10000
            ) / 100
          : 0,
      },
      events: PRODUCT_EVENT_NAMES.map((name) => {
        const event: any = groupedByName.get(name);
        return {
          name,
          count: event?._count?._all || 0,
          latestAt: event?._max?.createdAt
            ? event._max.createdAt.toISOString()
            : null,
        };
      }),
      recent: recent.map((event: any) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}
