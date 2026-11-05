import { NativeClipPreproductionServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/native-clip-preproduction.service.v1';
import { clipRevisionInputV2 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/native-clip-revision.v2';
import { NativeClipProductionServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/native-clip-production.service.v1';
import { clipExecutionModeInputV2, clipReferenceLaunchV2 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/native-clip-execution.v2';
import { clipProductionPrepareV1, clipProductionLaunchV1, clipLastFrameRepairLaunchV1, clipLastFrameRepairRefreshV1, clipProductionRecoverV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/native-clip-production.v1';
import { clipPreproductionInputV1, clipPreproductionOpenV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/native-clip-preproduction.v1';
import type { AgentThreadsService } from '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service';
import { ModuleRef } from '@nestjs/core';
import { SourceArtifactServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/source-artifact.service';
import { DraftDestinationServiceV1,draftDestinationInputSchemaV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/draft-destination.v1';
import { sourceArtifactResolveInputSchemaV1,parseSourceArtifactSelectionV1,localReelInputSchemaV1,sourceDraftEditInputSchemaV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/native-journey.schemas.v1';
import { SocialFactoryMaterialEditService, type CampaignTextEdit } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/material-edit.service';
import { SocialFactoryProductionService, type CampaignPrepareInput } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/production.service';
import {localCompositionStartSchemaV2,localCompositionScopeSchemaV2} from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/local-composition.operation.v2';
import { VideoProductionService } from '@contentfactory/nestjs-libraries/videos/production/video-production.service';
import { SocialFactoryAttributionService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/attribution/attribution.service';
import { SocialFactoryHelixaExchangeService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/attribution/helixa-exchange.service';
import { SocialFactoryOptionalAnalyticsService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/measurement/optional-analytics/optional-analytics.service';
import { SocialFactorySourcePermissionService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/source-permission.service';
import { campaignPreparationSchema, campaignVideoBindInputSchema, videoRevisionInputSchema, videoPreflightInputSchema, videoLaunchSchema, optionalAnalyticsSchema, attributionLinkSchema, campaignTextEditSchema, sourcePermissionSchema, campaignExperimentSchema, findingProposalSchema, helixaReadRequestSchema, productionReinspectSchema, campaignReviseSchema } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/social-factory.production.schemas.v1';
import { helixaRequestSchema, HELIXA_EXCHANGE_PROTOCOL } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/attribution/helixa-exchange.v1';
import { NativeEditorialMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/editorial/native-material.service';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import type { SourceAdmissionV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/social-factory.v1';
import { z as schema } from 'zod';
import { ChannelProfileServiceV1 } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/profiles/channel-profile.v1';
import { SocialFactoryPlanningService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/planning.service';
import { SocialFactoryMeasurementService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/measurement/measurement.service';
import { SocialFactoryLearningService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/learning/learning.service';
import { EditorialDecisionService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/autonomy/editorial-decision.service';
import type { CreateCampaignInput } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/campaign/campaign.service';
import type { GrantInput } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/autonomy/autonomy.service';
import type { DeliverInput } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/publishing/publishing.service';
import { BadRequestException, Body, Controller, Get, HttpException, Param, Patch, Post } from '@nestjs/common';
import type { Organization, User } from '@prisma/client';
import { z } from 'zod';
import { authorRequestResolver } from '@contentfactory/nestjs-libraries/chat/capabilities/original-author-request';
import { MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '../../services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '../../services/auth/permissions/permission.exception.class';
import { SocialFactoryService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/social-factory.service';
import { SocialFactoryPublishingService } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/publishing/publishing.service';
import { approvalSchema, campaignCreateSchema, deliverySchema, grantSchema, modeSchema, retrySchema } from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/contracts/social-factory.schemas.v1';

export function parseSocialFactory<T extends z.ZodTypeAny>(schema:T,raw:unknown):z.infer<T>{
  const parsed=schema.safeParse(raw);
  if(!parsed.success)throw new BadRequestException({code:'SOCIAL_FACTORY_INVALID_INPUT',message:'Check the campaign fields.',fields:parsed.error.issues.map(issue=>issue.path.join('.'))});
  return parsed.data;
}
async function result<T>(run:()=>Promise<T>){
  try{return await run();}catch(error:any){
    if(error?.code&&error?.status)throw new HttpException({code:error.code,message:error.message},error.status);
    throw error;
  }
}
@Controller('/social-factory')
export class SocialFactoryController{
  constructor(private readonly factory:SocialFactoryService,private readonly publishing:SocialFactoryPublishingService,private readonly profiles:ChannelProfileServiceV1,private readonly planning:SocialFactoryPlanningService,private readonly measurement:SocialFactoryMeasurementService,private readonly learning:SocialFactoryLearningService,private readonly decisions:EditorialDecisionService,private readonly native:NativeEditorialMaterialService,private readonly pieces:PieceService,private readonly production:SocialFactoryProductionService,private readonly videos:VideoProductionService,private readonly attribution:SocialFactoryAttributionService,private readonly exchange:SocialFactoryHelixaExchangeService,private readonly optionalAnalytics:SocialFactoryOptionalAnalyticsService,private readonly permissions:SocialFactorySourcePermissionService,private readonly edits:SocialFactoryMaterialEditService,private readonly sourceArtifacts:SourceArtifactServiceV1,private readonly draftDestinations:DraftDestinationServiceV1,private readonly clips:NativeClipPreproductionServiceV1,private readonly clipModuleRef:ModuleRef,private readonly clipProduction:NativeClipProductionServiceV1){}
  @Post('/clip-preproduction')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async preproduceClip(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipPreproductionInputV1.extend({threadId:z.string().min(1).max(128)}),raw);
    const identity={organizationId:org.id,userId:user.id} as Parameters<AgentThreadsService['readMessages']>[0];
    const context={[MASTRA_THREAD_ID_KEY]:input.threadId,[MASTRA_RESOURCE_ID_KEY]:`${org.id}:${user.id}`};
    const original=await authorRequestResolver(identity,context,token=>this.clipModuleRef.get(token,{strict:false}))?.({requestMessageId:input.requestMessageId});
    if(!original)throw new BadRequestException({code:'CLIP_ORIGINAL_REQUEST_REQUIRED'});
    return result(()=>this.clips.prepare(org.id,user.id,input.threadId,original,clipPreproductionInputV1.parse({requestMessageId:input.requestMessageId,sourceArtifact:input.sourceArtifact,outputLocale:input.outputLocale})));
  }
  @Post('/clip-preproduction/open')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  async openClipPreproduction(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipPreproductionOpenV1.extend({threadId:z.string().min(1).max(128)}),raw);
    // Lazy lookup matches the native resolver and avoids controller -> thread
    // service -> Mastra registry -> controller initialization cycles. Relative
    // requires also survive backend compilation, unlike runtime TS aliases.
    const {AgentThreadsService:Threads}=require('../../../../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service') as {AgentThreadsService:typeof AgentThreadsService};
    if(!await this.clipModuleRef.get(Threads,{strict:false}).ownThread({organizationId:org.id,userId:user.id},input.threadId))throw new BadRequestException({code:'CLIP_OWNED_CHAT_REQUIRED'});
    return result(()=>this.clips.open(org.id,user.id,input.threadId,input.pilotId));
  }
  @Post('/clip-preproduction/revise-v2')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async reviseClipPreproductionV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipRevisionInputV2.extend({threadId:z.string().min(1).max(128)}),raw);
    const original=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clips.reviseV2(org.id,user.id,input.threadId,original,{pilotId:input.pilotId,requestMessageId:input.requestMessageId,scope:input.scope}));
  }
  @Post('/clip-preproduction/resume-review')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async resumeClipPreproductionReview(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipPreproductionOpenV1.extend({threadId:z.string().min(1).max(128)}),raw);
    const {AgentThreadsService:Threads}=require('../../../../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service') as {AgentThreadsService:typeof AgentThreadsService};
    if(!await this.clipModuleRef.get(Threads,{strict:false}).ownThread({organizationId:org.id,userId:user.id},input.threadId))throw new BadRequestException({code:'CLIP_OWNED_CHAT_REQUIRED'});
    return result(()=>this.clips.resumeReview(org.id,user.id,input.threadId,input.pilotId));
  }
  private async ownedClipThread(org:Organization,user:User,threadId:string){
    const {AgentThreadsService:Threads}=require('../../../../../libraries/nestjs-libraries/src/chat/conductor/agent-threads.service') as {AgentThreadsService:typeof AgentThreadsService};
    if(!await this.clipModuleRef.get(Threads,{strict:false}).ownThread({organizationId:org.id,userId:user.id},threadId))throw new BadRequestException({code:'CLIP_OWNED_CHAT_REQUIRED'});
  }
  private async clipAuthorRequest(org:Organization,user:User,threadId:string,requestMessageId:string){
    await this.ownedClipThread(org,user,threadId);
    const identity={organizationId:org.id,userId:user.id} as Parameters<AgentThreadsService['readMessages']>[0];
    const context={[MASTRA_THREAD_ID_KEY]:threadId,[MASTRA_RESOURCE_ID_KEY]:`${org.id}:${user.id}`};
    const original=await authorRequestResolver(identity,context,token=>this.clipModuleRef.get(token,{strict:false}))?.({requestMessageId});
    if(!original)throw new BadRequestException({code:'CLIP_ORIGINAL_REQUEST_REQUIRED'});return original;
  }
  @Post('/clip-preproduction/production/prepare')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async prepareClipPilot(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionPrepareV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.prepare(org.id,user.id,input.threadId,request,{pilotId:input.pilotId}));
  }
  @Patch('/clip-preproduction/production/mode-v2')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  async setClipExecutionModeV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipExecutionModeInputV2.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    return result(()=>this.clipProduction.setExecutionModeV2(org.id,user.id,input.threadId,{pilotId:input.pilotId,mode:input.mode}));
  }
  @Post('/clip-preproduction/production/references/launch-v2')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async launchReviewedClipV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipReferenceLaunchV2.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    return result(()=>this.clipProduction.launchReviewedClipV2(org.id,user.id,input.threadId,{pilotId:input.pilotId,referenceDigest:input.referenceDigest}));
  }
  @Post('/clip-preproduction/production/prepare-delegated')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async prepareClipPilotDelegated(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionPrepareV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.prepare(org.id,user.id,input.threadId,request,{pilotId:input.pilotId},'delegated_quote_bound'));
  }
  @Post('/clip-preproduction/production/budget-question')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async clipPilotBudgetQuestion(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipPreproductionOpenV1.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    // Human answers are applied only through the native server-held suspension,
    // never through a model numeric argument or an unbound HTTP budget body.
    return result(()=>this.clipProduction.budgetPrompt(org.id,user.id,input.threadId,input.pilotId,user.language??'ru'));
  }
  @Post('/clip-preproduction/production/launch')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async launchClipPilot(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionLaunchV1.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    return result(()=>this.clipProduction.launch(org.id,user.id,input.threadId,{pilotId:input.pilotId,preflightId:input.preflightId,approvalHash:input.approvalHash}));
  }
  @Post('/clip-preproduction/production/recover')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  async recoverClipPilot(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionRecoverV1.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    return result(()=>this.clipProduction.recover(org.id,user.id,input.threadId,input.pilotId,input.stage,input.action));
  }
  @Post('/clip-preproduction/production/vision/recover-fenced-v1')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async recoverClipVisionFencedV1(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionPrepareV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.recoverVisionFencedV1(org.id,user.id,input.threadId,request,{pilotId:input.pilotId}));
  }
  @Post('/clip-preproduction/production/last-frame-repair/prepare')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async prepareClipLastFrameRepair(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionPrepareV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.prepareLastFrameRepair(org.id,user.id,input.threadId,request,{pilotId:input.pilotId}));
  }
  @Post('/clip-preproduction/production/renew-credentials')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async renewClipPilotCredentialsV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipProductionPrepareV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.renewCredentialsV2(org.id,user.id,input.threadId,request,{pilotId:input.pilotId}));
  }
  @Post('/clip-preproduction/production/last-frame-repair/refresh-quote')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async refreshClipLastFrameRepairQuote(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipLastFrameRepairRefreshV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.refreshLastFrameRepairQuote(org.id,user.id,input.threadId,request,{pilotId:input.pilotId,repairId:input.repairId}));
  }
  @Post('/clip-preproduction/production/last-frame-repair/launch')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  async launchClipLastFrameRepair(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipLastFrameRepairLaunchV1.extend({threadId:z.string().min(1).max(128)}),raw);await this.ownedClipThread(org,user,input.threadId);
    return result(()=>this.clipProduction.launchLastFrameRepair(org.id,user.id,input.threadId,{pilotId:input.pilotId,repairId:input.repairId,preflightId:input.preflightId,approvalHash:input.approvalHash}));
  }
  @Post('/clip-preproduction/production/stop')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  async stopClipPilot(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    const input=parseSocialFactory(clipPreproductionOpenV1.extend({threadId:z.string().min(1).max(128),requestMessageId:z.string().min(1).max(128)}),raw);
    const request=await this.clipAuthorRequest(org,user,input.threadId,input.requestMessageId);
    return result(()=>this.clipProduction.stop(org.id,user.id,input.threadId,input.pilotId,request.messageId));
  }
  @Post('/source-artifacts/resolve')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  resolveSourceArtifact(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.sourceArtifacts.resolve(org.id,user.id,parseSourceArtifactSelectionV1(parseSocialFactory(sourceArtifactResolveInputSchemaV1,raw))));}
  @Post('/source-artifacts/edit-draft')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  editDraftSourceArtifact(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.sourceArtifacts.editDraft(org.id,user.id,parseSocialFactory(sourceDraftEditInputSchemaV1,raw)));}
  @Post('/draft-destinations')
  @CheckPolicies([AuthorizationActions.Create,Sections.EDITOR])
  createDraftDestination(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.draftDestinations.create(org.id,user.id,parseSocialFactory(draftDestinationInputSchemaV1,raw)));}
  @Post('/production/local-reel')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  renderLocalReel(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.production.renderLocal(org.id,user.id,parseSocialFactory(localReelInputSchemaV1,raw) as Parameters<SocialFactoryProductionService['renderLocal']>[2]));}
  @Post('/production/local-composition-v2')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  composeLocalVideoV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.production.composeLocalVideoV2(org.id,user.id,parseSocialFactory(localCompositionStartSchemaV2,raw) as Parameters<SocialFactoryProductionService['composeLocalVideoV2']>[2]));}
  @Post('/production/local-composition-v2/open')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  localVideoCompositionV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){const input=parseSocialFactory(localCompositionScopeSchemaV2,raw);return result(()=>this.production.localVideoCompositionV2(org.id,user.id,input.operationId,input.compositionId));}
  @Post('/production/local-composition-v2/stop')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  stopLocalVideoCompositionV2(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){const input=parseSocialFactory(localCompositionScopeSchemaV2,raw);return result(()=>this.production.stopLocalVideoCompositionV2(org.id,user.id,input.operationId,input.compositionId));}
  @Get('/campaigns')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  list(@GetOrgFromRequest()org:Organization){return result(()=>this.factory.campaigns.list(org.id));}
  @Post('/campaigns')
  @CheckPolicies([AuthorizationActions.Create,Sections.EDITOR])
  create(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){
    return result(()=>this.factory.create(org.id,{...parseSocialFactory(campaignCreateSchema,raw),actorId:user.id} as CreateCampaignInput));
  }
  @Get('/campaigns/:id')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  detail(@GetOrgFromRequest()org:Organization,@Param('id')id:string,@GetUserFromRequest()user?:User){return result(()=>this.factory.detail(org.id,id,user?.id));}
  @Post('/campaigns/:id/stop')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  stop(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string){return result(async()=>{
    const campaign=await this.factory.campaigns.stop(org.id,id,user.id);
    return {campaign,...await this.publishing.cancelPending(org.id,id)};
  });}
  @Patch('/campaigns/:id/mode')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  mode(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.factory.campaigns.setMode(org.id,id,{...parseSocialFactory(modeSchema,raw),actorId:user.id} as Parameters<SocialFactoryService['campaigns']['setMode']>[2]));}
  @Post('/campaigns/:id/retry')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  retry(@GetOrgFromRequest()org:Organization,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.factory.campaigns.retry(org.id,id,parseSocialFactory(retrySchema,raw).itemIds));}
  @Post('/campaigns/:id/items/:itemId/approve')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  approve(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Param('itemId')itemId:string,@Body()raw:unknown){return result(()=>this.factory.campaigns.approve(org.id,id,itemId,{...parseSocialFactory(approvalSchema,raw),actorId:user.id} as Parameters<SocialFactoryService['campaigns']['approve']>[3]));}
  @Post('/campaigns/:id/items/:itemId/deliver')
  @CheckPolicies([AuthorizationActions.Create,Sections.POSTS_PER_MONTH],[AuthorizationActions.Update,Sections.EDITOR])
  deliver(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Param('itemId')itemId:string,@Body()raw:unknown){return result(()=>this.publishing.deliver(org.id,{...parseSocialFactory(deliverySchema,raw),campaignId:id,itemId,actorId:user.id,authority:'user'} as DeliverInput,user.language==='ru'?'ru':'en'));}
  @Post('/campaigns/:id/items/:itemId/reconcile')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  reconcile(@GetOrgFromRequest()org:Organization,@Param('id')id:string,@Param('itemId')itemId:string){return result(()=>this.publishing.reconcile(org.id,id,itemId));}
  @Post('/grants')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  grant(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.factory.grant(org.id,{...parseSocialFactory(grantSchema,raw),actorId:user.id,authority:'user'} as GrantInput));}
  @Post('/grants/:id/revoke')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  revoke(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string){return result(async()=>{
    const grant=await this.factory.autonomy.revoke(org.id,id,user.id);
    const campaigns=await this.factory.campaigns.list(org.id);
    const stopped=await Promise.all(campaigns.filter(c=>c.grantId===id).map(c=>this.publishing.cancelPending(org.id,c.id)));
    return {grant,stopped};
  });}
  @Get('/channels/:channelId/capability')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  capability(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string){return result(()=>this.publishing.capability(org.id,id));}
  @Post('/channels/:channelId/source-recommendation/dismiss')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  dismissSource(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string){return result(()=>this.factory.sourceRecommendation(org.id,id,true));}
  @Get('/channels/:channelId/profile')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  profile(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string){return result(()=>this.profiles.resolve(org.id,id));}
  @Post('/channels/:channelId/profile')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  saveProfile(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string,@Body()raw:unknown){return result(async()=>{
    const input=parseSocialFactory(schema.object({expectedRevision:schema.number().int().nonnegative(),profile:schema.object({channelId:schema.literal(id)}).passthrough()}).strict(),raw);
    return this.profiles.save(org.id,input.profile,input.expectedRevision);
  });}
  @Post('/channels/:channelId/discover')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Read,Sections.EDITOR])
  discover(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string,@Body()raw:unknown){return result(()=>this.planning.discover(org.id,id,parseSocialFactory(schema.object({sourceIds:schema.array(schema.string().min(1).max(200)).max(20).optional(),allowWebSearch:schema.boolean().optional()}).strict(),raw)));}
  @Post('/campaigns/:id/decide')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  decide(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>{
    const input=parseSocialFactory(schema.object({itemId:schema.string().min(1).max(200).optional(),grantId:schema.string().min(1).max(200).optional(),requestId:schema.string().min(1).max(200),question:schema.string().min(1).max(5000)}).strict(),raw);
    return this.decisions.answer(org.id,user.id,{...input,campaignId:id} as Parameters<EditorialDecisionService['answer']>[2]);
  });}
  @Post('/items/:itemId/measure')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  measure(@GetOrgFromRequest()org:Organization,@Param('itemId')id:string,@Body()raw:unknown){return result(()=>this.measurement.capture(org.id,id,parseSocialFactory(schema.object({requestId:schema.string().min(1).max(200)}).strict(),raw).requestId));}
  @Get('/items/:itemId/observations')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  observations(@GetOrgFromRequest()org:Organization,@Param('itemId')id:string){return result(()=>this.measurement.listForItem(org.id,id));}
  @Get('/channels/:channelId/findings')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  findings(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string){return result(async()=>{await this.factory.assertChannel(org.id,id);return this.learning.forPlanning(org.id,id);});}
  @Post('/findings/:findingId/review')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  reviewFinding(@GetOrgFromRequest()org:Organization,@Param('findingId')id:string,@Body()raw:unknown){return result(()=>{
    const input=parseSocialFactory(schema.object({expectedRevision:schema.number().int().min(1),action:schema.enum(['accept','withdraw'])}).strict(),raw);
    return this.learning.review(org.id,id,input.expectedRevision,input.action);
  });}
  @Post('/experiments')
  @CheckPolicies([AuthorizationActions.Create,Sections.EDITOR])
  experiment(@GetOrgFromRequest()org:Organization,@Body()raw:unknown){return result(async()=>{
    const input=parseSocialFactory(campaignExperimentSchema,raw);
    await this.factory.assertChannel(org.id,input.channelId);
    return this.learning.proposeExperiment(org.id,input as Parameters<SocialFactoryLearningService['proposeExperiment']>[1]);
  });}
  @Post('/experiments/:id/evaluate')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  evaluate(@GetOrgFromRequest()org:Organization,@Param('id')id:string){return result(()=>this.learning.evaluate(org.id,id));}

  @Post('/campaigns/:id/items/:itemId/edit')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  edit(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Param('itemId')itemId:string,@Body()raw:unknown){return result(async()=>{
    return this.edits.edit(org.id,user.id,{...parseSocialFactory(campaignTextEditSchema.omit({campaignId:true,itemId:true}),raw),campaignId:id,itemId} as CampaignTextEdit,user.language==='ru'?'ru':'en');
  });}


  @Post('/campaigns/:id/plan')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  plan(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.production.plan(org.id,user.id,{...parseSocialFactory(campaignPreparationSchema.omit({campaignId:true}),raw),campaignId:id} as CampaignPrepareInput));}
  @Post('/campaigns/:id/prepare')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  prepare(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.production.prepare(org.id,user.id,{...parseSocialFactory(campaignPreparationSchema.omit({campaignId:true}),raw),campaignId:id} as CampaignPrepareInput));}
  @Post('/campaigns/:id/items/:itemId/video')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  bindVideo(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Param('itemId')itemId:string,@Body()raw:unknown){return result(()=>this.production.bindVideo(org.id,user.id,id,itemId,parseSocialFactory(campaignVideoBindInputSchema,raw) as Parameters<SocialFactoryProductionService['bindVideo']>[4]));}
  @Post('/production/:operationId/finalize-video')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  finalizeVideo(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('operationId')id:string){return result(()=>this.production.finalizeVideo(org.id,user.id,id));}
  @Post('/videos')
  @CheckPolicies([AuthorizationActions.Create,Sections.EDITOR])
  createVideo(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(()=>this.videos.createRevision(org.id,user.id,parseSocialFactory(videoRevisionInputSchema,raw)));}
  @Get('/videos')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  listVideos(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User){return result(()=>this.videos.list(org.id,undefined,user.id));}
  @Get('/videos/:id')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  video(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string){return result(()=>this.videos.get(org.id,id,user.id));}
  @Post('/videos/:id/preflight')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  videoPreflight(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.videos.preflight(org.id,user.id,id,parseSocialFactory(videoPreflightInputSchema,raw)));}
  @Post('/videos/:id/launch')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  videoLaunch(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.videos.approveAndLaunch(org.id,user.id,id,parseSocialFactory(videoLaunchSchema,raw) as Parameters<VideoProductionService['approveAndLaunch']>[3]));}
  @Post('/videos/:id/stop')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  stopVideo(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string){return result(()=>this.videos.stop(org.id,user.id,id));}
  @Post('/videos/:id/retry-save')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  retryVideoSave(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.videos.retrySave(org.id,user.id,id,parseSocialFactory(schema.object({jobId:schema.string().min(1).max(200)}).strict(),raw).jobId));}
  @Get('/analytics/optional')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  analyticsCapabilities(){return this.optionalAnalytics.capabilities();}
  @Post('/analytics/optional')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  optionalEvidence(@GetOrgFromRequest()org:Organization,@Body()raw:unknown){return result(async()=>{const input=parseSocialFactory(optionalAnalyticsSchema,raw);await this.factory.assertChannel(org.id,input.channelId);return this.optionalAnalytics.evidence(org.id,input.channelId,input.sourceIds,input.connectorId);});}
  @Post('/attribution/links')
  @CheckPolicies([AuthorizationActions.Create,Sections.EDITOR])
  attributionLink(@GetOrgFromRequest()org:Organization,@Body()raw:unknown){return result(()=>this.attribution.createLink(org.id,parseSocialFactory(attributionLinkSchema,raw) as Parameters<SocialFactoryAttributionService['createLink']>[1]));}
  @Get('/attribution/links/:id/clicks')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  attributionClicks(@GetOrgFromRequest()org:Organization,@Param('id')id:string){return result(()=>this.attribution.clicks(org.id,id));}
  @Post('/attribution/links/:id/lead')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  claimLead(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.attribution.claimLead(org.id,id,user.id,parseSocialFactory(schema.object({leadId:schema.string().min(1).max(240),evidenceRef:schema.string().min(1).max(500),note:schema.string().max(2000).optional()}).strict(),raw) as Parameters<SocialFactoryAttributionService['claimLead']>[3]));}
  @Post('/helixa/exchange')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  helixa(@GetOrgFromRequest()org:Organization,@Body()raw:unknown){return result(async()=>{const {expectedOrganizationId:_,...input}=parseSocialFactory(helixaRequestSchema,typeof raw==='object'&&raw?{...raw,expectedOrganizationId:'resolved-by-server'}:raw);if(input.operation==='knowledge.propose')throw new BadRequestException({code:'HELIXA_FINDING_FEEDBACK_ROUTE_REQUIRED'});return this.exchange.exchange(org.id,input as Parameters<SocialFactoryHelixaExchangeService['exchange']>[1]);});}
  @Get('/helixa/findings/:id/feedback')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  findingFeedback(@GetOrgFromRequest()org:Organization,@Param('id')id:string){return result(()=>this.exchange.prepareFindingFeedback(org.id,id));}
  @Post('/channels/:channelId/youtube-amendment')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  youtubeAmendment(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('channelId')id:string,@Body()raw:unknown){return result(()=>this.measurement.recordYouTubeAmendment(org.id,id,user.id,parseSocialFactory(schema.object({acceptanceReference:schema.string().trim().min(1).max(1000),acceptedAt:schema.string().datetime({offset:true}),expiresAt:schema.string().datetime({offset:true}),expectedRevision:schema.number().int().nonnegative()}).strict(),raw) as Parameters<SocialFactoryMeasurementService['recordYouTubeAmendment']>[3]));}
  @Post('/channels/:channelId/youtube-amendment/revoke')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  revokeYoutubeAmendment(@GetOrgFromRequest()org:Organization,@Param('channelId')id:string,@Body()raw:unknown){return result(()=>this.measurement.revokeYouTubeAmendment(org.id,id,parseSocialFactory(schema.object({expectedRevision:schema.number().int().positive()}).strict(),raw).expectedRevision));}

  @Post('/source-permissions')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  sourcePermission(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Body()raw:unknown){return result(async()=>{const input=parseSocialFactory(sourcePermissionSchema,raw);for(const channelId of input.channelIds)await this.factory.assertChannel(org.id,channelId);return this.permissions.save(org.id,user.id,input as Parameters<SocialFactorySourcePermissionService['save']>[2]);});}
  @Post('/source-permissions/:id/revoke')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  revokeSourcePermission(@GetOrgFromRequest()org:Organization,@Param('id')id:string,@Body()raw:unknown){return result(()=>this.permissions.revoke(org.id,id,parseSocialFactory(schema.object({expectedRevision:schema.number().int().positive()}).strict(),raw).expectedRevision));}
  @Post('/helixa/findings/:id/propose')
  @CheckPolicies([AuthorizationActions.Update,Sections.ADMIN])
  proposeFinding(@GetOrgFromRequest()org:Organization,@Param('id')id:string,@Body()raw:unknown){return result(async()=>{const input=parseSocialFactory(findingProposalSchema.omit({findingId:true}),raw);return this.exchange.proposeRegisteredFinding(org.id,id,input as Parameters<SocialFactoryHelixaExchangeService['proposeRegisteredFinding']>[2]);});}
  @Post('/helixa/read')
  @CheckPolicies([AuthorizationActions.Read,Sections.EDITOR])
  readHelixa(@GetOrgFromRequest()org:Organization,@Body()raw:unknown){return result(()=>{
    const input=parseSocialFactory(helixaReadRequestSchema,raw);
    if(input.attributionLinkId)return this.exchange.readAttributedOutcomes(org.id,input.attributionLinkId,{projectId:input.projectId!,recordIds:input.resourceIds});
    return this.exchange.exchange(org.id,{operation:input.operation,projectId:input.projectId,...(input.operation==='knowledge.read'?{claimIds:input.resourceIds}:{recordIds:input.resourceIds}),protocol:HELIXA_EXCHANGE_PROTOCOL} as Parameters<SocialFactoryHelixaExchangeService['exchange']>[1]);
  });}
  @Post('/production/:operationId/reinspect')
  @CheckPolicies([AuthorizationActions.Update,Sections.EDITOR])
  reinspect(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('operationId')id:string,@Body()raw:unknown){return result(()=>this.production.reinspect(org.id,user.id,id,parseSocialFactory(productionReinspectSchema.omit({operationId:true}),raw) as Parameters<SocialFactoryProductionService['reinspect']>[3]));}
  @Post('/campaigns/:id/items/:itemId/revise')
  @CheckPolicies([AuthorizationActions.Create,Sections.AI],[AuthorizationActions.Update,Sections.EDITOR])
  revise(@GetOrgFromRequest()org:Organization,@GetUserFromRequest()user:User,@Param('id')id:string,@Param('itemId')itemId:string,@Body()raw:unknown){return result(()=>this.production.revise(org.id,user.id,id,itemId,parseSocialFactory(campaignReviseSchema.omit({campaignId:true,itemId:true}),raw) as Parameters<SocialFactoryProductionService['revise']>[4]));}
}
