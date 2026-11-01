'use strict';
const { loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');
const { protectPersistedApprovals } = loadCapabilityModule('../conductor/native-session-permissions.ts');

const address = { threadId: 'thread', resourceId: 'org:user' };
const call = (runId, toolCallId, toolName) => ({ runId, toolCalls: [{ toolCallId, toolName, requiresApproval: true }] });
const fixture = (runs) => {
  const armed = new Set();
  const policies = new Map();
  let listener;
  const session = {
    thread: { getId: () => 'thread' },
    resolveToolApproval: (name) => policies.get(name) ?? (name === 'denied' ? 'deny' : 'allow'),
    approval: { isArmed: ({ runId, toolCallId }) => armed.has(`${runId}:${toolCallId}`) },
    subscribe: (callback) => { listener = callback; return () => {}; },
  };
  const agent = { listSuspendedRuns: jest.fn(async () => ({ runs, total: runs.length })) };
  return { session, agent, setPolicy: (name, policy) => policies.set(name, policy), arm(runId, toolCallId) {
    armed.add(`${runId}:${toolCallId}`);
    listener({ type: 'tool_approval_required', threadId: address.threadId, toolCallId });
  } };
};

test('only saved approval calls temporarily ask; future and unrelated tools use their current policy', async () => {
  const f = fixture([call('r1', 'c1', 'memory'), call('r2', 'c1', 'memory'), call('r3', 'c3', 'denied'),
    { runId: 'r4', toolCalls: [{ toolCallId: 'q1', toolName: 'question', requiresApproval: false }] }]);
  await protectPersistedApprovals(f.session, f.agent, address);
  expect(f.agent.listSuspendedRuns).toHaveBeenCalledWith(address);
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('ask');
  expect(f.session.resolveToolApproval('memory', 'other')).toBe('allow');
  expect(f.session.resolveToolApproval('question', 'thread')).toBe('allow');
  f.arm('r1', 'c1');
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('ask');
  f.arm('r2', 'c1');
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('allow');
  expect(f.session.resolveToolApproval('denied', 'thread')).toBe('deny');
});

test('a denied old call that no longer exists does not block a later allowed call', async () => {
  const f = fixture([call('old-run', 'old-call', 'denied')]);
  await protectPersistedApprovals(f.session, f.agent, address);
  expect(f.session.resolveToolApproval('denied', 'thread')).toBe('deny');
  f.agent.listSuspendedRuns.mockResolvedValue({ runs: [], total: 0 });
  await protectPersistedApprovals(f.session, f.agent, address);
  f.setPolicy('denied', 'allow');
  expect(f.session.resolveToolApproval('denied', 'thread')).toBe('allow');
});

test('a reused session fences only the owning thread, even without an explicit thread argument', async () => {
  const f = fixture([call('r1', 'c1', 'memory')]);
  await protectPersistedApprovals(f.session, f.agent, address);
  const other = { threadId: 'other', resourceId: 'org:user' };
  f.agent.listSuspendedRuns.mockResolvedValue({ runs: [call('r2', 'c2', 'other-tool')], total: 1 });
  await protectPersistedApprovals(f.session, f.agent, other);
  expect(f.session.resolveToolApproval('memory')).toBe('ask');
  expect(f.session.resolveToolApproval('memory', 'other')).toBe('allow');
  expect(f.session.resolveToolApproval('other-tool', 'thread')).toBe('allow');
  expect(f.session.resolveToolApproval('other-tool', 'other')).toBe('ask');
  f.agent.listSuspendedRuns.mockResolvedValue({ runs: [], total: 0 });
  await protectPersistedApprovals(f.session, f.agent, other);
  expect(f.session.resolveToolApproval('other-tool', 'other')).toBe('allow');
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('ask');
});

test('an approval after 100 other runs remains fenced', async () => {
  const questions = Array.from({ length: 100 }, (_, i) => ({ runId: `q${i}`,
    toolCalls: [{ toolCallId: `q${i}`, toolName: 'question', requiresApproval: false }] }));
  const f = fixture([...questions, call('late-run', 'late-call', 'memory')]);
  await protectPersistedApprovals(f.session, f.agent, address);
  expect(f.agent.listSuspendedRuns).toHaveBeenCalledWith(address);
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('ask');
  f.arm('late-run', 'late-call');
  expect(f.session.resolveToolApproval('memory', 'thread')).toBe('allow');
});

test('unaddressed approvals and unavailable snapshots fail closed before binding', async () => {
  const invalid = fixture([{ runId: 'r1', toolCalls: [{ requiresApproval: true, toolName: 'memory' }] }]);
  await expect(protectPersistedApprovals(invalid.session, invalid.agent, address)).rejects.toThrow('missing its address');
  const unavailable = fixture([]);
  unavailable.agent.listSuspendedRuns.mockRejectedValue(new Error('storage unavailable'));
  await expect(protectPersistedApprovals(unavailable.session, unavailable.agent, address)).rejects.toThrow('storage unavailable');
});
