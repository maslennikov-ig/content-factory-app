import {
  proxyActivities,
  setHandler,
  condition,
  sleep,
  continueAsNew,
  log,
} from '@temporalio/workflow';
import { EmailActivityV2 } from '@contentfactory/orchestrator/activities/email.activity.v2';
import {
  SendEmail,
  sendEmailSignal,
} from '@contentfactory/orchestrator/signals/send.email.signal';

/**
 * Versioned successor of `sendEmailWorkflow` (send.email.workflow.ts).
 *
 * `sendEmailWorkflow` is a long-running singleton (`workflowId: 'send_email'`,
 * `workflowIdConflictPolicy: 'USE_EXISTING'`); an execution of it may already
 * be mid-history when this ships, and Temporal replays that history against
 * whatever code is currently deployed. Changing what `sendEmailWorkflow`
 * schedules — how many arguments it hands the `sendEmail` activity — would
 * make a replay of that pre-existing history produce a different command
 * than the one already recorded, which is the non-determinism this repo's
 * contract rule exists to prevent. So `sendEmailWorkflow` stays byte-for-byte
 * what it was before language support existed, forever, and this file is
 * where the fifth argument (the recipient's language, for the footer
 * signature line) actually lives.
 *
 * `sendEmailWorkflowV2` is a separate singleton under its own workflow id
 * (`send_email_v2`, wired by callers — see `EmailService.sendEmail`). It
 * never shares a workflow execution with `sendEmailWorkflow`, so nothing
 * about its code needs to match what the original's history already
 * contains.
 *
 * The `sendEmail` signal (`send.email.signal.ts`) and its `SendEmail` type
 * are shared with v1 rather than forked. That is safe, and not the same
 * mistake as mutating the workflow/activity contract: a signal's payload is
 * raw data recorded in history exactly as received — TypeScript's `SendEmail`
 * type has no bearing on replay. `language` on `SendEmail` is optional, and
 * `sendEmailWorkflow`'s signal handler and processing loop never read it, so
 * a payload that now happens to carry a `language` field changes nothing
 * about what `sendEmailWorkflow` replays or schedules. Only this file reads
 * `email.language`.
 *
 * **What the cutover leaves behind, and it is not nothing.** The v1 execution
 * already running in production does not retire when callers move here. Its
 * loop is `while (true) { await condition(() => queue.length > 0) ... }` — the
 * comment beside that line says «timeout after 1 hour of inactivity», but
 * `condition()` is called with no timeout, so it waits forever. Its only exit
 * is `continueAsNew` after thirty processed emails, and after the cutover it
 * will never see a thirty-first. Mail already queued at the moment of the
 * cutover is safe: the condition is already satisfied and the loop drains it.
 * What remains is an idle execution stuck Running for good. Terminating it is
 * a production mutation and belongs to whoever deploys this, not to the code.
 */
const { sendEmailV2 } = proxyActivities<EmailActivityV2>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

const RATE_LIMIT_MS = 700;

export async function sendEmailWorkflowV2({
  queue = [],
}: {
  queue: SendEmail[];
}) {
  let processedThisRun = 0;
  // Handle incoming email signals
  setHandler(sendEmailSignal, (addEmail: SendEmail) => {
    if (addEmail.to && addEmail.subject) {
      if (addEmail.addTo === 'top') {
        queue.unshift(addEmail);
      } else {
        queue.push(addEmail);
      }
    }
  });

  // Process emails with rate limiting
  while (true) {
    // Wait until there's an email in the queue or timeout after 1 hour of inactivity
    await condition(() => queue.length > 0);

    const email = queue.shift();
    if (!email) {
      continue;
    }

    try {
      await sendEmailV2(
        email.to,
        email.subject,
        email.html,
        email.replyTo,
        email.language
      );
      processedThisRun++;
    } catch (err) {
      // The email was already removed from `queue` above, so there is no
      // second attempt after this — it is gone either way. What changed is
      // that it no longer disappears silently: `log.error` goes through the
      // Worker's log sink (a plain `console.log` from inside the workflow
      // sandbox may not go anywhere a replay-aware Worker actually reads),
      // and the failed `ActivityTaskFailed` this catch swallows already sits
      // in this workflow execution's own Temporal history for anyone who
      // looks — this just makes sure someone doesn't have to go looking.
      log.error('sendEmailWorkflowV2: dropping an email that failed to send', {
        to: email.to,
        subject: email.subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(RATE_LIMIT_MS);

    if (processedThisRun >= 30) {
      return await continueAsNew({ queue });
    }
  }
}
