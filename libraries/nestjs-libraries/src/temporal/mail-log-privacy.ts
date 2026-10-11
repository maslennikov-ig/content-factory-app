import type { Logger, LogLevel, LogMetadata } from '@temporalio/common';
import { DefaultLogger, LogTimestamp, Runtime } from '@temporalio/worker';
import { randomUUID } from 'node:crypto';
import { MAIL_ACTIVITY_TYPES, MAIL_WORKFLOW_TYPES } from './mail-log-scope';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTS = new Map([
  ['Activity started', 'activity_started'],
  ['Activity completed', 'activity_completed'],
  ['Activity completed as cancelled', 'activity_cancelled'],
  ['Activity reset', 'activity_reset'],
  ['Activity failed', 'activity_failed'],
  ['Workflow started', 'workflow_started'],
  ['Workflow completed', 'workflow_completed'],
  ['Workflow completed as cancelled', 'workflow_cancelled'],
  ['Workflow continued as new', 'workflow_continued'],
  ['Workflow failed', 'workflow_failed'],
  ['mail.workflow_console', 'workflow_console'],
  ['sendEmailWorkflowV2: dropping an email that failed to send', 'delivery_failed'],
  ['sendEmailWorkflowV3: dropping an email that failed to send', 'delivery_failed'],
]);

/** Only mail SDK records change; provider failures and workflow state are untouched. */
export function createMailPrivacyLogger(delegate: Logger): Logger {
  const log = (level: LogLevel, message: string, meta?: LogMetadata) => {
    const workflowType = meta?.workflowType;
    const activityType = meta?.activityType;
    const mailWorkflow = typeof workflowType === 'string' && MAIL_WORKFLOW_TYPES.has(workflowType);
    const mailActivity = typeof activityType === 'string' && MAIL_ACTIVITY_TYPES.has(activityType);
    if (!mailWorkflow && !mailActivity) {
      delegate.log(level, message, meta);
      return;
    }

    // Never inspect, format or mutate the raw error, its causes or payload details.
    const runId = meta?.workflowRunId ?? meta?.runId;
    const code = EVENTS.get(message) ?? 'log_event';
    const safe: LogMetadata = {
      code,
      correlationId: typeof runId === 'string' && UUID.test(runId) ? runId : randomUUID(),
      ...(mailWorkflow ? { workflowType } : {}),
      ...(mailActivity ? { activityType } : {}),
    };
    for (const key of ['attempt', 'durationMs'] as const) {
      const value = meta?.[key];
      if (typeof value === 'number' && Number.isFinite(value) &&
          value >= (key === 'attempt' ? 1 : 0) && value <= Number.MAX_SAFE_INTEGER &&
          (key !== 'attempt' || Number.isInteger(value))) safe[key] = value;
    }
    if (typeof meta?.[LogTimestamp] === 'bigint') safe[LogTimestamp] = meta[LogTimestamp];
    delegate.log(level, `mail.${code}`, safe);
  };
  return {
    log,
    trace: (message, meta) => log('TRACE', message, meta),
    debug: (message, meta) => log('DEBUG', message, meta),
    info: (message, meta) => log('INFO', message, meta),
    warn: (message, meta) => log('WARN', message, meta),
    error: (message, meta) => log('ERROR', message, meta),
  };
}

export function installMailLogPrivacy() {
  // Keep SDK default INFO severity and Core telemetry options. Install before
  // Nest creates any worker; late installation must fail rather than leak silently.
  Runtime.install({ logger: createMailPrivacyLogger(new DefaultLogger()) });
}
