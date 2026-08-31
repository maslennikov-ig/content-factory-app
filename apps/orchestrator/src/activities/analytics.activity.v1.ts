import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AnalyticsSnapshotService } from '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service';

@Injectable()
@Activity()
export class AnalyticsActivityV1 {
  constructor(private readonly snapshots: AnalyticsSnapshotService) {}

  @ActivityMethod()
  captureIntegrationAnalyticsSnapshotsV1() {
    return this.snapshots.captureAll();
  }
}
