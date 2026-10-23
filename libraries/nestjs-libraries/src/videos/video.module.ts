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

@Global()
@Module({
  providers: [VideoSubscriptionRepository, VideoSubscriptionRuntime, VideoConnectionService, VideoOAuthClient, VideoMcpClient, VideoSubscriptionJobService, VideoSubscriptionExecution, VideoSubscriptionRecovery, HiggsfieldSubscriptionProvider, HeygenSubscriptionProvider, VideoAccessService, {provide: VIDEO_SUBSCRIPTION_EXECUTION, useExisting: VideoSubscriptionExecution}, ImagesSlides, Veo3, VideoManager, VideoJobService, VideoGenerationRepository,
    VideoCredentialsService, VideoMediaV1, HiggsfieldProviderV1, HeygenProviderV1,
    VideoExecutionV1, VideoExecutionRecoveryV1, {provide: VIDEO_EXECUTION_V1, useExisting: VideoExecutionV1}],
  get exports() {
    return this.providers;
  },
})
export class VideoModule {}
