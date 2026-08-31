import { Global, Module } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaService,
  PrismaTransaction,
} from './prisma.service';
import { OrganizationRepository } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.repository';
import { OrganizationService } from '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@contentfactory/nestjs-libraries/database/prisma/users/users.service';
import { UsersRepository } from '@contentfactory/nestjs-libraries/database/prisma/users/users.repository';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { SubscriptionRepository } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationRepository } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.repository';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsRepository } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { MediaRepository } from '@contentfactory/nestjs-libraries/database/prisma/media/media.repository';
import { NotificationsRepository } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@contentfactory/nestjs-libraries/services/email.service';
import { StripeService } from '@contentfactory/nestjs-libraries/services/stripe.service';
import { ExtractContentService } from '@contentfactory/nestjs-libraries/openai/extract.content.service';
import { OpenaiService } from '@contentfactory/nestjs-libraries/openai/openai.service';
import { AgenciesService } from '@contentfactory/nestjs-libraries/database/prisma/agencies/agencies.service';
import { AgenciesRepository } from '@contentfactory/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { ShortLinkService } from '@contentfactory/nestjs-libraries/short-linking/short.link.service';
import { WebhooksRepository } from '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import { WebhooksService } from '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { SignatureRepository } from '@contentfactory/nestjs-libraries/database/prisma/signatures/signature.repository';
import { SignatureService } from '@contentfactory/nestjs-libraries/database/prisma/signatures/signature.service';
import { AutopostRepository } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { AutopostService } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.service';
import { SetsService } from '@contentfactory/nestjs-libraries/database/prisma/sets/sets.service';
import { SetsRepository } from '@contentfactory/nestjs-libraries/database/prisma/sets/sets.repository';
import { ThirdPartyRepository } from '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.repository';
import { ThirdPartyService } from '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.service';
import { VideoManager } from '@contentfactory/nestjs-libraries/videos/video.manager';
import { FalService } from '@contentfactory/nestjs-libraries/openai/fal.service';
import { RefreshIntegrationService } from '@contentfactory/nestjs-libraries/integrations/refresh.integration.service';
import { OAuthRepository } from '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.repository';
import { OAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/oauth.service';
import { AnnouncementsRepository } from '@contentfactory/nestjs-libraries/database/prisma/announcements/announcements.repository';
import { AnnouncementsService } from '@contentfactory/nestjs-libraries/database/prisma/announcements/announcements.service';
import { ErrorsRepository } from '@contentfactory/nestjs-libraries/database/prisma/errors/errors.repository';
import { ErrorsService } from '@contentfactory/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsRepository } from '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.repository';
import { AdminStatsService } from '@contentfactory/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { TelegramUpdatesService } from '@contentfactory/nestjs-libraries/integrations/telegram.updates.service';
import { AnalyticsSnapshotService } from '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service';
import { ProductEventsRepository } from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.repository';
import { ProductEventsService } from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.service';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';
import { BrandProfileService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.service';
import { ContentSourceRegistryRepository } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.repository';
import { SourceFetchGateway } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway';
import { ContentSourceRegistryService } from '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service';
import { ContentContextRepository } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.repository';
import { ContentContextBuilderV1 } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.builder';
import { ContentContextService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service';
import { ContentFactRepository } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.repository';
import { ContentFactService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service';
import { VoiceSampleRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-sample.repository';
import { VoiceProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-profile.repository';
import {
  VoiceEditRepository,
  VOICE_EDIT_PORT,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-edit.repository';
import { VoiceAssistService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-assist.service';
import {
  VoiceService,
  VOICE_ASSIST_PORT,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import { DRAFT_VOICE_JUDGE } from '@contentfactory/nestjs-libraries/agent/draft-pick';
import { ContentMaterialRepository } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.repository';
import { ContentMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service';
import { ContentBriefRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.repository';
import { ContentBriefService } from '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    PrismaService,
    PrismaRepository,
    PrismaTransaction,
    AiUsageService,
    UsersService,
    UsersRepository,
    OrganizationService,
    OrganizationRepository,
    SubscriptionService,
    SubscriptionRepository,
    NotificationService,
    NotificationsRepository,
    WebhooksRepository,
    WebhooksService,
    IntegrationService,
    IntegrationRepository,
    PostsService,
    PostsRepository,
    StripeService,
    SignatureRepository,
    AutopostRepository,
    AutopostService,
    SignatureService,
    MediaService,
    MediaRepository,
    AgenciesService,
    AgenciesRepository,
    IntegrationManager,
    RefreshIntegrationService,
    ExtractContentService,
    OpenaiService,
    FalService,
    EmailService,
    ShortLinkService,
    SetsService,
    SetsRepository,
    ThirdPartyRepository,
    ThirdPartyService,
    OAuthRepository,
    OAuthService,
    VideoManager,
    AnnouncementsRepository,
    AnnouncementsService,
    ErrorsRepository,
    ErrorsService,
    AdminStatsRepository,
    AdminStatsService,
    WebResearchService,
    TelegramUpdatesService,
    AnalyticsSnapshotService,
    ProductEventsRepository,
    ProductEventsService,
    BrandProfileRepository,
    BrandProfileContextService,
    BrandProfileService,
    ContentSourceRegistryRepository,
    SourceFetchGateway,
    ContentSourceRegistryService,
    ContentContextRepository,
    ContentContextBuilderV1,
    ContentContextService,
    ContentFactRepository,
    ContentFactService,
    VoiceSampleRepository,
    VoiceProfileRepository,
    VoiceEditRepository,
    // Сохранение поста берёт правки по имени: `posts.service.ts` знает только
    // тип, чтобы не тащить голосовой модуль в воркер публикации.
    { provide: VOICE_EDIT_PORT, useExisting: VoiceEditRepository },
    VoiceAssistService,
    // The assist port is an interface, so the token carries the class that
    // satisfies it. `voice.service.ts` names it by string and never imports a
    // model client.
    { provide: VOICE_ASSIST_PORT, useExisting: VoiceAssistService },
    VoiceService,
    // Отбор черновика судит мерка разбора. Граф знает только имя порта: тащить
    // голосовой модуль в генерацию значило бы завести вторую сборку мерки, а
    // мерка в этом эпике одна.
    { provide: DRAFT_VOICE_JUDGE, useExisting: VoiceService },
    ContentMaterialRepository,
    ContentMaterialService,
    ContentBriefRepository,
    ContentBriefService,
  ],
  get exports() {
    return this.providers;
  },
})
export class DatabaseModule {}
