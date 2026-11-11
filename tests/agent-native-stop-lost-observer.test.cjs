'use strict';
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');
const {runProbeProcess} = require('./helpers/native-probe-process.cjs');

test.each(['0', '1'])('Stop settles an exact native orphan and drains tracked work (%s)', tracked => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-stop-lost-observer.probe.cjs')], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 20_000,
    env: {...process.env, CF_NATIVE_LOST_OBSERVER_TRACKED: tracked},
  });
  expect(JSON.parse(output.split('\n').find(line => line.startsWith('{"schema":"native-stop-lost-observer/1"')))).toMatchObject({interrupted: true,
    replayRemovedBySdk: true, responseWasNeverAnnounced: true, savedMessagesPreserved: true,
    sameChatContinuation: true, nativeProviderCalls: 2, paidCalls: 0});
}, 25_000);

test.each(['0', '1'])('a retained native registry and stopped scope drain the actual mutation, failure=%s', failed => {
  const output = runProbeProcess(path.join(__dirname, 'helpers/agent-native-stop-lost-observer.probe.cjs'), [], {
    timeout: 30_000, env: {CF_NATIVE_LOST_OBSERVER_RETAINED: '1', CF_NATIVE_LOST_OBSERVER_SCOPE_FAIL: failed},
  });
  const schema = failed === '1' ? 'native-stop-retained-failed-scope/1' : 'native-stop-lost-observer/1';
  const result = JSON.parse(output.split('\n').find(line => line.startsWith(`{"schema":"${schema}"`)));
  expect(result).toMatchObject(failed === '1' ? {outcome: 'failed', stopRejected: true, pendingWorkDrained: true,
    savedMessagesPreserved: true, paidCalls: 0} : {interrupted: true, retainedRegistryAndStoppedScope: true,
    savedMessagesPreserved: true, sameChatContinuation: true, paidCalls: 0});
}, 35_000);

test('a settled SDK fence, rather than a released lease alone, retires a retained registry entry', async () => {
  const {nativeLocalExecutionSettled} = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-stop.ts', {});
  let release;
  const entry = {executionFence: {runId: 'native-run', executionId: 'exact-owner', generation: 3,
    whenSettled: new Promise(resolve => {release = resolve;})}};
  const owner = {ownerId: 'exact-owner', generation: 3, live: false};
  expect(await nativeLocalExecutionSettled(entry, 'native-run', owner)).toBe(false);
  release();
  expect(await nativeLocalExecutionSettled(entry, 'native-run', owner)).toBe(true);
  expect(await nativeLocalExecutionSettled(entry, 'native-run', {...owner, live: true})).toBe(false);
  expect(await nativeLocalExecutionSettled(entry, 'native-run', {...owner, generation: 4})).toBe(false);
  expect(await nativeLocalExecutionSettled(entry, 'native-run', {...owner, ownerId: 'successor'})).toBe(false);
  expect(await nativeLocalExecutionSettled({executionFence: {...entry.executionFence, whenSettled: undefined}}, 'native-run', owner)).toBe(false);
  expect(await nativeLocalExecutionSettled({executionFence: {...entry.executionFence, executionId: ''}}, 'native-run', owner)).toBe(false);
  expect(await nativeLocalExecutionSettled(entry, 'native-run', {...owner, ownerId: ''})).toBe(false);
});

test('a failed ownership read keeps the original native tail attached', async () => {
  const {readNativeStopTail} = loadWithMocks('libraries/nestjs-libraries/src/chat/conductor/native-session-stream.ts', {
    '@mastra/ai-sdk': {}, './native-run-observer': {}, './conductor.model-task': {},
  });
  let source, inspected, cancelled = false;
  const ownershipRead = new Promise(resolve => {inspected = resolve;});
  const reader = new ReadableStream({start(controller) {source = controller;}, cancel() {cancelled = true;}}).getReader();
  const abort = new AbortController();
  abort.abort();
  const next = readNativeStopTail(reader, abort.signal, async () => {
    inspected();
    throw new Error('Controlled ownership store outage.');
  });
  await ownershipRead;
  expect(cancelled).toBe(false);
  source.enqueue({type: 'finish', finishReason: 'abort'});
  await expect(next).resolves.toEqual({done: false, value: {type: 'finish', finishReason: 'abort'}});
  source.close();
  await reader.cancel();
});
