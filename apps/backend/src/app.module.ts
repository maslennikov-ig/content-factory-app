import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@contentfactory/nestjs-libraries/database/prisma/database.module';
import { ApiModule } from '@contentfactory/backend/api/api.module';
import { APP_GUARD } from '@nestjs/core';
import { PoliciesGuard } from '@contentfactory/backend/services/auth/permissions/permissions.guard';
import { PublicApiModule } from '@contentfactory/backend/public-api/public.api.module';
import { ThrottlerBehindProxyGuard } from '@contentfactory/nestjs-libraries/throttler/throttler.provider';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgentModule } from '@contentfactory/nestjs-libraries/agent/agent.module';
import { ThirdPartyModule } from '@contentfactory/nestjs-libraries/3rdparties/thirdparty.module';
import { VideoModule } from '@contentfactory/nestjs-libraries/videos/video.module';
import { ChatModule } from '@contentfactory/nestjs-libraries/chat/chat.module';
import { getTemporalModule } from '@contentfactory/nestjs-libraries/temporal/temporal.module';
import { TemporalRegisterMissingSearchAttributesModule } from '@contentfactory/nestjs-libraries/temporal/temporal.register';
import { InfiniteWorkflowRegisterModule } from '@contentfactory/nestjs-libraries/temporal/infinite.workflow.register';
import { AnalyticsScheduleRegisterModuleV1 } from '@contentfactory/nestjs-libraries/temporal/analytics.schedule.register.v1';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { NewsletterDeliveryRetryModuleV1 } from '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.module.v1';
import { VoiceRetentionModule } from '@contentfactory/backend/services/content-intelligence/voice-retention.module';

@Global()
@Module({
  imports: [
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThirdPartyModule,
    VideoModule,
    ChatModule,
    getTemporalModule(false),
    NewsletterDeliveryRetryModuleV1,
    VoiceRetentionModule,
    TemporalRegisterMissingSearchAttributesModule,
    InfiniteWorkflowRegisterModule,
    AnalyticsScheduleRegisterModuleV1,
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 3600000,
          limit: process.env.API_LIMIT ? Number(process.env.API_LIMIT) : 90,
        },
      ],
      storage: new ThrottlerStorageRedisService(ioRedis),
    }),
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PoliciesGuard,
    },
  ],
  exports: [
    DatabaseModule,
    ApiModule,
    PublicApiModule,
    AgentModule,
    ThrottlerModule,
    ChatModule,
  ],
})
export class AppModule {}
