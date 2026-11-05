import { assertLocalReelCandidateV1,projectLocalReelScenesV1,type LocalRenderContinuationV1 } from './editorial/local-reel-scenes.v1';
import { assertGrantScope } from './autonomy/grant-policy';
import { readDraftDestinationV1 } from './draft-destination.v1';
import { postingMinutesOf } from '../pieces/adaptation-plan';
import { SocialFactoryLearningService } from './learning/learning.service';
import { Injectable,Optional } from '@nestjs/common';
import {localCompositionPublicV2,type LocalCompositionOperationRecordV2} from './local-composition.operation.v2';
import { SourceArtifactServiceV1 } from './source-artifact.service';
import { CampaignService, type CreateCampaignInput, approvalDigest } from './campaign/campaign.service';
import { AutonomyService, type GrantInput } from './autonomy/autonomy.service';
import { SocialFactoryRepository, SocialFactoryError, resourceRef } from './social-factory.repository';
import { IntegrationService } from '../../database/prisma/integrations/integration.service';
import type { AutonomyDecisionV1, CampaignV1, LearningFindingV1 } from './contracts/social-factory.v1';

@Injectable()
export class SocialFactoryService {
  constructor(readonly campaigns:CampaignService,readonly autonomy:AutonomyService,private readonly store:SocialFactoryRepository,private readonly integrations:IntegrationService,private readonly learning:SocialFactoryLearningService,@Optional() private readonly sourceArtifacts?:SourceArtifactServiceV1){}
  async assertChannel(org:string,id:string,platform?:string){
    const draft=await this.store.read(org,'draft_destination',id);
    if(draft){const value=readDraftDestinationV1(draft.payload,id);if(platform&&platform!==value.platform)throw new SocialFactoryError('DRAFT_DESTINATION_PLATFORM_MISMATCH');return {id,name:value.name,providerIdentifier:value.platform,postingTimes:null as string|null,destination:{kind:'draft' as const,id,publishable:false as const},actorId:value.actorId};}
    const channel=await this.integrations.getIntegrationById(org,id);
    const actual=channel?.providerIdentifier==='instagram-standalone'?'instagram':channel?.providerIdentifier;
    if(!channel||channel.deletedAt||platform&&actual!==platform)throw new SocialFactoryError('SOCIAL_FACTORY_CHANNEL_NOT_FOUND','Channel unavailable in this workspace.',404);
    return channel;
  }
  async create(org:string,input:CreateCampaignInput){
    input={...input,allocations:input.allocations.map(allocation=>({...allocation}))};
    const slotMinutesUtc:Record<string,number[]>={};
    for(const allocation of input.allocations){const channel=await this.assertChannel(org,allocation.channelId,allocation.platform);
      if('destination' in channel){if(channel.actorId!==input.actorId)throw new SocialFactoryError('DRAFT_DESTINATION_ACTOR_MISMATCH');allocation.destination=channel.destination;}
      else if(allocation.destination)throw new SocialFactoryError('DRAFT_DESTINATION_INVALID');
      slotMinutesUtc[channel.id]=postingMinutesOf(channel.postingTimes);}
    // Accepted findings from this tenant/channel become actual planning inputs. Expiry/invalidation is enforced by the store.
    const plans=await Promise.all([...new Set(input.allocations.map(a=>a.channelId))].map(id=>this.learning.forPlanning(org,id)));
    const eligible=plans.flatMap(plan=>plan.findings).map(payload=>({id:payload.id,payload}));
    const ids=new Set(eligible.map(row=>row.id));
    if((input.findingIds??[]).some(id=>!ids.has(id)))throw new SocialFactoryError('SOCIAL_FACTORY_FINDING_SCOPE','Finding unavailable for these channels.',400);
    return this.campaigns.create(org,{...input,slotMinutesUtc,findingIds:[...new Set([...(input.findingIds??[]),...eligible.map(row=>row.id)])]});
  }
  async grant(org:string,input:GrantInput){
    for(const id of input.channelIds){const channel=await this.assertChannel(org,id);if('destination'in channel&&(channel.actorId!==input.actorId||input.actions.some(action=>['publish','schedule'].includes(action))))throw new SocialFactoryError('DRAFT_DESTINATION_NOT_PUBLISHABLE');}
    return this.autonomy.grant(org,input);
  }
  async detail(org:string,id:string,actorId?:string){
    await this.store.purgeExpired(org);
    const detail=await this.campaigns.get(org,id);
    const channels=await Promise.all([...new Set(detail.items.map(item=>item.channelId))].map(async channelId=>{const channel=await this.integrations.getIntegrationById(org,channelId);const draft=channel?null:await this.store.read<any>(org,'draft_destination',channelId);return [channelId,channel?.name??draft?.payload?.name??'']as const;}));
    const channelNames=new Map(channels);
    const findings=await Promise.all(detail.campaign.findingIds.map(key=>this.store.read<LearningFindingV1>(org,'finding',key)));
    const decisions=await this.store.list<AutonomyDecisionV1>(org,'decision',10000,id);
    const grant=detail.campaign.grantId?await this.autonomy.getGrant(org,detail.campaign.grantId).catch(()=>null):null;
    const operations=await this.store.list<any>(org,'editorial',10000,id);
    const planned=new Map<string,any>();
    const operationFor=(item:typeof detail.items[number])=>{const matches=operations.filter(row=>row.payload.version===2&&row.payload.itemId===item.id&&(row.payload.appliedContentRevision??row.payload.sourceContentRevision)===item.contentRevision);return matches.length===1?matches[0].payload:undefined;};
    const localCompositions=new Map<string,ReturnType<typeof localCompositionPublicV2>>();
    if(actorId)for(const item of detail.items){const compositionId=operationFor(item)?.localComposition?.id;if(!compositionId)continue;
      const row=await this.store.read<LocalCompositionOperationRecordV2>(org,'editorial',compositionId);
      if(row?.payload.type==='local_composition_v2'&&row.payload.actorId===actorId&&row.payload.operationId===operationFor(item)?.id)localCompositions.set(item.id,localCompositionPublicV2(row.payload));
    }
    for(const operation of operations)if(operation.payload.type==='campaign_destination_plan')for(const assignment of operation.payload.assignments??[])planned.set(assignment.itemId,assignment);
    const sourceStates=new Map<string,{state:'current'|'stale';code?:string}>();
    for(const item of detail.items){const source=operationFor(item)?.baseInput?.sourceArtifact;if(!source)continue;
      try{if(!this.sourceArtifacts)throw new Error('SOURCE_ARTIFACT_SERVICE_REQUIRED');await this.sourceArtifacts.assertCurrent(org,source.actorId,source);sourceStates.set(item.id,{state:'current'});}
      catch(error:any){sourceStates.set(item.id,{state:'stale',code:error?.code??error?.getResponse?.()?.code??error?.message??'SOURCE_ARTIFACT_STALE'});}
    }
    const continuations=new Map<string,NonNullable<Awaited<ReturnType<AutonomyService['localPreflightContinuation']>>>|LocalRenderContinuationV1>();
    const localRenderStates=new Map<string,any>();
    if(actorId)for(const item of detail.items){const op=operationFor(item);if(!op||sourceStates.get(item.id)?.state==='stale')continue;
      if(['needs_video','material_ready'].includes(op.state)&&sourceStates.get(item.id)?.state==='current'&&(op.baseInput?.brief?.audioMode==='silent'||(op.material?.scenes?.length&&op.material.scenes.every((scene:any)=>!scene.spokenText?.trim())))){
       try{const material=assertLocalReelCandidateV1(org,actorId,op,detail.campaign,item);const target=await this.assertChannel(org,item.channelId,item.platform);if('destination'in target&&target.actorId!==actorId)throw Error('LOCAL_REEL_ACTOR_MISMATCH');
        if(detail.campaign.grantId){if(!grant)throw Error('AUTONOMY_GRANT_REQUIRED');assertGrantScope(grant,detail.campaign,item,'prepare');}
        projectLocalReelScenesV1(material);
        continuations.set(item.id,{kind:'local_render',reason:'SAVED_PREPARATION_READY',primaryPreparation:'saved',primaryRetryAllowed:false,speech:false,nextAction:'campaign.render_local_reel',expectedContentRevision:item.contentRevision,sourceArtifact:op.baseInput.sourceArtifact.ref,
         input:{operationId:op.id,expectedContentRevision:item.contentRevision}});
        localRenderStates.set(item.id,{state:'ready_to_render',mode:'silent',primaryPreparation:'saved',primaryRetryAllowed:false,...(op.blocker?{previousLocalFailure:op.blocker}:{})});
       }catch(error:any){localRenderStates.set(item.id,{state:'needs_input',reason:error?.code??error?.message??'LOCAL_REEL_INPUT_REQUIRED',primaryPreparation:'saved',primaryRetryAllowed:false});}
       continue;
      }
      if(item.state!=='uncertain')continue;
      const continuation=await this.autonomy.localPreflightContinuation(org,actorId,op.id,item.contentRevision);
      if(continuation)continuations.set(item.id,continuation);
    }
    return {...detail,grant,campaign:{...detail.campaign,allocations:detail.campaign.allocations.map(allocation=>({...allocation,channelName:channelNames.get(allocation.channelId)}))},items:detail.items.map(item=>({...item,...(localCompositions.get(item.id)?{localComposition:localCompositions.get(item.id)}:{}),...(localRenderStates.get(item.id)?{localRender:localRenderStates.get(item.id)}:{}),...(continuations.get(item.id)?{continuation:continuations.get(item.id)}:{}),...(sourceStates.get(item.id)?.state==='stale'?{state:'needs_input' as const,blocker:{code:sourceStates.get(item.id)!.code!,detail:'The selected source changed. Read its current version and explicitly revise this item.'}}:{}),sourceStatus:sourceStates.get(item.id),operationId:operationFor(item)?.id,productionId:operationFor(item)?.productionId,sourceArtifact:item.material?.sourceArtifact??operationFor(item)?.baseInput?.sourceArtifact?.ref,channelName:channelNames.get(item.channelId),plannedTopic:planned.get(item.id)?.candidate?.title,plannedAngle:planned.get(item.id)?.candidate?.angle,plannedLengthOptions:planned.get(item.id)?.lengthOptions,approvalDigest:approvalDigest(item)})),findings:findings.filter(Boolean).map(row=>row!.payload),decisions:decisions.map(row=>({...row.payload,id:row.id}))};
  }
  async sourceRecommendation(org:string,channelId:string,dismiss=false){
    await this.assertChannel(org,channelId);
    const row=await this.store.read<{dismissed:boolean}>(org,'source_recommendation',channelId);
    if(dismiss&&!row?.payload.dismissed)await this.store.put({organizationId:org,kind:'source_recommendation',id:channelId,payload:{dismissed:true},expectedRevision:row?.revision??0});
    return {show:!dismiss&&!row?.payload.dismissed};
  }
}
