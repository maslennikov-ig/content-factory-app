import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthController } from '@contentfactory/backend/api/routes/auth.controller';
import { AuthService } from '@contentfactory/backend/services/auth/auth.service';
import { UsersController } from '@contentfactory/backend/api/routes/users.controller';
import { AuthMiddleware } from '@contentfactory/backend/services/auth/auth.middleware';
import { StripeController } from '@contentfactory/backend/api/routes/stripe.controller';
import { StripeService } from '@contentfactory/nestjs-libraries/services/stripe.service';
import { AnalyticsController } from '@contentfactory/backend/api/routes/analytics.controller';
import { PoliciesGuard } from '@contentfactory/backend/services/auth/permissions/permissions.guard';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { SettingsController } from '@contentfactory/backend/api/routes/settings.controller';
import { PostsController } from '@contentfactory/backend/api/routes/posts.controller';
import { MediaController } from '@contentfactory/backend/api/routes/media.controller';
import { UploadModule } from '@contentfactory/nestjs-libraries/upload/upload.module';
import { BillingController } from '@contentfactory/backend/api/routes/billing.controller';
import { NotificationsController } from '@contentfactory/backend/api/routes/notifications.controller';
import { AiProviderService } from '@contentfactory/nestjs-libraries/openai/ai.provider.service';
import { OpenaiService } from '@contentfactory/nestjs-libraries/openai/openai.service';
import { ExtractContentService } from '@contentfactory/nestjs-libraries/openai/extract.content.service';
import { CodesService } from '@contentfactory/nestjs-libraries/services/codes.service';
import { CopilotController } from '@contentfactory/backend/api/routes/copilot.controller';
import { PublicController } from '@contentfactory/backend/api/routes/public.controller';
import { SourceController } from '@contentfactory/backend/api/routes/source.controller';
import { RootController } from '@contentfactory/backend/api/routes/root.controller';
import { ShortLinkService } from '@contentfactory/nestjs-libraries/short-linking/short.link.service';
import { WebhookController } from '@contentfactory/backend/api/routes/webhooks.controller';
import { SignatureController } from '@contentfactory/backend/api/routes/signature.controller';
import { AutopostController } from '@contentfactory/backend/api/routes/autopost.controller';
import { SetsController } from '@contentfactory/backend/api/routes/sets.controller';
import { ThirdPartyController } from '@contentfactory/backend/api/routes/third-party.controller';
import { MonitorController } from '@contentfactory/backend/api/routes/monitor.controller';
import { NoAuthIntegrationsController } from '@contentfactory/backend/api/routes/no.auth.integrations.controller';
import { PUBLIC_GROWTH_SERVICE } from '@contentfactory/backend/api/routes/public-growth.token';
import { EnterpriseController } from '@contentfactory/backend/api/routes/enterprise.controller';
import { OAuthAppController } from '@contentfactory/backend/api/routes/oauth-app.controller';
import { ApprovedAppsController } from '@contentfactory/backend/api/routes/approved-apps.controller';
import {
  OAuthController,
  OAuthAuthorizedController,
} from '@contentfactory/backend/api/routes/oauth.controller';
import { AnnouncementsController } from '@contentfactory/backend/api/routes/announcements.controller';
import { AdminController } from '@contentfactory/backend/api/routes/admin.controller';
import { AuthProviderManager } from '@contentfactory/backend/services/auth/providers/providers.manager';
import { GithubProvider } from '@contentfactory/backend/services/auth/providers/github.provider';
import { GoogleProvider } from '@contentfactory/backend/services/auth/providers/google.provider';
import { FarcasterProvider } from '@contentfactory/backend/services/auth/providers/farcaster.provider';
import { OauthProvider } from '@contentfactory/backend/services/auth/providers/oauth.provider';
import { TelegramProvider } from '@contentfactory/backend/services/auth/providers/telegram.provider';
import { ProductEventsController } from '@contentfactory/backend/api/routes/product-events.controller';
import {
  PublicGrowthEventsController,
  PublicGrowthEventsGuard,
} from '@contentfactory/backend/api/routes/public-growth-events.controller';
import { PublicGrowthRepository } from '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.repository';
import { PublicGrowthService } from '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.service';
import { BrandProfileController } from '@contentfactory/backend/api/routes/brand-profile.controller';
import { ContentSourceController } from '@contentfactory/backend/api/routes/content-source.controller';
import { OnboardingController } from '@contentfactory/backend/api/routes/onboarding.controller';
import { ContentContextController } from '@contentfactory/backend/api/routes/content-context.controller';
import { BrandVoiceController } from '@contentfactory/backend/api/routes/brand-voice.controller';
import { ContentMaterialController } from '@contentfactory/backend/api/routes/content-material.controller';
import { ContentArchiveController } from '@contentfactory/backend/api/routes/content-archive.controller';
import { ContentBriefController } from '@contentfactory/backend/api/routes/content-brief.controller';
import { ContentLeadController } from '@contentfactory/backend/api/routes/content-lead.controller';

const authenticatedController = [
  UsersController,
  AnalyticsController,
  IntegrationsController,
  SettingsController,
  PostsController,
  MediaController,
  BillingController,
  NotificationsController,
  CopilotController,
  WebhookController,
  SignatureController,
  AutopostController,
  SetsController,
  ThirdPartyController,
  OAuthAppController,
  ApprovedAppsController,
  OAuthAuthorizedController,
  AnnouncementsController,
  AdminController,
  ProductEventsController,
  BrandProfileController,
  ContentSourceController,
  OnboardingController,
  ContentContextController,
  BrandVoiceController,
  ContentMaterialController,
  ContentArchiveController,
  ContentBriefController,
  ContentLeadController,
];
@Module({
  imports: [UploadModule],
  controllers: [
    RootController,
    StripeController,
    AuthController,
    PublicController,
    PublicGrowthEventsController,
    // AGPL-3.0 section 13 owes the Corresponding Source to anyone who reaches
    // this deployment over a network, so it belongs with the controllers the
    // auth middleware below never sees.
    SourceController,
    MonitorController,
    EnterpriseController,
    NoAuthIntegrationsController,
    OAuthController,
    ...authenticatedController,
  ],
  providers: [
    AuthService,
    StripeService,
    OpenaiService,
    AiProviderService,
    ExtractContentService,
    AuthMiddleware,
    PoliciesGuard,
    PermissionsService,
    CodesService,
    IntegrationManager,
    ShortLinkService,
    AuthProviderManager,
    GithubProvider,
    GoogleProvider,
    FarcasterProvider,
    OauthProvider,
    TelegramProvider,
    PublicGrowthRepository,
    PublicGrowthService,
    PublicGrowthEventsGuard,
    { provide: PUBLIC_GROWTH_SERVICE, useExisting: PublicGrowthService },
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(...authenticatedController);
  }
}
