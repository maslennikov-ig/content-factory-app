import { Prisma } from '@prisma/client';
import { videoErrorV1 } from '../video-brief.v1';
import { creditExposure } from './video-credit-policy';
import { HggPilotAuthorizationSchemaV1,HGG_PILOT_STAGE_KIND_V1,type HggPilotAuthorizationV1,type HggPilotStoredStageV1,type HggPilotLastFrameRepairAuthorizationV1 } from './video-hgg-pilot-stage.v1';
import { subscriptionHash } from './video-provider-registry';
import type { HggPilotQuoteAssetV1 } from './video-hgg-pilot-quote.v1';
export const hggPilotCodeV1=(e:any)=>{
 const code=e?.getResponse?.()?.code??e?.code;
 if(code==='CLIP_WHOLE_PILOT_APPROVAL_REQUIRED')return 'VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED';
 if(code==='CLIP_REPAIR_APPROVAL_REQUIRED')return 'VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED';
 if(code==='CLIP_REFERENCE_APPROVAL_REQUIRED')return 'VIDEO_PILOT_REFERENCE_APPROVAL_REQUIRED';
 return typeof code==='string' && /^(?:VIDEO|SOURCE_ARTIFACT)_[A-Z0-9_]{1,90}$/.test(code)?code:'VIDEO_PILOT_UNAVAILABLE';
};
export const hggPilotAmountV1=(q:any)=>Prisma.Decimal.max(new Prisma.Decimal(String(q.cost.credits)),new Prisma.Decimal(String(q.cost.creditsExact))).toDecimalPlaces(6,Prisma.Decimal.ROUND_CEIL);
export function hggPilotQuotedInputsV1(quote:any){
 const check=quote?.providerInputCheck;
 if(check && (check.required_media_present===false || check.missing_roles?.length))return videoErrorV1('VIDEO_PILOT_PROVIDER_INPUTS_MISSING',409);
}
export const hggPilotBindingHashV1=(s:Omit<HggPilotStoredStageV1,'requestHash'|'capturedAt'|'localAdmissionExpiresAt'>)=>subscriptionHash({compiled:s.compiled.requestHash,workspace:s.workspace.bindingHash,references:s.references,stage:s.stage,locale:s.publicOutputLocale,planningOnly:!!s.planningOnly});
export async function hggPilotReferencesV1(tx:any,org:string,actor:string,stage:HggPilotStoredStageV1,strict=false){
 const assets=(stage.compiled.input.kind==='video'?stage.compiled.input.frames:stage.compiled.input.references) as HggPilotQuoteAssetV1[];
 const expected=stage.stage==='first_frame'?0:stage.stage==='last_frame'?1:2;
 if(stage.references.length!==expected || assets.length!==expected){if(strict)return videoErrorV1('VIDEO_PILOT_INPUTS_REQUIRED',409);if(stage.references.length || assets.length)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);return false;}
 for(let i=0;i<expected;i++){
  const reference=stage.references[i],asset=assets[i],slot=i===0?'first_frame':'last_frame';
  const job=await tx.videoSubscriptionJob.findFirst({where:{id:reference.jobId,organizationId:org,actorId:actor}});
  const prior=job?.request as HggPilotStoredStageV1;const receipt=job?.receipt as any;const file=job?.storedFile as any;
  const media=job?.resultMediaId?await tx.media.findFirst({where:{id:job.resultMediaId,organizationId:org,deletedAt:null}}):null;
  const sameSource=(a:any,b:any)=>{const {parentRevision:ar,...as}=a||{}, {parentRevision:br,...bs}=b||{};return subscriptionHash(as)===subscriptionHash(bs);};
  const referenceBinding=prior?.executionCredentials ? prior.executionCredentials.currentWorkspace.bindingHash : stage.workspace.bindingHash;
  if(prior?.executionCredentials && (!stage.executionCredentials || subscriptionHash(prior.executionCredentials)!==subscriptionHash(stage.executionCredentials)))return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);
  if(!job || job.state!=='completed' || prior?.kind!==HGG_PILOT_STAGE_KIND_V1 || prior.stage!==slot || job.connectionId!==stage.workspace.connectionId || job.generation!==stage.workspace.accountGeneration ||
   prior.workspace.bindingHash!==stage.workspace.bindingHash || !sameSource(prior.compiled.input.source,stage.compiled.input.source) ||
   !media || media.type!=='image' || media.path!==file?.path || job.resultMediaId!==reference.ownedMediaId || file.byteSha256!==reference.byteSha256 ||
   receipt?.kind!=='image' || receipt.inputChanged || receipt.profile!=='hgg_pilot_job_v1' || receipt.jobId!==reference.providerJobId || reference.workspaceBindingHash!==referenceBinding ||
   asset.ownedMediaId!==reference.ownedMediaId || asset.byteSha256!==reference.byteSha256 || asset.providerMediaId!==receipt.jobId ||
   asset.connectionId!==job.connectionId || asset.accountGeneration!==job.generation)return videoErrorV1('VIDEO_PILOT_REFERENCE_INVALID',409);
 }
 return true;
}
export async function hggPilotFinancialV1(tx:any,org:string,actor:string,connection:any,stage:HggPilotStoredStageV1,authInput:HggPilotAuthorizationV1|null,amount:Prisma.Decimal,now:Date,excludeJobId?:string,repair?:HggPilotLastFrameRepairAuthorizationV1){
 const auth=HggPilotAuthorizationSchemaV1.safeParse(authInput);
 if(!auth.success || !auth.data.stages.includes(stage.stage))return videoErrorV1('VIDEO_PILOT_BUDGET_REQUIRED',409);
 if(connection.unit!=='higgsfield_credit' || !amount.isFinite() || amount.lt(0) || amount.gt(auth.data.stageLimit))return videoErrorV1('VIDEO_PILOT_BUDGET_EXCEEDED',409);
 const all=await tx.videoSubscriptionJob.findMany({where:{organizationId:org,actorId:actor}});
 const pilot=all.filter((j:any)=>(j.request as any)?.kind===HGG_PILOT_STAGE_KIND_V1 && (j.request as any).compiled.input.source.pilotId===stage.compiled.input.source.pilotId);
 const duplicates=pilot.filter((j:any)=>j.id!==excludeJobId && j.request.stage===stage.stage);
 if(repair){
  // Only the guarded parent may exempt its one archived last-frame job from
  // the duplicate-stage rule. Every old cost still enters the sum below.
  const previous=pilot.find((j:any)=>j.id===repair.previousJobId),current=excludeJobId?pilot.find((j:any)=>j.id===excludeJobId):null;
  const {parentRevision:previousRevision,...previousSource}=previous?.request?.compiled?.input?.source??{};
  const {parentRevision:currentRevision,...currentSource}=stage.compiled.input.source;
  if(repair.version!==1 || !repair.repairId || !repair.intentId || !/^[a-f0-9]{64}$/.test(repair.bindingDigest) ||
   repair.authorizationId!==auth.data.id || repair.requestHash!==stage.requestHash || stage.stage!=='last_frame' ||
   stage.compiled.input.kind!=='image_frame' || stage.compiled.input.slot!=='last' ||
   !previous || previous.state!=='completed' || previous.preflightId!==repair.previousPreflightId || previous.request.requestHash!==repair.previousRequestHash ||
   previous.connectionId!==stage.workspace.connectionId || previous.generation!==stage.workspace.accountGeneration ||
   previous.request.workspace?.bindingHash!==stage.workspace.bindingHash || subscriptionHash(previousSource)!==subscriptionHash(currentSource) ||
   repair.previousRequestHash===stage.requestHash ||
   previous.snapshot?.authorization?.id!==auth.data.id || previous.intentId===repair.intentId ||
   duplicates.length!==1 || duplicates[0].id!==previous.id ||
   (excludeJobId && (!current || !current.snapshot?.lastFrameRepair || current.id===previous.id || current.intentId!==repair.intentId || current.request.requestHash!==stage.requestHash ||
    current.connectionId!==stage.workspace.connectionId || current.generation!==stage.workspace.accountGeneration || current.snapshot.authorization?.id!==auth.data.id ||
    subscriptionHash(current.snapshot?.lastFrameRepair)!==subscriptionHash(repair))))return videoErrorV1('VIDEO_PILOT_REPAIR_BINDING_CHANGED',409);
 }else if(duplicates.length)return videoErrorV1('VIDEO_PILOT_STAGE_ALREADY_EXISTS',409);
 const reserved=pilot.reduce((n:Prisma.Decimal,j:any)=>n.plus(j.actualCost??j.reserved),new Prisma.Decimal(0));
 const increment=excludeJobId?new Prisma.Decimal(0):amount;
 if(reserved.plus(increment).gt(auth.data.pilotLimit))return videoErrorV1('VIDEO_PILOT_BUDGET_EXCEEDED',409);
 if(connection.perJob!==null && connection.perJob!==undefined && (connection.perJob.lte(0) || amount.gt(connection.perJob)))return videoErrorV1('VIDEO_JOB_CREDIT_LIMIT_EXCEEDED',409);
 if(connection.perMonth!==null && connection.perMonth!==undefined && (connection.perMonth.lte(0) || (await creditExposure(tx,connection.id,now)).plus(increment).gt(connection.perMonth)))return videoErrorV1('VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED',409);
 return {authorization:auth.data,reserved,remaining:Prisma.Decimal.max(0,new Prisma.Decimal(auth.data.pilotLimit).minus(reserved)),actualChargeUnknown:pilot.some((j:any)=>j.actualCost===null)};
}
