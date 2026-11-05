import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, VideoGenerationJob } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { serializableWithRetry } from '../serializable.transaction';
import type { MeasuredVideoMetadataV1, StoredSubtitleV1, VideoCaptionEvidenceV1, VideoSubtitleResultV1 } from '../../../videos/production/video-production-result.v1';
import type { VideoProductionApprovalV1, VideoProductionManifestV1, VideoProductionRevisionV1 } from '../../../videos/production/video-production.v1';
import { videoProductionDigestV1 } from '../../../videos/production/video-production.v1';
import { PersonalProductionManifestSchemaV2, PersonalProductionPreflightSchemaV2, type PersonalProductionManifestV2 } from '../../../videos/production/video-production.personal.v2';
import type { PersonalProductionApprovalV2, PersonalProductionJobCreateV2, PersonalProductionPreparationV2, PersonalProductionRevisionV2 } from '../../../videos/production/video-production.personal.types.v2';
import { VideoSubscriptionRepository } from '../video-subscription/video-subscription.repository';
import { assertCreditPolicy, creditExposure, creditPeriod } from '../../../videos/subscriptions/video-credit-policy';
import { videoSourceRevisionV1 } from '../../../videos/video-brief.v1';

const deny=(code:string,status=409):never=>{throw new HttpException({code},status);};
const json=(v:unknown)=>v as Prisma.InputJsonValue;
const revision=(v:unknown)=>v as VideoProductionRevisionV1;
export type ProductionJobCreateV1=Prisma.VideoGenerationJobUncheckedCreateInput;
type ProductionCreateInput<T>={organizationId:string;userId:string;intentId:string;parentId?:string;manifest:T;digest:string};
const personalRevision=(v:unknown)=>v as PersonalProductionRevisionV2;
const personal=(manifest:unknown)=>!!manifest&&typeof manifest==='object'&&(manifest as {version?:unknown}).version===2;
/** Production is an immutable grouping of existing billable jobs, never a second job engine. */
@Injectable()
export class VideoProductionRepository {
  constructor(private readonly prisma:PrismaService){}
  read(organizationId:string,id:string){return this.prisma.videoProductionRevision.findFirst({where:{organizationId,id}}).then(v=>v?revision(v):null);}
  list(organizationId:string,productionId?:string){return this.prisma.videoProductionRevision.findMany({where:{organizationId,...(productionId?{productionId}:{})},orderBy:{createdAt:'desc'},take:100}).then(rows=>rows.map(revision));}
  create(input:ProductionCreateInput<PersonalProductionManifestV2>):Promise<PersonalProductionRevisionV2>;
  create(input:ProductionCreateInput<VideoProductionManifestV1>):Promise<VideoProductionRevisionV1>;
  create(input:ProductionCreateInput<VideoProductionManifestV1|PersonalProductionManifestV2>):Promise<VideoProductionRevisionV1|PersonalProductionRevisionV2>;
  async create(input:ProductionCreateInput<VideoProductionManifestV1|PersonalProductionManifestV2>):Promise<VideoProductionRevisionV1|PersonalProductionRevisionV2>{
    return serializableWithRetry(this.prisma,async tx=>{
      const known=await tx.videoProductionRevision.findUnique({where:{organizationId_intentId:{organizationId:input.organizationId,intentId:input.intentId}}});
      if(known){if(known.digest!==input.digest||known.userId!==input.userId||known.parentId!==(input.parentId??null))deny('VIDEO_PRODUCTION_INTENT_MISMATCH');return revision(known);}
      const parent=input.parentId?await tx.videoProductionRevision.findFirst({where:{organizationId:input.organizationId,id:input.parentId}}):null;
      if(input.parentId&&!parent)deny('VIDEO_PRODUCTION_NOT_FOUND',404);
      if(personal(input.manifest))PersonalProductionManifestSchemaV2.parse(input.manifest);
      if(parent&&personal(parent.manifest)){
        if(!personal(input.manifest))deny('VIDEO_PRODUCTION_FUNDING_CHANGED');
        if(parent.userId!==input.userId)deny('VIDEO_PRODUCTION_ACTOR_MISMATCH',403);
      }
      const productionId=parent?.productionId??randomUUID();
      if(parent){
        await this.acceptedPersonalFunding(tx,input.organizationId,productionId,input.manifest);
        const latest=await tx.videoProductionRevision.findFirst({where:{organizationId:input.organizationId,productionId},orderBy:{revision:'desc'}});
        if(latest?.id!==parent.id)deny('VIDEO_PRODUCTION_PARENT_CHANGED');
      }
      return await tx.videoProductionRevision.create({data:{organizationId:input.organizationId,userId:input.userId,intentId:input.intentId,parentId:parent?.id,productionId,revision:(parent?.revision??0)+1,manifest:json(input.manifest),digest:input.digest}}) as unknown as VideoProductionRevisionV1|PersonalProductionRevisionV2;
    },'Video revision changed; reload before editing.');
  }
  async savePreflight(row:VideoProductionRevisionV1,value:VideoProductionApprovalV1){
    const changed=await this.prisma.videoProductionRevision.updateMany({where:{organizationId:row.organizationId,id:row.id,digest:row.digest,state:{in:['draft','preflight']},stoppedAt:null},data:{state:'preflight',approval:json(value)}});
    if(changed.count!==1)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
  }
  async savePersonalPreflight(row:PersonalProductionRevisionV2,approval:PersonalProductionApprovalV2){
    return serializableWithRetry(this.prisma,async tx=>{
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId:row.organizationId,id:row.id}});
      await new VideoSubscriptionRepository(this.prisma).member(row.organizationId,row.userId,true,tx);
      if(!current||current.userId!==row.userId||current.digest!==row.digest||current.state!==row.state||!['draft','preflight'].includes(current.state)||current.stoppedAt||
        ((current.approval as unknown as {id?:string}|null)?.id??null)!==(row.approval?.id??null)||!personal(current.manifest)||
        approval.version!==2||approval.kind!=='personal_subscription'||approval.actorId!==current.userId||approval.manifestDigest!==current.digest||approval.acceptedAt||
        !Number.isFinite(Date.parse(approval.expiresAt))||Date.parse(approval.expiresAt)<=Date.now())deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      PersonalProductionPreflightSchemaV2.parse({creditLimits:approval.creditLimits});
      await tx.videoProductionRevision.update({where:{organizationId:row.organizationId,id:row.id},data:{state:'preflight',approval:json(approval)}});
      return personalRevision({...current,state:'preflight',approval});
    },'Video personal preflight changed; reload before confirming.');
  }
  subscriptionJob(organizationId:string,id:string){return this.prisma.videoSubscriptionJob.findFirst({where:{organizationId,id}});}
  personalJobByIntent(organizationId:string,intentId:string){return this.prisma.videoSubscriptionJob.findUnique({where:{organizationId_intentId:{organizationId,intentId}}});}
  private async acceptedPersonalFunding(tx:Pick<Prisma.TransactionClient,'videoProductionRevision'>,organizationId:string,productionId:string,manifest:unknown){
    const family=await tx.videoProductionRevision.findMany({where:{organizationId,productionId},select:{manifest:true,approval:true}});
    for(const ancestor of family)if(personal(ancestor.manifest)&&(ancestor.approval as unknown as PersonalProductionApprovalV2|null)?.acceptedAt){
      if(!personal(manifest)||videoProductionDigestV1(PersonalProductionManifestSchemaV2.parse(ancestor.manifest).funding)!==videoProductionDigestV1(PersonalProductionManifestSchemaV2.parse(manifest).funding))deny('VIDEO_PRODUCTION_FUNDING_CHANGED');
    }
  }
  private async unresolvedPersonalSceneIn(tx:Pick<Prisma.TransactionClient,'videoProductionRevision'|'videoSubscriptionJob'>,organizationId:string,actorId:string,productionId:string,sceneId:string,beforeRevision?:number){
    const family=await tx.videoProductionRevision.findMany({where:{organizationId,userId:actorId,productionId,...(beforeRevision===undefined?{}:{revision:{lt:beforeRevision}})},select:{manifest:true,approval:true}});
    const ids=new Set<string>();
    for(const row of family)if(personal(row.manifest)){
      const approval=row.approval as unknown as PersonalProductionApprovalV2|null;
      if(approval?.version!==2||!approval.acceptedAt)continue;
      for(const scene of approval.scenes)if(scene.sceneId===sceneId&&scene.kind==='generation'){
        if(!scene.jobId)return true;
        ids.add(scene.jobId);
      }
    }
    if(!ids.size)return false;
    const jobs=await tx.videoSubscriptionJob.findMany({where:{organizationId,actorId,id:{in:[...ids]}},select:{id:true,state:true}});
    return jobs.length!==ids.size||jobs.some(job=>!['completed','failed','canceled'].includes(job.state));
  }
  unresolvedPersonalScene(organizationId:string,actorId:string,productionId:string,sceneId:string){return this.unresolvedPersonalSceneIn(this.prisma,organizationId,actorId,productionId,sceneId);}
  private async personalSource(tx:Prisma.TransactionClient,row:{organizationId:string;manifest:unknown;digest:string}){
    const manifest=PersonalProductionManifestSchemaV2.parse(row.manifest);
    if(videoProductionDigestV1(manifest)!==row.digest)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
    const piece=await tx.contentPiece.findFirst({where:{organizationId:row.organizationId,id:manifest.pieceId,archivedAt:null}});
    if(!piece||videoSourceRevisionV1(piece)!==manifest.pieceRevision)deny('VIDEO_SOURCE_CHANGED');
    return manifest;
  }
  private async personalConnection(tx:Prisma.TransactionClient,row:{organizationId:string;userId:string},manifest:PersonalProductionManifestV2,preparation:PersonalProductionPreparationV2){
    if(!preparation||manifest.funding.connections[preparation.provider]!==preparation.connectionId)deny('VIDEO_PRODUCTION_FUNDING_CHANGED');
    const connection=await new VideoSubscriptionRepository(this.prisma).connection(row.organizationId,row.userId,preparation.connectionId,tx);
    if(connection.provider!==preparation.provider||connection.walletDigest!==preparation.walletDigest||!/^[a-f0-9]{64}$/.test(connection.walletDigest)||
      connection.generation!==preparation.accountGeneration||connection.unit!==preparation.unit||connection.unit!==connection.provider+'_credit')deny('VIDEO_CONNECTION_CHANGED');
    PersonalProductionPreflightSchemaV2.parse({creditLimits:[{connectionId:connection.id,unit:preparation.unit,maxCredits:preparation.perJob}]});
    PersonalProductionPreflightSchemaV2.parse({creditLimits:[{connectionId:connection.id,unit:preparation.unit,maxCredits:preparation.perMonth}]});
    if(!connection.perJob||!connection.perMonth||!connection.perJob.eq(preparation.perJob)||!connection.perMonth.eq(preparation.perMonth))deny('VIDEO_PREFLIGHT_STALE');
    const quote=preparation.request?.quote;
    const validAmount=(value:unknown)=>typeof value==='string'&&/^\d{1,12}(?:\.\d{1,6})?$/.test(value);
    if(!quote||quote.unit!==connection.unit||!validAmount(quote.amount)||(quote.upperBound!==null&&!validAmount(quote.upperBound))||
      !Number.isFinite(Date.parse(quote.expiresAt))||Date.parse(quote.expiresAt)<=Date.now())deny('VIDEO_PRICE_UNAVAILABLE');
    assertCreditPolicy(connection,quote);
    return connection;
  }
  private async reusablePersonalJob(tx:Prisma.TransactionClient,row:{organizationId:string;userId:string},manifest:PersonalProductionManifestV2,job:Awaited<ReturnType<VideoProductionRepository['subscriptionJob']>>){
    const snapshot=job?.snapshot as Record<string,unknown>|undefined;
    if(!job||job.organizationId!==row.organizationId||job.actorId!==row.userId||job.state!=='completed'||!job.resultMediaId||
      !['heygen','higgsfield'].includes(job.provider)||manifest.funding.connections[job.provider as 'heygen'|'higgsfield']!==job.connectionId||
      job.unit!==job.provider+'_credit'||snapshot?.kind!=='production/personal-v2'||snapshot.fundingDigest!==videoProductionDigestV1(manifest.funding))deny('VIDEO_PRODUCTION_INTENT_MISMATCH');
    const connection=await new VideoSubscriptionRepository(this.prisma).connection(row.organizationId,row.userId,job.connectionId,tx,false);
    if(connection.provider!==job.provider||connection.walletDigest!==job.walletDigest||connection.unit!==job.unit)deny('VIDEO_CONNECTION_CHANGED');
    return job;
  }
  async approvePersonal(row:PersonalProductionRevisionV2,approval:PersonalProductionApprovalV2,jobs:PersonalProductionJobCreateV2[]){
    return serializableWithRetry(this.prisma,async tx=>{
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId:row.organizationId,id:row.id}});
      await new VideoSubscriptionRepository(this.prisma).member(row.organizationId,row.userId,true,tx);
      const saved=current?.approval as unknown as PersonalProductionApprovalV2|null;
      if(!current||current.userId!==row.userId||current.digest!==row.digest||!personal(current.manifest)||saved?.version!==2||saved.kind!=='personal_subscription'||
        saved.id!==approval.id||saved.manifestDigest!==current.digest||saved.actorId!==row.userId||approval.actorId!==row.userId||approval.manifestDigest!==current.digest)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      if(current.state==='approved'&&saved.acceptedAt&&!current.stoppedAt)return personalRevision(current);
      if(current.state!=='preflight'||current.stoppedAt||saved.acceptedAt||videoProductionDigestV1(saved)!==videoProductionDigestV1(approval))deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      if(!Number.isFinite(Date.parse(saved.expiresAt))||Date.parse(saved.expiresAt)<=Date.now()||saved.blockers.length)deny('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
      // Serialize replays on the aggregate before inserting shared job IDs.
      // Otherwise PostgreSQL can report a unique-ID collision before SSI gets
      // to retry the competing production update at the end of admission.
      await tx.videoProductionRevision.update({where:{organizationId:row.organizationId,id:row.id,state:'preflight',digest:row.digest,stoppedAt:null},data:{updatedAt:new Date()}});
      const manifest=await this.personalSource(tx,current);
      await this.acceptedPersonalFunding(tx,row.organizationId,current.productionId,manifest);
      const limits=PersonalProductionPreflightSchemaV2.parse({creditLimits:saved.creditLimits}).creditLimits;
      const expected=new Map<string,{state:'accepted'|'awaiting_assets';preparation:PersonalProductionPreparationV2}>();
      for(const scene of saved.scenes){
        if(scene.kind!=='generation')continue;
        if(!scene.jobId)deny('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
        if(scene.reused){await this.reusablePersonalJob(tx,row,manifest,await tx.videoSubscriptionJob.findFirst({where:{organizationId:row.organizationId,id:scene.jobId}}));continue;}
        if(await this.unresolvedPersonalSceneIn(tx,row.organizationId,row.userId,current.productionId,scene.sceneId,current.revision))deny('VIDEO_SCENE_RECONCILIATION_REQUIRED');
        if(!scene.preparation||expected.has(scene.jobId))deny('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
        expected.set(scene.jobId,{state:'accepted',preparation:scene.preparation});
      }
      if(!saved.final.preparation||!saved.final.provider||saved.final.provider!==manifest.funding.finalProvider||saved.final.connectionId!==saved.final.preparation.connectionId||
        saved.final.provider!==saved.final.preparation.provider||expected.has(saved.final.jobId))deny('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
      expected.set(saved.final.jobId,{state:'awaiting_assets',preparation:saved.final.preparation});
      if(jobs.length!==expected.size||new Set(jobs.map(job=>job.id)).size!==jobs.length||new Set(jobs.map(job=>job.intentId)).size!==jobs.length)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      const resolved=structuredClone(saved),fresh:Prisma.VideoSubscriptionJobUncheckedCreateInput[]=[];
      const groups=new Map<string,{connection:Awaited<ReturnType<VideoProductionRepository['personalConnection']>>;reserved:Prisma.Decimal}>();
      const now=new Date();
      for(const job of jobs){
        const plan=expected.get(job.id);
        if(!plan||job.state!==plan.state||videoProductionDigestV1(job.preparation)!==videoProductionDigestV1(plan.preparation))deny('VIDEO_PRODUCTION_APPROVAL_STALE');
        const preparation=job.preparation,connection=await this.personalConnection(tx,row,manifest,preparation);
        const existing=await tx.videoSubscriptionJob.findUnique({where:{organizationId_intentId:{organizationId:row.organizationId,intentId:job.intentId}}});
        if(existing){
          await this.reusablePersonalJob(tx,row,manifest,existing);
          const oldRequest=existing.request as unknown as PersonalProductionPreparationV2['request'];
          if(existing.connectionId!==preparation.connectionId||existing.walletDigest!==preparation.walletDigest||
            videoProductionDigestV1({tool:oldRequest.tool,args:oldRequest.args,schemaDigest:oldRequest.schemaDigest})!==videoProductionDigestV1({tool:preparation.request.tool,args:preparation.request.args,schemaDigest:preparation.request.schemaDigest}))deny('VIDEO_PRODUCTION_INTENT_MISMATCH');
          for(const scene of resolved.scenes)if(scene.jobId===job.id){scene.jobId=existing.id;scene.reused=true;}
          if(resolved.final.jobId===job.id)resolved.final.jobId=existing.id;
          continue;
        }
        const group=groups.get(connection.id)??{connection,reserved:new Prisma.Decimal(0)};
        group.reserved=group.reserved.plus(connection.perJob!);groups.set(connection.id,group);
        fresh.push({id:job.id,organizationId:row.organizationId,actorId:row.userId,pieceId:manifest.pieceId,pieceRevision:manifest.pieceRevision,
          draftId:row.id,draftVersion:row.revision,preflightId:job.id,intentId:job.intentId,connectionId:connection.id,walletDigest:connection.walletDigest,
          generation:connection.generation,provider:connection.provider,unit:connection.unit,state:job.state,request:json(preparation.request),quote:json(preparation.request.quote),
          snapshot:json({...job.snapshot,kind:'production/personal-v2',productionRevisionId:row.id,manifestDigest:row.digest,approvalId:saved.id,fundingDigest:videoProductionDigestV1(manifest.funding)}),
          reserved:connection.perJob!,period:creditPeriod(now)});
      }
      for(const {connection,reserved} of groups.values()){
        const limit=limits.find(entry=>entry.connectionId===connection.id);
        if(!limit||limit.unit!==connection.unit||reserved.gt(limit.maxCredits))deny('VIDEO_PRODUCTION_TOTAL_CREDIT_LIMIT_EXCEEDED');
        if((await creditExposure(tx,connection.id,now)).plus(reserved).gt(connection.perMonth!))deny('VIDEO_MONTHLY_CREDIT_LIMIT_EXCEEDED',429);
      }
      for(const job of fresh)await tx.videoSubscriptionJob.create({data:job});
      resolved.acceptedAt=now.toISOString();
      await tx.videoProductionRevision.update({where:{id:row.id,organizationId:row.organizationId},data:{state:'approved',approval:json(resolved)}});
      return personalRevision({...current,state:'approved',approval:resolved});
    },'Video personal production admission is busy; retry the same approval.');
  }
  async finalPersonalJob(row:PersonalProductionRevisionV2,job:PersonalProductionJobCreateV2){
    return serializableWithRetry(this.prisma,async tx=>{
      await new VideoSubscriptionRepository(this.prisma).member(row.organizationId,row.userId,true,tx);
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId:row.organizationId,id:row.id,state:'approved',stoppedAt:null,userId:row.userId,digest:row.digest}});
      if(!current)deny('VIDEO_PRODUCTION_STOPPED');
      const approval=current.approval as unknown as PersonalProductionApprovalV2;
      if(approval?.version!==2||!approval.acceptedAt||approval.actorId!==row.userId||approval.manifestDigest!==row.digest||approval.final.jobId!==job.id)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      const manifest=await this.personalSource(tx,current),existing=await tx.videoSubscriptionJob.findFirst({where:{organizationId:row.organizationId,id:job.id,actorId:row.userId}});
      const snapshot=existing?.snapshot as Record<string,unknown>|undefined;
      if(!existing||existing.draftId!==row.id||snapshot?.kind!=='production/personal-v2'||snapshot.manifestDigest!==row.digest||snapshot.productionRevisionId!==row.id||snapshot.fundingDigest!==videoProductionDigestV1(manifest.funding))deny('VIDEO_PRODUCTION_JOB_NOT_FOUND');
      if(existing.state!=='awaiting_assets')return existing;
      if(approval.final.readyRequestDigest||existing.submitAttempts||existing.receipt||existing.submittedAt||job.intentId!==existing.intentId||job.preparation.operation!=='final_composition'||
        approval.final.provider!==job.preparation.provider||approval.final.connectionId!==job.preparation.connectionId)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      const connection=await this.personalConnection(tx,row,manifest,job.preparation);
      if(existing.connectionId!==connection.id||existing.walletDigest!==connection.walletDigest||existing.generation!==connection.generation||existing.provider!==connection.provider||existing.unit!==connection.unit)deny('VIDEO_CONNECTION_CHANGED');
      const quote=job.preparation.request.quote;
      if(existing.reserved.lt(quote.amount)||(quote.upperBound!==null&&existing.reserved.lt(quote.upperBound)))deny('VIDEO_JOB_CREDIT_LIMIT_EXCEEDED');
      const frozenApproval={...approval,final:{...approval.final,readyRequestDigest:videoProductionDigestV1(job.preparation.request)}};
      await tx.videoProductionRevision.update({where:{id:row.id,organizationId:row.organizationId},data:{approval:json(frozenApproval)}});
      return tx.videoSubscriptionJob.update({where:{id:existing.id,organizationId:row.organizationId},data:{state:'accepted',request:json(job.preparation.request),quote:json(quote),
        snapshot:json({...job.snapshot,kind:'production/personal-v2',productionRevisionId:row.id,manifestDigest:row.digest,approvalId:approval.id,fundingDigest:videoProductionDigestV1(manifest.funding)})}});
    },'Video personal composition admission is busy; retry the same revision.');
  }
  private unsentPersonalFinal(row:PersonalProductionRevisionV2,job:Awaited<ReturnType<VideoProductionRepository['subscriptionJob']>>){
    const approval=row.approval,prepared=approval?.final.preparation,snapshot=job?.snapshot as Record<string,unknown>|undefined;
    return !!job&&!!approval&&!!prepared&&job.id===approval.final.jobId&&job.organizationId===row.organizationId&&job.actorId===row.userId&&
      job.draftId===row.id&&job.draftVersion===row.revision&&job.preflightId===job.id&&job.pieceId===row.manifest.pieceId&&job.pieceRevision===row.manifest.pieceRevision&&
      job.state==='awaiting_assets'&&job.submitAttempts===0&&job.submittedAt===null&&job.receipt===null&&job.connectionId===prepared.connectionId&&
      job.provider===prepared.provider&&job.walletDigest===prepared.walletDigest&&job.generation===prepared.accountGeneration&&job.unit===prepared.unit&&job.reserved.eq(prepared.perJob)&&
      snapshot?.kind==='production/personal-v2'&&snapshot.productionRevisionId===row.id&&snapshot.manifestDigest===row.digest&&snapshot.approvalId===approval.id&&
      snapshot.fundingDigest===videoProductionDigestV1(row.manifest.funding)&&videoProductionDigestV1(job.request)===videoProductionDigestV1(prepared.request);
  }
  async recordPersonalFinalPreparationError(organizationId:string,revisionId:string,jobId:string,code:string){
    return serializableWithRetry(this.prisma,async tx=>{
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId,id:revisionId,state:{in:['approved','needs_attention']},stoppedAt:null}});
      if(!current||!personal(current.manifest))return false;
      const row=personalRevision(current),approval=row.approval;
      if(approval?.version!==2||approval.kind!=='personal_subscription'||!approval.acceptedAt||approval.actorId!==row.userId||approval.manifestDigest!==row.digest||approval.final.jobId!==jobId)return false;
      const job=await tx.videoSubscriptionJob.findFirst({where:{organizationId,id:jobId}});
      if(!this.unsentPersonalFinal(row,job))return false;
      // Persist the blocker and pause together: a stale failing preparation
      // must not pause a final which another worker already froze or resumed.
      await tx.videoProductionRevision.update({where:{organizationId,id:revisionId},data:{state:'needs_attention'}});
      await tx.videoSubscriptionJob.update({where:{organizationId,id:jobId},data:{errorCode:/^VIDEO_[A-Z0-9_:.-]{1,160}$/.test(code)?code:'VIDEO_FINAL_PREPARATION_FAILED'}});
      return true;
    },'Video personal final preparation is busy; reload the same revision.');
  }
  async resumePersonalFinal(organizationId:string,actorId:string,id:string,approvalId:string,digest:string){
    return serializableWithRetry(this.prisma,async tx=>{
      await new VideoSubscriptionRepository(this.prisma).member(organizationId,actorId,true,tx);
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId,id}});
      if(!current)deny('VIDEO_PRODUCTION_NOT_FOUND',404);
      if(current.userId!==actorId)deny('VIDEO_PRODUCTION_ACTOR_MISMATCH',403);
      if(current.stoppedAt||current.state==='stopped')deny('VIDEO_PRODUCTION_STOPPED');
      const row=personalRevision(current),approval=row.approval;
      if(!personal(row.manifest)||!['needs_attention','approved'].includes(row.state)||row.digest!==digest||approval?.version!==2||approval.kind!=='personal_subscription'||
        approval.id!==approvalId||approval.manifestDigest!==row.digest||approval.actorId!==actorId||!approval.acceptedAt||approval.blockers.length)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      await this.personalSource(tx,current);
      const final=await tx.videoSubscriptionJob.findFirst({where:{organizationId,id:approval.final.jobId}});
      if(!this.unsentPersonalFinal(row,final))deny('VIDEO_FINAL_PREPARATION_RETRY_UNAVAILABLE');
      for(const plan of approval.scenes)if(plan.jobId){
        const scene=await tx.videoSubscriptionJob.findFirst({where:{organizationId,id:plan.jobId,actorId}});
        if(!scene||scene.state!=='completed'||!scene.resultMediaId)deny('VIDEO_SCENE_RECONCILIATION_REQUIRED');
      }
      if(row.state==='approved')return row;
      await tx.videoProductionRevision.update({where:{organizationId,id,state:'needs_attention',stoppedAt:null,digest},data:{state:'approved'}});
      await tx.videoSubscriptionJob.update({where:{organizationId,id:final!.id},data:{errorCode:null}});
      return personalRevision({...current,state:'approved'});
    },'Video personal final retry is busy; retry the same saved approval.');
  }
  async stopPersonal(organizationId:string,actorId:string,id:string){
    return serializableWithRetry(this.prisma,async tx=>{
      await new VideoSubscriptionRepository(this.prisma).member(organizationId,actorId,true,tx);
      const row=await tx.videoProductionRevision.findFirst({where:{organizationId,id}});
      if(!row)deny('VIDEO_PRODUCTION_NOT_FOUND',404);
      if(row.userId!==actorId)deny('VIDEO_PRODUCTION_ACTOR_MISMATCH',403);
      if(!personal(row.manifest))deny('VIDEO_PRODUCTION_FUNDING_CHANGED');
      const approval=row.approval as unknown as PersonalProductionApprovalV2|null;
      const ids=[...(approval?.scenes.map(scene=>scene.jobId).filter((value):value is string=>!!value)??[]),...(approval?.final.jobId?[approval.final.jobId]:[])];
      const stoppedAt=row.stoppedAt??new Date();
      await tx.videoProductionRevision.update({where:{organizationId,id},data:{state:'stopped',stoppedAt}});
      await tx.videoSubscriptionJob.updateMany({where:{organizationId,actorId,draftId:id,id:{in:ids},state:{in:['accepted','awaiting_assets']},submitAttempts:0,submittedAt:null,receipt:{equals:Prisma.DbNull}},
        data:{state:'canceled',actualCost:0,costCertainty:'locally_canceled',finishedAt:new Date(),leaseOwner:null,leaseUntil:null,errorCode:'VIDEO_PRODUCTION_STOPPED'}});
      return personalRevision({...row,state:'stopped',stoppedAt});
    },'Video personal production is busy; retry stop.');
  }
  byIntent(organizationId:string,intentId:string){return this.prisma.videoGenerationJob.findUnique({where:{organizationId_intentId:{organizationId,intentId}}});}
  async approve(row:VideoProductionRevisionV1,approval:VideoProductionApprovalV1,jobs:ProductionJobCreateV1[],limits:Record<string,number>){
    return serializableWithRetry(this.prisma,async tx=>{
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId:row.organizationId,id:row.id}});
      const saved=current?.approval as unknown as VideoProductionApprovalV1;
      if(current?.state==='approved'&&saved?.id===approval.id)return revision(current);
      if(!current||current.state!=='preflight'||current.stoppedAt||saved?.id!==approval.id||saved.manifestDigest!==row.digest||saved.actorId!==row.userId)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      if(Date.parse(saved.expiresAt)<=Date.now()||saved.blockers.length)deny('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED');
      let reservation=0;
      const resolved=structuredClone(approval);
      const fresh:ProductionJobCreateV1[]=[];
      for(const job of jobs){
        const existing=await tx.videoGenerationJob.findUnique({where:{organizationId_intentId:{organizationId:row.organizationId,intentId:job.intentId}}});
        if(existing){
          const found=resolved.scenes.find(s=>s.jobId===job.id);if(found)found.jobId=existing.id;
          if(resolved.finalJobId===job.id)resolved.finalJobId=existing.id;
          if(existing.state!=='completed')deny('VIDEO_SCENE_RECONCILIATION_REQUIRED');
        }else{fresh.push(job);reservation+=Number(job.reservedUsd);}
      }
      if(reservation>approval.maxTotalUsd+1e-8)deny('VIDEO_PRODUCTION_TOTAL_BUDGET_EXCEEDED');
      await this.checkBudget(tx,row.organizationId,fresh,limits);
      for(const job of fresh)await tx.videoGenerationJob.create({data:job});
      resolved.acceptedAt=new Date().toISOString();
      await tx.videoProductionRevision.update({where:{id:row.id,organizationId:row.organizationId},data:{state:'approved',approval:json(resolved)}});
      return revision({...current,state:'approved',approval:resolved});
    },'Video production admission is busy; retry the same approval.');
  }
  /** The final reservation already exists; atomically freeze derived asset URLs exactly once. */
  async finalJob(row:VideoProductionRevisionV1,job:ProductionJobCreateV1){
    return serializableWithRetry(this.prisma,async tx=>{
      const current=await tx.videoProductionRevision.findFirst({where:{organizationId:row.organizationId,id:row.id,state:'approved',stoppedAt:null}});
      if(!current)deny('VIDEO_PRODUCTION_STOPPED');
      const approval=current.approval as unknown as VideoProductionApprovalV1;
      if(!approval.finalJobId||approval.finalJobId!==job.id)deny('VIDEO_PRODUCTION_APPROVAL_STALE');
      const existing=await tx.videoGenerationJob.findFirst({where:{organizationId:row.organizationId,id:approval.finalJobId}});
      if(!existing)deny('VIDEO_PRODUCTION_JOB_NOT_FOUND');
      if(existing.state!=='awaiting_assets')return existing;
      await tx.videoProductionRevision.update({where:{id:row.id,organizationId:row.organizationId},data:{updatedAt:new Date()}});
      return tx.videoGenerationJob.update({where:{id:existing.id,organizationId:row.organizationId},data:{request:job.request,snapshot:job.snapshot,estimate:job.estimate,state:'accepted'}});
    },'Video composition admission is busy; retry the same revision.');
  }
  private async checkBudget(tx:Prisma.TransactionClient,organizationId:string,jobs:ProductionJobCreateV1[],limits:Record<string,number>,future?:{provider:string;payer:string;amount:number}){
    const now=new Date();const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
    const groups=new Map<string,{provider:string;payer:string;amount:number}>();
    for(const job of jobs){const k=job.provider+':'+job.payer;const g=groups.get(k)??{provider:job.provider,payer:job.payer as string,amount:0};g.amount+=Number(job.reservedUsd);groups.set(k,g);}
    if(future){const k=future.provider+':'+future.payer;const g=groups.get(k)??{...future,amount:0};g.amount+=future.amount;groups.set(k,g);}
    for(const[k,g]of groups){
      // Unknown costs remain exposure after period rollover, failure, cancellation or storage failure.
      const rows=await tx.videoGenerationJob.findMany({where:{organizationId,provider:g.provider,payer:g.payer as any,OR:[{createdAt:{gte:start}},{costUsd:null}]},select:{reservedUsd:true,costUsd:true}});
      const used=rows.reduce((n,r)=>n+(r.costUsd===null?Number(r.reservedUsd):Number(r.costUsd)),0);
      if(!Number.isFinite(limits[k])||used+g.amount>limits[k]+1e-8)deny('VIDEO_MONTHLY_BUDGET_EXHAUSTED',429);
    }
  }
  async stop(organizationId:string,id:string){
    return serializableWithRetry(this.prisma,async tx=>{
      const row=await tx.videoProductionRevision.findFirst({where:{organizationId,id}});if(!row)deny('VIDEO_PRODUCTION_NOT_FOUND',404);
      await tx.videoProductionRevision.update({where:{id,organizationId},data:{state:'stopped',stoppedAt:row.stoppedAt??new Date()}});
      await tx.videoGenerationJob.updateMany({where:{organizationId,productionRevisionId:id,state:{in:['accepted','awaiting_assets']}},data:{state:'canceled',costUsd:0,finishedAt:new Date(),errorCode:'VIDEO_PRODUCTION_STOPPED'}});
      return revision({...row,state:'stopped',stoppedAt:row.stoppedAt??new Date()});
    },'Video production is busy; retry stop.');
  }
  async claimResultEvidence(organizationId:string,id:string,resultMediaId:string,owner:string){
    const changed=await this.prisma.videoGenerationJob.updateMany({where:{organizationId,id,resultMediaId,state:'completed',OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},data:{leaseOwner:owner,leaseUntil:new Date(Date.now()+600000)}});
    return changed.count===1;
  }
  async saveResultEvidence(organizationId:string,id:string,resultMediaId:string,owner:string,metadata:MeasuredVideoMetadataV1,captions:VideoCaptionEvidenceV1,subtitle?:StoredSubtitleV1){
    return serializableWithRetry(this.prisma,async tx=>{
      const job=await tx.videoGenerationJob.findFirst({where:{organizationId,id,resultMediaId,state:'completed',leaseOwner:owner,leaseUntil:{gt:new Date()}}});
      if(!job)throw new Error('VIDEO_RESULT_EVIDENCE_LEASE_LOST');
      const stored=(job.storedFile??{}) as Record<string,any>;
      const existing=stored.resultEvidence?.subtitles as VideoSubtitleResultV1[]|undefined;
      const subtitles=existing??[];
      if(subtitle&&!subtitles.length){
        const media=await tx.media.create({data:{organizationId,name:subtitle.name,originalName:subtitle.name,path:subtitle.path,type:'subtitle',fileSize:subtitle.size}});
        subtitles.push({id:media.id,mediaId:media.id,name:media.name,path:media.path,type:'subtitle',mimeType:subtitle.mimeType,role:'captions',sha256:subtitle.sha256,cueCount:subtitle.cueCount,source:subtitle.source});
      }
      await tx.videoGenerationJob.update({where:{id,organizationId},data:{storedFile:json({...stored,metadata,resultEvidence:{captions,subtitles}})}});
      return {metadata,captions,subtitles};
    },'Video evidence is busy; reload the saved result.');
  }
  async recordFinalPreparationError(organizationId:string,revisionId:string,jobId:string,code:string){
    await this.prisma.videoGenerationJob.updateMany({where:{organizationId,id:jobId,productionRevisionId:revisionId,state:'awaiting_assets',submitAttempts:0},data:{errorCode:code}});
  }
  async setState(organizationId:string,id:string,state:string){await this.prisma.videoProductionRevision.updateMany({where:{organizationId,id,state:'approved',stoppedAt:null},data:{state}});}
  async resume(organizationId:string,id:string){await this.prisma.videoProductionRevision.updateMany({where:{organizationId,id,state:'needs_attention',stoppedAt:null},data:{state:'approved'}});}
  pending(){return this.prisma.videoProductionRevision.findMany({where:{state:'approved',stoppedAt:null},select:{id:true,organizationId:true},take:500,orderBy:{updatedAt:'asc'}});}
}
