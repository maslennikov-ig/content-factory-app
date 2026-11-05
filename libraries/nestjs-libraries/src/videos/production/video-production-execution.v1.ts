import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { TemporalService } from 'nestjs-temporal-core';
import { VideoProductionExecutionPortV1 } from './video-production-execution.port.v1';
import { VideoProductionService } from './video-production.service';
@Injectable()
export class VideoProductionExecutionV1 implements VideoProductionExecutionPortV1 {
  constructor(private readonly temporal:TemporalService){}
  async start(organizationId:string,revisionId:string){
    try{await this.temporal.client.getRawClient().workflow.start('videoProductionWorkflowV1',{workflowId:'video-production-v1:'+revisionId,
      taskQueue:'main',args:[{organizationId,revisionId}],workflowIdReusePolicy:'ALLOW_DUPLICATE'});}
    catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
  }
}
@Injectable()
export class VideoProductionRecoveryV1 implements OnApplicationBootstrap,OnApplicationShutdown {
  private readonly logger=new Logger(VideoProductionRecoveryV1.name);private timer?:ReturnType<typeof setInterval>;private busy=false;
  constructor(private readonly productions:VideoProductionService,private readonly execution:VideoProductionExecutionV1){}
  async onApplicationBootstrap(){await this.recover();this.timer=setInterval(()=>void this.recover(),30000);this.timer.unref();}
  onApplicationShutdown(){if(this.timer)clearInterval(this.timer);}
  async recover(){if(this.busy)return;this.busy=true;try{for(const row of await this.productions.recoverPending())try{await this.execution.start(row.organizationId,row.id);}catch{this.logger.warn('VIDEO_PRODUCTION_DISPATCH_UNAVAILABLE');}}catch{this.logger.warn('VIDEO_PRODUCTION_RECOVERY_UNAVAILABLE');}finally{this.busy=false;}}
}
