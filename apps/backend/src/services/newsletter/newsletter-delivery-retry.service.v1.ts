import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { TemporalService } from 'nestjs-temporal-core';

const RECONCILIATION_INTERVAL_MS = 60_000;
const RECONCILIATION_BATCH_SIZE = 100;
// Eight activity attempts wait 1+2+4+8+16+32+60 minutes between retries and
// may each run for 30 seconds. Three hours keeps one workflow authoritative
// through that bounded window, then lets a crashed worker's lease be reclaimed.
const DELIVERY_LEASE_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class NewsletterDeliveryRetryServiceV1 implements OnModuleInit {
  private readonly logger = new Logger(NewsletterDeliveryRetryServiceV1.name);

  constructor(
    private readonly users: UsersService,
    private readonly temporal: TemporalService
  ) {}

  async schedule(userId: string, pendingAt: Date) {
    const now = new Date();
    // Stable for one pending transition. If Temporal accepted a start but its
    // response was lost, the retry converges on the same workflow instead of
    // creating a second delivery owner.
    const leaseId = `newsletter-delivery-v1:${userId}:${pendingAt.getTime()}`;
    const leaseExpiresAt = new Date(now.getTime() + DELIVERY_LEASE_MS);
    const claim = await this.users.claimNewsletterDelivery(
      userId,
      pendingAt,
      leaseId,
      leaseExpiresAt,
      now
    );
    if (claim.count !== 1) {
      return { scheduled: false };
    }

    const workflow = this.temporal.client.getRawClient()?.workflow;
    if (!workflow) {
      await this.users.releaseNewsletterDeliveryLease(
        userId,
        pendingAt,
        leaseId
      );
      throw new Error('Temporal workflow client is unavailable');
    }

    try {
      const handle = await workflow.start(
        'newsletterSubscriptionRetryWorkflowV1',
        {
          args: [{ userId, pendingAt: pendingAt.toISOString(), leaseId }],
          taskQueue: 'main',
          workflowId: `newsletter-subscription-v1:${userId}:${pendingAt.getTime()}`,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
        }
      );
      return { scheduled: true, handle };
    } catch (error) {
      await this.users.releaseNewsletterDeliveryLease(
        userId,
        pendingAt,
        leaseId
      );
      throw error;
    }
  }

  onModuleInit() {
    // Recovery must not become an application-startup gate when Temporal is
    // the system that is unavailable. The method handles its own failures and
    // the interval repeats it after startup.
    void this.reconcilePending();
  }

  @Interval(RECONCILIATION_INTERVAL_MS)
  async reconcilePending() {
    let pending: { id: string; newsletterDeliveryPendingAt: Date }[];
    try {
      pending = await this.users.listPendingNewsletterDeliveries(
        RECONCILIATION_BATCH_SIZE,
        new Date()
      );
    } catch {
      this.logger.error('Newsletter pending-delivery scan failed.');
      return { pending: 0, scheduled: 0 };
    }

    const attempts = await Promise.allSettled(
      pending.map(({ id, newsletterDeliveryPendingAt }) =>
        this.schedule(id, newsletterDeliveryPendingAt)
      )
    );
    const scheduled = attempts.filter(
      (attempt) =>
        attempt.status === 'fulfilled' && attempt.value.scheduled === true
    ).length;
    if (scheduled !== pending.length) {
      this.logger.warn(
        `Newsletter delivery scheduling incomplete: ${scheduled}/${pending.length}`
      );
    }
    return { pending: pending.length, scheduled };
  }
}
