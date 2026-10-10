'use strict';

const { runPeriodicWorkflow } = require('./helpers/periodic-history.module.cjs');
const { CancelledFailure, ActivityFailure } = require('@temporalio/common');
const base = 'apps/orchestrator/src/workflows/';
const email = n => ({ to: 'synthetic@example.test', subject: 'mail-' + n,
  html: '<p>synthetic</p>', replyTo: 'reply@example.test', language: 'ru', addTo: 'bottom' });
const mail = (queue, options) => runPeriodicWorkflow(base + 'send.email.workflow.v3.ts',
  'sendEmailWorkflowV3', [{ queue }], options);

describe.each([
  ['autopost.workflow.v2.ts', 'autoPostWorkflowV2', 'autoPost', { id: 'synthetic-auto' }],
  ['autopost-draft-v3.workflow.ts', 'autoPostDraftV3Workflow', 'autoPostDraftV2',
    { id: 'synthetic-draft', organizationId: 'synthetic-org' }],
])('%s hourly rotation', (file, name, activity, original) => {
  test.each([true, false])('two runs preserve state and cadence, immediately=%s', async immediately => {
    const first = await runPeriodicWorkflow(base + file, name, [{ ...original, immediately }]);
    expect(first.completion).toBe('continued');
    expect(first.calls.activities).toHaveLength(immediately ? 100 : 99);
    expect(first.calls.activities[0].at).toBe(immediately ? 0 : 3_600_000);
    expect(first.calls.sleeps).toEqual(Array(100).fill(3_600_000));
    expect(first.calls.continuations).toEqual([[{ ...original, immediately: true }]]);
    const second = await runPeriodicWorkflow(base + file, name, first.calls.continuations[0]);
    expect(second.calls.activities).toHaveLength(100);
    expect(second.calls.activities[0].at + first.now).toBe(100 * 3_600_000);
    expect(second.calls.continuations).toEqual(first.calls.continuations);
    expect([...first.calls.activities, ...second.calls.activities].every(call =>
      call.name === activity && JSON.stringify(call.args) === JSON.stringify(
        activity === 'autoPost' ? [original.id] : [original]))).toBe(true);
    expect(first.calls.proxies[0]).toMatchObject({ taskQueue: 'main', startToCloseTimeout: '10 minute',
      retry: { maximumAttempts: 3, backoffCoefficient: 1, initialInterval: '2 minutes' } });
  });
});

test('recovery rotates after exactly 100 hourly V108 checks and starts another identical run', async () => {
  const first = await runPeriodicWorkflow(base + 'missing.post.workflow.v109.ts', 'missingPostWorkflowV109');
  expect(first.completion).toBe('continued');
  expect(first.calls.activities).toHaveLength(100);
  expect(first.calls.activities.map(c => c.at)).toEqual(Array.from({ length: 100 }, (_, n) => n * 3_600_000));
  expect(first.calls.activities.every(c => c.name === 'searchForMissingThreeHoursPostsV108' && c.args.length === 0)).toBe(true);
  expect(first.calls.continuations).toEqual([[]]);
  const second = await runPeriodicWorkflow(base + 'missing.post.workflow.v109.ts', 'missingPostWorkflowV109', first.calls.continuations[0]);
  expect(second.calls.activities[0].at + first.now).toBe(100 * 3_600_000);
  expect(second.calls.continuations).toEqual([[]]);
});

test('ordinary legacy AutoPost failures count toward the 100-turn bound', async () => {
  const run = await runPeriodicWorkflow(base + 'autopost.workflow.v2.ts', 'autoPostWorkflowV2',
    [{ id: 'synthetic', immediately: true }], { activity: async () => { throw new Error('Synthetic failure'); } });
  expect(run.completion).toBe('continued');
  expect(run.calls.activities).toHaveLength(100);
});

test.each([
  ['autopost-draft-v3.workflow.ts', 'autoPostDraftV3Workflow', [{ id: 'draft', organizationId: 'org', immediately: true }]],
  ['missing.post.workflow.v109.ts', 'missingPostWorkflowV109', []],
])('%s preserves fatal activity errors', async (file, name, args) => {
  const error = new Error('Synthetic fatal activity error');
  await expect(runPeriodicWorkflow(base + file, name, args, { activity: async () => { throw error; } })).rejects.toBe(error);
});

test.each(['success', 'failure', 'mixed'])('%s mail stream rotates on the thirtieth processed attempt', async kind => {
  const queue = Array.from({ length: 32 }, (_, n) => email(n));
  let failures = 0;
  const run = await mail(queue, { activity: async (entry, { calls }) => {
    if (kind === 'failure' || (kind === 'mixed' && calls.activities.length % 2 === 0)) {
      failures++;
      throw new Error('Synthetic provider failure');
    }
  } });
  expect(run.completion).toBe('continued');
  expect(run.calls.activities).toHaveLength(30);
  expect(run.calls.logs).toHaveLength(failures);
  expect(run.calls.sleeps).toEqual(Array(30).fill(700));
  expect(run.now).toBe(21_000);
  expect(run.calls.continuations).toEqual([[{ queue: [email(30), email(31)] }]]);
  expect(run.calls.activities[0]).toMatchObject({ name: 'sendEmailV2',
    args: ['synthetic@example.test', 'mail-0', '<p>synthetic</p>', 'reply@example.test', 'ru'] });
  expect(run.calls.proxies[0]).toMatchObject({ taskQueue: 'main', cancellationType: 'ABANDON',
    startToCloseTimeout: '10 minute', scheduleToCloseTimeout: '30 minutes',
    retry: { initialInterval: '30 seconds', backoffCoefficient: 2, maximumInterval: '5 minutes', maximumAttempts: 5 } });
  if (failures) expect(run.calls.logs[0]).toEqual([
    expect.stringContaining('sendEmailWorkflowV3'), expect.objectContaining({
      to: 'synthetic@example.test', error: 'Synthetic provider failure' }),
  ]);
});

test('signals during the last send and pacing preserve priority/order and never repeat processed work', async () => {
  const top = { ...email('activity-top'), addTo: 'top' };
  const tail = email('activity-tail');
  const paced = { ...email('pacing-top'), addTo: 'top' };
  const first = await mail(Array.from({ length: 31 }, (_, n) => email(n)), {
    activity: async (_entry, { calls, signal }) => {
      if (calls.activities.length === 30) { signal(top); signal(tail); }
    },
    onSleep: async ({ calls, signal }) => { if (calls.sleeps.length === 30) signal(paced); },
  });
  expect(first.calls.continuations).toEqual([[{ queue: [paced, top, email(30), tail] }]]);
  const second = await mail(first.calls.continuations[0][0].queue);
  expect(second.completion).toBe('fixture-stopped');
  expect(second.calls.activities.map(c => c.args[1])).toEqual([paced.subject, top.subject, email(30).subject, tail.subject]);
  const subjects = [...first.calls.activities, ...second.calls.activities].map(c => c.args[1]);
  expect(subjects).toHaveLength(34);
  expect(new Set(subjects).size).toBe(34);
});

test('a complete mail batch continues with an empty queue and next run accepts new signals', async () => {
  const first = await mail(Array.from({ length: 30 }, (_, n) => email(n)));
  expect(first.calls.continuations).toEqual([[{ queue: [] }]]);
  let delivered = false;
  const second = await mail([], { onCondition: async ({ signal }) => {
    if (!delivered) { delivered = true; signal(email('new-run')); }
  } });
  expect(second.calls.activities.map(c => c.args[1])).toEqual(['mail-new-run']);
  expect(second.calls.continuations).toEqual([]);
});

test('idle/default queue and invalid signals schedule no sends or timers', async () => {
  const run = await mail(undefined, { onCondition: async ({ signal }) => {
    signal({ ...email('invalid-to'), to: '' });
    signal({ ...email('invalid-subject'), subject: '' });
  } });
  expect(run.completion).toBe('fixture-stopped');
  expect(run.calls.activities).toEqual([]);
  expect(run.calls.sleeps).toEqual([]);
  expect(run.calls.continuations).toEqual([]);
});

describe.each(['direct', 'activity-wrapped'])('%s cancellation', kind => {
  const cause = new CancelledFailure('Synthetic cancellation');
  const error = kind === 'direct' ? cause : new ActivityFailure('Synthetic cancelled activity',
    'sendEmailV2', 'owned', 'RETRY_STATE_CANCEL_REQUESTED', undefined, cause);
  test.each([
    ['autopost.workflow.v2.ts', 'autoPostWorkflowV2', [{ id: 'auto', immediately: true }]],
    ['send.email.workflow.v3.ts', 'sendEmailWorkflowV3', [{ queue: [email('cancel')] }]],
  ])('%s propagates cancellation', async (file, name, args) => {
    await expect(runPeriodicWorkflow(base + file, name, args, { activity: async () => { throw error; } })).rejects.toBe(error);
  });
});
