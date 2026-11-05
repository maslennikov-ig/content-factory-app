'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadRegistry, loadCapabilityModule, IDENTITY, servicesFrom } = require('./helpers/agent-capabilities.cjs');
const { nativeSubagentInputSchema, NATIVE_SUBAGENT_TASK_MAX_LENGTH } = loadCapabilityModule('../conductor/native-subagent.input.ts');
const registry = loadRegistry();
const services = servicesFrom({});
const input = () => ({ agentType: 'writing', task: 'Draft three distinct five-second concepts.', prompt: null,
  modelId: 'openai/gpt-6.1-sol', forked: false, _background: null });
const describe = (args, identity = IDENTITY, toolName = 'subagent') =>
  registry.describeApprovalCall(registry.CAPABILITY_CATALOGUE, services, identity, toolName, args);

test.each(['ru', 'en'])('native subagent approval describes the stored role, task and requested model (%s)', async language => {
  const args = input(), before = JSON.stringify(args);
  const summary = await describe(args, { ...IDENTITY, language });
  expect(summary).toContain(args.task);
  expect(summary).toContain(args.modelId);
  expect(summary).toContain(language === 'ru' ? 'Написание' : 'writing');
  expect(JSON.stringify(args)).toBe(before);
  expect(await registry.approvalContentDigest(registry.CAPABILITY_CATALOGUE, services, IDENTITY, 'subagent', args)).toBeNull();
});

test.each(['research', 'writing', 'review'])('a native %s task alias and null optional model retain their honest scope', async agentType => {
  const summary = await describe({ agentType, task: null, prompt: 'Inspect the saved brief.', modelId: null, forked: null });
  expect(summary).toContain('Inspect the saved brief.');
  expect(summary).toContain('настройкам роли');
});

test.each([
  null, [], {}, { agentType: 'other', task: 'Draft.' }, { agentType: 'writing', task: ' ' },
  { agentType: 'writing', task: 'Draft.', forked: true }, { agentType: 'writing', task: 'Draft.', forked: 'false' },
  { agentType: 'writing', task: 'x'.repeat(16001) }, { agentType: 'writing', task: 'Draft.', modelId: 'x'.repeat(101) },
  { agentType: 'writing', task: 'Draft.', modelId: '' }, { agentType: 'writing', task: 42 },
])('malformed or unsupported native subagent input is refused: %#', async args => {
  expect(await describe(args)).toBeNull();
});

test('bounded native summaries retain role and requested model before a long sanitized task', async () => {
  const summary = await describe({ ...input(), task: 'Draft\nthree concepts.\u0000 ' + 'Long context. '.repeat(200) });
  expect(summary.length).toBeLessThanOrEqual(700);
  expect(summary).toContain('Написание');
  expect(summary).toContain(input().modelId);
  expect(summary).not.toMatch(/[\n\u0000]/);
});

test.each(['task', 'prompt'].flatMap(field => [8001, 10321, 16000].map(length => [field, length])))
('%s accepts a complete %i-unit review in both execution and bounded approval description', async (field, length) => {
  expect(NATIVE_SUBAGENT_TASK_MAX_LENGTH).toBe(16000);
  const args = { agentType: 'review', modelId: 'openai/gpt-6.1-terra', forked: false, [field]: 'Review. '.repeat(2000).slice(0, length - 1) + 'Z' };
  const raw = JSON.stringify(args);
  expect(args[field].length).toBe(length);
  expect(nativeSubagentInputSchema.safeParse(args).success).toBe(true);
  const summary = await describe(args);
  expect(summary).not.toBeNull();
  expect(summary.length).toBeLessThanOrEqual(700);
  expect(summary).toContain('Проверка');
  expect(summary).toContain(args.modelId);
  expect(JSON.stringify(args)).toBe(raw);
  expect(nativeSubagentInputSchema.safeParse({ ...args, [field]: args[field] + 'x'.repeat(16001 - length) }).success).toBe(false);
});

test('the finite task and alias cap counts UTF-16 units consistently', async () => {
  for (const field of ['task', 'prompt']) {
    const args = { agentType: 'review', [field]: '😀'.repeat(8000) };
    expect(args[field].length).toBe(16000);
    expect(nativeSubagentInputSchema.safeParse(args).success).toBe(true);
    expect(await describe({ ...args, [field]: args[field] + 'x' })).toBeNull();
  }
});

test('unknown tools and an unauthorized writing role remain refused', async () => {
  expect(await describe(input(), IDENTITY, 'unregistered_tool')).toBeNull();
  expect(await describe(input(), { ...IDENTITY, role: 'USER' })).toBeNull();
  expect(await describe({ agentType: 'research', task: 'Inspect the saved brief.' }, { ...IDENTITY, role: 'USER' })).not.toBeNull();
});

test('the actual pending native Yes executes once while forged and repeated targets stay refused', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/native-subagent-approval.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 35_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({ approvedOnce: true, forgedTargetRefused: true,
    repeatedTargetRefused: true, savedArgsUnchanged: true, childCalls: 1, controlledModelCalls: 3, externalRequests: 0 });
}, 40_000);

test('a genuine native Yes delivers the complete 16000-unit review task once without replacing its arguments', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/native-subagent-approval.probe.cjs'), 'long-review'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 35_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({ approvedOnce: true, forgedTargetRefused: true,
    repeatedTargetRefused: true, savedArgsUnchanged: true, childCalls: 1, controlledModelCalls: 3, externalRequests: 0,
    taskUtf16Units: 16000, role: 'review', fullTaskDelivered: true });
}, 40_000);
