import {
  condition,
  continueAsNew,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type { EmailActivityV2 } from '@contentfactory/orchestrator/activities/email.activity.v2';
import {
  SendEmail,
  sendEmailSignal,
} from '@contentfactory/orchestrator/signals/send.email.signal';

const { sendEmailV2 } = proxyActivities<EmailActivityV2>({
  startToCloseTimeout: '10 minute',
  scheduleToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '30 seconds',
    backoffCoefficient: 2,
    maximumInterval: '5 minutes',
    maximumAttempts: 5,
  },
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

const RATE_LIMIT_MS = 700;
const MAX_ATTEMPTS_PER_RUN = 30;

// New type, same signal/activity contracts. Pending work alone crosses runs.
export async function sendEmailWorkflowV3({
  queue = [],
}: {
  queue: SendEmail[];
}): Promise<void> {
  let processedThisRun = 0;
  setHandler(sendEmailSignal, (email: SendEmail) => {
    if (email.to && email.subject) {
      if (email.addTo === 'top') queue.unshift(email);
      else queue.push(email);
    }
  });

  while (true) {
    await condition(() => queue.length > 0);
    const email = queue.shift();
    if (!email) continue;

    try {
      await sendEmailV2(
        email.to,
        email.subject,
        email.html,
        email.replyTo,
        email.language
      );
    } catch (error) {
      if (isCancellation(error)) throw error;
      log.error('sendEmailWorkflowV3: dropping an email that failed to send', {
        to: email.to,
        subject: email.subject,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    processedThisRun++;
    await sleep(RATE_LIMIT_MS);

    if (processedThisRun >= MAX_ATTEMPTS_PER_RUN) {
      // Handler is synchronous; signals received during activity/pacing are
      // already in queue when the main loop takes this checkpoint.
      return await continueAsNew<typeof sendEmailWorkflowV3>({ queue });
    }
  }
}
