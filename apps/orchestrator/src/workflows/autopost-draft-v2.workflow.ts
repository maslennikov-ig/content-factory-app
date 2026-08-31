import { proxyActivities, sleep } from '@temporalio/workflow';
import type { AutopostDraftV2Activity } from '@contentfactory/orchestrator/activities/autopost-draft-v2.activity';

const { autoPostDraftV2 } = proxyActivities<AutopostDraftV2Activity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export type AutoPostDraftV2WorkflowInput = {
  id: string;
  organizationId: string;
  immediately: boolean;
};

export async function autoPostDraftV2Workflow(
  input: AutoPostDraftV2WorkflowInput
) {
  let immediately = input.immediately;
  while (true) {
    if (immediately) {
      await autoPostDraftV2({
        id: input.id,
        organizationId: input.organizationId,
      });
    }
    immediately = true;
    await sleep(3_600_000);
  }
}
