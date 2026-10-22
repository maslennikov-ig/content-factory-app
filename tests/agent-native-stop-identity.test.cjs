'use strict';

const { createNativeStopIdentityFixture } = require('./helpers/agent-native-stop-identity.cjs');

test.each(['queued', 'availability'])('Stop preserves its owned request when cancellation retires the live owner at %s', async retireAt => {
  const fixture = createNativeStopIdentityFixture({ retireAt });
  expect((await fixture.service.activeTurnFor(fixture.identity, fixture.threadId)).requestId).toBe(fixture.requestId);
  await expect(fixture.stop()).resolves.toEqual({ stopped: true, threadId: fixture.threadId, requestId: fixture.requestId });
  expect(fixture.trace).toContain('http-owner-finished');
  expect(await fixture.service.activeTurnFor(fixture.identity, fixture.threadId)).toBeNull();
});

test('a cold native owner returns its server-owned logical request without a local HTTP handle', async () => {
  const fixture = createNativeStopIdentityFixture({ active: false });
  await expect(fixture.stop()).resolves.toEqual({ stopped: true, threadId: fixture.threadId, requestId: fixture.requestId });
});

test.each([null, 3, {}, '', '   '])('an invalid native logical identity %p cannot acknowledge a particular request', async logicalRequestId => {
  const fixture = createNativeStopIdentityFixture({ active: false,
    pointer: { runId: 'native-stopped-run', logicalRequestId, state: 'running' } });
  await expect(fixture.stop()).resolves.toEqual({ stopped: true, threadId: fixture.threadId, requestId: null });
});

test('a live owned request takes precedence over a mismatched saved native pointer', async () => {
  const fixture = createNativeStopIdentityFixture({ retireAt: 'availability',
    pointer: { runId: 'older-native-run', logicalRequestId: 'older-logical-request', state: 'stopped' } });
  await expect(fixture.stop()).resolves.toEqual({ stopped: true, threadId: fixture.threadId, requestId: fixture.requestId });
});

test('a successor registered while Stop awaits cancellation cannot replace the captured request identity', async () => {
  const fixture = createNativeStopIdentityFixture({ retireAt: 'availability', afterRetire: ({ service, identity, threadId, row }) => {
    row.metadata.assistantNativeRun = { runId: 'successor-native-run', logicalRequestId: 'successor-request', state: 'running' };
    service.registerActiveTurn({ identity, threadId, requestId: 'successor-request', onStop: async () => undefined });
  } });
  await expect(fixture.stop()).resolves.toEqual({ stopped: true, threadId: fixture.threadId, requestId: fixture.requestId });
  expect((await fixture.service.activeTurnFor(fixture.identity, fixture.threadId)).requestId).toBe('successor-request');
  expect(fixture.trace).toContainEqual(['availability-cancel', 'native-stopped-run', fixture.threadId]);
});

test('a failed native cancellation does not produce a positive Stop receipt', async () => {
  const error = new Error('Native Stop storage failed.');
  const fixture = createNativeStopIdentityFixture({ cancelError: error });
  await expect(fixture.stop()).rejects.toBe(error);
});

test('Stop checks thread ownership before cancellation or identity fallback', async () => {
  const fixture = createNativeStopIdentityFixture({ active: false, resourceId: 'another-org:another-user' });
  await expect(fixture.stop()).rejects.toMatchObject({ response: { code: 'AGENT_NOT_YOURS' } });
  expect(fixture.trace).toEqual([]);
});

test('no live or native owner cannot invent a stopped request', async () => {
  const fixture = createNativeStopIdentityFixture({ active: false, pointer: null, nativeAborted: false });
  await expect(fixture.stop()).resolves.toEqual({ stopped: false, threadId: fixture.threadId, requestId: null });
});
