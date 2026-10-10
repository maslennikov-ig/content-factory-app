import { proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV107 } from '@contentfactory/orchestrator/activities/post.activity.v107';

const { searchForMissingThreeHoursPostsV107 } =
  proxyActivities<PostActivityV107>({
    startToCloseTimeout: '10 minute',
    retry: { maximumAttempts: 3 },
  });

export async function missingPostWorkflowV107() {
  while (true) {
    await searchForMissingThreeHoursPostsV107();
    await sleep('1 hour');
  }
}
