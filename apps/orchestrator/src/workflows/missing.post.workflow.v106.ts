import { proxyActivities, sleep } from '@temporalio/workflow';
import type { PostActivityV106 } from '@contentfactory/orchestrator/activities/post.activity.v106';

const { searchForMissingThreeHoursPostsV106 } = proxyActivities<PostActivityV106>({
  startToCloseTimeout: '10 minute', retry: { maximumAttempts: 3 },
});

export async function missingPostWorkflowV106() {
  while (true) {
    await searchForMissingThreeHoursPostsV106();
    await sleep('1 hour');
  }
}
