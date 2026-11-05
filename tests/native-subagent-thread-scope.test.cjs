'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { MASTRA_SCOPES_KEY, MASTRA_THREAD_ID_KEY, MASTRA_RESOURCE_ID_KEY } = require('@mastra/core/request-context');
const { loadCapabilityModule, requestContextFor } = require('./helpers/agent-capabilities.cjs');
const { buildConductorSubagentTool } = loadCapabilityModule('../conductor/conductor.autonomy.ts');
const capabilityContext = loadCapabilityModule('capability.context.ts');

test.each(['research', 'writing', 'review'])('the %s child drops parent thread identity and retains its authority and parent context', async agentType => {
  const parent = requestContextFor(capabilityContext);
  const scopes = Object.freeze(['org:org-1', 'user:user-1', 'role:EDITOR', 'resource:org-1:user-1', 'thread:parent-thread', 'tag:thread:retained']);
  const policy = Object.freeze({ maxCostUsd: 0.5 });
  const approvals = Object.freeze(['approved-parent-call']);
  const actor = Object.freeze({ id: 'user-1' });
  const controller = { threadId: 'parent-thread', resourceId: 'org-1:user-1' };
  parent.set(MASTRA_SCOPES_KEY, scopes);
  parent.set(MASTRA_THREAD_ID_KEY, 'parent-thread');
  parent.set(MASTRA_RESOURCE_ID_KEY, 'org-1:user-1');
  parent.set('cf.executionPolicy', policy);
  parent.set('cf.approvals', approvals);
  parent.set('cf.paidCalls', 2);
  parent.set('mastra__messageAuthor', actor);
  parent.set('controller', controller);
  let modelContext, childContext;
  const tool = buildConductorSubagentTool({
    subagents: [{ id: agentType, name: agentType, instructions: 'Use the provided context.', tools: {}, forked: false }],
    resolveSubagentModel: async (_identity, _type, context) => { modelContext = context; return {}; },
    createSubagentRunner: () => ({ stream: async (_task, options) => {
      childContext = options.requestContext;
      return { fullStream: (async function* () {})(), getFullOutput: async () => ({ text: 'Controlled specialist result.' }) };
    } }),
  });
  const result = await tool.execute({ agentType, task: 'Inspect the supplied context.', forked: false }, { requestContext: parent });
  expect(result.ok).toBe(true);
  expect(childContext).toBe(modelContext);
  expect(childContext).not.toBe(parent);
  expect(childContext.get(MASTRA_THREAD_ID_KEY)).toBeUndefined();
  expect(childContext.get(MASTRA_SCOPES_KEY)).toEqual(['org:org-1', 'user:user-1', 'role:EDITOR', 'resource:org-1:user-1', 'tag:thread:retained']);
  expect(childContext.get(MASTRA_RESOURCE_ID_KEY)).toBe('org-1:user-1');
  expect(childContext.get('cf.executionPolicy')).toBe(policy);
  expect(childContext.get('cf.approvals')).toBe(approvals);
  expect(childContext.get('cf.paidCalls')).toBe(2);
  expect(childContext.get('mastra__messageAuthor')).toBe(actor);
  expect(childContext.get('controller')).toEqual({ threadId: null, resourceId: '' });
  expect(parent.get(MASTRA_SCOPES_KEY)).toBe(scopes);
  expect(parent.get(MASTRA_THREAD_ID_KEY)).toBe('parent-thread');
  expect(parent.get('controller')).toBe(controller);
  expect(controller.threadId).toBe('parent-thread');
});

test('native YES after genuine process loss completes one child and its owner through either approval path', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/native-subagent-cold-approval.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 40_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({
    scenarios: ['cold-persisted', 'cold-armed', 'warm-owner'].map(timing => ({ timing, ownerOutcome: 'completed',
      writerResult: true, controlledModelCalls: 3, decisions: [true] })),
    externalRequests: 0,
  });
}, 45_000);
