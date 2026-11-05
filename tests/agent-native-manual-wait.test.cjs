'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

let report;
beforeAll(() => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-manual-wait.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30_000,
  });
  report = JSON.parse(output.trim().split('\n').at(-1));
}, 35_000);

test.each([false, true])('a manual native approval releases its HTTP observer with delayed Session=%s', delayed => {
  const value = report.scenarios.find(value => value.policy === 'ask' && value.delayed === delayed && !value.approve);
  expect(value).toMatchObject({ nativeRequiresApproval: true, validSummary: true,
    sessionArmed: !delayed, httpEnded: true, nativeWait: true, completed: true,
    controlledModelCalls: 2, decisions: [false] });
  if (delayed) expect(value.answerCompletedBeforeMirror).toBe(true);
  expect(report.externalRequests).toBe(0);
});

test('Yes before the Session mirror arrives runs the exact child once and completes', () => {
  expect(report.scenarios.find(value => value.policy === 'ask' && value.approve)).toMatchObject({
    delayed: true, sessionArmed: false, httpEnded: true, nativeWait: true,
    answerCompletedBeforeMirror: true, completed: true, controlledModelCalls: 3, decisions: [true],
  });
});

test('automatic allow does not announce a human wait while the same durable approval is briefly stored', () => {
  expect(report.scenarios.find(value => value.policy === 'allow')).toMatchObject({
    delayed: true, nativeRequiresApproval: true, sessionArmed: false,
    httpEnded: false, nativeWait: false, completed: true, decisions: [true],
  });
});

const args = { agentType: 'writing', task: 'Controlled exact task.', forked: false };
const storedRun = () => ({ runId: 'run', threadId: 'thread', resourceId: 'resource',
  toolCalls: [{ toolCallId: 'call', toolName: 'subagent', requiresApproval: true, args: { ...args } }] });

async function replay({ mutate = () => {}, policy = 'ask', resumed = false, readError = false, duringRead, emptyReads = 0 } = {}) {
  let source;
  const output = new ReadableStream({ start(controller) { source = controller; } });
  const run = storedRun();
  mutate(run);
  const session = {
    sendSignal: () => ({ accepted: Promise.resolve({ runId: 'run', action: 'start' }) }),
    subscribe: () => () => {}, approval: { isArmed: () => false }, suspensions: { has: () => false },
    resolveToolApproval: () => policy,
  };
  const listSuspendedRuns = jest.fn(async address => {
    expect(address).toEqual({ threadId: 'thread', resourceId: 'resource' });
    if (duringRead) await duringRead({ setPolicy: value => { policy = value; } });
    if (readError) throw Error('Controlled storage read failure');
    return { runs: listSuspendedRuns.mock.calls.length <= emptyReads ? [] : [run] };
  });
  const { streamNativeSession } = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts', {
    '@mastra/ai-sdk': { toAISdkStream: value => value },
    './native-run-observer': { observeConductorRun: async () => ({ output, detach() {} }) },
    './conductor.model-task': { seedConductorModelTask() {} },
  });
  const stream = await streamNativeSession({
    session, agent: { listSuspendedRuns }, threadId: 'thread', resourceId: 'resource', requestContext: new Map(),
    message: { id: 'human', parts: [{ type: 'text', text: 'Controlled task' }] },
    onRunId: async () => {}, onError: () => 'ERROR',
  });
  const reader = stream.getReader();
  source.enqueue({ type: 'data-tool-call-approval', data: {
    runId: 'run', toolCallId: 'call', toolName: 'subagent', args: { ...args }, ...(resumed ? { resumed: true } : {}),
  } });
  source.enqueue({ type: 'sentinel' });
  const parts = [(await reader.read()).value, (await reader.read()).value];
  if (parts.at(-1).type !== 'sentinel') parts.push((await reader.read()).value);
  await reader.cancel();
  return { parts, reads: listSuspendedRuns.mock.calls.length };
}

test('persisted proof tolerates JSON object key order while keeping exact values', async () => {
  const value = await replay({ mutate: run => { run.toolCalls[0].args = { forked: false, task: args.task, agentType: 'writing' }; } });
  expect(value.parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'data-native-input-wait', 'sentinel']);
  expect(value.reads).toBe(1);
});

test('publication before the durable checkpoint commit is reconciled without a Session event', async () => {
  const value = await replay({ emptyReads: 1 });
  expect(value.parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'data-native-input-wait', 'sentinel']);
  expect(value.reads).toBe(2);
});

test.each([
  ['run', run => { run.runId = 'foreign-run'; }],
  ['thread', run => { run.threadId = 'foreign-thread'; }],
  ['resource', run => { run.resourceId = 'foreign-resource'; }],
  ['call', run => { run.toolCalls[0].toolCallId = 'foreign-call'; }],
  ['tool', run => { run.toolCalls[0].toolName = 'another-tool'; }],
  ['arguments', run => { run.toolCalls[0].args = { ...args, task: 'Changed task.' }; }],
  ['suspension phase', run => { run.toolCalls[0].requiresApproval = false; }],
])('a mismatched persisted %s cannot release the live observer', async (_name, mutate) => {
  expect((await replay({ mutate })).parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'sentinel']);
});

test.each(['allow', 'deny'])('current %s policy cannot be shown as a manual wait', async policy => {
  const value = await replay({ policy });
  expect(value.parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'sentinel']);
  expect(value.reads).toBe(0);
});

test('a policy change during the saved-gate read wins before notification', async () => {
  const value = await replay({ duringRead: async ({ setPolicy }) => { setPolicy('deny'); } });
  expect(value.parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'sentinel']);
});

test('unread storage never fabricates a human wait or fails the native owner', async () => {
  expect((await replay({ readError: true })).parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'sentinel']);
});

test('already resumed approval events cannot release a live observer', async () => {
  const value = await replay({ resumed: true });
  expect(value.parts.map(part => part.type)).toEqual(['data-tool-call-approval', 'sentinel']);
  expect(value.reads).toBe(0);
});
