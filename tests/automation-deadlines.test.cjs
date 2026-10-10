'use strict';

const { BASE_TIME, runClockWorkflow } = require('./helpers/automation-deadlines.module.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
beforeEach(() => jest.useFakeTimers({ now: BASE_TIME }));
afterEach(() => jest.useRealTimers());

test.each([5, 6])('historical V10%s retains the observed cumulative waits', async version => {
  const calls = await runClockWorkflow(version, { actionTime: 400 });
  expect(calls.actions.map(action => action.at)).toEqual([1000, 3400, 6800]);
});

test('V107 respects 1/2/3 offsets with nonzero processing', async () => {
  const calls = await runClockWorkflow(7, { actionTime: 400 });
  expect(calls.actions.map(action => action.at)).toEqual([1000, 2000, 3000]);
  expect(calls.sleeps).toEqual([1000, 600, 600]);
});

test('mixed internal/global actions subtract schedule discovery and processing time', async () => {
  const internal = [500, 1500].map(delay => ({ type: 'internal-plug', integration: 'target-' + delay,
    originalIntegration: 'channel', orgId: 'org', plugName: 'repost', delay, information: {} }));
  const calls = await runClockWorkflow(7, { publicationTime: 200, webhookTime: 300,
    discoveryTime: 250, actionTime: 100, internal,
    global: [{ type: 'global', plugId: 'global', delay: 1000, totalRuns: 2 }] });
  expect(calls.actions.map(({ kind, at }) => [kind, at])).toEqual([
    ['internal', 1000], ['global', 1500], ['internal', 2000], ['global', 2500],
  ]);
  expect(calls.payloads[0]).toEqual({ ...internal[0], post: 'remote-post' });
  expect(calls.payloads[1]).toEqual({ type: 'global', plugId: 'global', delay: 1000,
    totalRuns: 2, postId: 'remote-post' });
  expect(calls.payloads.every(data => !('dueAt' in data))).toBe(true);
});

test('long actions make overdue actions immediate without another full interval', async () => {
  const calls = await runClockWorkflow(7, { actionTime: 1700 });
  expect(calls.actions.map(action => action.at)).toEqual([1000, 2700, 4400]);
  expect(calls.sleeps).toEqual([1000]);
});

test('overdue actions do not create zero-duration Temporal timers', async () => {
  const calls = await runClockWorkflow(7, { actionTime: 1700 });
  expect(calls.sleeps.every(ms => ms > 0)).toBe(true);
});

test('equal deadlines keep stable ordering and never repeat the wait', async () => {
  const calls = await runClockWorkflow(7, { actionTime: 200,
    global: ['one', 'two'].map(plugId => ({ type: 'global', plugId, delay: 1000, totalRuns: 1 })) });
  expect(calls.actions.map(({ id, at }) => [id, at])).toEqual([['one', 1000], ['two', 1200]]);
  expect(calls.sleeps).toEqual([1000]);
});

test('zero and negative offsets never become negative sleeps', async () => {
  const calls = await runClockWorkflow(7, { global: [], internal: [-100, 0].map(delay => ({
    type: 'internal-plug', integration: String(delay), delay,
  })) });
  expect(calls.sleeps).toEqual([]);
  expect(calls.actions.map(action => action.at)).toEqual([0, 0]);
});

test('refresh/retry processing consumes later deadline budgets', async () => {
  const calls = await runClockWorkflow(7, { refreshFirst: true, actionTime: 400, refreshTime: 1500 });
  expect(calls.actions.map(action => action.at)).toEqual([1000, 2900, 3300, 3700]);
  expect(calls.sleeps).toEqual([1000]);
  expect(calls.names.filter(name => name === 'refreshTokenWithCause')).toHaveLength(1);
});

test('repeat uses workflow-entry deadline and V107 child, independently of plug origin', async () => {
  const calls = await runClockWorkflow(7, { publicationTime: 500, discoveryTime: 200,
    actionTime: 400, repeatAt: 2200 });
  expect(calls.actions.map(action => action.at)).toEqual([1500, 2500, 3500]);
  expect(calls.children).toHaveLength(1);
  expect(calls.children[0]).toMatchObject({ at: 2200, name: 'postWorkflowV107', args: {
    parentClosePolicy: 'ABANDON', args: [{ taskQueue: 'synthetic', postId: 'post',
      organizationId: 'org', postNow: true }], workflowId: 'post_post_fixture-child',
  } });
});

test('a repeat overdue during initial publication is immediate and sorts before plugs', async () => {
  const calls = await runClockWorkflow(7, { publicationTime: 1500, repeatAt: 1000 });
  expect(calls.children[0].at).toBe(1500);
  expect(calls.actions.map(action => action.at)).toEqual([2500, 3500, 4500]);
  expect(calls.sleeps).toEqual([1000, 1000, 1000]);
});

test('initial scheduled wait does not reset the declared repeat base', async () => {
  const calls = await runClockWorkflow(7, { postNow: false, publishAt: 5000,
    publicationTime: 1000, repeatAt: 7000 });
  expect(calls.children[0].at).toBe(7000);
  expect(calls.actions.map(action => action.at)).toEqual([7000, 8000, 9000]);
  expect(calls.sleeps.every(ms => ms >= 0)).toBe(true);
});

test('dbxe.15 safe skip still removes only that automation in V107', async () => {
  const { fixture } = require('./helpers/automation-disablement.module.cjs');
  const f = fixture();
  f.state.plug.activated = false;
  const log = jest.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const calls = await runClockWorkflow(7, {
      global: ['plug', 'other'].map(plugId => ({ type: 'global', plugId, delay: 1000, totalRuns: 3 })),
      processPlug: data => data.plugId === 'plug' ? f.service.processPlugs(data) : false,
    });
    expect(calls.actions.map(({ id, at }) => [id, at])).toEqual([
      ['plug', 1000], ['other', 1000], ['other', 2000], ['other', 3000],
    ]);
    expect(f.provider.promote).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  } finally { log.mockRestore(); }
});

test.each([false, true])('V107 preserves real V106 publication claim behavior (failure=%s)', async failure => {
  const { fixture } = require('./helpers/publication-v106.module.cjs');
  const f = fixture(undefined, failure ? { write: async () => { throw new Error('Synthetic uncertain write'); } } : {});
  const calls = await runClockWorkflow(7, { postNow: false,
    post: { ...f.client.row, integration: f.integration },
    publication: (...args) => f.activity.postSocialV106(...args),
  });
  expect(f.calls.writes).toBe(1);
  if (failure) {
    expect(calls.result).toBe(false);
    expect(calls.actions).toEqual([]);
    expect(f.client.row.publicationJournal.attempts[0].status).toBe('pending');
  } else {
    expect(f.client.row.state).toBe('PUBLISHED');
    expect(calls.actions).toHaveLength(3);
  }
});

test('recovery activity selects V107 without changing IDs, tenant attributes or USE_EXISTING', async () => {
  const { dependencyMocks } = require('./helpers/publication-v106.module.cjs');
  const attributes = loadTypeScriptModule('libraries/nestjs-libraries/src/temporal/temporal.search.attribute.ts');
  const { PostActivityV107 } = loadTypeScriptModule('apps/orchestrator/src/activities/post.activity.v107.ts', {
    ...dependencyMocks,
    '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute': attributes,
  });
  const signalWithStart = jest.fn(async () => {});
  const posts = { searchForMissingThreeHoursPosts: async () => [{ id: 'p1', organizationId: 'org',
    integration: { providerIdentifier: 'synthetic-page' } }] };
  const activity = new PostActivityV107(posts, { client: { getRawClient: () => ({ workflow: { signalWithStart } }) } });
  expect(await activity.searchForMissingThreeHoursPostsV107()).toBeUndefined();
  expect(signalWithStart).toHaveBeenCalledWith('postWorkflowV107', expect.objectContaining({
    workflowId: 'post_p1', workflowIdConflictPolicy: 'USE_EXISTING', signal: 'poke', signalArgs: [],
    args: [{ taskQueue: 'synthetic', postId: 'p1', organizationId: 'org' }],
  }));
  expect(signalWithStart.mock.calls[0][1].typedSearchAttributes.getAll()).toHaveLength(2);
  expect(signalWithStart.mock.calls[0][1].typedSearchAttributes.get(attributes.postId)).toBe('p1');
  expect(signalWithStart.mock.calls[0][1].typedSearchAttributes.get(attributes.organizationId)).toBe('org');
});

test('cron registration selects new recovery loop only under the existing RUN_CRON switch', async () => {
  const saved = process.env.RUN_CRON;
  const decorator = () => () => {};
  const { InfiniteWorkflowRegister } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/temporal/infinite.workflow.register.ts', {
      '@nestjs/common': { Injectable: decorator, Global: decorator, Module: decorator },
      'nestjs-temporal-core': { TemporalService: class {} },
    });
  const start = jest.fn(async () => {});
  const registration = new InfiniteWorkflowRegister({ client: { getRawClient: () => ({ workflow: { start } }) } });
  try {
    delete process.env.RUN_CRON;
    await registration.onModuleInit();
    expect(start).not.toHaveBeenCalled();
    process.env.RUN_CRON = '1';
    await registration.onModuleInit();
    expect(start).toHaveBeenCalledWith('missingPostWorkflowV109', {
      workflowId: 'missing-post-workflow-v108', taskQueue: 'main',
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
  } finally {
    if (saved === undefined) delete process.env.RUN_CRON; else process.env.RUN_CRON = saved;
  }
});

test('new recovery loop invokes its versioned activity and retains hourly cadence', async () => {
  const activity = jest.fn(async () => {});
  const stop = new Error('Owned fixture loop finished');
  const sleep = jest.fn(async () => { throw stop; });
  const { missingPostWorkflowV107 } = loadTypeScriptModule('apps/orchestrator/src/workflows/missing.post.workflow.v107.ts', {
    '@temporalio/workflow': { proxyActivities: () => ({ searchForMissingThreeHoursPostsV107: activity }), sleep },
  });
  await expect(missingPostWorkflowV107()).rejects.toBe(stop);
  expect(activity).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledWith('1 hour');
});
