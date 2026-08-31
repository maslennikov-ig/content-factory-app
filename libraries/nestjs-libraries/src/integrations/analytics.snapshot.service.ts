import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsSeries,
  mergeAnalyticsSnapshots,
  utcAnalyticsDay,
} from '@contentfactory/nestjs-libraries/integrations/analytics.snapshot';

@Injectable()
export class AnalyticsSnapshotService {
  private readonly logger = new Logger(AnalyticsSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationManager: IntegrationManager
  ) {}

  async captureAll(now = new Date()) {
    const integrations = await this.prisma.integration.findMany({
      where: {
        type: 'social',
        disabled: false,
        refreshNeeded: false,
        deletedAt: null,
      },
      select: {
        id: true,
        internalId: true,
        providerIdentifier: true,
        token: true,
      },
    });
    const bucket = utcAnalyticsDay(now);
    let collected = 0;
    let failed = 0;

    for (const integration of integrations) {
      const provider = this.integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );
      if (!provider?.analyticsSnapshot) continue;

      try {
        const values = await provider.analyticsSnapshot(
          integration.internalId,
          integration.token
        );
        for (const item of values) {
          if (!Number.isFinite(item.value)) continue;
          await this.prisma.integrationAnalyticsSnapshot.upsert({
            where: {
              integrationId_metric_bucket: {
                integrationId: integration.id,
                metric: item.metric,
                bucket,
              },
            },
            create: {
              integrationId: integration.id,
              metric: item.metric,
              value: Math.round(item.value),
              bucket,
            },
            update: { value: Math.round(item.value) },
          });
          collected += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Analytics snapshot failed for integration ${integration.id}`,
          error
        );
      }
    }

    return { collected, failed };
  }

  async merge(
    integrationId: string,
    days: number,
    live: AnalyticsSeries[],
    now = new Date()
  ) {
    const end = utcAnalyticsDay(now);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - Math.max(1, days) + 1);
    const snapshots = await this.prisma.integrationAnalyticsSnapshot.findMany({
      where: {
        integrationId,
        bucket: { gte: start, lte: end },
      },
      select: { metric: true, value: true, bucket: true },
      orderBy: { bucket: 'asc' },
    });

    return mergeAnalyticsSnapshots(live, snapshots, days, now);
  }
}
