'use strict';

// Offline, fail-closed conservation proof for the immutable V2/V3 mail contract.
// Input histories contain private mail. Output deliberately contains counts only.
const fs = require('node:fs');
const assert = require('node:assert/strict');

function payload(value) {
  const encoding = Buffer.from(value?.metadata?.encoding || '', 'base64').toString();
  if (encoding === 'binary/null') return null;
  assert.equal(encoding, 'json/plain', 'Unsupported mail payload encoding');
  return JSON.parse(Buffer.from(value.data || '', 'base64').toString());
}
const inputs = attributes => (attributes?.input?.payloads || []).map(payload);
function fingerprint(email) {
  assert.ok(email && typeof email.to === 'string' && email.to &&
    typeof email.subject === 'string' && email.subject && typeof email.html === 'string',
  'Unsupported queued mail shape');
  assert.ok(email.replyTo == null || typeof email.replyTo === 'string');
  assert.ok(email.language == null || typeof email.language === 'string');
  return JSON.stringify([email.to, email.subject, email.html, email.replyTo ?? null, email.language ?? null]);
}

function inspectMailQueue(history, description) {
  assert.ok(Array.isArray(history?.events) && history.events.length, 'Missing history');
  const info = description?.workflowExecutionInfo;
  assert.ok(['sendEmailWorkflowV2', 'sendEmailWorkflowV3'].includes(info?.type?.name), 'Unexpected workflow type');
  assert.equal(info.execution?.workflowId, 'send_email_v2', 'Unexpected mail singleton');
  assert.equal(info.taskQueue, 'main', 'Unexpected task queue');
  assert.equal(info.status, 'WORKFLOW_EXECUTION_STATUS_RUNNING', 'Mail is not Running');
  assert.equal(Number(info.historyLength), history.events.length, 'Description/history differ');
  const outstanding = new Map(), activities = new Map(), timers = new Set(), tasks = new Set();
  let initialQueue = 0, acceptedSignals = 0, ignoredSignals = 0, completed = 0, failed = 0;
  const add = email => { const key = fingerprint(email); outstanding.set(key, (outstanding.get(key) || 0) + 1); };
  let started = false;
  for (const event of history.events) {
    const id = String(event.eventId);
    if (event.workflowExecutionStartedEventAttributes) {
      assert.equal(started, false, 'Multiple start events'); started = true;
      const a = event.workflowExecutionStartedEventAttributes;
      assert.equal(a.workflowType?.name, info.type.name);
      assert.equal(a.taskQueue?.name, 'main');
      const args = inputs(a); assert.equal(args.length, 1);
      const queue = args[0]?.queue ?? []; assert.ok(Array.isArray(queue));
      initialQueue = queue.length; queue.forEach(add);
    } else if (event.workflowExecutionSignaledEventAttributes) {
      const a = event.workflowExecutionSignaledEventAttributes;
      assert.equal(a.signalName, 'sendEmail', 'Unknown signal');
      const args = inputs(a); assert.equal(args.length, 1);
      const email = args[0];
      assert.ok(email && typeof email === 'object', 'Malformed signal');
      if (email.to && email.subject) { add(email); acceptedSignals++; }
      else ignoredSignals++;
    } else if (event.activityTaskScheduledEventAttributes) {
      const a = event.activityTaskScheduledEventAttributes;
      assert.equal(a.activityType?.name, 'sendEmailV2', 'Unexpected mail activity');
      assert.equal(a.taskQueue?.name, 'main');
      const args = inputs(a); assert.equal(args.length, 5, 'Activity argument contract changed');
      const key = fingerprint({to:args[0],subject:args[1],html:args[2],replyTo:args[3],language:args[4]});
      const count = outstanding.get(key) || 0;
      assert.ok(count > 0, 'Scheduled mail has no admitted occurrence');
      outstanding.set(key, count - 1); activities.set(id, false);
    } else if (event.activityTaskCompletedEventAttributes || event.activityTaskFailedEventAttributes ||
               event.activityTaskTimedOutEventAttributes || event.activityTaskCanceledEventAttributes) {
      const success = event.activityTaskCompletedEventAttributes;
      const a = success || event.activityTaskFailedEventAttributes || event.activityTaskTimedOutEventAttributes || event.activityTaskCanceledEventAttributes;
      const scheduled = String(a.scheduledEventId);
      assert.equal(activities.get(scheduled), false, 'Unknown or twice-settled activity');
      activities.set(scheduled, true); if (success) completed++; else failed++;
    } else if (event.timerStartedEventAttributes) {
      const timer = event.timerStartedEventAttributes.timerId;
      assert.equal(timers.has(timer), false); timers.add(timer);
    } else if (event.timerFiredEventAttributes || event.timerCanceledEventAttributes) {
      const timer = (event.timerFiredEventAttributes || event.timerCanceledEventAttributes).timerId;
      assert.equal(timers.delete(timer), true, 'Unknown timer completion');
    } else if (event.workflowTaskScheduledEventAttributes) {
      tasks.add(id);
    } else if (event.workflowTaskCompletedEventAttributes || event.workflowTaskFailedEventAttributes || event.workflowTaskTimedOutEventAttributes) {
      const a = event.workflowTaskCompletedEventAttributes || event.workflowTaskFailedEventAttributes || event.workflowTaskTimedOutEventAttributes;
      assert.equal(tasks.delete(String(a.scheduledEventId)), true, 'Unknown workflow-task completion');
    } else if (!event.workflowTaskStartedEventAttributes && !event.activityTaskStartedEventAttributes) {
      throw new Error('Unsupported history event; inspect manually');
    }
  }
  assert.equal(started, true);
  const pendingQueue = [...outstanding.values()].reduce((a, b) => a + b, 0);
  const unsettledActivities = [...activities.values()].filter(value => !value).length;
  const describePending = (description.pendingActivities || []).length;
  const pendingWorkflowTask = !!description.pendingWorkflowTask;
  return { workflowType: info.type.name, eventCount: history.events.length, initialQueue, acceptedSignals, ignoredSignals,
    scheduledActivities: activities.size, completedActivities: completed, failedActivities: failed,
    pendingQueue, unsettledActivities, pendingTimers: timers.size, pendingWorkflowTasks: tasks.size,
    describePendingActivities: describePending, describePendingWorkflowTask: pendingWorkflowTask,
    readyForEmptyCutover: pendingQueue === 0 && unsettledActivities === 0 && timers.size === 0 && tasks.size === 0 &&
      describePending === 0 && !pendingWorkflowTask,
    payloadsDisclosed: false };
}

module.exports = { inspectMailQueue };
if (require.main === module) {
  try {
    assert.equal(process.argv.length, 4, 'Usage: inspect-mail-queue-state.cjs <private-history.json> <private-description.json>');
    const result = inspectMailQueue(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), JSON.parse(fs.readFileSync(process.argv[3], 'utf8')));
    console.log(JSON.stringify(result)); if (!result.readyForEmptyCutover) process.exitCode = 2;
  } catch {
    console.error('mail.queue_state_unverified'); process.exitCode = 1;
  }
}
