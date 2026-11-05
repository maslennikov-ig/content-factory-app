import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VideoProductionRepository, ProductionJobCreateV1 } from '../../database/prisma/video-production/video-production.repository';
import { VideoGenerationRepository, VIDEO_PENDING_V1 } from '../../database/prisma/video-generation/video-generation.repository';
import { VideoCredentialsService } from '../video-credentials.service';
import { HeygenProviderV1 } from '../providers/heygen.provider';
import { HiggsfieldProviderV1 } from '../providers/higgsfield.provider';
import { HeygenStudioCompositionProviderV1 } from '../providers/composition/heygen-studio.provider.v1';
import { HyperframesCompositionProviderV1, estimateHyperframesV1 } from '../providers/composition/hyperframes.provider.v1';
import { compositionUrlV1 } from '../providers/composition/composition-http.v1';
import { VideoCompositionProviderV1 } from '../video-composition.provider.v1';
import { VideoJobService } from '../video-job.service';
import { VideoMediaV1 } from '../video-media.v1';
import { videoErrorV1, videoSettingsV1, videoSourceRevisionV1 } from '../video-brief.v1';
import type { VideoCredentialV1, VideoPreparedRequestV1, VideoSettingsV1 } from '../video-provider.v1';
import type { CompositionInputV1, CompositionSceneV1 } from '../providers/composition/composition-provider.v1';
import { compositionSourceV1, parseProductionManifestV1, productionSceneKeyV1, videoProductionDigestV1, VideoProductionApprovalV1, VideoProductionManifestV1, VideoProductionRevisionV1, VideoProductionScenePlanV1 } from './video-production.v1';
import { productionCaptionPlanV1, MeasuredVideoMetadataV1, StoredSubtitleV1, VideoProductionResultV1 } from './video-production-result.v1';
import { VIDEO_PRODUCTION_EXECUTION_V1, VideoProductionExecutionPortV1 } from './video-production-execution.port.v1';
import { VideoProductionPersonalServiceV2 } from './video-production.personal.service.v2';
import type {LocalCompositionProvenanceV2} from '../../content-intelligence/social-factory/editorial/local-composition.service.v2';

const keyFor=(key:string)=>'production-scene-'+key;
const finalKey=(id:string)=>'production-final-'+id;
const validMoney=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>0&&x<=100000;

@Injectable()
export class VideoProductionService {
  constructor(
    private readonly repository:VideoProductionRepository,
    private readonly generations:VideoGenerationRepository,
    private readonly credentials:VideoCredentialsService,
    private readonly heygen:HeygenProviderV1,
    private readonly higgsfield:HiggsfieldProviderV1,
    private readonly studio:HeygenStudioCompositionProviderV1,
    private readonly hyperframes:HyperframesCompositionProviderV1,
    private readonly jobs:VideoJobService,
    private readonly media:VideoMediaV1,
    @Inject(VIDEO_PRODUCTION_EXECUTION_V1) private readonly execution:VideoProductionExecutionPortV1,
    @Optional() private readonly personal?:VideoProductionPersonalServiceV2,
  ){}
  private personalLane(){if(!this.personal)return videoErrorV1('VIDEO_PERSONAL_PRODUCTION_UNAVAILABLE',409);return this.personal;}
  private personalRow(row:VideoProductionRevisionV1){return (row.manifest as any)?.version===2||(row.manifest as any)?.funding?.kind==='personal_subscription';}

  private async row(organizationId:string,id:string){
    const row=await this.repository.read(organizationId,id);
    if(!row)return videoErrorV1('VIDEO_PRODUCTION_NOT_FOUND',404);
    return row;
  }
  private async validateSource(organizationId:string,manifest:VideoProductionManifestV1){
    const piece=await this.generations.piece(organizationId,manifest.pieceId);
    if(!piece||videoSourceRevisionV1(piece)!==manifest.pieceRevision)return videoErrorV1('VIDEO_SOURCE_CHANGED',409);
  }
  private async assets(organizationId:string,manifest:VideoProductionManifestV1){
    const ids=[...new Set(manifest.scenes.flatMap(s=>[s.mediaId,s.audioMediaId,...s.referenceMediaIds].filter((x):x is string=>!!x)))];
    const rows=ids.length?await this.generations.references(organizationId,ids):[];
    if(rows.length!==ids.length)return videoErrorV1('VIDEO_REFERENCE_NOT_FOUND',404);
    const assets=new Map(rows.map(r=>[r.id,r]));
    for(const row of rows)compositionUrlV1(row.path);
    for(const scene of manifest.scenes){
      const source=scene.mediaId?assets.get(scene.mediaId):undefined;
      if(source&&scene.kind==='video'&&source.type!=='video')return videoErrorV1('VIDEO_REFERENCE_NOT_VIDEO');
      if(source&&scene.kind==='image'&&source.type!=='image')return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
      if(scene.audioMediaId&&assets.get(scene.audioMediaId)?.type!=='audio')return videoErrorV1('VIDEO_REFERENCE_NOT_AUDIO');
      for(const id of scene.referenceMediaIds)if(assets.get(id)?.type!=='image')return videoErrorV1('VIDEO_REFERENCE_NOT_IMAGE');
    }
    return assets;
  }
  private assetIdentities(scene:VideoProductionManifestV1['scenes'][number],assets:Map<string,any>){
    return [scene.mediaId,scene.audioMediaId,...scene.referenceMediaIds].filter(Boolean).map(id=>{
      const a=assets.get(id!);return {id:a.id,path:a.path,type:a.type,size:a.fileSize,revision:new Date(a.updatedAt).toISOString()};
    });
  }
  async createRevision(organizationId:string,userId:string,value:any){
    const parent=value?.parentId?await this.repository.read(organizationId,value.parentId):null;
    if(value?.funding||value?.manifest?.version===2||value?.manifest?.funding||parent&&this.personalRow(parent))return this.personalLane().createRevision(organizationId,userId,value);
    if(!value||Object.keys(value).some(k=>!['manifest','intentId','parentId'].includes(k))||typeof value.intentId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value.intentId))return videoErrorV1('VIDEO_PRODUCTION_INPUT_INVALID');
    const manifest=parseProductionManifestV1(value.manifest);
    await this.validateSource(organizationId,manifest);await this.assets(organizationId,manifest);
    const row=await this.repository.create({organizationId,userId,intentId:value.intentId,parentId:value.parentId,manifest,digest:videoProductionDigestV1(manifest)});
    return this.view(row);
  }
  async list(organizationId:string,productionId?:string,actorId?:string){return Promise.all((await this.repository.list(organizationId,productionId)).map(row=>this.personalRow(row)?this.personalLane().get(organizationId,row.id,actorId):this.view(row)));}
  async get(organizationId:string,id:string,actorId?:string){const row=await this.row(organizationId,id);return this.personalRow(row)?this.personalLane().get(organizationId,id,actorId):this.view(row);}
  async finalResultJob(organizationId:string,id:string,jobId:string){const row=await this.row(organizationId,id);return this.personalRow(row)?this.personalLane().finalResultJob(organizationId,id,jobId):this.generations.job(organizationId,jobId);}
  /** Read saved source provenance only. A local final never changes funding or admits/restarts scene jobs. */
  async localSourceEvidenceV2(org:string,actor:string,id:string,pieceId?:string):Promise<LocalCompositionProvenanceV2>{
    const row=await this.row(org,id);
    if(row.userId!==actor||!pieceId||row.manifest.pieceId!==pieceId||videoProductionDigestV1(row.manifest)!==row.digest)return videoErrorV1('LOCAL_COMPOSITION_PRODUCTION_BINDING',409);
    const plans=row.approval?.acceptedAt?row.approval.scenes:[],captions:NonNullable<LocalCompositionProvenanceV2['captions']>={};
    for(const plan of plans){
      if(!plan.jobId)continue;
      const job=this.personalRow(row)?await this.repository.subscriptionJob(org,plan.jobId):await this.generations.job(org,plan.jobId);
      if(job&&(('actorId'in job&&job.actorId!==actor)||('userId'in job&&job.userId!==actor)))continue;
      const facts=(job?.storedFile as {metadata?:MeasuredVideoMetadataV1}|undefined)?.metadata;
      if(!job||job.state!=='completed'||!job.resultMediaId||!facts||facts.source!=='mp4_bytes'||!/^[a-f0-9]{64}$/.test(facts.sha256)||(job.providerResult as {captionsBurned?:unknown}|null)?.captionsBurned!==true)continue;
      const owned=await this.generations.media(org,job.resultMediaId);if(!owned)continue;
      captions[job.resultMediaId]={kind:'provider_confirmed',mediaSha256:facts.sha256,evidenceSha256:videoProductionDigestV1({jobId:job.id,metadata:facts,captionsBurned:true}),sourceJobIds:[job.id]};
    }
    return {captions};
  }
  private async view(row:VideoProductionRevisionV1){
    const jobIds=row.approval?.acceptedAt?[...new Set([...(row.approval?.scenes.map(s=>s.jobId).filter((x):x is string=>!!x)??[]),...(row.approval?.finalJobId?[row.approval.finalJobId]:[])])]:[];
    const jobs=await Promise.all(jobIds.map(id=>this.jobs.get(row.organizationId,id)));
    const final=jobs.find(j=>j.id===row.approval?.finalJobId);
    const result=final?.result?await this.result(row,final.id,final.result):null;
    // Internal request bodies and provider URLs never become the public approval view.
    const approval=row.approval?{id:row.approval.id,actorId:row.approval.actorId,expiresAt:row.approval.expiresAt,
      maxTotalUsd:row.approval.maxTotalUsd,estimatesUsd:row.approval.estimatesUsd,blockers:row.approval.blockers,
      acceptedAt:row.approval.acceptedAt,scenes:row.approval.scenes.map(s=>({sceneId:s.sceneId,kind:s.kind,jobId:s.jobId,reused:s.reused,
        provider:s.provider,model:s.model,payer:s.payer,estimate:s.request?.estimate,reservedUsd:s.reservedUsd,mediaId:s.mediaId})),
      final:{provider:'heygen',model:'hyperframes',payer:row.approval.final.payer,estimate:row.approval.final.estimate,reservedUsd:row.approval.final.reservedUsd},finalJobId:row.approval.finalJobId}:null;
    return {id:row.id,productionId:row.productionId,revision:row.revision,parentId:row.parentId,manifest:row.manifest,digest:row.digest,state:row.state,
      stoppedAt:row.stoppedAt,approval,jobs,result,
      cost:{knownUsd:jobs.reduce((sum,j)=>sum+(j.costUsd??0),0),unknownJobIds:jobs.filter(j=>j.costCertainty==='unknown').map(j=>j.id),reservedJobIds:jobs.filter(j=>j.costCertainty==='reserved').map(j=>j.id),
        reservedUsd:jobs.filter(j=>j.costUsd===null).reduce((sum,j)=>sum+j.reservedUsd,0)},createdAt:row.createdAt};
  }

  private async result(row:VideoProductionRevisionV1,jobId:string,media:{id:string;name:string;path:string;type:string}):Promise<VideoProductionResultV1>{
    if(media.type!=='video')return videoErrorV1('VIDEO_RESULT_NOT_VIDEO');
    const owned={...media,type:'video' as const};
    const final=await this.generations.job(row.organizationId,jobId);
    if(!final||final.state!=='completed'||final.resultMediaId!==media.id)return {...owned,metadataStatus:'unavailable',captions:{burned:'unverified',sourceJobIds:[]},subtitles:[]};
    let stored=final.storedFile as any;
    let metadata=stored?.metadata as MeasuredVideoMetadataV1|undefined;
    const publicResult=(value?:MeasuredVideoMetadataV1,evidence=stored?.resultEvidence):VideoProductionResultV1=>({...owned,metadataStatus:value?'measured':'unavailable',
      ...(value?{width:value.width,height:value.height,durationSeconds:value.durationSeconds,metadata:value}:{}),
      captions:evidence?.captions??{burned:'unverified',sourceJobIds:[]},subtitles:evidence?.subtitles??[]});
    // Cached evidence is server-written and bound to the uploaded bytes, not caller settings.
    if(metadata?.source==='mp4_bytes'&&stored?.resultEvidence){
      const subtitles=stored.resultEvidence.subtitles??[];
      const owned=await this.generations.references(row.organizationId,subtitles.map((s:any)=>s.mediaId));
      return publicResult(metadata,{...stored.resultEvidence,subtitles:subtitles.filter((s:any)=>owned.some(m=>m.id===s.mediaId&&m.type==='subtitle'&&m.path===s.path))});
    }
    const owner=randomUUID();
    if(!await this.repository.claimResultEvidence(row.organizationId,jobId,media.id,owner))return publicResult(metadata);
    try{
      if(metadata?.source!=='mp4_bytes')metadata=await this.media.inspectOwnedVideo(media.path);
      const sceneIds=row.approval?.scenes.map(s=>s.jobId).filter((id):id is string=>!!id)??[];
      const sceneJobs=await Promise.all(sceneIds.map(id=>this.generations.job(row.organizationId,id)));
      const plan=productionCaptionPlanV1(final,sceneJobs.filter(Boolean),metadata!);
      let subtitle:StoredSubtitleV1|undefined;
      try{
        if(plan.subtitleUrl)subtitle=await this.media.importSubtitle(plan.subtitleUrl,metadata!.durationSeconds);
        else if(plan.cues)subtitle=await this.media.storeAuthoredCaptions(plan.cues,metadata!.durationSeconds);
      }catch{/* An unavailable caption asset is not a complete subtitle; retain truthful evidence and no fake Media. */}
      const evidence=await this.repository.saveResultEvidence(row.organizationId,jobId,media.id,owner,metadata!,plan.evidence,subtitle);
      return publicResult(metadata,evidence);
    }catch{
      // Old/unsupported containers remain owned files but carry no fabricated dimensions/duration.
      return publicResult(metadata);
    }finally{await this.generations.release(row.organizationId,jobId,owner);}
  }

  async preflight(organizationId:string,userId:string,id:string,value:unknown){
    const row=await this.row(organizationId,id);
    if(this.personalRow(row))return this.personalLane().preflight(organizationId,userId,id,value);
    const apiValue=value as {maxTotalUsd:number};
    if(row.userId!==userId)return videoErrorV1('VIDEO_PRODUCTION_ACTOR_MISMATCH',403);
    if(!apiValue||Object.keys(apiValue).some(k=>k!=='maxTotalUsd')||!validMoney(apiValue.maxTotalUsd))return videoErrorV1('VIDEO_PRODUCTION_BUDGET_REQUIRED');
    if(!['draft','preflight'].includes(row.state)||row.stoppedAt)return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE',409);
    const m=parseProductionManifestV1(row.manifest);await this.validateSource(organizationId,m);
    const assets=await this.assets(organizationId,m);
    const finalCredential=await this.credentials.resolve(organizationId,'heygen');
    const finalEstimate=estimateHyperframesV1(m.durationSeconds,m.resolution);
    const approval:VideoProductionApprovalV1={version:1,id:randomUUID(),actorId:userId,manifestDigest:row.digest,
      expiresAt:new Date(Date.now()+300000).toISOString(),scenes:[],final:{provider:'heygen',model:'hyperframes',payer:finalCredential.payer,
        credentialReference:finalCredential.reference,estimate:finalEstimate,reservedUsd:finalCredential.maxCostUsd,monthlyBudgetUsd:finalCredential.monthlyBudgetUsd},
      maxTotalUsd:apiValue.maxTotalUsd,estimatesUsd:finalEstimate.usd,blockers:[],finalJobId:randomUUID()};
    let reserved=finalCredential.maxCostUsd;
    for(const scene of m.scenes){
      const key=productionSceneKeyV1(row.productionId,m,scene,this.assetIdentities(scene,assets));
      const plan:VideoProductionScenePlanV1={sceneId:scene.id,key,kind:'asset',mediaId:scene.mediaId,audioMediaId:scene.audioMediaId,
        reused:false,captionsBurned:scene.sourceCaptions==='burned'};
      const needsGeneration=scene.kind==='presenter'||scene.kind==='generated_clip'||(scene.kind==='image'&&!!scene.script.trim()&&!scene.audioMediaId);
      if(needsGeneration){
        plan.kind='generation';const existing=await this.repository.byIntent(organizationId,keyFor(key));
        if(existing){
          plan.jobId=existing.id;plan.reused=true;plan.captionsBurned=m.captions&&scene.kind!=='generated_clip';
          if(existing.state!=='completed')approval.blockers.push('VIDEO_SCENE_RECONCILIATION_REQUIRED:'+scene.id);
        }else{
          const provider=scene.kind==='generated_clip'?'higgsfield':'heygen';
          const credential=await this.credentials.resolve(organizationId,provider);
          let request:VideoPreparedRequestV1;let settings:VideoSettingsV1|undefined;
          if(scene.kind==='presenter'){
            settings=videoSettingsV1({provider:'heygen',model:'heygen-avatar',mode:'presenter',locale:m.locale,duration:scene.durationSeconds,
              aspectRatio:m.aspectRatio,resolution:m.resolution,audio:true,captions:m.captions,avatarId:scene.avatarId,voiceId:scene.voiceId,engine:scene.engine});
            request=await this.heygen.prepare({settings,prompt:'',script:scene.script,references:[],scriptPolicy:'exact'},credential);
          }else if(scene.kind==='generated_clip'){
            settings=videoSettingsV1(scene.clipSettings);
            if(settings.provider!=='higgsfield'||settings.mode!=='clip'||settings.locale!==m.locale||settings.duration!==scene.durationSeconds||settings.aspectRatio!==m.aspectRatio||(!m.audio&&settings.audio)||settings.captions)return videoErrorV1('VIDEO_CLIP_SETTINGS_MISMATCH');
            const references=await Promise.all(scene.referenceMediaIds.map(async id=>({id,url:assets.get(id)!.path,...await this.media.referenceDimensions(assets.get(id)!.path)})));
            request=await this.higgsfield.prepare({settings,prompt:scene.prompt!,script:'',references,scriptPolicy:'exact'},credential);
          }else{
            const input:CompositionInputV1={route:'heygen-studio',intentKey:randomUUID(),title:m.title,locale:m.locale,durationSeconds:scene.durationSeconds,
              aspectRatio:m.aspectRatio,resolution:m.resolution,audio:m.audio,captions:m.captions,approvedScript:scene.script,
              scenes:[{id:scene.id,kind:'image',durationSeconds:scene.durationSeconds,script:scene.script,mediaUrl:assets.get(scene.mediaId!)!.path,voiceId:scene.voiceId}]};
            request=VideoCompositionProviderV1.wrap(await this.studio.prepare(input,credential));
          }
          Object.assign(plan,{jobId:randomUUID(),provider,model:scene.kind==='image'?'heygen-studio':settings!.model,settings,request,
            credentialReference:credential.reference,payer:credential.payer,reservedUsd:credential.maxCostUsd,monthlyBudgetUsd:credential.monthlyBudgetUsd,
            captionsBurned:m.captions&&scene.kind!=='generated_clip'});
          reserved+=credential.maxCostUsd;
          if(request.estimate.usd===null){approval.estimatesUsd=null;approval.blockers.push('VIDEO_PRICE_UNAVAILABLE:'+scene.id);}
          else{if(approval.estimatesUsd!==null)approval.estimatesUsd+=request.estimate.usd;
            if(request.estimate.usd>credential.maxCostUsd||(request.estimate.upperBoundUsd??0)>credential.maxCostUsd)approval.blockers.push('VIDEO_JOB_BUDGET_EXCEEDED:'+scene.id);}
        }
      }
      approval.scenes.push(plan);
    }
    if(finalEstimate.usd===null||finalEstimate.usd>finalCredential.maxCostUsd)approval.blockers.push('VIDEO_FINAL_BUDGET_EXCEEDED');
    if(reserved>approval.maxTotalUsd+1e-8)approval.blockers.push('VIDEO_PRODUCTION_TOTAL_BUDGET_EXCEEDED');
    await this.repository.savePreflight(row,approval);return this.get(organizationId,id);
  }

  async approveAndLaunch(organizationId:string,userId:string,id:string,value:{approvalId:string;digest:string}){
    const row=await this.row(organizationId,id);
    if(this.personalRow(row)){const result=await this.personalLane().approveAndLaunch(organizationId,userId,id,value);await this.dispatch(row);return result;}
    const approval=row.approval;
    if(!approval||value?.approvalId!==approval.id||value?.digest!==row.digest||approval.actorId!==userId||row.userId!==userId)return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE',409);
    if(row.state==='approved'){await this.dispatch(row);return this.view(row);}
    if(row.state!=='preflight'||Date.parse(approval.expiresAt)<=Date.now()||approval.blockers.length)return videoErrorV1('VIDEO_PRODUCTION_PREFLIGHT_BLOCKED',409);
    const m=parseProductionManifestV1(row.manifest);await this.validateSource(organizationId,m);const assets=await this.assets(organizationId,m);
    const creates:ProductionJobCreateV1[]=[];const limits:Record<string,number>={};
    for(const plan of approval.scenes){
      const scene=m.scenes.find(s=>s.id===plan.sceneId)!;
      if(productionSceneKeyV1(row.productionId,m,scene,this.assetIdentities(scene,assets))!==plan.key)return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED',409);
      if(plan.kind==='asset'||plan.reused)continue;
      const credential=await this.credentials.resolve(organizationId,plan.provider!,plan.payer);
      if(credential.reference!==plan.credentialReference||credential.maxCostUsd!==plan.reservedUsd)return videoErrorV1('VIDEO_CREDENTIAL_CHANGED',409);
      if(!plan.request||Date.parse(plan.request.estimate.expiresAt)<=Date.now())return videoErrorV1('VIDEO_PRODUCTION_APPROVAL_STALE',409);
      limits[credential.provider+':'+credential.payer]=credential.monthlyBudgetUsd;
      creates.push(this.jobCreate(row,plan.jobId!,keyFor(plan.key),plan.request,credential,plan.model!,{sceneId:scene.id,scene,settings:plan.settings},plan.request.estimate));
    }
    const finalCredential=await this.credentials.resolve(organizationId,'heygen',approval.final.payer);
    if(finalCredential.reference!==approval.final.credentialReference||finalCredential.maxCostUsd!==approval.final.reservedUsd)return videoErrorV1('VIDEO_CREDENTIAL_CHANGED',409);
    limits['heygen:'+finalCredential.payer]=finalCredential.monthlyBudgetUsd;
    creates.push({...this.jobCreate(row,approval.finalJobId!,finalKey(row.id),{provider:'heygen',endpoint:'',body:{},estimate:approval.final.estimate},finalCredential,'hyperframes',
      {deferred:true,manifestDigest:row.digest},approval.final.estimate),state:'awaiting_assets'});
    const accepted=await this.repository.approve(row,approval,creates,limits);
    await this.dispatch(accepted);return this.view(accepted);
  }
  private jobCreate(row:VideoProductionRevisionV1,id:string,intentId:string,request:VideoPreparedRequestV1,credential:VideoCredentialV1,model:string,snapshot:unknown,estimate:unknown):ProductionJobCreateV1{
    const composition=(request as any).composition;
    return {id,organizationId:row.organizationId,userId:row.userId,pieceId:row.manifest.pieceId,pieceRevision:row.manifest.pieceRevision,
      draftId:'',draftVersion:row.revision,productionRevisionId:row.id,preflightId:id,intentId,
      snapshot:{kind:'production/v1',productionRevisionId:row.id,manifestDigest:row.digest,approvalId:row.approval!.id,details:snapshot} as any,
      provider:credential.provider,model,payer:credential.payer,credentialReference:credential.reference,request:request as any,
      idempotencyKey:composition?.intentKey??id,estimate:estimate as any,reservedUsd:credential.maxCostUsd};
  }
  private async dispatch(row:VideoProductionRevisionV1){try{await this.execution.start(row.organizationId,row.id);}catch{/* Persisted revision recovery owns dispatch retries. */}}
  async stop(organizationId:string,userId:string,id:string){const row=await this.row(organizationId,id);return this.personalRow(row)?this.personalLane().stop(organizationId,userId,id):this.view(await this.repository.stop(organizationId,id));}
  async retrySave(organizationId:string,userId:string,id:string,jobId:string){
    const row=await this.row(organizationId,id);
    if(this.personalRow(row)){const result=await this.personalLane().retrySave(organizationId,userId,id,jobId);await this.dispatch(row);return result;}
    if(!row.approval?.scenes.some(s=>s.jobId===jobId)&&row.approval?.finalJobId!==jobId)return videoErrorV1('VIDEO_PRODUCTION_JOB_NOT_FOUND',404);
    await this.jobs.retrySave(organizationId,userId,jobId);await this.repository.resume(organizationId,id);await this.dispatch(row);return this.get(organizationId,id);
  }
  recoverPending(){return this.repository.pending();}

  async runStep(organizationId:string,id:string):Promise<{state:string;done:boolean}>{
    const row=await this.row(organizationId,id);
    if(this.personalRow(row))return this.personalLane().runStep(organizationId,id);
    if(row.state!=='approved'||row.stoppedAt)return {state:row.state,done:true};
    const approval=row.approval!;
    let waiting=false;let progressed=0;
    for(const plan of approval.scenes){
      if(!plan.jobId)continue;
      const job=await this.generations.job(organizationId,plan.jobId);
      if(!job)return {state:'VIDEO_PRODUCTION_JOB_NOT_FOUND',done:false};
      if(job.state==='completed')continue;
      if(!VIDEO_PENDING_V1.includes(job.state)){await this.repository.setState(organizationId,id,'needs_attention');return {state:'needs_attention:'+job.state,done:true};}
      await this.jobs.runStep(organizationId,job.id);
      waiting=true;if(++progressed>=2||job.state==='saving')break;
    }
    if(waiting)return {state:'preparing_scenes',done:false};
    const final=await this.generations.job(organizationId,approval.finalJobId!);
    if(!final)return {state:'VIDEO_PRODUCTION_JOB_NOT_FOUND',done:false};
    if(final.state==='completed'){await this.repository.setState(organizationId,id,'completed');return {state:'completed',done:true};}
    if(final.state==='awaiting_assets'){try{await this.prepareFinal(row);}catch(error){const code=(error as any)?.getResponse?.()?.code??'VIDEO_FINAL_PREPARATION_FAILED';await this.repository.recordFinalPreparationError(organizationId,id,final.id,code);await this.repository.setState(organizationId,id,'needs_attention');return {state:'needs_attention:'+code,done:true};}}
    else if(VIDEO_PENDING_V1.includes(final.state))await this.jobs.runStep(organizationId,final.id);
    else{await this.repository.setState(organizationId,id,'needs_attention');return {state:'needs_attention:'+final.state,done:true};}
    return {state:final.state,done:false};
  }
  private async prepareFinal(row:VideoProductionRevisionV1){
    const m=parseProductionManifestV1(row.manifest);const approval=row.approval!;
    const assets=await this.assets(row.organizationId,m);const scenes:CompositionSceneV1[]=[];
    for(const plan of approval.scenes){
      const scene=m.scenes.find(s=>s.id===plan.sceneId)!;
      if(productionSceneKeyV1(row.productionId,m,scene,this.assetIdentities(scene,assets))!==plan.key)return videoErrorV1('VIDEO_PRODUCTION_ASSET_CHANGED',409);
      if(plan.jobId){
        const job=await this.generations.job(row.organizationId,plan.jobId);
        const media=job?.resultMediaId?await this.generations.media(row.organizationId,job.resultMediaId):null;
        if(!job||job.state!=='completed'||!media)return videoErrorV1('VIDEO_SCENE_NOT_COMPLETED',409);
        const measured=(job.providerResult as any)?.duration;
        if(m.captions&&scene.script.trim()&&(job.providerResult as any)?.captionsBurned!==true)return videoErrorV1('VIDEO_SCENE_CAPTIONS_UNVERIFIED',409);
        if(scene.script.trim()&&(!Number.isFinite(measured)||measured<=0))return videoErrorV1('VIDEO_SCENE_ACTUAL_DURATION_UNKNOWN',409);
        scenes.push({id:scene.id,kind:'video',durationSeconds:Number.isFinite(measured)&&measured>0?measured:scene.durationSeconds,script:scene.script,mediaUrl:media.path,
          ...(m.audio?{retainSourceAudio:true}:{}),...(plan.captionsBurned?{sourceCaptions:'burned' as const}:{}),...(scene.title?{title:scene.title}:{})});
      }else{
        const media=assets.get(scene.mediaId!)!;
        scenes.push({...compositionSourceV1(scene,media.path,scene.audioMediaId?assets.get(scene.audioMediaId)!.path:undefined),
          ...(!m.audio?{retainSourceAudio:undefined}:{}),...(scene.sourceCaptions==='burned'?{sourceCaptions:'burned' as const}:{})});
      }
    }
    const durationSeconds=scenes.reduce((sum,s)=>sum+s.durationSeconds,0);
    if(durationSeconds>600)return videoErrorV1('VIDEO_PRODUCTION_ACTUAL_DURATION_EXCEEDS_LIMIT',409);
    const credential=await this.credentials.resolve(row.organizationId,'heygen',approval.final.payer);
    if(credential.reference!==approval.final.credentialReference||credential.maxCostUsd!==approval.final.reservedUsd)return videoErrorV1('VIDEO_CREDENTIAL_CHANGED',409);
    const final=await this.generations.job(row.organizationId,approval.finalJobId!);
    const request=await this.hyperframes.prepare({route:'hyperframes',intentKey:final!.idempotencyKey,title:m.title,locale:m.locale,durationSeconds,
      aspectRatio:m.aspectRatio,resolution:m.resolution,audio:m.audio,captions:m.captions,approvedScript:scenes.map(s=>s.script).join('\n\n'),scenes},credential);
    if(request.estimate.usd===null||request.estimate.usd>approval.final.reservedUsd)return videoErrorV1('VIDEO_FINAL_BUDGET_EXCEEDED',409);
    await this.repository.finalJob(row,this.jobCreate(row,approval.finalJobId!,finalKey(row.id),VideoCompositionProviderV1.wrap(request),credential,'hyperframes',
      {manifestDigest:row.digest,sourceJobs:approval.scenes.filter(s=>s.jobId).map(s=>({sceneId:s.sceneId,jobId:s.jobId})),actualDurationSeconds:durationSeconds},request.estimate));
  }
}
