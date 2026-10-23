import { VideoSubscriptionActivityV1 } from './activities/video-subscription.activity.v1';
import { Module } from '@nestjs/common';
import { PostActivity } from '@contentfactory/orchestrator/activities/post.activity';
import { PostActivityV106 } from '@contentfactory/orchestrator/activities/post.activity.v106';
import { PostActivityV107 } from '@contentfactory/orchestrator/activities/post.activity.v107';
import { PostActivityV108 } from '@contentfactory/orchestrator/activities/post.activity.v108';
import { getTemporalModule } from '@contentfactory/nestjs-libraries/temporal/temporal.module';
import { DatabaseModule } from '@contentfactory/nestjs-libraries/database/prisma/database.module';
import { AutopostActivity } from '@contentfactory/orchestrator/activities/autopost.activity';
import { AutopostDraftV2Activity } from '@contentfactory/orchestrator/activities/autopost-draft-v2.activity';
import { EmailActivity } from '@contentfactory/orchestrator/activities/email.activity';
import { EmailActivityV2 } from '@contentfactory/orchestrator/activities/email.activity.v2';
import { IntegrationsActivity } from '@contentfactory/orchestrator/activities/integrations.activity';
import { HealthController } from '@contentfactory/orchestrator/health.controller';
import { WorkerReadinessService } from './worker-readiness.service';
import { AnalyticsActivityV1 } from '@contentfactory/orchestrator/activities/analytics.activity.v1';
import { NewsletterActivityV1 } from '@contentfactory/orchestrator/activities/newsletter.activity.v1';
import { ContentLeadCheckActivity } from '@contentfactory/orchestrator/activities/content-lead-check.activity';

import { VideoModule } from '@contentfactory/nestjs-libraries/videos/video.module';
import { VideoGenerationActivityV1 } from './activities/video-generation.activity.v1';

const activities = [
  VideoSubscriptionActivityV1,
  VideoGenerationActivityV1,
  PostActivity,
  PostActivityV106,
  PostActivityV107,
  PostActivityV108,
  AutopostActivity,
  AutopostDraftV2Activity,
  EmailActivity,
  EmailActivityV2,
  IntegrationsActivity,
  AnalyticsActivityV1,
  NewsletterActivityV1,
  ContentLeadCheckActivity,
];
@Module({
  imports: [
    DatabaseModule,
    VideoModule,
    getTemporalModule(true, require.resolve('./workflows'), activities),
  ],
  controllers: [HealthController],
  providers: [...activities, WorkerReadinessService],
  get exports() {
    return [...this.providers, ...this.imports];
  },
})
export class AppModule {}
