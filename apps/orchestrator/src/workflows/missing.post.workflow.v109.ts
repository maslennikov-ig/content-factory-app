import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV108 } from '@contentfactory/orchestrator/activities/post.activity.v108';

const { searchForMissingThreeHoursPostsV108 } = proxyActivities<PostActivityV108>({
  startToCloseTimeout: '10 minute',
  retry: { maximumAttempts: 3 },
});

const MAX_ITERATIONS_PER_RUN = 100;

// Keep V108 recovery/publication behavior; rotate only this periodic loop.
export async function missingPostWorkflowV109(): Promise<void> {
  for (let iteration = 0; iteration < MAX_ITERATIONS_PER_RUN; iteration++) {
    await searchForMissingThreeHoursPostsV108();
    await sleep('1 hour');
  }
  return await continueAsNew<typeof missingPostWorkflowV109>();
}
