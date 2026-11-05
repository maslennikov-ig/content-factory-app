import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV109 } from '@contentfactory/orchestrator/activities/post.activity.v109';

const { searchForMissingThreeHoursPostsV110 } = proxyActivities<PostActivityV109>({
  startToCloseTimeout: '10 minute', retry: { maximumAttempts: 3 },
});
/** Recovery routes campaign roots through their guarded workflow; prior versions remain immutable. */
export async function missingPostWorkflowV110(): Promise<void> {
  for (let iteration = 0; iteration < 100; iteration++) {
    await searchForMissingThreeHoursPostsV110();
    await sleep('1 hour');
  }
  return await continueAsNew<typeof missingPostWorkflowV110>();
}
