import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { VideoConnectionService } from './video-connection.service';
import { VideoSubscriptionJobService } from './video-subscription-job.service';
import { HggPilotParentPortV1 } from './video-hgg-pilot-parent.port.v1';
import { assertHggExecutionCredentialsV2 } from './video-hgg-pilot-credentials.v2';
import { HggPilotWorkspaceServiceV1 } from './video-hgg-workspace.service.v1';
import { HiggsfieldPilotProviderV1 } from '../providers/higgsfield-pilot.provider.v1';
import { HggPilotMediaV1 } from '../hgg-pilot-media.v1';
import { videoErrorV1 } from '../video-brief.v1';
import { subscriptionHash } from './video-provider-registry';
import { hggPilotAmountV1,hggPilotBindingHashV1,hggPilotCodeV1,hggPilotFinancialV1,hggPilotReferencesV1,hggPilotQuotedInputsV1 } from './video-hgg-pilot-policy.v1';
import { HGG_PILOT_STAGE_KIND_V1,hggPilotExpectedV1,hggPilotApprovalHashV1,type HggPilotStoredStageV1 } from './video-hgg-pilot-stage.v1';
const json=(v:unknown):any=>v;
const pending=['accepted','submitting','queued','running','saving'];
@Injectable()
export class HggPilotJobServiceV1 {
 constructor(readonly repository:VideoSubscriptionRepository,readonly connections:VideoConnectionService,readonly shared:VideoSubscriptionJobService,
 readonly provider:HiggsfieldPilotProviderV1,readonly workspace:HggPilotWorkspaceServiceV1,readonly parents:HggPilotParentPortV1,readonly media:HggPilotMediaV1){}
 private async write(job:any,owner:string,data:any){await this.shared.write(job.organizationId,job.id,owner,data);}
 private async receiptData(job:any,receipt:unknown,attemptId:string){
  const current=await this.repository.db.videoSubscriptionJob.findFirstOrThrow({where:{id:job.id,organizationId:job.organizationId,actorId:job.actorId}});
  return {...current.receipt as any,...receipt as any,submitAttemptId:attemptId};
 }
 /** Audit capture is immutable and bound to the submitted attempt, independent of an expired state lease. */
 private async persistReceived(job:any,stage:HggPilotStoredStageV1,attemptId:string,raw:Record<string,unknown>){
  const rawDigest=subscriptionHash(raw),receivedAt=this.connections.runtime.now().toISOString();
  await this.repository.transaction(async tx=>{
   const current=await tx.videoSubscriptionJob.findFirst({where:{id:job.id,organizationId:job.organizationId,actorId:job.actorId,submitAttempts:1}});
   const attempt=(current?.snapshot as any)?.submitAttempt;
   if((current?.request as any)?.kind!==HGG_PILOT_STAGE_KIND_V1 || (current!.request as any).requestHash!==stage.requestHash || attempt?.id!==attemptId || attempt?.requestHash!==stage.requestHash)return videoErrorV1('VIDEO_PILOT_RECEIPT_ATTEMPT_MISMATCH',409);
   const existing=current!.receipt as any;
   if(existing){if(existing.submitAttemptId!==attemptId || !existing.raw || subscriptionHash(existing.raw)!==rawDigest)return videoErrorV1('VIDEO_PILOT_RECEIPT_CONFLICT',409);return;}
   const saved=await tx.videoSubscriptionJob.updateMany({where:{id:job.id,organizationId:job.organizationId,actorId:job.actorId,submitAttempts:1,AND:[{request:{path:['requestHash'],equals:stage.requestHash}},{snapshot:{path:['submitAttempt','id'],equals:attemptId}}]},data:{receipt:json({raw,rawDigest,receivedAt,submitAttemptId:attemptId,requestHash:stage.requestHash})}});
   if(saved.count!==1)return videoErrorV1('VIDEO_PILOT_RECEIPT_ATTEMPT_MISMATCH',409);
  });
 }
 async expire(org:string,id:string,expectedCycle?:number){
  const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{id,organizationId:org}});
  if((job?.request as any)?.kind!==HGG_PILOT_STAGE_KIND_V1)return {state:'failed',done:true};
  if(expectedCycle!==undefined && job!.runCycle!==expectedCycle)return {state:job!.state,done:true};
  if(job!.state==='completed')return this.runStep(org,id,expectedCycle);
  if(!pending.includes(job!.state))return {state:job!.state,done:true};
  const deadline=job!.statusDeadlineAt?.getTime()??job!.createdAt.getTime()+86400000;
  if(deadline>this.connections.runtime.now().getTime())return {state:job!.state,done:false};
  const owner=randomUUID();
  const claim=await this.repository.db.videoSubscriptionJob.updateMany({where:{id,organizationId:org,runCycle:job!.runCycle,state:{in:pending},OR:[{leaseUntil:null},{leaseUntil:{lt:this.connections.runtime.now()}}]},data:{leaseOwner:owner,leaseUntil:new Date(this.connections.runtime.now().getTime()+240000)}});
  if(claim.count!==1){const fresh=await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id,organizationId:org}});return {state:fresh.state,done:!pending.includes(fresh.state)&&fresh.state!=='completed'};}
  try{
   const fresh=await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id,organizationId:org}});
   const currentDeadline=fresh.statusDeadlineAt?.getTime()??fresh.createdAt.getTime()+86400000;
   if(fresh.runCycle!==job!.runCycle || currentDeadline>this.connections.runtime.now().getTime())return {state:fresh.state,done:false};
   const state=fresh.state==='saving'?'save_failed':fresh.state==='submitting'?'submission_unknown':'status_delayed';
   await this.write(fresh,owner,{state,errorCode:'VIDEO_STATUS_DEADLINE'});return {state,done:true};
  }finally{await this.repository.db.videoSubscriptionJob.updateMany({where:{id,organizationId:org,leaseOwner:owner},data:{leaseOwner:null,leaseUntil:null}});}
 }
 async runStep(org:string,id:string,expectedCycle?:number):Promise<{state:string;done:boolean}>{
  let job=await this.repository.db.videoSubscriptionJob.findFirst({where:{id,organizationId:org}});
  if((job?.request as any)?.kind!==HGG_PILOT_STAGE_KIND_V1)return {state:'failed',done:true};
  if(expectedCycle!==undefined && job!.runCycle!==expectedCycle)return {state:job!.state,done:true};
  if(job!.state==='completed' && (job!.providerResult as any)?.continuationDelivered)return {state:'completed',done:true};
  const receivedLate=job!.state==='submission_unknown' && !!(job!.receipt as any)?.raw;
  if(!pending.includes(job!.state) && job!.state!=='completed' && !receivedLate)return {state:job!.state,done:true};
  const owner=randomUUID();
  const claimed=await this.repository.db.videoSubscriptionJob.updateMany({where:{id,organizationId:org,state:job!.state,runCycle:job!.runCycle,OR:[{leaseUntil:null},{leaseUntil:{lt:this.connections.runtime.now()}}]},data:{leaseOwner:owner,leaseUntil:new Date(this.connections.runtime.now().getTime()+240000)}});
  if(claimed.count!==1)return {state:job!.state,done:false};
  try{
   job=await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id,organizationId:org}});const stage=job!.request as unknown as HggPilotStoredStageV1;
   if(job!.state==='completed')await this.continueParent(job!,owner,stage);
   else if(job!.state==='submitting' || job!.state==='submission_unknown'){
    try{
     if((job!.receipt as any)?.submitAttemptId!==(job!.snapshot as any)?.submitAttempt?.id)return videoErrorV1('VIDEO_PILOT_RECEIPT_ATTEMPT_MISMATCH',409);
     const receipt=this.provider.decodeReceipt(stage,(job!.receipt as any)?.raw);await this.write(job,owner,{receipt:json(await this.receiptData(job,receipt,(job!.snapshot as any).submitAttempt.id)),state:receipt.inputChanged?'input_changed':'queued',errorCode:receipt.inputChanged?'VIDEO_PILOT_INPUTS_CHANGED':null,...(job!.state==='submission_unknown'?{runCycle:{increment:1},statusDeadlineAt:new Date(this.connections.runtime.now().getTime()+86400000)}:{})});}
    catch{await this.write(job,owner,{state:'submission_unknown',errorCode:'VIDEO_SUBMIT_INTERRUPTED'});}
   }else if(job!.state==='saving')await this.save(job!,owner,stage);
   else{
    const context=await this.workspace.load(org,job!.actorId,stage.workspace.qualificationId,job!.connectionId,job!.generation,!!stage.executionCredentials || job!.state!=='accepted');
    if(context.bindingHash!==stage.workspace.bindingHash)return videoErrorV1('VIDEO_PILOT_WORKSPACE_CHANGED',409);
    if(stage.executionCredentials)await this.repository.transaction(tx=>assertHggExecutionCredentialsV2(tx,org,job!.actorId,stage.executionCredentials!,stage.workspace,this.connections.runtime.now()));
    const credential=await this.connections.token(org,job!.actorId,job!.connectionId,job!.generation,job!.state==='accepted'?'pilot_generation_v1':'pilot_recovery_v1',{allowRefresh:false,pilotQualificationId:stage.executionCredentials?.currentWorkspace.qualificationId??stage.workspace.qualificationId});
    const def=await this.connections.connectable(org,'higgsfield');
    const compiled=this.provider.compile(stage.compiled.input,{organizationId:org,actorId:job!.actorId,connectionId:job!.connectionId,accountGeneration:job!.generation},await this.workspace.models(org,job!.actorId,stage.workspace.qualificationId));
    if(subscriptionHash(compiled)!==subscriptionHash(stage.compiled) || hggPilotBindingHashV1(stage)!==stage.requestHash)return videoErrorV1('VIDEO_PILOT_REQUEST_INVALID',409);
    if(job!.state==='accepted'){
     hggPilotQuotedInputsV1(job!.quote);
     const submitAttemptId=randomUUID();
     for(const ref of stage.references){const image=await this.repository.db.videoSubscriptionJob.findFirst({where:{id:ref.jobId,organizationId:org,actorId:job!.actorId}});if(!image?.storedFile)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);await this.media.assertOwnedImage(image.storedFile as any);}
     const receipt=await this.workspace.withContext(org,job!.actorId,job!.connectionId,stage.compiled.input.source.pilotId,stage.compiled.input.source.parentRevision,()=>this.provider.submit(def,credential.token,stage,credential.assertUsable,{
      beforeMutation:async()=>this.repository.transaction(async tx=>{
       const connection=await this.repository.connection(org,job!.actorId,job!.connectionId,tx,false);
       if(connection.generation!==job!.generation || connection.tokenVersion!==(stage.executionCredentials?.currentWorkspace.tokenVersion??stage.workspace.tokenVersion))return videoErrorV1('VIDEO_CONNECTION_CHANGED',409);
       if(stage.executionCredentials){if((job!.snapshot as any).executionBindingHash!==stage.executionCredentials.executionBindingHash)return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);await assertHggExecutionCredentialsV2(tx,org,job!.actorId,stage.executionCredentials,stage.workspace,this.connections.runtime.now());}
       const preflight=await tx.videoAccessPreflight.findFirstOrThrow({where:{id:job!.preflightId,organizationId:org,actorId:job!.actorId}});
       if(preflight.expiresAt<=this.connections.runtime.now())return videoErrorV1('VIDEO_PREFLIGHT_STALE',409);
       await hggPilotReferencesV1(tx,org,job!.actorId,stage,true);
       const assertion=stage.executionCredentials?await this.parents.assertCurrentPilotWithCredentialsV2(tx,{...hggPilotExpectedV1(stage,org,job!.actorId,'submit',(job!.snapshot as any).approvalHash),executionCredentials:stage.executionCredentials}):await this.parents.assertCurrentPilot(tx,hggPilotExpectedV1(stage,org,job!.actorId,'submit',(job!.snapshot as any).approvalHash));
       const budget=await hggPilotFinancialV1(tx,org,job!.actorId,connection,stage,assertion.authorization,hggPilotAmountV1(job!.quote),this.connections.runtime.now(),job!.id,assertion.lastFrameRepair);
       if(hggPilotApprovalHashV1(stage,(job!.quote as any).quoteHash,budget.authorization)!==(job!.snapshot as any).approvalHash)return videoErrorV1('VIDEO_PILOT_AUTHORIZATION_CHANGED',409);
       const marked=await tx.videoSubscriptionJob.updateMany({where:{id,organizationId:org,state:'accepted',submitAttempts:0,leaseOwner:owner,leaseUntil:{gt:this.connections.runtime.now()}},data:{state:'submitting',submitAttempts:1,submittedAt:this.connections.runtime.now(),leaseUntil:new Date(this.connections.runtime.now().getTime()+240000),snapshot:json({...job!.snapshot as any,submitAttempt:{id:submitAttemptId,requestHash:stage.requestHash}})}});
       if(marked.count!==1)return videoErrorV1('VIDEO_JOB_LEASE_LOST',409);
      }),
      afterResult:async raw=>{await this.persistReceived(job,stage,submitAttemptId,raw);},
     }));
     await this.write(job,owner,{receipt:json(await this.receiptData(job,receipt,submitAttemptId)),state:receipt.inputChanged?'input_changed':'queued',errorCode:receipt.inputChanged?'VIDEO_PILOT_INPUTS_CHANGED':null});
    }else{
     if(job!.pollAttempts>=8640)return videoErrorV1('VIDEO_STATUS_DEADLINE',409);
     await this.write(job,owner,{pollAttempts:{increment:1}});
     const {result,raw}=await this.workspace.withContext(org,job!.actorId,job!.connectionId,stage.compiled.input.source.pilotId,stage.compiled.input.source.parentRevision,()=>this.provider.poll(def,credential.token,stage,job!.receipt as any,credential.assertUsable));
     const state=(job!.receipt as any)?.inputChanged?'input_changed':result.state==='lookup_unknown'?'status_delayed':result.state==='completed_unvalidated'?'saving':result.state==='terminal'?(result.status==='canceled'?'canceled':'failed'):'running';
     await this.write(job,owner,{state,providerResult:json({raw,candidateUrl:result.candidateResultUrl,continuationDelivered:false}),errorCode:state==='input_changed'?'VIDEO_PILOT_INPUTS_CHANGED':state==='status_delayed'?'VIDEO_PROVIDER_LOOKUP_UNKNOWN':null,...(state==='failed'||state==='canceled'?{finishedAt:this.connections.runtime.now()}:{})});
    }
   }
  }catch(e){
   const fresh=await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id,organizationId:org}});const code=hggPilotCodeV1(e);
   if(fresh.state==='submitting' && (fresh.receipt as any)?.raw){
    try{const receipt=this.provider.decodeReceipt(fresh.request as any,(fresh.receipt as any).raw);
     await this.write(fresh,owner,{receipt:json(await this.receiptData(fresh,receipt,(fresh.snapshot as any).submitAttempt.id)),state:receipt.inputChanged?'input_changed':['VIDEO_REAUTH_REQUIRED','VIDEO_CONNECTION_CHANGED','VIDEO_ACCESS_DENIED','VIDEO_PILOT_WORKSPACE_QUALIFICATION_REQUIRED'].includes(code)?'reauth_required':'queued',errorCode:receipt.inputChanged?'VIDEO_PILOT_INPUTS_CHANGED':code});
    }catch{await this.write(fresh,owner,{state:'submission_unknown',errorCode:code}).catch(()=>{});}
   }else{
   let state=fresh.state==='submitting'?'submission_unknown':fresh.state==='accepted'?'access_unavailable':['queued','running'].includes(fresh.state)?'status_delayed':fresh.state;
   if(code==='VIDEO_PILOT_CONNECTION_BUSY' && fresh.state==='accepted')state='accepted';
   if(fresh.state!=='submitting' && (code==='VIDEO_REAUTH_REQUIRED'||code==='VIDEO_CONNECTION_CHANGED'))state='reauth_required';
   await this.write(fresh,owner,{state,errorCode:code}).catch(()=>{});
   }
  }finally{await this.repository.db.videoSubscriptionJob.updateMany({where:{id,organizationId:org,leaseOwner:owner},data:{leaseOwner:null,leaseUntil:null}});}
  const fresh=await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id,organizationId:org}});
  return {state:fresh.state,done:!pending.includes(fresh.state) && !(fresh.state==='completed' && !(fresh.providerResult as any)?.continuationDelivered)};
 }
 private async save(job:any,owner:string,stage:HggPilotStoredStageV1){
  try{
   await this.write(job,owner,{saveAttempts:{increment:1}});let stored=job.storedFile;
   if(!stored){
    let url=job.providerResult?.candidateUrl;
    if(!url)url=await this.resultUrl(job,stage);
    if(!url)return videoErrorV1('VIDEO_PROVIDER_RESULT_MISSING',409);
    const importResult=(value:string)=>this.media.importResult(value,stage.stage==='clip'?'video':'image',stage.compiled.arguments.params.resolution==='720p'?'720p':'1080p');
    try{stored=await importResult(url);}catch(e){
     if(hggPilotCodeV1(e)!=='VIDEO_RESULT_DOWNLOAD_FAILED')throw e;
     const refreshed=await this.resultUrl(job,stage);if(!refreshed)throw e;stored=await importResult(refreshed);
    }
    await this.write(job,owner,{storedFile:json(stored)});
   }
   await this.repository.transaction(async tx=>{
    const fresh=await tx.videoSubscriptionJob.findFirst({where:{id:job.id,organizationId:job.organizationId,state:'saving',resultMediaId:null,leaseOwner:owner,leaseUntil:{gt:this.connections.runtime.now()}}});
    if(!fresh)return videoErrorV1('VIDEO_JOB_LEASE_LOST',409);
    const media=await tx.media.create({data:{organizationId:job.organizationId,name:stored.name,path:stored.path,fileSize:stored.size,type:stage.stage==='clip'?'video':'image',originalName:stored.name}});
    const changed=await tx.videoSubscriptionJob.updateMany({where:{id:job.id,organizationId:job.organizationId,state:'saving',resultMediaId:null,leaseOwner:owner},data:{state:'completed',resultMediaId:media.id,errorCode:null,finishedAt:this.connections.runtime.now()}});
    if(changed.count!==1)return videoErrorV1('VIDEO_JOB_LEASE_LOST',409);
   });
  }catch(e){await this.write(job,owner,{state:'save_failed',errorCode:hggPilotCodeV1(e)});}
 }
 private async resultUrl(job:any,stage:HggPilotStoredStageV1){
  if(stage.executionCredentials)await this.repository.transaction(tx=>assertHggExecutionCredentialsV2(tx,job.organizationId,job.actorId,stage.executionCredentials!,stage.workspace,this.connections.runtime.now()));
  const credential=await this.connections.token(job.organizationId,job.actorId,job.connectionId,job.generation,'pilot_recovery_v1',{allowRefresh:false,pilotQualificationId:stage.executionCredentials?.currentWorkspace.qualificationId??stage.workspace.qualificationId});
  const def=await this.connections.connectable(job.organizationId,'higgsfield');
  const status=await this.workspace.withContext(job.organizationId,job.actorId,job.connectionId,stage.compiled.input.source.pilotId,stage.compiled.input.source.parentRevision,()=>this.provider.poll(def,credential.token,stage,job.receipt,credential.assertUsable));
  return status.result.state==='completed_unvalidated'?status.result.candidateResultUrl:undefined;
 }
 private async continueParent(job:any,owner:string,stage:HggPilotStoredStageV1){
  await this.parents.onStageSettled({eventId:job.id,organizationId:job.organizationId,actorId:job.actorId,pilotId:stage.compiled.input.source.pilotId,stage:stage.stage,jobId:job.id});
  await this.write(job,owner,{providerResult:json({...job.providerResult,continuationDelivered:true})});
 }
}
