import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { ContentLeadCheckActivity } from '@contentfactory/orchestrator/activities/content-lead-check.activity';

const { checkContentLeadSubscription } = proxyActivities<ContentLeadCheckActivity>({
  startToCloseTimeout: '5 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '1 minute',
  },
});

export type ContentLeadCheckWorkflowInput = {
  organizationId: string;
  subscriptionId: string;
  /** Minutes between checks, from `ContentLeadSubscription.checkIntervalMinutes`. */
  checkIntervalMinutes: number;
};

// `autoPostDraftV2Workflow`'s own hourly loop resets its Temporal history
// with `continueAsNew`; left out here, a subscription checked on a
// 60-minute interval accumulates history forever and eventually hits
// Temporal's per-execution history size/length limit, months into a
// subscription's life. 100 passes is comfortably under that limit for any
// configured interval and keeps a single workflow run's history small.
const MAX_ITERATIONS_PER_RUN = 100;

/**
 * The "regular check" for one subscription, one eternal workflow per row —
 * the same shape `autoPostDraftV2Workflow` already uses, started and
 * terminated by `ContentLeadService` the way `AutopostService.processCronV2`
 * manages its own. A separate, brand-new workflow rather than a change to
 * that one: `AutoPost`'s draft-per-hour loop is a production contract this
 * task must not touch, and a subscription's own schedule is configurable per
 * row while AutoPost's is fixed at an hour.
 */
export async function contentLeadCheckWorkflow(
  input: ContentLeadCheckWorkflowInput
) {
  const intervalMs = Math.max(1, input.checkIntervalMinutes) * 60_000;
  for (let iteration = 0; iteration < MAX_ITERATIONS_PER_RUN; iteration++) {
    await checkContentLeadSubscription({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
    });
    await sleep(intervalMs);
  }
  return await continueAsNew(input);
}
