import { proxyActivities } from '@temporalio/workflow';
import { AnalyticsActivityV1 } from '@contentfactory/orchestrator/activities/analytics.activity.v1';

const { captureIntegrationAnalyticsSnapshotsV1 } =
  proxyActivities<AnalyticsActivityV1>({
    startToCloseTimeout: '30 minutes',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 2,
      initialInterval: '1 minute',
    },
  });

export async function integrationAnalyticsSnapshotWorkflowV1() {
  return captureIntegrationAnalyticsSnapshotsV1();
}
