import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
@Injectable()
export class HggPilotExecutionV1 {
 constructor(readonly temporal:TemporalService){}
 async start(org:string,id:string,cycle=0){
  try{await this.temporal.client.getRawClient().workflow.start('hggPilotStageWorkflowV1',{workflowId:`hgg-pilot-stage-v1:${id}:${cycle}`,taskQueue:'main',args:[{organizationId:org,jobId:id,runCycle:cycle}],workflowIdReusePolicy:'ALLOW_DUPLICATE_FAILED_ONLY'});}
  catch(e){if(!(e instanceof WorkflowExecutionAlreadyStartedError))throw e;}
 }
 async dispatch(job:any){try{await this.start(job.organizationId,job.id,job.runCycle);}catch{/* Existing durable recovery owns the dispatch gap. */}}
}
