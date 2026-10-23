import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TemporalService } from 'nestjs-temporal-core';
import { VideoJobService } from './video-job.service';
import { VideoExecutionPortV1 } from './video-execution.port.v1';

@Injectable()
export class VideoExecutionV1 implements VideoExecutionPortV1 {
  constructor(private readonly temporal: TemporalService) {}

  async start(organizationId: string, jobId: string, cycle = 0): Promise<void> {
    try {
      await this.temporal.client.getRawClient().workflow.start('videoGenerationWorkflowV1', {
        workflowId: cycle > 0 ? `video-v1:${jobId}:save:${cycle}` : `video-v1:${jobId}`,
        taskQueue: 'main',
        args: [{ organizationId, jobId }],
        workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
  }
}

/** Reconcile the persisted-before-dispatch gap, including temporary Temporal outages. */
@Injectable()
export class VideoExecutionRecoveryV1 implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(VideoExecutionRecoveryV1.name);
  private timer?: ReturnType<typeof setInterval>;
  private recovering = false;

  constructor(private readonly jobs: VideoJobService, private readonly execution: VideoExecutionV1) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover();
    this.timer = setInterval(() => void this.recover(), 30_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      for (const job of await this.jobs.recoverPending()) {
        try {
          await this.execution.start(job.organizationId, job.id, job.runCycle);
        } catch {
          // Never log provider payload, credential or raw transport errors.
          this.logger.warn('VIDEO_EXECUTION_DISPATCH_UNAVAILABLE');
        }
      }
    } catch {
      this.logger.warn('VIDEO_EXECUTION_RECOVERY_UNAVAILABLE');
    } finally {
      this.recovering = false;
    }
  }
}
