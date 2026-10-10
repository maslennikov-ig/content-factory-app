import { proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV108 } from '@contentfactory/orchestrator/activities/post.activity.v108';

const { searchForMissingThreeHoursPostsV108 } =
  proxyActivities<PostActivityV108>({
    startToCloseTimeout: '10 minute',
    retry: { maximumAttempts: 3 },
  });

export async function missingPostWorkflowV108() {
  while (true) {
    await searchForMissingThreeHoursPostsV108();
    await sleep('1 hour');
  }
}
