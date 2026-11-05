import { NativeClipProductionServiceV1 } from './native-clip-production.service.v1';
import { NativeClipVisionReviewServiceV1 } from './native-clip-vision-review.service.v1';
import { NATIVE_CLIP_PRODUCTION_PORT_V1 } from './contracts/native-clip-production.v1';
import { NativeClipPreproductionServiceV1 } from './native-clip-preproduction.service.v1';
import { CampaignLocalReelServiceV1 } from './editorial/local-reel.service';
import { SourceArtifactRepositoryV1 } from './source-artifact.repository';
import { SourceArtifactServiceV1 } from './source-artifact.service';
import { DraftDestinationServiceV1 } from './draft-destination.v1';
import { SocialFactoryMaterialEditService } from './material-edit.service';
import { ShortLinkService } from '../../short-linking/short.link.service';
import { SocialFactoryAttributionService } from './attribution/attribution.service';
import { SocialFactoryHelixaExchangeService } from './attribution/helixa-exchange.service';
import { SocialFactoryOptionalAnalyticsService, SOCIAL_FACTORY_OPTIONAL_ANALYTICS, SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY } from './measurement/optional-analytics/optional-analytics.service';
import { LicensedAnalyticsExportAdapter } from './measurement/optional-analytics/licensed-export';
import { SocialFactoryProductionService } from './production.service';
import { VideoModule } from '../../videos/video.module';
import { EditorialSourceAuthorityV1 } from './editorial/source-authority.v1';
import { SocialEditorialProductionV1 } from './editorial/social-editorial-production.v1';
import { AiUsageService } from '../../openai/ai.usage.service';
import { MediaService } from '../../database/prisma/media/media.service';
import { SocialFactorySourceLifecycleService } from './source-lifecycle.service';
import { SOCIAL_FACTORY_SOURCE_LIFECYCLE } from './source-lifecycle.port';
import { SocialFactoryPlanningService } from './planning.service';
import { NativeEditorialMaterialService } from './editorial/native-material.service';
import { SocialFactorySourcePermissionService } from './source-permission.service';
import { ChannelProfileServiceV1 } from './profiles/channel-profile.v1';
import { IntegrationRepository } from '../../database/prisma/integrations/integration.repository';
import { BrandProfileRepository } from '../brand-profile/brand-profile.repository';
import { EditorialAssetsV1 } from './editorial/assets/editorial-assets.v1';
import { SocialDiscoveryService } from './discovery/social-discovery.service';
import { RegistryDiscoveryReader, TopicDiscoveryReader } from './discovery/discovery.adapters';
import { RedisDiscoveryCache } from './discovery/redis-discovery-cache';
import { PersistentSourceRecommendation } from './discovery/source-recommendation';
import { ContentSourceRegistryRepository } from '../source-registry/source-registry.repository';
import { LeadTopicGateway } from '../leads/lead-topic.gateway';
import { ioRedis } from '../../redis/redis.service';
import { SocialFactoryMeasurementService } from './measurement/measurement.service';
import { SocialFactoryLearningService } from './learning/learning.service';
import { EditorialDecisionService } from './autonomy/editorial-decision.service';
import { Global, Module } from '@nestjs/common';
import {CampaignLocalCompositionServiceV2} from './editorial/local-composition.service.v2';
import {CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2} from './local-composition.operation.v2';
import {LocalCompositionExecutionV2,LocalCompositionRecoveryV2} from './local-composition-execution.v2';
import {LOCAL_COMPOSITION_EXECUTION_V2} from '../../videos/production/local-composition-execution.port.v2';
import { AgentModule } from '../../agent/agent.module';
import { SocialFactoryRepository } from './social-factory.repository';
import { CampaignService } from './campaign/campaign.service';
import { AutonomyService } from './autonomy/autonomy.service';
import { SocialFactoryPublishingService } from './publishing/publishing.service';
import { SOCIAL_FACTORY_PUBLICATION_GUARD } from './publishing/publication-guard';
import { SocialFactoryService } from './social-factory.service';

@Global()
@Module({
  imports:[AgentModule,VideoModule],
  providers:[CampaignLocalCompositionServiceV2,{provide:CAMPAIGN_LOCAL_COMPOSITION_SERVICE_V2,useExisting:CampaignLocalCompositionServiceV2},LocalCompositionExecutionV2,LocalCompositionRecoveryV2,{provide:LOCAL_COMPOSITION_EXECUTION_V2,useExisting:LocalCompositionExecutionV2},NativeClipPreproductionServiceV1,NativeClipProductionServiceV1,NativeClipVisionReviewServiceV1,{provide:NATIVE_CLIP_PRODUCTION_PORT_V1,useExisting:NativeClipProductionServiceV1},CampaignLocalReelServiceV1,SourceArtifactRepositoryV1,SourceArtifactServiceV1,DraftDestinationServiceV1,SocialFactoryMaterialEditService,
    ShortLinkService,SocialFactoryAttributionService,SocialFactoryHelixaExchangeService,SocialFactoryOptionalAnalyticsService,
    {provide:SOCIAL_FACTORY_OPTIONAL_ANALYTICS,inject:[ContentSourceRegistryRepository],useFactory:(sources:ContentSourceRegistryRepository)=>[new LicensedAnalyticsExportAdapter(sources)]},
    {provide:SOCIAL_FACTORY_OPTIONAL_ANALYTICS_AUTHORITY,inject:[EditorialSourceAuthorityV1],useFactory:(authority:EditorialSourceAuthorityV1)=>({read:async(org:string,channelId:string,sourceIds:string[])=>{const result=await authority.read(org,channelId,sourceIds,'licensed_registry_export_v1');return {...result,documents:result.documents.flatMap(document=>document.evidence.map(evidence=>({...document,evidence})))}}})},
    SocialFactoryProductionService,    {provide:EditorialSourceAuthorityV1,inject:[SocialFactoryRepository,ContentSourceRegistryRepository],useFactory:(store:SocialFactoryRepository,registry:ContentSourceRegistryRepository)=>new EditorialSourceAuthorityV1(store,registry)},
    {provide:SocialEditorialProductionV1,inject:[AiUsageService,EditorialAssetsV1,MediaService,EditorialSourceAuthorityV1,SourceArtifactServiceV1],useFactory:(usage:AiUsageService,assets:EditorialAssetsV1,media:MediaService,authority:EditorialSourceAuthorityV1,sourceArtifacts:SourceArtifactServiceV1)=>new SocialEditorialProductionV1(usage,assets,media,authority,undefined,sourceArtifacts)},
    SocialFactorySourceLifecycleService,SocialFactoryPlanningService,NativeEditorialMaterialService,    SocialFactorySourcePermissionService,EditorialAssetsV1,SocialFactoryMeasurementService,SocialFactoryLearningService,
    {provide:ChannelProfileServiceV1,inject:[SocialFactoryRepository,IntegrationRepository,BrandProfileRepository],useFactory:(store:SocialFactoryRepository,integrations:IntegrationRepository,brands:BrandProfileRepository)=>new ChannelProfileServiceV1({store,integrations,brands})},
    {provide:SocialDiscoveryService,inject:[ContentSourceRegistryRepository,LeadTopicGateway,SocialFactoryRepository,SocialFactorySourcePermissionService],useFactory:(sources:ContentSourceRegistryRepository,web:LeadTopicGateway,store:SocialFactoryRepository,rights:SocialFactorySourcePermissionService)=>new SocialDiscoveryService(new RegistryDiscoveryReader(sources),new TopicDiscoveryReader(web,(org,url)=>rights.publicRights(org,url)),new RedisDiscoveryCache(ioRedis),new PersistentSourceRecommendation(store))},
    EditorialDecisionService,SocialFactoryRepository,CampaignService,AutonomyService,SocialFactoryPublishingService,SocialFactoryService,
    {provide:SOCIAL_FACTORY_PUBLICATION_GUARD,useExisting:SocialFactoryPublishingService},{provide:SOCIAL_FACTORY_SOURCE_LIFECYCLE,useExisting:SocialFactorySourceLifecycleService}],
  exports:[NativeClipPreproductionServiceV1,NativeClipProductionServiceV1,NativeClipVisionReviewServiceV1,CampaignLocalReelServiceV1,SourceArtifactRepositoryV1,SourceArtifactServiceV1,DraftDestinationServiceV1,SocialFactoryMaterialEditService,SocialFactoryAttributionService,SocialFactoryHelixaExchangeService,SocialFactoryOptionalAnalyticsService,SocialFactoryProductionService,EditorialSourceAuthorityV1,SocialEditorialProductionV1,SocialFactorySourceLifecycleService,SocialFactoryPlanningService,NativeEditorialMaterialService,SocialFactorySourcePermissionService,ChannelProfileServiceV1,EditorialAssetsV1,SocialDiscoveryService,SocialFactoryMeasurementService,SocialFactoryLearningService,EditorialDecisionService,SocialFactoryRepository,CampaignService,AutonomyService,SocialFactoryPublishingService,SocialFactoryService,SOCIAL_FACTORY_PUBLICATION_GUARD,SOCIAL_FACTORY_SOURCE_LIFECYCLE],
})
export class SocialFactoryModule{}
