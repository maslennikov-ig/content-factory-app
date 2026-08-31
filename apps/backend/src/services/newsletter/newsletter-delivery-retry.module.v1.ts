import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NewsletterDeliveryRetryServiceV1 } from '@contentfactory/backend/services/newsletter/newsletter-delivery-retry.service.v1';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [NewsletterDeliveryRetryServiceV1],
  exports: [NewsletterDeliveryRetryServiceV1],
})
export class NewsletterDeliveryRetryModuleV1 {}
