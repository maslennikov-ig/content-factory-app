import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ScheduleAlreadyRunning } from '@temporalio/client';
import { TemporalService } from 'nestjs-temporal-core';

export const analyticsSnapshotScheduleIdV1 =
  'integration-analytics-snapshots-v1';

const scheduleSpec = {
  calendars: [{ hour: 0, minute: 15 }],
  timezone: 'UTC',
};

const scheduleAction = {
  type: 'startWorkflow',
  workflowType: 'integrationAnalyticsSnapshotWorkflowV1',
  taskQueue: 'main',
  args: [],
} as const;

const schedulePolicies = {
  overlap: 'SKIP',
  catchupWindow: '12 hours',
  pauseOnFailure: false,
} as const;

@Injectable()
export class AnalyticsScheduleRegisterV1 implements OnModuleInit {
  constructor(private readonly temporal: TemporalService) {}

  async onModuleInit() {
    if (!process.env.RUN_CRON) return;

    const schedule = this.temporal.client.getRawClient().schedule;
    try {
      await schedule.create({
        scheduleId: analyticsSnapshotScheduleIdV1,
        spec: scheduleSpec,
        action: scheduleAction,
        policies: schedulePolicies,
      });
      return;
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) {
        throw error;
      }
    }

    // Temporal keeps whatever a schedule was created with, so a deployment
    // that already registered this one would never see a changed cadence or
    // overlap policy. The pause state and any other operator change stay.
    await schedule
      .getHandle(analyticsSnapshotScheduleIdV1)
      .update((previous) => ({
        ...previous,
        spec: scheduleSpec,
        action: scheduleAction,
        policies: schedulePolicies,
      }));
  }
}

@Global()
@Module({
  providers: [AnalyticsScheduleRegisterV1],
  exports: [AnalyticsScheduleRegisterV1],
})
export class AnalyticsScheduleRegisterModuleV1 {}
