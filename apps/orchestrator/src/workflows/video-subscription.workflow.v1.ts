import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { VideoSubscriptionActivityV1, VideoSubscriptionInputV1 } from '../activities/video-subscription.activity.v1';

const { stepVideoSubscriptionV1, expireVideoSubscriptionV1 } = proxyActivities<VideoSubscriptionActivityV1>({
  taskQueue: 'main',
  startToCloseTimeout: '5 minutes',
  // Domain owns retries and provider uncertainty; Temporal never repeats a submit blindly.
  retry: { maximumAttempts: 1 },
});

/** V1 history carries only local identities and sanitized state. */
export async function videoSubscriptionWorkflowV1(
  input: VideoSubscriptionInputV1,
  deadlineAt = Date.now() + 24 * 60 * 60 * 1000
): Promise<{ state: string; done: boolean }> {
  for (let iteration = 0; iteration < 100 && Date.now() < deadlineAt; iteration++) {
    try {
      const result = await stepVideoSubscriptionV1(input);
      if (result.done) return result;
    } catch {
      // A transient storage/worker failure does not create another logical
      // submit. The domain CAS recognizes an interrupted submit as uncertain.
    }
    await sleep(10_000);
  }
  if (Date.now() < deadlineAt) return continueAsNew(input, deadlineAt);
  try {
    const result = await expireVideoSubscriptionV1(input);
    if (result.done) return result;
  } catch {
    // A busy lease or storage outage cannot successfully close a pending job.
  }
  await sleep(10_000);
  return continueAsNew(input, deadlineAt);
}
