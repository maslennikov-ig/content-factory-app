import { HggPilotServiceV1 } from './subscriptions/video-hgg-pilot.service.v1';
import { HggPilotWorkspaceServiceV1 } from './subscriptions/video-hgg-workspace.service.v1';
import { HggPilotJobServiceV1 } from './subscriptions/video-hgg-pilot-job.service.v1';
import { HggPilotExecutionV1 } from './subscriptions/video-hgg-pilot-execution.v1';
import { HGG_PILOT_SERVICE_V1 } from './subscriptions/video-hgg-pilot-stage.v1';
import { HiggsfieldPilotProviderV1 } from './providers/higgsfield-pilot.provider.v1';
import { HggPilotMediaV1 } from './hgg-pilot-media.v1';
import { VideoCompositionProviderV1 } from './video-composition.provider.v1';
import { HeygenStudioCompositionProviderV1 } from './providers/composition/heygen-studio.provider.v1';
import { HyperframesCompositionProviderV1 } from './providers/composition/hyperframes.provider.v1';
import { VideoProductionRepository } from '../database/prisma/video-production/video-production.repository';
import { VideoProductionService } from './production/video-production.service';
import { VideoProductionPersonalServiceV2 } from './production/video-production.personal.service.v2';
import { VideoProductionExecutionV1,VideoProductionRecoveryV1 } from './production/video-production-execution.v1';
import { VIDEO_PRODUCTION_EXECUTION_V1 } from './production/video-production-execution.port.v1';
import { Global, Module } from '@nestjs/common';
import { ImagesSlides } from '@contentfactory/nestjs-libraries/videos/images-slides/images.slides';
import { VideoManager } from '@contentfactory/nestjs-libraries/videos/video.manager';
import { Veo3 } from '@contentfactory/nestjs-libraries/videos/veo3/veo3';
import { VideoJobService } from './video-job.service';
import { VideoGenerationRepository } from '../database/prisma/video-generation/video-generation.repository';
import { VideoCredentialsService } from './video-credentials.service';
import { VideoMediaV1 } from './video-media.v1';
import { HiggsfieldProviderV1 } from './providers/higgsfield.provider';
import { HeygenProviderV1 } from './providers/heygen.provider';
import { VideoExecutionRecoveryV1, VideoExecutionV1 } from './video-execution.v1';
import { VIDEO_EXECUTION_V1 } from './video-execution.port.v1';

import { VideoSubscriptionRepository } from '../database/prisma/video-subscription/video-subscription.repository';
import { VideoSubscriptionRuntime } from './subscriptions/video-provider-registry';
import { VideoConnectionService } from './subscriptions/video-connection.service';
import { VideoOAuthClient } from './subscriptions/video-oauth-client';
import { VideoMcpClient } from './subscriptions/video-mcp-client';
import { VideoSubscriptionJobService, VIDEO_SUBSCRIPTION_EXECUTION } from './subscriptions/video-subscription-job.service';
import { VideoSubscriptionExecution, VideoSubscriptionRecovery } from './subscriptions/video-subscription-execution';
import { HiggsfieldSubscriptionProvider } from './providers/higgsfield-subscription.provider';
import { HeygenSubscriptionProvider } from './providers/heygen-subscription.provider';
import { VideoAccessService } from './video-access.service';
import { HggPilotParentPortV1 } from './subscriptions/video-hgg-pilot-parent.port.v1';

@Global()
@Module({
  providers: [HggPilotServiceV1,HggPilotWorkspaceServiceV1,HggPilotJobServiceV1,HggPilotExecutionV1,HiggsfieldPilotProviderV1,HggPilotMediaV1,{provide:HGG_PILOT_SERVICE_V1,useExisting:HggPilotServiceV1},HggPilotParentPortV1,VideoCompositionProviderV1,HeygenStudioCompositionProviderV1,HyperframesCompositionProviderV1,VideoProductionRepository,VideoProductionService,VideoProductionPersonalServiceV2,VideoProductionExecutionV1,VideoProductionRecoveryV1,{provide:VIDEO_PRODUCTION_EXECUTION_V1,useExisting:VideoProductionExecutionV1},VideoSubscriptionRepository, VideoSubscriptionRuntime, VideoConnectionService, VideoOAuthClient, VideoMcpClient, VideoSubscriptionJobService, VideoSubscriptionExecution, VideoSubscriptionRecovery, HiggsfieldSubscriptionProvider, HeygenSubscriptionProvider, VideoAccessService, {provide: VIDEO_SUBSCRIPTION_EXECUTION, useExisting: VideoSubscriptionExecution}, ImagesSlides, Veo3, VideoManager, VideoJobService, VideoGenerationRepository,
    VideoCredentialsService, VideoMediaV1, HiggsfieldProviderV1, HeygenProviderV1,
    VideoExecutionV1, VideoExecutionRecoveryV1, {provide: VIDEO_EXECUTION_V1, useExisting: VideoExecutionV1}],
  get exports() {
    return this.providers;
  },
})
export class VideoModule {}
