'use strict';

// Actual Stop guard with a controlled storage read schedule. No workflow or
// provider runs; a cancellation request is observable and must remain zero.
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
let cancellations = 0;
const createRun = async () => ({cancel: async () => { cancellations++; }});
const { cancelNativeRunSnapshots } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/native-stop.ts', {
  '@mastra/core/mastra': {Mastra: class {}},
  '@mastra/core/agent/durable': {createDurableAgenticWorkflow: () => ({createRun,
    steps: {'durable-agentic-execution': {id: 'durable-agentic-execution', createRun}}})},
});
const binding = {runId: 'owned-run', threadId: 'owned-thread', resourceId: 'org:actor', requestId: 'owned-request'};
const owner = {ownerId: 'owned-driver', generation: 42, live: false};
const snapshot = (nested, status = 'suspended') => ({resourceId: binding.resourceId, snapshot: {
  runId: binding.runId, status,
  requestContext: {'mastra__threadId': binding.threadId, 'mastra__resourceId': binding.resourceId,
    'cf.organizationId': 'org', 'cf.userId': 'actor', 'cf.requestId': binding.requestId},
  ...(nested ? {parentWorkflow: {runId: binding.runId, workflowId: 'durable-agentic-loop', stepId: 'durable-agentic-execution'}} : {}),
}});
function fixture(options = {}) {
  const firstNested = options.firstNested ?? snapshot(true);
  const fresh = options.fresh ?? [null, null];
  const reads = [], counts = [0, 0]; let ownerReads = 0;
  const workflows = {
    getWorkflowRunById: async input => {
      const slot = input.workflowName === 'durable-agentic-loop' ? 0 : 1;
      const row = counts[slot]++ === 0 ? [null, firstNested][slot] : fresh[slot];
      reads.push({workflowName: input.workflowName, row: structuredClone(row)});
      return structuredClone(row);
    },
    getRunOwnership: async () => structuredClone((options.owners ?? [owner])[Math.min(ownerReads++, (options.owners ?? [owner]).length - 1)]),
  };
  const stillOwned = jest.fn(async () => options.stillOwned !== false);
  const run = () => cancelNativeRunSnapshots({getStore: async () => workflows}, binding, stillOwned);
  return {run, reads, stillOwned};
}
beforeEach(() => { cancellations = 0; });
afterEach(() => { expect(cancellations).toBe(0); });

test('one bounded fresh read recognizes SDK cleanup after root-null / stale nested-present observations', async () => {
  const f = fixture();
  await expect(f.run()).resolves.toBeUndefined();
  expect(f.reads.map(r => r.row?.snapshot.status ?? null)).toEqual([null, 'suspended', null, null]);
  expect(f.stillOwned).toHaveBeenCalledTimes(1);
});

test('a consistent reappearing root is adopted only with matching owned terminal checkpoints', async () => {
  const f = fixture({fresh: [snapshot(false, 'canceled'), snapshot(true, 'canceled')]});
  await expect(f.run()).resolves.toBeUndefined();
  expect(f.reads).toHaveLength(6);
});

test.each(['suspended', 'canceled'])('a truly missing root with a persistent %s nested checkpoint stays refused', async status => {
  const nested = snapshot(true, status), f = fixture({firstNested: nested, fresh: [null, nested]});
  await expect(f.run()).rejects.toThrow('Native Stop root ownership is unavailable.');
  expect(f.reads).toHaveLength(4);
});

test.each(['resource', 'actor', 'thread', 'request', 'run', 'parent-run', 'parent-workflow', 'parent-step'])(
  'foreign observed nested %s is refused before refreshing or cancelling anything', async mismatch => {
    const nested = snapshot(true);
    if (mismatch === 'resource') nested.resourceId = 'other:actor';
    if (mismatch === 'actor') nested.snapshot.requestContext['cf.userId'] = 'another-actor';
    if (mismatch === 'thread') nested.snapshot.requestContext['mastra__threadId'] = 'another-thread';
    if (mismatch === 'request') nested.snapshot.requestContext['cf.requestId'] = 'another-request';
    if (mismatch === 'run') nested.snapshot.runId = 'another-run';
    if (mismatch === 'parent-run') nested.snapshot.parentWorkflow.runId = 'another-run';
    if (mismatch === 'parent-workflow') nested.snapshot.parentWorkflow.workflowId = 'another-workflow';
    if (mismatch === 'parent-step') nested.snapshot.parentWorkflow.stepId = 'another-step';
    const f = fixture({firstNested: nested});
    await expect(f.run()).rejects.toThrow('Native Stop checkpoint ownership changed.');
    expect(f.reads).toHaveLength(2);
  }
);

test.each(['live', 'changed-owner', 'changed-generation'])('the %s native owner cannot be accepted through the refresh path', async mode => {
  const f = fixture({owners: mode === 'live' ? [{...owner, live: true}] : [owner,
    {...owner, ...(mode === 'changed-owner' ? {ownerId: 'another-driver'} : {generation: 43})}]});
  await expect(f.run()).rejects.toThrow('Native Stop still has an active or changed native owner.');
});

test('a changed current task refuses completed cleanup without accepting a Stop for a successor', async () => {
  const f = fixture({stillOwned: false});
  await expect(f.run()).rejects.toThrow('Native Stop task changed.');
});

test('a newly visible foreign root remains refused after the bounded refresh', async () => {
  const root = snapshot(false, 'canceled'); root.snapshot.requestContext['cf.requestId'] = 'foreign-request';
  const f = fixture({fresh: [root, snapshot(true, 'canceled')]});
  await expect(f.run()).rejects.toThrow('Native Stop checkpoint ownership changed.');
});
