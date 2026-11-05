import {Injectable,Logger,OnApplicationBootstrap,OnApplicationShutdown} from '@nestjs/common';
import {WorkflowExecutionAlreadyStartedError} from '@temporalio/client';
import {TemporalService} from 'nestjs-temporal-core';
import type {LocalCompositionExecutionPortV2} from '../../videos/production/local-composition-execution.port.v2';
import {SocialFactoryRepository} from './social-factory.repository';

@Injectable()
export class LocalCompositionExecutionV2 implements LocalCompositionExecutionPortV2{
 constructor(private readonly temporal:TemporalService){}
 async start(organizationId:string,operationId:string,compositionId:string){
  try{await this.temporal.client.getRawClient().workflow.start('localCompositionWorkflowV2',{workflowId:'local-composition-v2:'+compositionId,taskQueue:'main',args:[{organizationId,operationId,compositionId}],workflowIdReusePolicy:'ALLOW_DUPLICATE'});}
  catch(error){if(!(error instanceof WorkflowExecutionAlreadyStartedError))throw error;}
 }
}
@Injectable()
export class LocalCompositionRecoveryV2 implements OnApplicationBootstrap,OnApplicationShutdown{
 private readonly logger=new Logger(LocalCompositionRecoveryV2.name);private timer?:ReturnType<typeof setInterval>;private busy=false;
 constructor(private readonly repository:SocialFactoryRepository,private readonly execution:LocalCompositionExecutionV2){}
 async onApplicationBootstrap(){await this.recover();this.timer=setInterval(()=>void this.recover(),30_000);this.timer.unref();}
 onApplicationShutdown(){if(this.timer)clearInterval(this.timer);}
 async recover(){if(this.busy)return;this.busy=true;try{for(const row of await this.repository.pendingLocalCompositionsV2())if(row.parentId)try{await this.execution.start(row.organizationId,row.parentId,row.id);}catch{this.logger.warn('LOCAL_COMPOSITION_DISPATCH_UNAVAILABLE');}}catch{this.logger.warn('LOCAL_COMPOSITION_RECOVERY_UNAVAILABLE');}finally{this.busy=false;}}
}
