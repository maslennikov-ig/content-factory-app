import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { AutopostDraftV2Activity } from '@contentfactory/orchestrator/activities/autopost-draft-v2.activity';
import type { AutoPostDraftV2WorkflowInput } from './autopost-draft-v2.workflow';

const { autoPostDraftV2 } = proxyActivities<AutopostDraftV2Activity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const MAX_ITERATIONS_PER_RUN = 100;

// History rotation only; the product's draft V2 generation stays unchanged.
export async function autoPostDraftV3Workflow(
  input: AutoPostDraftV2WorkflowInput
): Promise<void> {
  let immediately = input.immediately;
  for (let iteration = 0; iteration < MAX_ITERATIONS_PER_RUN; iteration++) {
    if (immediately) {
      await autoPostDraftV2({
        id: input.id,
        organizationId: input.organizationId,
      });
    }
    immediately = true;
    await sleep(3_600_000);
  }
  return await continueAsNew<typeof autoPostDraftV3Workflow>({
    ...input,
    immediately: true,
  });
}
