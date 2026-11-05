import {Injectable} from '@nestjs/common';
import {Activity,ActivityMethod} from 'nestjs-temporal-core';
import {Context} from '@temporalio/activity';
import {SocialFactoryProductionService} from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/production.service';
export type LocalCompositionActivityInputV2={organizationId:string;operationId:string;compositionId:string};
@Injectable()
@Activity()
export class LocalCompositionActivityV2{
 constructor(private readonly production:SocialFactoryProductionService){}
 @ActivityMethod()
 async stepLocalCompositionV2(input:LocalCompositionActivityInputV2){
  const context=Context.current();context.heartbeat({state:'claimed'});
  const timer=setInterval(()=>{try{context.heartbeat({state:'running'});}catch{/* Cancellation is carried by the context signal. */}},15_000);timer.unref();
  try{return await this.production.runLocalVideoCompositionV2(input.organizationId,input.operationId,input.compositionId,{signal:context.cancellationSignal,onProgress:async progress=>context.heartbeat(progress)});}
  catch{throw new Error('LOCAL_COMPOSITION_STEP_UNAVAILABLE');}finally{clearInterval(timer);}
 }
}
