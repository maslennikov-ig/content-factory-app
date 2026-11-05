import { Injectable } from '@nestjs/common';
import { VideoSubscriptionRepository } from '../../database/prisma/video-subscription/video-subscription.repository';
import { authenticatedSession } from '../../user/authenticated.session';
import { videoErrorV1 } from '../video-brief.v1';
import { VideoConnectionService } from './video-connection.service';
import { VideoMcpClient } from './video-mcp-client';
import { subscriptionHash } from './video-provider-registry';
import { HggPilotParentPortV1 } from './video-hgg-pilot-parent.port.v1';
import type { HggPilotWorkspaceBindingV1, HggPilotWorkspacePreparationV1 } from './video-hgg-pilot-stage.v1';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { decodeHggReadV1 } from './video-hgg-qualification-read.v1';
import { hggPilotNativeModelsV1,type HggPilotNativeModelsV1 } from './video-hgg-pilot-native-profile.v1';
const inputSchema=z.object({intentId:z.string().min(1).max(200),pilotId:z.string().min(1).max(512),parentRevision:z.number().int().positive(),connectionId:z.string().min(1),accountGeneration:z.number().int().positive(),workspaceId:z.string().min(1).max(512).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)),selectionAuthorizationId:z.string().min(1).max(512).optional()}).strict();
const json=(v:unknown):any=>v;
@Injectable()
export class HggPilotWorkspaceServiceV1 {
 constructor(readonly repository:VideoSubscriptionRepository,readonly connections:VideoConnectionService,readonly mcp:VideoMcpClient,readonly parents:HggPilotParentPortV1){}
 /** One durable CF context lease per owned connection; outside-CF changes remain non-atomic. */
 async withContext<T>(org:string,actor:string,connectionId:string,pilotId:string,parentRevision:number,run:()=>Promise<T>):Promise<T>{
  const id=subscriptionHash({kind:'hgg-pilot-context-lease/v1',connectionId}),owner=randomUUID(),now=this.connections.runtime.now();
  await this.repository.transaction(async tx=>{
   await this.repository.connection(org,actor,connectionId,tx,false);
   const row=await tx.videoAccessPreflight.findUnique({where:{id}});
   if(!row)await tx.videoAccessPreflight.create({data:{id,organizationId:org,actorId:actor,draftId:pilotId,draftVersion:parentRevision,draftDigest:id,access:{kind:'hgg-pilot-context-lease/v1'},snapshot:{kind:'hgg-pilot-context-lease/v1'},request:{},quote:{},connectionId,expiresAt:new Date(0)}});
   const changed=await tx.videoAccessPreflight.updateMany({where:{id,actorId:actor,connectionId,expiresAt:{lte:now}},data:{expiresAt:new Date(now.getTime()+240000),snapshot:{kind:'hgg-pilot-context-lease/v1',owner}}});
   if(changed.count!==1)return videoErrorV1('VIDEO_PILOT_CONNECTION_BUSY',409);
  });
  try{return await run();}finally{
   await this.repository.db.videoAccessPreflight.updateMany({where:{id,actorId:actor,connectionId,snapshot:{path:['owner'],equals:owner}},data:{expiresAt:this.connections.runtime.now(),snapshot:{kind:'hgg-pilot-context-lease/v1'}}}).catch(()=>{});
  }
 }
 async discover(org:string,actor:string,input:Pick<HggPilotWorkspacePreparationV1,'intentId'|'pilotId'|'parentRevision'|'selectionAuthorizationId'>){
  const parsed=inputSchema.omit({connectionId:true,accountGeneration:true,workspaceId:true}).safeParse(input);
  if(!parsed.success)return videoErrorV1('VIDEO_PILOT_WORKSPACE_INVALID',409);input=parsed.data as typeof input;
  if(authenticatedSession()?.actorId!==actor)return videoErrorV1('VIDEO_ACCESS_DENIED',403);await this.repository.member(org,actor);
  const candidates=await this.repository.db.videoSubscriptionConnection.findMany({where:{ownerId:actor,provider:'higgsfield',state:{in:['connected','discovery_required']},encryptedTokens:{not:null}}});
  const granted=[];for(const c of candidates){const grant=await this.repository.db.videoSubscriptionGrant.findUnique({where:{connectionId_organizationId:{connectionId:c.id,organizationId:org}}});if(grant?.enabled)granted.push(c);}
  if(granted.length!==1)return videoErrorV1(granted.length?'VIDEO_PILOT_CONNECTION_CHOICE_REQUIRED':'VIDEO_PILOT_CONNECTION_REQUIRED',409);
  const connection=granted[0],credential=await this.connections.token(org,actor,connection.id,connection.generation,'pilot_context_v1',{allowRefresh:false});
  const discovery=await this.mcp.discoverHiggsfieldPilot(await this.connections.connectable(org,'higgsfield'),credential.token,credential.assertUsable);
  const result=decodeHggReadV1({kind:'workspaces'},discovery.workspaces) as any;
  const owners=result.workspaces.filter((w:any)=>w.type==='private'&&w.user_role==='owner');
  if(owners.length!==1)return videoErrorV1(owners.length?'VIDEO_PILOT_WORKSPACE_CHOICE_REQUIRED':'VIDEO_PILOT_PRIVATE_WORKSPACE_REQUIRED',409);
  const models=hggPilotNativeModelsV1(discovery.imageCatalogue,discovery.videoCatalogue);
  return this.qualify(org,actor,{...input,connectionId:connection.id,accountGeneration:connection.generation,workspaceId:owners[0].id},models);
 }
 async qualify(org:string,actor:string,value:HggPilotWorkspacePreparationV1,discoveredModels?:HggPilotNativeModelsV1):Promise<HggPilotWorkspaceBindingV1>{
  const parsed=inputSchema.safeParse(value);if(!parsed.success)return videoErrorV1('VIDEO_PILOT_WORKSPACE_INVALID',409);const input=parsed.data as HggPilotWorkspacePreparationV1;
  if(authenticatedSession()?.actorId!==actor)return videoErrorV1('VIDEO_ACCESS_DENIED',403);await this.repository.member(org,actor);
  const credential=await this.connections.token(org,actor,input.connectionId,input.accountGeneration,'pilot_context_v1',{allowRefresh:false});
  const def=await this.connections.connectable(org,'higgsfield');const digest=subscriptionHash(input);
  const row=await this.repository.transaction(async tx=>{
   const prior=await tx.videoRouteIntent.findUnique({where:{organizationId_intentId:{organizationId:org,intentId:input.intentId}}});
   if(prior){if(prior.actorId!==actor || prior.accessDigest!==digest)return videoErrorV1('VIDEO_INTENT_MISMATCH',409);return tx.videoAccessPreflight.findFirstOrThrow({where:{id:prior.preflightId,organizationId:org,actorId:actor}});}
   const result=await tx.videoAccessPreflight.create({data:{organizationId:org,actorId:actor,draftId:input.pilotId,draftVersion:input.parentRevision,draftDigest:digest,access:json({kind:'hgg-workspace/v1'}),snapshot:json({kind:'hgg-workspace/v1',state:'new',input}),request:{},quote:{},connectionId:input.connectionId,generation:input.accountGeneration,expiresAt:new Date(this.connections.runtime.now().getTime()+86400000)}});
   await tx.videoRouteIntent.create({data:{organizationId:org,actorId:actor,intentId:input.intentId,preflightId:result.id,accessDigest:digest}});return result;
  });
  const snapshot=row.snapshot as any;
  if(snapshot.kind!=='hgg-workspace/v1')return videoErrorV1('VIDEO_INTENT_MISMATCH',409);
  let models=discoveredModels??snapshot.models;
  if(!models){const metadata=await this.mcp.discoverHiggsfieldPilot(def,credential.token,credential.assertUsable);models=hggPilotNativeModelsV1(metadata.imageCatalogue,metadata.videoCatalogue);}
  const canSelect=snapshot.state==='new' && !!input.selectionAuthorizationId;
  const result=await this.withContext(org,actor,input.connectionId,input.pilotId,input.parentRevision,()=>this.mcp.exchangeHiggsfieldPilot(def,credential.token,{kind:canSelect?'select':'observe',workspaceId:input.workspaceId},credential.assertUsable,{
   beforeMutation:async()=>{
    await this.repository.transaction(async tx=>{
     await this.repository.connection(org,actor,input.connectionId,tx,false);
     await this.parents.assertWorkspaceSelection(tx,{...input,organizationId:org,actorId:actor});
     const changed=await tx.videoAccessPreflight.updateMany({where:{id:row.id,organizationId:org,actorId:actor,snapshot:{path:['state'],equals:'new'}},data:{snapshot:json({kind:'hgg-workspace/v1',state:'selecting',input,models})}});
     if(changed.count!==1)return videoErrorV1('VIDEO_PILOT_WORKSPACE_SELECTION_UNKNOWN',409);
    });
   },afterResult:async raw=>{await this.repository.db.videoAccessPreflight.updateMany({where:{id:row.id,organizationId:org,actorId:actor},data:{request:json({rawSelection:raw})}});},
  }));
  await credential.assertUsable();
  const core={connectionId:input.connectionId,accountGeneration:input.accountGeneration,tokenVersion:credential.connection.tokenVersion,workspaceId:result.workspace.id};
  const binding:HggPilotWorkspaceBindingV1={version:1,...core,bindingHash:subscriptionHash({provider:'higgsfield',issuer:def.issuer,resource:def.resource,actor,...core}),qualificationId:row.id,observedAt:this.connections.runtime.now().toISOString(),context:'observed_private_owner',atomicBillingProof:false};
  await this.repository.db.videoAccessPreflight.updateMany({where:{id:row.id,organizationId:org,actorId:actor},data:{snapshot:json({kind:'hgg-workspace/v1',state:'qualified',input,binding,models,observation:result.workspace})}});
  return binding;
 }
 async load(org:string,actor:string,id:string,connectionId?:string,generation?:number,recovery=false):Promise<HggPilotWorkspaceBindingV1>{
  await this.repository.member(org,actor);
  const row=await this.repository.db.videoAccessPreflight.findFirst({where:{id,organizationId:org,actorId:actor}});const s=row?.snapshot as any;
  if(s?.kind!=='hgg-workspace/v1' || s.state!=='qualified' || !recovery && row!.expiresAt<=this.connections.runtime.now() ||
   connectionId && s.binding.connectionId!==connectionId || generation!==undefined && s.binding.accountGeneration!==generation)return videoErrorV1('VIDEO_PILOT_WORKSPACE_QUALIFICATION_REQUIRED',409);
  return s.binding;
 }
 async models(org:string,actor:string,id:string):Promise<HggPilotNativeModelsV1>{
  await this.repository.member(org,actor);
  const row=await this.repository.db.videoAccessPreflight.findFirst({where:{id,organizationId:org,actorId:actor}}),snapshot=row?.snapshot as any;
  if(snapshot?.kind!=='hgg-workspace/v1'||snapshot.state!=='qualified'||!snapshot.models)return videoErrorV1('VIDEO_PILOT_MODEL_DISCOVERY_REQUIRED',409);
  return snapshot.models;
 }
}
