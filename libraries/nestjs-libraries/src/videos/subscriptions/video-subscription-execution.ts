import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { VideoSubscriptionJobService, SUBSCRIPTION_PENDING } from './video-subscription-job.service';
@Injectable()
export class VideoSubscriptionExecution {
  constructor(readonly temporal: TemporalService) {}
  async start(organizationId: string, jobId: string, cycle = 0) {
    try { await this.temporal.client.getRawClient().workflow.start('videoSubscriptionWorkflowV1', {workflowId: `video-subscription-v1:${jobId}:${cycle}`, taskQueue: 'main', args: [{organizationId, jobId}], workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY'}); }
    catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error; }
  }
}
@Injectable()
export class VideoSubscriptionRecovery implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly logger = new Logger(VideoSubscriptionRecovery.name); private timer?: ReturnType<typeof setInterval>; private running = false;
  constructor(readonly jobs: VideoSubscriptionJobService) {}
  async recover() {
    if (this.running) return; this.running = true;
    try {
      const jobs = await this.jobs.repository.db.videoSubscriptionJob.findMany({where: {state: {in: SUBSCRIPTION_PENDING}}, orderBy: {updatedAt: 'asc'}, take: 500});
      for (const job of jobs) await this.jobs.dispatch(job);
    } catch { this.logger.warn('VIDEO_SUBSCRIPTION_RECOVERY_UNAVAILABLE'); }
    finally { this.running = false; }
  }
  async onApplicationBootstrap() { await this.recover(); this.timer = setInterval(() => void this.recover(), 30_000); this.timer.unref(); }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
}
