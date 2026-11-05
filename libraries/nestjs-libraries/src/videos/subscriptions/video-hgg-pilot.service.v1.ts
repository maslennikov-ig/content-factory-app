import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoConnectionService } from './video-connection.service';
import { subscriptionHash } from './video-provider-registry';
import { HiggsfieldPilotProviderV1 } from '../providers/higgsfield-pilot.provider.v1';
import { HggPilotWorkspaceServiceV1 } from './video-hgg-workspace.service.v1';
import { HggPilotParentPortV1 } from './video-hgg-pilot-parent.port.v1';
import { HggPilotExecutionV1 } from './video-hgg-pilot-execution.v1';
import { HggPilotMediaV1 } from '../hgg-pilot-media.v1';
import { creditPeriod } from './video-credit-policy';
import { hggPilotAmountV1,hggPilotBindingHashV1,hggPilotCodeV1,hggPilotFinancialV1,hggPilotReferencesV1,hggPilotQuotedInputsV1 } from './video-hgg-pilot-policy.v1';
import { HGG_PILOT_STAGE_KIND_V1,HggPilotAuthorizationSchemaV1,hggPilotStageOfV1,hggPilotExpectedV1,hggPilotApprovalHashV1,type HggPilotServicePortV1,type HggPilotStagePreparationV1,type HggPilotStoredStageV1,type HggPilotStagePublicV1,type HggPilotWorkspacePreparationV1,type HggPilotRecoveryActionV1 } from './video-hgg-pilot-stage.v1';
import { assertHggExecutionCredentialsV2, type HggCredentialRenewalRequestV2, type HggExecutionCredentialsV2 } from './video-hgg-pilot-credentials.v2';
const json=(v:unknown):any=>v;
const ref=z.object({jobId:z.string().min(1),ownedMediaId:z.string().min(1),byteSha256:z.string().regex(/^[a-f0-9]{64}$/),providerJobId:z.string().uuid(),workspaceBindingHash:z.string().regex(/^[a-f0-9]{64}$/),connectionId:z.string().optional(),accountGeneration:z.number().int().positive().optional(),providerMediaId:z.string().uuid().optional()}).strict();
const preparation=z.object({intentId:z.string().min(1).max(200),connectionId:z.string().min(1),accountGeneration:z.number().int().positive(),workspaceQualificationId:z.string().min(1),publicOutputLocale:z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/),input:z.unknown(),references:z.array(ref).max(2)}).strict();
@Injectable()
export class HggPilotServiceV1 implements HggPilotServicePortV1 {
 constructor(readonly repository:VideoSubscriptionRepository,readonly connections:VideoConnectionService,readonly provider:HiggsfieldPilotProviderV1,
 readonly workspace:HggPilotWorkspaceServiceV1,readonly parents:HggPilotParentPortV1,readonly execution:HggPilotExecutionV1,readonly media:HggPilotMediaV1){}
 qualifyWorkspace(org:string,actor:string,input:HggPilotWorkspacePreparationV1){return this.workspace.qualify(org,actor,input);}
 discoverWorkspace(org:string,actor:string,input:Pick<HggPilotWorkspacePreparationV1,'intentId'|'pilotId'|'parentRevision'|'selectionAuthorizationId'>){return this.workspace.discover(org,actor,input);}
 private credentialBindingId(org:string,actor:string,input:HggCredentialRenewalRequestV2){return subscriptionHash({kind:'hgg-execution-credential/v2',org,actor,pilotId:input.pilotId,renewalId:input.renewalId});}
 private async lookupCredentialBindingV2(org:string,actor:string,input:HggCredentialRenewalRequestV2):Promise<HggExecutionCredentialsV2|null>{
  const id=this.credentialBindingId(org,actor,input);
  return this.repository.transaction(async tx=>{
   const connection=await this.repository.connection(org,actor,input.connectionId,tx,false);
   await this.parents.assertCredentialRenewalV2(tx,{...input,organizationId:org,actorId:actor});
   const row=await tx.videoAccessPreflight.findUnique({where:{id,organizationId:org,actorId:actor}});
   if(!row)return null;
   const credentials=(row.snapshot as any)?.credentials as HggExecutionCredentialsV2;
   if(row.organizationId!==org || row.actorId!==actor || row.connectionId!==input.connectionId || row.generation!==input.accountGeneration || !credentials)return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);
   const {executionBindingHash,...core}=credentials;
   if(credentials.version!==2 || subscriptionHash(core)!==executionBindingHash || credentials.pilotId!==input.pilotId || credentials.renewalId!==input.renewalId || credentials.originContextDigest!==input.originContextDigest || credentials.originWorkspaceBindingHash!==input.originWorkspace.bindingHash || credentials.retainedReferencesDigest!==subscriptionHash(input.references) || credentials.connectionId!==input.connectionId || credentials.accountGeneration!==input.accountGeneration || connection.generation!==credentials.accountGeneration || connection.tokenVersion!==credentials.currentWorkspace.tokenVersion)return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);
   await assertHggExecutionCredentialsV2(tx,org,actor,credentials,input.originWorkspace,this.connections.runtime.now());
   return credentials;
  });
 }
 async readCredentialBindingV2(org:string,actor:string,input:HggCredentialRenewalRequestV2):Promise<HggExecutionCredentialsV2|null>{
  const existing=await this.lookupCredentialBindingV2(org,actor,input);if(existing)return existing;
  const receiptId=subscriptionHash({kind:'hgg-same-grant-renewal/v1',connectionId:input.connectionId,generation:input.accountGeneration,tokenVersion:input.originWorkspace.tokenVersion});
  const completed=await this.repository.transaction(async tx=>{
   const connection=await this.repository.connection(org,actor,input.connectionId,tx,false);
   await this.parents.assertCredentialRenewalV2(tx,{...input,organizationId:org,actorId:actor});
   const row=await tx.videoAccessPreflight.findUnique({where:{id:receiptId,organizationId:org,actorId:actor}}),snapshot=row?.snapshot as any;
   return row?.actorId===actor && row.connectionId===input.connectionId && row.generation===input.accountGeneration && snapshot?.kind==='hgg-same-grant-renewal/v1' && snapshot.state==='completed' && connection.generation===input.accountGeneration && connection.tokenVersion===input.originWorkspace.tokenVersion+1;
  });
  // Recovery may observe the original workspace and persist an envelope, but
  // never dispatches an OAuth refresh or a financial operation.
  return completed?this.finishCredentialBindingV2(org,actor,input):null;
 }
 async renewCredentialBindingV2(org:string,actor:string,input:HggCredentialRenewalRequestV2):Promise<HggExecutionCredentialsV2>{
  const existing=await this.lookupCredentialBindingV2(org,actor,input);if(existing)return existing;
  if(input.originWorkspace.connectionId!==input.connectionId || input.originWorkspace.accountGeneration!==input.accountGeneration)return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);
  const expected={...input,organizationId:org,actorId:actor};
  await this.workspace.withContext(org,actor,input.connectionId,input.pilotId,input.parentRevision,()=>this.connections.renewOwnedGrantV1(org,actor,{connectionId:input.connectionId,accountGeneration:input.accountGeneration,tokenVersion:input.originWorkspace.tokenVersion,pilotId:input.pilotId,parentRevision:input.parentRevision},tx=>this.parents.assertCredentialRenewalV2(tx,expected)));
  return this.finishCredentialBindingV2(org,actor,input);
 }
 private async finishCredentialBindingV2(org:string,actor:string,input:HggCredentialRenewalRequestV2):Promise<HggExecutionCredentialsV2>{
  const expected={...input,organizationId:org,actorId:actor};
  const models=await this.workspace.models(org,actor,input.originWorkspace.qualificationId);
  const currentWorkspace=await this.workspace.qualify(org,actor,{intentId:subscriptionHash({kind:'hgg-renewed-workspace/v2',org,actor,pilotId:input.pilotId,renewalId:input.renewalId}),pilotId:input.pilotId,parentRevision:input.parentRevision,connectionId:input.connectionId,accountGeneration:input.accountGeneration,workspaceId:input.originWorkspace.workspaceId},models);
  if(currentWorkspace.workspaceId!==input.originWorkspace.workspaceId || currentWorkspace.tokenVersion!==input.originWorkspace.tokenVersion+1)return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);
  const core={version:2 as const,renewalId:input.renewalId,pilotId:input.pilotId,originContextDigest:input.originContextDigest,connectionId:input.connectionId,accountGeneration:input.accountGeneration,originWorkspaceBindingHash:input.originWorkspace.bindingHash,currentWorkspace,retainedReferencesDigest:subscriptionHash(input.references)};
  const credentials={...core,executionBindingHash:subscriptionHash(core)};
  await this.repository.transaction(async tx=>{
   const connection=await this.repository.connection(org,actor,input.connectionId,tx,false);
   await this.parents.assertCredentialRenewalV2(tx,expected);
   if(connection.generation!==input.accountGeneration || connection.tokenVersion!==currentWorkspace.tokenVersion)return videoErrorV1('VIDEO_CONNECTION_CHANGED',409);
   const id=this.credentialBindingId(org,actor,input),row=await tx.videoAccessPreflight.findUnique({where:{id,organizationId:org,actorId:actor}});
   if(row){if(subscriptionHash((row.snapshot as any)?.credentials)!==subscriptionHash(credentials))return videoErrorV1('VIDEO_PILOT_RENEWAL_INVALID',409);return;}
   await tx.videoAccessPreflight.create({data:{id,organizationId:org,actorId:actor,draftId:input.pilotId,draftVersion:input.parentRevision,draftDigest:credentials.executionBindingHash,access:json({kind:'hgg-execution-credential/v2'}),snapshot:json({kind:'hgg-execution-credential/v2',credentials}),request:{},quote:{},connectionId:input.connectionId,generation:input.accountGeneration,expiresAt:new Date(new Date(currentWorkspace.observedAt).getTime()+86400000)}});
  });
  return credentials;
 }
 quotePlanningClip(org:string,actor:string,input:HggPilotStagePreparationV1){
  if(input.input?.kind!=='video' || input.input.frames.length || input.references.length)return videoErrorV1('VIDEO_PILOT_PLANNING_INVALID',409);
  return this.quote(org,actor,input);
 }
 private async owned(org:string,actor:string,id:string){
  await this.repository.member(org,actor);const row=await this.repository.db.videoAccessPreflight.findFirst({where:{id,organizationId:org,actorId:actor}});
  if((row?.request as any)?.kind!==HGG_PILOT_STAGE_KIND_V1)return videoErrorV1('VIDEO_PREFLIGHT_NOT_FOUND',404);return row!;
 }
 private async verifyBytes(org:string,actor:string,stage:HggPilotStoredStageV1){
  for(const r of stage.references){const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{id:r.jobId,organizationId:org,actorId:actor}});if(!job?.storedFile)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);await this.media.assertOwnedImage(job.storedFile as any);}
 }
 async quote(org:string,actor:string,value:HggPilotStagePreparationV1):Promise<HggPilotStagePublicV1>{return this.quoteInternal(org,actor,value);}
 async quoteWithCredentialsV2(org:string,actor:string,value:HggPilotStagePreparationV1,credentials:HggExecutionCredentialsV2):Promise<HggPilotStagePublicV1>{return this.quoteInternal(org,actor,value,credentials);}
 private async quoteInternal(org:string,actor:string,value:HggPilotStagePreparationV1,credentials?:HggExecutionCredentialsV2):Promise<HggPilotStagePublicV1>{
  const parsed=preparation.safeParse(value);if(!parsed.success)return videoErrorV1('VIDEO_PILOT_REQUEST_INVALID',409);const input=parsed.data as HggPilotStagePreparationV1;
  await this.repository.member(org,actor);
  const workspace=await this.workspace.load(org,actor,input.workspaceQualificationId,input.connectionId,input.accountGeneration,!!credentials);
  const credential=await this.connections.token(org,actor,input.connectionId,input.accountGeneration,'pilot_context_v1',{allowRefresh:false});
  if((credentials?.currentWorkspace.tokenVersion??workspace.tokenVersion)!==credential.connection.tokenVersion)return videoErrorV1('VIDEO_CONNECTION_CHANGED',409);
  const compiled=this.provider.compile(input.input as any,{organizationId:org,actorId:actor,connectionId:input.connectionId,accountGeneration:input.accountGeneration},await this.workspace.models(org,actor,input.workspaceQualificationId));
  const now=this.connections.runtime.now();
  const base={kind:HGG_PILOT_STAGE_KIND_V1,version:1 as const,stage:hggPilotStageOfV1(compiled.input),publicOutputLocale:input.publicOutputLocale,compiled,workspace,references:input.references,planningOnly:compiled.input.kind==='video'&&compiled.input.frames.length===0,...(credentials?{executionCredentials:credentials}:{})};
  const stage:HggPilotStoredStageV1={...base,requestHash:hggPilotBindingHashV1(base),capturedAt:now.toISOString(),localAdmissionExpiresAt:new Date(now.getTime()+600000).toISOString()};
  await this.verifyBytes(org,actor,stage);
  const created=await this.repository.transaction(async tx=>{
   await this.repository.connection(org,actor,input.connectionId,tx,false);
   if(credentials){await assertHggExecutionCredentialsV2(tx,org,actor,credentials,workspace,now);await this.parents.assertCurrentPilotWithCredentialsV2(tx,{...hggPilotExpectedV1(stage,org,actor,'quote'),executionCredentials:credentials});}
   else await this.parents.assertCurrentPilot(tx,hggPilotExpectedV1(stage,org,actor,'quote'));
   await hggPilotReferencesV1(tx,org,actor,stage);
   const intent=await tx.videoRouteIntent.findUnique({where:{organizationId_intentId:{organizationId:org,intentId:input.intentId}}});
   if(intent){
    if(intent.actorId!==actor || intent.accessDigest!==stage.requestHash)return videoErrorV1('VIDEO_INTENT_MISMATCH',409);
    const row=await tx.videoAccessPreflight.findFirstOrThrow({where:{id:intent.preflightId,organizationId:org,actorId:actor}}),snapshot=row.snapshot as any;
    const existingJob=await tx.videoSubscriptionJob.findFirst({where:{organizationId:org,...(credentials?{OR:[{preflightId:row.id},{intentId:input.intentId}]}:{preflightId:row.id})}});
    if(!existingJob && (snapshot.state==='quoted' && row.expiresAt<=now || snapshot.state==='quote_failed' && snapshot.errorCode==='VIDEO_PILOT_CONNECTION_BUSY')){
     const updated=await tx.videoAccessPreflight.updateMany({where:{id:row.id,organizationId:org,actorId:actor,expiresAt:row.expiresAt,snapshot:{path:['state'],equals:snapshot.state},...(snapshot.state==='quote_failed'?{AND:[{snapshot:{path:['errorCode'],equals:'VIDEO_PILOT_CONNECTION_BUSY'}}]}:{})},data:{request:json(stage),quote:{},expiresAt:new Date(stage.localAdmissionExpiresAt),snapshot:json({...snapshot,state:'quote_pending',priorQuotes:[...(snapshot.priorQuotes||[]),{quote:row.quote,request:row.request,rawQuote:snapshot.rawQuote}],quoteAttempt:(snapshot.quoteAttempt||1)+1})}});
     return {row,fresh:updated.count===1};
    }
    return {row,fresh:false};
   }
   const row=await tx.videoAccessPreflight.create({data:{organizationId:org,actorId:actor,draftId:compiled.input.source.pilotId,draftVersion:compiled.input.source.parentRevision,draftDigest:stage.requestHash,
    access:json({kind:HGG_PILOT_STAGE_KIND_V1,connectionId:input.connectionId}),snapshot:json({kind:HGG_PILOT_STAGE_KIND_V1,state:'quote_pending',intentId:input.intentId}),request:json(stage),quote:{},connectionId:input.connectionId,generation:input.accountGeneration,schemaDigest:compiled.schemaDigest,expiresAt:new Date(stage.localAdmissionExpiresAt)}});
   await tx.videoRouteIntent.create({data:{organizationId:org,actorId:actor,intentId:input.intentId,preflightId:row.id,accessDigest:stage.requestHash}});return {row,fresh:true};
  });
  if(!created.fresh)return this.read(org,actor,created.row.id);
  try{
   const def=await this.connections.connectable(org,'higgsfield');
   const quote=await this.workspace.withContext(org,actor,input.connectionId,compiled.input.source.pilotId,compiled.input.source.parentRevision,()=>this.provider.quote(def,credential.token,stage,credential.assertUsable,{afterResult:async raw=>{
    const previous=await this.repository.db.videoAccessPreflight.findFirstOrThrow({where:{id:created.row.id,organizationId:org,actorId:actor}});
    await this.repository.db.videoAccessPreflight.updateMany({where:{id:created.row.id,organizationId:org,actorId:actor},data:{snapshot:json({...previous.snapshot as any,state:'quote_pending',rawQuote:raw})}});
   }}));
   await credential.assertUsable();
   stage.capturedAt=this.connections.runtime.now().toISOString();stage.localAdmissionExpiresAt=new Date(this.connections.runtime.now().getTime()+600000).toISOString();
   await this.repository.transaction(async tx=>{
    if(credentials){await assertHggExecutionCredentialsV2(tx,org,actor,credentials,workspace,this.connections.runtime.now());await this.parents.assertCurrentPilotWithCredentialsV2(tx,{...hggPilotExpectedV1(stage,org,actor,'quote'),executionCredentials:credentials});}
    else await this.parents.assertCurrentPilot(tx,hggPilotExpectedV1(stage,org,actor,'quote'));
    await tx.videoAccessPreflight.updateMany({where:{id:created.row.id,organizationId:org,actorId:actor},data:{quote:json(quote),request:json(stage),expiresAt:new Date(stage.localAdmissionExpiresAt),snapshot:json({...((await tx.videoAccessPreflight.findUnique({where:{id:created.row.id,organizationId:org,actorId:actor}}))!.snapshot as any),state:'quoted'})}});
   });
  }catch(e){await this.repository.db.videoAccessPreflight.updateMany({where:{id:created.row.id,organizationId:org,actorId:actor},data:{snapshot:json({...((await this.repository.db.videoAccessPreflight.findUnique({where:{id:created.row.id,organizationId:org,actorId:actor}}))!.snapshot as any),state:'quote_failed',errorCode:hggPilotCodeV1(e)})}});}
  return this.read(org,actor,created.row.id);
 }
 async getByIntent(org:string,actor:string,intentId:string){
  await this.repository.member(org,actor);const intent=await this.repository.db.videoRouteIntent.findUnique({where:{organizationId_intentId:{organizationId:org,intentId}}});
  if(!intent)return null;if(intent.actorId!==actor)return videoErrorV1('VIDEO_ACCESS_DENIED',403);return this.read(org,actor,intent.preflightId);
 }
 private async assessment(tx:any,org:string,actor:string,row:any,action:'quote'|'admit'|'submit'='quote'){
  const stage=row.request as unknown as HggPilotStoredStageV1;const quote=row.quote as any;
  if(stage.planningOnly)return videoErrorV1('VIDEO_PILOT_PLANNING_ONLY',409);
  if(!quote.quoteHash)return videoErrorV1('VIDEO_PRICE_UNAVAILABLE',409);
  hggPilotQuotedInputsV1(quote);
  if(row.expiresAt<=this.connections.runtime.now())return videoErrorV1('VIDEO_PREFLIGHT_STALE',409);
  const context=await this.workspace.load(org,actor,stage.workspace.qualificationId,stage.workspace.connectionId,stage.workspace.accountGeneration,!!stage.executionCredentials);
  if(context.bindingHash!==stage.workspace.bindingHash)return videoErrorV1('VIDEO_PILOT_WORKSPACE_CHANGED',409);
  const connection=await this.repository.connection(org,actor,stage.workspace.connectionId,tx,false);
  if(connection.generation!==stage.workspace.accountGeneration || connection.tokenVersion!==(stage.executionCredentials?.currentWorkspace.tokenVersion??stage.workspace.tokenVersion))return videoErrorV1('VIDEO_CONNECTION_CHANGED',409);
  if(stage.executionCredentials)await assertHggExecutionCredentialsV2(tx,org,actor,stage.executionCredentials,stage.workspace,this.connections.runtime.now());
  const assertion=stage.executionCredentials?await this.parents.assertCurrentPilotWithCredentialsV2(tx,{...hggPilotExpectedV1(stage,org,actor,'quote'),executionCredentials:stage.executionCredentials}):await this.parents.assertCurrentPilot(tx,hggPilotExpectedV1(stage,org,actor,'quote'));
  if(assertion.lastFrameRepair && assertion.lastFrameRepair.intentId!==(row.snapshot as any).intentId)return videoErrorV1('VIDEO_PILOT_REPAIR_BINDING_CHANGED',409);
  await hggPilotReferencesV1(tx,org,actor,stage,true);
  const amount=hggPilotAmountV1(quote);
  const budget=await hggPilotFinancialV1(tx,org,actor,connection,stage,assertion.authorization,amount,this.connections.runtime.now(),undefined,assertion.lastFrameRepair);
  const approvalHash=hggPilotApprovalHashV1(stage,quote.quoteHash,budget.authorization);
  if(action!=='quote'){
   const expected=hggPilotExpectedV1(stage,org,actor,action,approvalHash);
   if(stage.executionCredentials)await this.parents.assertCurrentPilotWithCredentialsV2(tx,{...expected,executionCredentials:stage.executionCredentials});
   else await this.parents.assertCurrentPilot(tx,expected);
  }
  return {stage,quote,connection,budget,amount,approvalHash,lastFrameRepair:assertion.lastFrameRepair};
 }
 async read(org:string,actor:string,id:string):Promise<HggPilotStagePublicV1>{
  const row=await this.owned(org,actor,id),stage=row.request as unknown as HggPilotStoredStageV1,quote=row.quote as any,snapshot=row.snapshot as any;
  const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{preflightId:id,organizationId:org,actorId:actor}});
  let assessment:Awaited<ReturnType<HggPilotServiceV1['assessment']>>|undefined,blockers:string[]=[];
  if(!job && quote.quoteHash){try{await this.verifyBytes(org,actor,stage);assessment=await this.repository.transaction(tx=>this.assessment(tx,org,actor,row,'quote'));}catch(e){blockers.push(hggPilotCodeV1(e));}}
  if(assessment){try{await this.repository.transaction(tx=>stage.executionCredentials?this.parents.assertCurrentPilotWithCredentialsV2(tx,{...hggPilotExpectedV1(stage,org,actor,'admit',assessment!.approvalHash),executionCredentials:stage.executionCredentials}):this.parents.assertCurrentPilot(tx,hggPilotExpectedV1(stage,org,actor,'admit',assessment!.approvalHash)));}catch(e){blockers.push(hggPilotCodeV1(e));}}
  if(!quote.quoteHash)blockers.push(snapshot.errorCode||'VIDEO_PRICE_UNAVAILABLE');
  const file=job?.storedFile as any;const owned=job?.resultMediaId?await this.repository.db.media.findFirst({where:{id:job.resultMediaId,organizationId:org,deletedAt:null}}):null;
  let budget=assessment?.budget;
  if(job){const authorization=HggPilotAuthorizationSchemaV1.safeParse((job.snapshot as any)?.authorization);if(authorization.success){
   const all=await this.repository.db.videoSubscriptionJob.findMany({where:{organizationId:org,actorId:actor}});
   const pilot=all.filter(j=>(j.request as any)?.kind===HGG_PILOT_STAGE_KIND_V1 && (j.request as any).compiled.input.source.pilotId===stage.compiled.input.source.pilotId);
   const reserved=pilot.reduce((sum,j)=>sum.plus(j.actualCost??j.reserved),new Prisma.Decimal(0));
   budget={authorization:authorization.data,reserved,remaining:Prisma.Decimal.max(0,new Prisma.Decimal(authorization.data.pilotLimit).minus(reserved)),actualChargeUnknown:pilot.some(j=>j.actualCost===null)};
  }}
  const cost=job?.actualCost?.toFixed()??null;
  return {version:1,pilotId:stage.compiled.input.source.pilotId,stage:stage.stage,preflightId:id,...(job?{jobId:job.id}:{}),
   state:job?(job.state==='completed'?'saved':job.state) as any:assessment&&!blockers.length?'ready':snapshot.state==='quote_pending'?'quote_pending':snapshot.state==='quote_failed'?'quote_failed':blockers.includes('VIDEO_PILOT_BUDGET_REQUIRED')?'awaiting_budget':'awaiting_approval',
   bindingHash:stage.requestHash,approvalHash:assessment?.approvalHash??null,canSubmit:!!assessment&&!job&&!blockers.length,localInputValidated:!!assessment,validationSource:'cf_owned_source_and_assets',blockers,recoveryActions:job?(job.state==='save_failed'?['retry_save']:job.receipt && ['status_delayed','reauth_required','queued','running','input_changed'].includes(job.state)?['status_read']:[]):[],
   quote:quote.quoteHash?{amount:hggPilotAmountV1(quote).toFixed(),unit:'higgsfield_credit',source:'provider',capturedAt:stage.capturedAt,observationSource:'local_receive_clock',providerInputValidated:false,localAdmissionExpiresAt:stage.localAdmissionExpiresAt,providerBillingCap:false}:null,
   ownerLimit:budget?{authorizationId:budget.authorization.id,unit:'higgsfield_credit',pilotLimit:budget.authorization.pilotLimit,stageLimit:budget.authorization.stageLimit,includedStages:budget.authorization.stages,authorized:true,reserved:budget.reserved.toFixed(),remaining:budget.remaining.toFixed(),remainingSource:'local_authorization',actualChargeUnknown:budget.actualChargeUnknown}:null,
   cost:{amount:cost,unit:'higgsfield_credit',certainty:cost?job!.costCertainty as any:'unknown'},result:job?.state==='completed'&&owned&&file&&owned.path===file.path&&owned.type===(stage.stage==='clip'?'video':'image')?{ownedMediaId:owned.id,path:owned.path,mime:file.mime,width:file.width,height:file.height,byteSha256:file.byteSha256,...(file.durationSeconds!==undefined?{durationSeconds:file.durationSeconds}:{})}:null,errorCode:job?.errorCode??snapshot.errorCode??null};
 }
 async admit(org:string,actor:string,id:string,approvalHash:string){
  const row=await this.owned(org,actor,id);await this.verifyBytes(org,actor,row.request as any);
  const job=await this.repository.transaction(async tx=>{
   const previous=await tx.videoSubscriptionJob.findFirst({where:{preflightId:id,organizationId:org,actorId:actor}});if(previous)return previous;
   const a=await this.assessment(tx,org,actor,row,'admit');if(a.approvalHash!==approvalHash)return videoErrorV1('VIDEO_PREFLIGHT_STALE',409);
   const s=a.stage,source=s.compiled.input.source;
   if(a.lastFrameRepair && a.lastFrameRepair.intentId!==(row.snapshot as any).intentId)return videoErrorV1('VIDEO_PILOT_REPAIR_BINDING_CHANGED',409);
   return tx.videoSubscriptionJob.create({data:{organizationId:org,actorId:actor,pieceId:source.sourceArtifactRef.pieceId,pieceRevision:source.sourceArtifactRef.revision,draftId:source.pilotId,draftVersion:source.parentRevision,preflightId:id,intentId:(row.snapshot as any).intentId,connectionId:s.workspace.connectionId,walletDigest:`observed:${s.workspace.bindingHash}`,generation:s.workspace.accountGeneration,provider:'higgsfield',unit:'higgsfield_credit',snapshot:json({kind:HGG_PILOT_STAGE_KIND_V1,pilotId:source.pilotId,approvalHash,authorization:a.budget.authorization,...(s.executionCredentials?{executionBindingHash:s.executionCredentials.executionBindingHash}:{}),...(a.lastFrameRepair?{lastFrameRepair:a.lastFrameRepair}:{})}),request:json(s),quote:json(a.quote),reserved:a.amount,period:creditPeriod(this.connections.runtime.now()),statusDeadlineAt:new Date(this.connections.runtime.now().getTime()+86400000),state:'accepted'}});
  });
  await this.execution.dispatch(job);return this.read(org,actor,id);
 }
 async recover(org:string,actor:string,id:string,action:HggPilotRecoveryActionV1){
  await this.owned(org,actor,id);if(!['status_read','retry_save'].includes(action))return videoErrorV1('VIDEO_INVALID_INPUT',409);
  const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{preflightId:id,organizationId:org,actorId:actor}});if(!job)return videoErrorV1('VIDEO_JOB_NOT_FOUND',404);
  if(action==='retry_save'&&job.state==='save_failed' || action==='status_read'&&job.receipt&&['status_delayed','reauth_required','input_changed'].includes(job.state)){
   await this.repository.db.videoSubscriptionJob.updateMany({where:{id:job.id,organizationId:org,actorId:actor,state:job.state,OR:[{leaseUntil:null},{leaseUntil:{lt:this.connections.runtime.now()}}]},data:{state:action==='retry_save'?'saving':'queued',errorCode:null,runCycle:{increment:1},statusDeadlineAt:new Date(this.connections.runtime.now().getTime()+86400000)}});
   await this.execution.dispatch(await this.repository.db.videoSubscriptionJob.findUniqueOrThrow({where:{id:job.id,organizationId:org,actorId:actor}}));
  }
  return this.read(org,actor,id);
 }
 async frameReceipt(org:string,actor:string,id:string){
  await this.owned(org,actor,id);const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{preflightId:id,organizationId:org,actorId:actor,state:'completed'}});
  const s=job?.request as unknown as HggPilotStoredStageV1,receipt=job?.receipt as any,file=job?.storedFile as any;
  if(!job || s.stage==='clip' || receipt?.profile!=='hgg_pilot_job_v1' || receipt.kind!=='image' || !job.resultMediaId || !file)return videoErrorV1('VIDEO_PILOT_FRAME_NOT_SAVED',409);
  const media=await this.repository.db.media.findFirst({where:{id:job.resultMediaId,organizationId:org,type:'image',deletedAt:null}});
  const connection=await this.repository.connection(org,actor,job.connectionId,this.repository.db,false);
  if(!media || media.path!==file.path || connection.generation!==job.generation || connection.tokenVersion!==s.workspace.tokenVersion)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);
  await this.media.assertOwnedImage(file);
  return {jobId:job.id,ownedMediaId:media.id,byteSha256:file.byteSha256,providerJobId:receipt.jobId,workspaceBindingHash:s.workspace.bindingHash,connectionId:job.connectionId,accountGeneration:job.generation,providerMediaId:receipt.jobId};
 }
 async frameReceiptWithCredentialsV2(org:string,actor:string,id:string,credentials:HggExecutionCredentialsV2){
  await this.owned(org,actor,id);
  const job=await this.repository.db.videoSubscriptionJob.findFirst({where:{preflightId:id,organizationId:org,actorId:actor,state:'completed'}});
  const stage=job?.request as unknown as HggPilotStoredStageV1,receipt=job?.receipt as any,file=job?.storedFile as any;
  if(!job || !stage || stage.stage==='clip' || receipt?.profile!=='hgg_pilot_job_v1' || receipt.kind!=='image' || receipt.inputChanged || !job.resultMediaId || !file || stage.compiled.input.source.pilotId!==credentials.pilotId || job.connectionId!==credentials.connectionId || job.generation!==credentials.accountGeneration || stage.workspace.bindingHash!==credentials.originWorkspaceBindingHash || stage.executionCredentials && subscriptionHash(stage.executionCredentials)!==subscriptionHash(credentials))return videoErrorV1('VIDEO_PILOT_FRAME_NOT_SAVED',409);
  await this.repository.transaction(async tx=>{
   const connection=await this.repository.connection(org,actor,job.connectionId,tx,false);
   await assertHggExecutionCredentialsV2(tx,org,actor,credentials,stage.workspace,this.connections.runtime.now());
   if(connection.generation!==job.generation || connection.tokenVersion!==credentials.currentWorkspace.tokenVersion)return videoErrorV1('VIDEO_CONNECTION_CHANGED',409);
  });
  const media=await this.repository.db.media.findFirst({where:{id:job.resultMediaId,organizationId:org,type:'image',deletedAt:null}});
  if(!media || media.path!==file.path)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);
  await this.media.assertOwnedImage(file);
  return {jobId:job.id,ownedMediaId:media.id,byteSha256:file.byteSha256,providerJobId:receipt.jobId,workspaceBindingHash:stage.executionCredentials?credentials.currentWorkspace.bindingHash:stage.workspace.bindingHash,connectionId:job.connectionId,accountGeneration:job.generation,providerMediaId:receipt.jobId};
 }
}
