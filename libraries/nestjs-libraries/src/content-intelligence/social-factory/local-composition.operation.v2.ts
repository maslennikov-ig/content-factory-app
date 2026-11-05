import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {VideoProductionLocalManifestV3Schema,type VideoProductionLocalManifestV3} from '../../videos/production/video-production.local.v3';
import {LOCAL_COMPOSITION_LIMITS_V2,localCompositionDigestV2,type LocalCompositionOptionsV2,type LocalCompositionProgressV2} from '../../videos/local-reel/local-composition.v2';
import type {LocalCompositionExecutionPortV2} from '../../videos/production/local-composition-execution.port.v2';
import type {CampaignLocalCompositionServiceV2,LocalCompositionCheckpointV2,LocalCompositionProvenanceV2} from './editorial/local-composition.service.v2';
import type {CampaignItemV1,CampaignV1,EditorialMaterialV1,SocialFactoryStoreV1} from './contracts/social-factory.v1';
import type {ProductionOperation} from './production.service';
import {SocialFactoryError,SocialFactoryRepository} from './social-factory.repository';
import {CampaignService} from './campaign/campaign.service';
import {identity} from './campaign/domain';

const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
export const CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2=Symbol('CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2');
const createSchema=z.object({operationId:id,expectedContentRevision:z.number().int().positive(),requestId:id,manifest:VideoProductionLocalManifestV3Schema}).strict();
export const localCompositionStartSchemaV2=z.object({operationId:id,compositionId:id.optional(),expectedContentRevision:createSchema.shape.expectedContentRevision.optional(),requestId:id.optional(),manifest:VideoProductionLocalManifestV3Schema.optional()}).strict();
export function parseLocalCompositionStartV2(raw:unknown){
 const value=localCompositionStartSchemaV2.parse(raw);
 const resume=value.compositionId!==undefined,hasCreate=value.expectedContentRevision!==undefined||value.requestId!==undefined||value.manifest!==undefined;
 if(resume&&hasCreate||!resume&&!createSchema.safeParse({operationId:value.operationId,expectedContentRevision:value.expectedContentRevision,requestId:value.requestId,manifest:value.manifest}).success)throw new SocialFactoryError('LOCAL_COMPOSITION_INPUT_INVALID');
 return value;
}
export const localCompositionScopeSchemaV2=z.object({operationId:id,compositionId:id}).strict();
export type LocalCompositionStartV2=z.infer<typeof createSchema>|{operationId:string;compositionId:string};
export interface LocalCompositionOperationRecordV2{
 type:'local_composition_v2';version:2;id:string;operationId:string;actorId:string;requestId:string;requestDigest:string;expectedContentRevision:number;claimedContentRevision:number;
 state:'queued'|'running'|'completed'|'failed'|'stopped';manifest:VideoProductionLocalManifestV3;baseMaterial:EditorialMaterialV1;
 checkpoint:LocalCompositionCheckpointV2;owner?:string;leaseUntil?:string;progress?:LocalCompositionProgressV2;errorCode?:string;
 appliedContentRevision?:number;resultMediaId?:string;stoppedAt?:string;
}
type Host={
 material:(op:ProductionOperation)=>EditorialMaterialV1;
 current:(org:string,op:ProductionOperation,store?:SocialFactoryStoreV1)=>Promise<{campaign:CampaignV1;item:CampaignItemV1}>;
 preflight:(org:string,actor:string,item:CampaignItemV1,store:SocialFactoryStoreV1)=>Promise<unknown>;
 sourceProduction:(org:string,actor:string,op:ProductionOperation,manifest:VideoProductionLocalManifestV3)=>Promise<LocalCompositionProvenanceV2|undefined>;
 inspect:(org:string,material:EditorialMaterialV1)=>Promise<{status:'ready'|'needs_revision'|'needs_video';material:EditorialMaterialV1;inspection:unknown}>;
 apply:(org:string,actor:string,op:ProductionOperation,owner:string,complete:(store:SocialFactoryStoreV1,final:ProductionOperation)=>Promise<void>)=>Promise<unknown>;
};
const requireValue=(value:unknown,code:string):void=>{if(!value)throw new SocialFactoryError('LOCAL_COMPOSITION_'+code);};
const lease=()=>new Date(Date.now()+120_000).toISOString();
const live=(until?:string)=>!!until&&Date.parse(until)>Date.now();
const code=(error:unknown)=>{const x=error as {code?:unknown;message?:unknown;getResponse?:()=>{code?:unknown}};const value=x?.code??x?.getResponse?.()?.code??x?.message;return typeof value==='string'&&/^[A-Z_]+$/.test(value)?value:'LOCAL_COMPOSITION_FAILED';};
export function localCompositionPublicV2(p:LocalCompositionOperationRecordV2){
 return {id:p.id,operationId:p.operationId,state:p.state,expectedContentRevision:p.appliedContentRevision??p.claimedContentRevision,progress:p.progress,errorCode:p.errorCode,
  resultMediaId:p.resultMediaId,renderKey:p.checkpoint.rendered?.renderKey,source:p.manifest.source,settings:p.manifest.settings,
  sourceProductionRevisionId:p.manifest.sourceProductionRevisionId,sceneCount:p.manifest.scenes.length,durationSeconds:p.manifest.scenes.reduce((sum,s)=>sum+Math.round(s.durationSeconds*30),0)/30,
  speechAlignment:'unverified' as const,publication:'not_requested' as const,...(p.state==='failed'?{resumeInput:{operationId:p.operationId,compositionId:p.id},nextAction:'campaign.compose_local_video'}:{})};
}
/** Uses the existing editorial parent/child CAS and native-material apply transaction. No second billable engine. */
export class LocalCompositionOperationV2{
 constructor(private readonly store:SocialFactoryStoreV1,private readonly producer:CampaignLocalCompositionServiceV2,private readonly host:Host,private readonly execution?:LocalCompositionExecutionPortV2){}
 private async parent(org:string,actor:string,operationId:string,store=this.store){
  const row=await store.read<ProductionOperation>(org,'editorial',operationId);
  requireValue(row?.payload.version===2&&row.payload.baseInput?.actorId===actor&&row.payload.baseInput.sourceArtifact&&row.payload.material,'ACCESS_DENIED');return row!;
 }
 private async record(org:string,actor:string,operationId:string,compositionId:string,store=this.store){
  await this.parent(org,actor,operationId,store);const row=await store.read<LocalCompositionOperationRecordV2>(org,'editorial',compositionId);
  requireValue(row?.payload.type==='local_composition_v2'&&row.payload.operationId===operationId&&row.payload.actorId===actor,'NOT_FOUND');return row!;
 }
 async open(org:string,actor:string,operationId:string,compositionId:string){return localCompositionPublicV2((await this.record(org,actor,operationId,compositionId)).payload);}
 async start(org:string,actor:string,raw:LocalCompositionStartV2){
  const parsed=parseLocalCompositionStartV2(raw);
  const previous=parsed.compositionId?(await this.record(org,actor,parsed.operationId,parsed.compositionId)).payload:undefined;
  const input=createSchema.parse(previous?{operationId:previous.operationId,expectedContentRevision:previous.expectedContentRevision,requestId:previous.requestId,manifest:previous.manifest}:{operationId:parsed.operationId,expectedContentRevision:parsed.expectedContentRevision,requestId:parsed.requestId,manifest:parsed.manifest}),compositionId=identity('local_composition_v2',org,input.operationId,input.requestId),requestDigest=localCompositionDigestV2(input);
  requireValue(this.execution,'EXECUTION_UNAVAILABLE');
  const saved=await this.store.transact(async store=>{
   const row=await this.parent(org,actor,input.operationId,store),op=row.payload,current=await this.host.current(org,op,store),known=await store.read<LocalCompositionOperationRecordV2>(org,'editorial',compositionId);
   if(known){
    requireValue(known.payload.type==='local_composition_v2'&&known.payload.actorId===actor&&known.payload.requestDigest===requestDigest&&op.localComposition?.id===compositionId,'INTENT_MISMATCH');
    if(known.payload.state==='completed')requireValue(current.item.contentRevision===known.payload.appliedContentRevision,'RESULT_SUPERSEDED');
    else if(known.payload.state!=='stopped')requireValue(current.item.contentRevision===known.payload.claimedContentRevision,'SUPERSEDED');
    if(known.payload.state!=='failed')return known.payload;
    requireValue(!live(known.payload.leaseUntil),'IN_PROGRESS');
    return (await store.put({...known,expectedRevision:known.revision,payload:{...known.payload,state:'queued' as const,owner:undefined,leaseUntil:undefined,errorCode:undefined}})).payload;
   }
   requireValue(current.item.contentRevision===input.expectedContentRevision,'REVISION_CONFLICT');
   requireValue(['reel','short','long_video'].includes(current.item.format)&&!['submitting','uncertain','scheduled','published','cancelled'].includes(current.item.state),'ITEM_SCOPE');
   requireValue(!live(op.leaseUntil)&&!live(op.finalizing?.until)&&op.captionEdit?.state!=='pending','IN_PROGRESS');
   if(op.localComposition){const previous=await store.read<LocalCompositionOperationRecordV2>(org,'editorial',op.localComposition.id);requireValue(previous&&['completed','failed','stopped'].includes(previous.payload.state),'IN_PROGRESS');}
   const source=op.baseInput.sourceArtifact!,expectedSource={pieceId:source.ref.pieceId,revision:source.ref.revision,textSha256:source.contentDigest,...(source.ref.kind==='adaptation'?{adaptationId:source.ref.adaptationId}:{})};
   requireValue(localCompositionDigestV2(expectedSource)===localCompositionDigestV2(input.manifest.source),'SOURCE_BINDING');
   requireValue(current.item.format==='long_video'?input.manifest.settings.width===1920&&input.manifest.settings.height===1080:input.manifest.settings.width===1080&&input.manifest.settings.height===1920,'OUTPUT_PRESET');
   requireValue(input.manifest.sourceProductionRevisionId===op.productionId,'PRODUCTION_BINDING');
   await this.host.preflight(org,actor,current.item,store);
   await store.assertSourceAdmissions(org,op.sourceAdmissions);
   const material=this.host.material(op),item=await new CampaignService(store as SocialFactoryRepository).setMaterial(org,op.campaignId,op.itemId,{material:current.item.material??material,expectedContentRevision:input.expectedContentRevision,editorialId:op.id,discoveryIds:[op.discoveryId]});
   const changed=await store.read<CampaignItemV1>(org,'campaign_item',op.itemId);
   await store.put({...changed!,expectedRevision:changed!.revision,payload:{...item,state:'preparing' as const,blocker:{code:'LOCAL_COMPOSITION_RUNNING',detail:'Local video composition is preparing the selected revision.'}}});
   await store.put({...row,expectedRevision:row.revision,payload:{...op,appliedContentRevision:item.contentRevision,localComposition:{id:compositionId,requestDigest}}});
   const payload:LocalCompositionOperationRecordV2={type:'local_composition_v2',version:2,id:compositionId,operationId:op.id,actorId:actor,requestId:input.requestId,requestDigest,expectedContentRevision:input.expectedContentRevision,claimedContentRevision:item.contentRevision,state:'queued',manifest:input.manifest,baseMaterial:material,checkpoint:{}};
   return (await store.put({organizationId:org,kind:'editorial',id:compositionId,parentId:op.id,expectedRevision:0,payload,sourceIds:row.sourceIds})).payload;
  });
  if(saved.state==='queued'||saved.state==='running')await this.execution!.start(org,input.operationId,compositionId);
  return localCompositionPublicV2(saved);
 }
 async stop(org:string,actor:string,operationId:string,compositionId:string){
  const saved=await this.store.transact(async store=>{const row=await this.record(org,actor,operationId,compositionId,store);if(row.payload.state==='completed'||row.payload.state==='stopped')return row.payload;
   const parent=await this.parent(org,actor,operationId,store);
   if(parent.payload.localComposition?.id===compositionId&&parent.payload.owner===row.payload.owner)await store.put({...parent,expectedRevision:parent.revision,payload:{...parent.payload,owner:undefined,leaseUntil:undefined}});
   const item=await store.read<CampaignItemV1>(org,'campaign_item',parent.payload.itemId);
   if(parent.payload.localComposition?.id===compositionId&&item?.payload.contentRevision===row.payload.claimedContentRevision)await store.put({...item,expectedRevision:item.revision,payload:{...item.payload,state:'needs_input' as const,blocker:{code:'LOCAL_COMPOSITION_STOPPED',detail:'Local composition stopped; saved source and prior assets are retained.'}}});
   return (await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,state:'stopped' as const,stoppedAt:new Date().toISOString(),owner:undefined,leaseUntil:undefined}})).payload;
  });return localCompositionPublicV2(saved);
 }
 async run(org:string,operationId:string,compositionId:string,workerOptions:LocalCompositionOptionsV2={}){
  const initial=await this.store.read<LocalCompositionOperationRecordV2>(org,'editorial',compositionId);
  if(!initial||initial.payload.type!=='local_composition_v2'||initial.payload.operationId!==operationId)return {state:'missing',done:true};
  if(['completed','failed','stopped'].includes(initial.payload.state))return {state:initial.payload.state,done:true};
  const actor=initial.payload.actorId,owner=randomUUID();let claimed=false,abort:AbortController|undefined,timer:ReturnType<typeof setInterval>|undefined,ticking:Promise<void>|undefined,unsubscribe:(()=>void)|undefined;
  try{
   const job=await this.store.transact(async store=>{
    const row=await this.record(org,actor,operationId,compositionId,store),parent=await this.parent(org,actor,operationId,store);
    if(!['queued','running'].includes(row.payload.state)||live(row.payload.leaseUntil)||live(parent.payload.leaseUntil))return undefined;
    const current=await this.host.current(org,parent.payload,store);requireValue(parent.payload.localComposition?.id===compositionId&&current.item.contentRevision===row.payload.claimedContentRevision&&parent.payload.productionId===row.payload.manifest.sourceProductionRevisionId,'SUPERSEDED');
    requireValue(!live(parent.payload.finalizing?.until)&&parent.payload.captionEdit?.state!=='pending','IN_PROGRESS');
    await store.put({...parent,expectedRevision:parent.revision,payload:{...parent.payload,owner,leaseUntil:lease()}});
    return (await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,state:'running' as const,owner,leaseUntil:lease(),errorCode:undefined}})).payload;
   });
   if(!job)return {state:'running',done:false};claimed=true;abort=new AbortController();
   const onAbort=()=>abort!.abort(workerOptions.signal?.reason);workerOptions.signal?.addEventListener('abort',onAbort,{once:true});if(workerOptions.signal?.aborted)onAbort();
   unsubscribe=()=>workerOptions.signal?.removeEventListener('abort',onAbort);
   let progress=job.progress;
   const current=async(checkpoint?:LocalCompositionCheckpointV2)=>{
    if(abort!.signal.aborted)throw abort!.signal.reason??new Error('LOCAL_COMPOSITION_ABORTED');
    await this.store.transact(async store=>{
     const row=await this.record(org,actor,operationId,compositionId,store),parent=await this.parent(org,actor,operationId,store);
     requireValue(row.payload.state==='running'&&row.payload.owner===owner&&parent.payload.owner===owner&&live(row.payload.leaseUntil)&&parent.payload.localComposition?.id===compositionId,'LEASE_LOST');
     const current=await this.host.current(org,parent.payload,store);requireValue(current.item.contentRevision===job.claimedContentRevision&&parent.payload.productionId===job.manifest.sourceProductionRevisionId&&!live(parent.payload.finalizing?.until)&&parent.payload.captionEdit?.state!=='pending','SUPERSEDED');await store.assertSourceAdmissions(org,parent.payload.sourceAdmissions);
     await store.put({...parent,expectedRevision:parent.revision,payload:{...parent.payload,leaseUntil:lease()}});
     await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,leaseUntil:lease(),...(checkpoint?{checkpoint}:{}),...(progress?{progress}:{})}});
    });
   };
   const tick=()=>{if(!ticking)ticking=current().catch(error=>{abort!.abort(error);}).finally(()=>{ticking=undefined;});};
   timer=setInterval(tick,LOCAL_COMPOSITION_LIMITS_V2.heartbeatMs);timer.unref();
   const options:LocalCompositionOptionsV2={signal:abort.signal,assertCurrent:()=>current(),onProgress:async value=>{progress=value;await current();await workerOptions.onProgress?.(value);}};
   const parent=await this.parent(org,actor,operationId),provenance=await this.host.sourceProduction(org,actor,parent.payload,job.manifest);
   const material=await this.producer.produce(org,parent.payload.baseInput.sourceArtifact!,job.baseMaterial,job.manifest,job.checkpoint,value=>current(value),options,compositionId,provenance);
   await current();const inspected=await this.host.inspect(org,material);await current();
   const prepared=await this.store.transact(async store=>{const row=await this.parent(org,actor,operationId,store);requireValue(row.payload.owner===owner,'LEASE_LOST');await this.host.current(org,row.payload,store);
    return (await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,state:'material_ready' as const,material:inspected.material,producerStatus:inspected.status,inspection:inspected.inspection,
     nativeMaterial:undefined,nativeRequestId:identity('local_composition_native_v2',compositionId),deliveryRequiresApproval:true}})).payload;
   });
   await this.host.apply(org,actor,prepared,owner,async(store,final)=>{
    const row=await this.record(org,actor,operationId,compositionId,store);requireValue(row.payload.state==='running'&&row.payload.owner===owner,'LEASE_LOST');
    await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,state:'completed' as const,appliedContentRevision:final.appliedContentRevision,resultMediaId:row.payload.checkpoint.asset?.mediaId,owner:undefined,leaseUntil:undefined}});
   });
   workerOptions.signal?.removeEventListener('abort',onAbort);return {state:'completed',done:true};
  }catch(error){
   const state=await this.store.transact(async store=>{
    const row=await this.record(org,actor,operationId,compositionId,store);if(row.payload.state==='stopped'||row.payload.state==='completed'||row.payload.owner&&row.payload.owner!==owner||!claimed&&live(row.payload.leaseUntil))return row.payload.state;
    const parent=await this.parent(org,actor,operationId,store);
    if(parent.payload.owner===owner)await store.put({...parent,expectedRevision:parent.revision,payload:{...parent.payload,owner:undefined,leaseUntil:undefined,blocker:code(error)}});
    const item=await store.read<CampaignItemV1>(org,'campaign_item',parent.payload.itemId);
    if(parent.payload.localComposition?.id===compositionId&&item?.payload.contentRevision===row.payload.claimedContentRevision)await store.put({...item,expectedRevision:item.revision,payload:{...item.payload,state:'needs_input' as const,blocker:{code:code(error),detail:'The saved local composition requires attention; retry the same request after correcting the cause.'}}});
    await store.put({...row,expectedRevision:row.revision,payload:{...row.payload,state:'failed' as const,errorCode:code(error),owner:undefined,leaseUntil:undefined}});
    return 'failed' as const;
   });
   return {state,done:state!=='running'&&state!=='queued'};
  }finally{unsubscribe?.();if(timer)clearInterval(timer);if(ticking)await ticking;}
 }
}
