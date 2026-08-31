import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { VoiceRetentionScheduler } from '@contentfactory/backend/services/content-intelligence/voice-retention.scheduler';

/**
 * Its own module for the same reason the newsletter retry has one: a schedule
 * is a side effect that must be switched on deliberately, and a provider that
 * quietly starts a timer wherever it is imported is hard to reason about when
 * something runs at three in the morning.
 */
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [VoiceRetentionScheduler],
  exports: [VoiceRetentionScheduler],
})
export class VoiceRetentionModule {}
