import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthService } from '@contentfactory/backend/services/auth/auth.service';
import { StripeService } from '@contentfactory/nestjs-libraries/services/stripe.service';
import { PoliciesGuard } from '@contentfactory/backend/services/auth/permissions/permissions.guard';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { UploadModule } from '@contentfactory/nestjs-libraries/upload/upload.module';
import { OpenaiService } from '@contentfactory/nestjs-libraries/openai/openai.service';
import { ExtractContentService } from '@contentfactory/nestjs-libraries/openai/extract.content.service';
import { CodesService } from '@contentfactory/nestjs-libraries/services/codes.service';
import { PublicIntegrationsController } from '@contentfactory/backend/public-api/routes/v1/public.integrations.controller';
import { PublicAuthMiddleware } from '@contentfactory/backend/services/auth/public.auth.middleware';

const authenticatedController = [PublicIntegrationsController];
@Module({
  imports: [UploadModule],
  controllers: [...authenticatedController],
  providers: [
    AuthService,
    StripeService,
    OpenaiService,
    ExtractContentService,
    PoliciesGuard,
    PermissionsService,
    CodesService,
    IntegrationManager,
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class PublicApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PublicAuthMiddleware).forRoutes(...authenticatedController);
  }
}

