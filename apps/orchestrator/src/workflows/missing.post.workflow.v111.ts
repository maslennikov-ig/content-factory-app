import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV110 } from '@contentfactory/orchestrator/activities/post.activity.v110';

const { searchForMissingThreeHoursPostsV111 } =
  proxyActivities<PostActivityV110>({
    startToCloseTimeout: '10 minute',
    retry: { maximumAttempts: 3 },
  });
/** Recovery signals existing post jobs or starts guarded V110 for every new root; no POST job is terminated. */
export async function missingPostWorkflowV111(): Promise<void> {
  for (let iteration = 0; iteration < 100; iteration++) {
    await searchForMissingThreeHoursPostsV111();
    await sleep('1 hour');
  }
  return await continueAsNew<typeof missingPostWorkflowV111>();
}
