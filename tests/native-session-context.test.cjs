'use strict';
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');
const { restoreNativeRunContext, configureNativeSessionContext } = loadCapabilityModule('../conductor/native-session-context.ts');
const { buildConductorContext } = loadCapabilityModule('../conductor/conductor.context.ts');
const identity = { organizationId: 'context-org', userId: 'context-user', role: 'ADMIN', organizationCreatedAt: '2026-01-01T00:00:00Z', language: 'ru' };
const address = { resourceId: 'context-org:context-user', threadId: 'context-thread', runId: 'context-run' };
function fixture() {
  const values = Object.fromEntries(buildConductorContext({ identity, threadId: address.threadId, requestId: 'original-owner' }).entries());
  Object.assign(values, { 'cf.paidCalls': 7, 'cf.approvals': 'saved-fingerprint', 'cf.queuedInputChildRunId': 'saved-child', controller: { state: { yolo: true } }, MastraMemory: { serialized: true }, mastra__durableExecutions: { stale: 'claim' }, 'cf.nativeTextModels': [{ serialized: true }] });
  const thread = { id: address.threadId, resourceId: address.resourceId };
  const rows = new Map([[address.runId, { snapshot: { status: 'suspended', requestContext: values } }]]);
  const currentIdentity = jest.fn(async original => ({ ...original, role: 'USER' }));
  const storage = { getStore: async name => name === 'memory' ? { getThreadById: async ({ threadId }) => threadId === address.threadId ? thread : null } : { getWorkflowRunById: async ({ runId }) => rows.get(runId) } };
  return { values, thread, rows, currentIdentity, storage, restore: input => restoreNativeRunContext(storage, input ?? address, currentIdentity) };
}
test('restores exact app owner/consent/counters and refreshes role/scopes without reusing SDK objects', async () => {
  const f = fixture();
  f.values['cf.role'] = 'EDITOR'; // Stored native scopes still name the earlier ADMIN role.
  const result = await f.restore();
  expect(result.get('cf.requestId')).toBe('original-owner');
  expect(result.get('cf.paidCalls')).toBe(7);
  expect(result.get('cf.queuedInputChildRunId')).toBe('saved-child');
  expect(result.get('cf.approvals')).toBe('saved-fingerprint');
  expect(result.get('cf.role')).toBe('USER');
  expect(result.get('mastra__scopes')).not.toContain('role:USER');
  expect(result.get('mastra__scopes')).not.toContain('role:ADMIN');
  expect(result.get('mastra__scopes').every(scope => f.values.mastra__scopes.includes(scope))).toBe(true);
  for (const key of ['controller','MastraMemory','mastra__durableExecutions','cf.nativeTextModels']) expect(result.get(key)).toBeUndefined();
  expect(f.currentIdentity).toHaveBeenCalledTimes(1);
});
test.each(['resource','thread','missing-run','settled-run','row-resource','snapshot-thread','snapshot-user','snapshot-author','invalid-schema','missing-owner','revoked','changed-user'])('fails closed for %s', async kind => {
  const f = fixture();let input = address;
  if (kind === 'resource') input = { ...address, resourceId: 'foreign:actor' };
  if (kind === 'thread') input = { ...address, threadId: 'foreign-thread' };
  if (kind === 'missing-run') input = { ...address, runId: 'unknown-run' };
  if (kind === 'settled-run') f.rows.get(address.runId).snapshot.status = 'success';
  if (kind === 'row-resource') f.rows.get(address.runId).resourceId = 'foreign:actor';
  if (kind === 'snapshot-thread') f.values.mastra__threadId = 'other-thread';
  if (kind === 'snapshot-user') f.values['cf.userId'] = 'other-user';
  if (kind === 'snapshot-author') f.values.mastra__messageAuthor = { id: 'another-user' };
  if (kind === 'invalid-schema') delete f.values['cf.timeZone'];
  if (kind === 'missing-owner') delete f.values['cf.requestId'];
  if (kind === 'revoked') f.currentIdentity.mockRejectedValue(new Error('Access revoked'));
  if (kind === 'changed-user') f.currentIdentity.mockResolvedValue({ ...identity, userId: 'other-user' });
  await expect(f.restore(input)).rejects.toThrow();
});
test('restores only an omitted native execution context on this exact session scope', async () => {
  const f = fixture(), buildRequestContext = jest.fn(async context => context), restore = jest.fn(f.restore);
  const session = { machinery: { buildRequestContext }, identity: { getResourceId: () => address.resourceId }, getThreadScope: () => ({ assistantThreadId: address.threadId }), setMachinery(value) { this.machinery = value; } };
  configureNativeSessionContext(session, restore);
  const supplied = buildConductorContext({ identity, threadId: address.threadId });
  expect(await session.machinery.buildRequestContext(supplied, { ...address, execution: true })).toBe(supplied);
  expect(restore).not.toHaveBeenCalled();
  await session.machinery.buildRequestContext(undefined);
  expect(restore).not.toHaveBeenCalled();
  const recovered = await session.machinery.buildRequestContext(undefined, { ...address, execution: true });
  expect(recovered.get('cf.requestId')).toBe('original-owner');
  for (const other of [{ ...address, threadId: 'other-thread' }, { ...address, resourceId: 'other:actor' }]) await expect(session.machinery.buildRequestContext(undefined, { ...other, execution: true })).rejects.toThrow();
  expect(restore).toHaveBeenCalledTimes(1);
});

test('native resumed context retains the writing choice captured by that run', async () => {
  const f = fixture();
  const captured = { selection: { channelId: 'channel-before', avatarId: 'avatar-before' },
    brandProfileSelection: { mode: 'version', versionId: 'version-before' } };
  f.values['cf.writingSelection'] = JSON.stringify(captured);
  const recovered = await f.restore(address);
  expect(JSON.parse(recovered.get('cf.writingSelection'))).toEqual(captured);
});

test('queued input snapshots writing choices and rejects malformed selection or foreign authors', () => {
  const { queuedInputSchema } = loadCapabilityModule('../conductor/native-queued-input.ts');
  const queued = { identity: { ...identity, timeZone: 'Europe/Moscow' }, threadId: address.threadId,
    resourceId: address.resourceId, requestId: 'request', childRunId: 'child',
    writingSelection: { channelId: 'channel-before', avatarId: 'avatar-before' },
    signal: { id: 'message', contents: 'Original text', createdAt: '2026-11-01T00:00:00.000Z', author: { id: identity.userId } } };
  const snapshot = JSON.parse(JSON.stringify(queuedInputSchema.parse(queued)));
  queued.writingSelection.avatarId = 'avatar-after';
  expect(queuedInputSchema.parse(snapshot).writingSelection).toEqual({ channelId: 'channel-before', avatarId: 'avatar-before' });
  expect(() => queuedInputSchema.parse({ ...snapshot, writingSelection: { avatarId: '../foreign' } })).toThrow();
  expect(queuedInputSchema.safeParse({ ...snapshot, signal: { ...snapshot.signal, author: { id: 'other' } } }).success).toBe(false);
  delete snapshot.writingSelection;
  expect(queuedInputSchema.parse(snapshot).writingSelection).toBeUndefined();
});
