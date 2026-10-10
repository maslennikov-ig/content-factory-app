import { continueAsNew, isCancellation, proxyActivities, sleep } from '@temporalio/workflow';
import type { AutopostActivity } from '@contentfactory/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

const MAX_ITERATIONS_PER_RUN = 100;

// Successor only: existing autoPostWorkflow histories retain their commands.
export async function autoPostWorkflowV2(input: {
  id: string;
  immediately: boolean;
}): Promise<void> {
  let immediately = input.immediately;
  for (let iteration = 0; iteration < MAX_ITERATIONS_PER_RUN; iteration++) {
    try {
      if (immediately) {
        await autoPost(input.id);
      }
    } catch (error) {
      if (isCancellation(error)) throw error;
    }
    immediately = true;
    await sleep(3_600_000);
  }
  return await continueAsNew<typeof autoPostWorkflowV2>({
    ...input,
    immediately: true,
  });
}
