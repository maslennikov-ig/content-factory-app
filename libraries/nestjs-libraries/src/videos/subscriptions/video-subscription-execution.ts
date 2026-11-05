import { HggPilotJobServiceV1 } from './video-hgg-pilot-job.service.v1';
import { HggPilotExecutionV1 } from './video-hgg-pilot-execution.v1';
import { HGG_PILOT_STAGE_KIND_V1 } from './video-hgg-pilot-stage.v1';
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
  constructor(readonly jobs: VideoSubscriptionJobService,readonly pilot:HggPilotExecutionV1,readonly pilotJobs:HggPilotJobServiceV1) {}
  async recover() {
    if (this.running) return; this.running = true;
    try {
      const jobs = await this.jobs.repository.db.videoSubscriptionJob.findMany({where: {OR:[{state:{in:SUBSCRIPTION_PENDING}},{state:'submission_unknown',request:{path:['kind'],equals:HGG_PILOT_STAGE_KIND_V1}},{state:'completed',request:{path:['kind'],equals:HGG_PILOT_STAGE_KIND_V1},providerResult:{path:['continuationDelivered'],equals:false}}]}, orderBy: {updatedAt: 'asc'}, take: 500});
      for (const job of jobs) {if((job.request as any)?.kind===HGG_PILOT_STAGE_KIND_V1){if(job.state==='submission_unknown'){if(!(job.receipt as any)?.raw)continue;await this.pilotJobs.runStep(job.organizationId,job.id);const recovered=await this.jobs.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id,organizationId:job.organizationId,actorId:job.actorId}});if(['queued','running'].includes(recovered.state))await this.pilot.dispatch(recovered);}else await this.pilot.dispatch(job);}else await this.jobs.dispatch(job);}
    } catch { this.logger.warn('VIDEO_SUBSCRIPTION_RECOVERY_UNAVAILABLE'); }
    finally { this.running = false; }
  }
  async onApplicationBootstrap() { await this.recover(); this.timer = setInterval(() => void this.recover(), 30_000); this.timer.unref(); }
  onApplicationShutdown() { if (this.timer) clearInterval(this.timer); }
}
