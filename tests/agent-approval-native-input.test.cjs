'use strict';

const { validateToolInput } = require('@mastra/core/tools');
const { toStandardSchema } = require('@mastra/core/schema');
const {
  IDENTITY, loadRegistry, permissionsService, requestContextFor, servicesFrom,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const capability = registry.CAPABILITY_CATALOGUE.find(entry => entry.id === 'campaign.grant');
const toolName = registry.toolNameOf(capability.id);
const services = servicesFrom({});
// Same native shape as a saved approval: optional model fields are explicit nulls.
// All identifiers and dates here are synthetic.
const input = () => ({
  requestId: 'grant-request', campaignId: 'campaign-owned', channelIds: ['draft-owned'],
  actions: ['prepare', 'editorial_decide'], mode: 'autopilot',
  expiresAt: '2099-01-02T12:00:00.000Z', budget: null,
  formats: ['carousel', 'reel'], timeZone: 'Europe/Moscow', postingWindows: null,
  exclusions: ['No account connection, paid media, scheduling or publishing.'],
  providerBudget: null, platformConsentIds: [],
});
const validate = args => validateToolInput(toStandardSchema(capability.input), args);
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const digest = args => registry.approvalContentDigest([capability], services, IDENTITY, toolName, args);
const describe = args => registry.describeApprovalCall([capability], services, IDENTITY, toolName, args);

test('a saved native grant with optional nulls has its exact approval summary and normalized content digest', async () => {
  const raw = freeze(input()), before = JSON.stringify(raw);
  const rawPrint = registry.approvalFingerprint(toolName, raw);
  expect(capability.input.safeParse(raw).success).toBe(false);
  const normalized = validate(raw);
  expect(normalized.error).toBeUndefined();
  expect(normalized.data).not.toHaveProperty('budget');
  expect(normalized.data).not.toHaveProperty('postingWindows');
  expect(normalized.data).not.toHaveProperty('providerBudget');
  expect(await describe(raw)).toBe('Разрешить только подготовку материалов, редакторские решения для выбранных каналов (1) до 2099-01-02T12:00:00.000Z');
  expect(await digest(raw)).toBe(await digest(normalized.data));
  expect(await digest(raw)).toBe(registry.approvalFingerprint(`content:${toolName}`, { content: normalized.data }));
  expect(JSON.stringify(raw)).toBe(before);
  expect(registry.approvalFingerprint(toolName, raw)).toBe(rawPrint);
  expect(rawPrint).not.toBe(registry.approvalFingerprint(toolName, normalized.data));
});

const actionLabels = {
  prepare: { ru: 'подготовку материалов', en: 'material preparation' },
  editorial_decide: { ru: 'редакторские решения', en: 'editorial decisions' },
  schedule: { ru: 'планирование публикаций', en: 'publication scheduling' },
  publish: { ru: 'публикацию материалов', en: 'publishing materials' },
  generate_paid: { ru: 'платное создание материалов', en: 'paid material creation' },
};

test('approval action labels cover the entire allowed schema enum', () => {
  expect(Object.keys(actionLabels).sort()).toEqual([...capability.input.shape.actions.element.options].sort());
});

test.each(Object.entries(actionLabels))('%s is named plainly in both approval languages, with channel count and expiry', async (action, labels) => {
  const raw = input();
  for (const language of ['ru', 'en']) {
    const line = await registry.describeApprovalCall([capability], services, { ...IDENTITY, language }, toolName, { ...raw, actions: [action] });
    expect(line).toBe(language === 'ru'
      ? `Разрешить только ${labels.ru} для выбранных каналов (1) до ${raw.expiresAt}`
      : `Allow only ${labels.en} for selected channels (1) until ${raw.expiresAt}`);
  }
});

test('the combined approval names every requested action within its real count and expiry', async () => {
  const raw = { ...input(), actions: Object.keys(actionLabels), channelIds: ['first-owned', 'second-owned', 'third-owned'] };
  for (const language of ['ru', 'en']) {
    const line = await registry.describeApprovalCall([capability], services, { ...IDENTITY, language }, toolName, raw);
    for (const label of Object.values(actionLabels)) expect(line).toContain(label[language]);
    expect(line).toContain('(3)');
    expect(line).toContain(raw.expiresAt);
  }
});

test('a serialized object stays invalid when the native validator requires an object', async () => {
  const raw = JSON.stringify(input());
  expect(validate(raw).error).toBeDefined();
  expect(await describe(raw)).toBeNull();
  expect(await digest(raw)).toBe(registry.approvalFingerprint(`content:${toolName}`, { content: null }));
  expect(registry.approvalFingerprint(toolName, raw)).not.toBe(registry.approvalFingerprint(toolName, input()));
});

test.each([
  ['required channels', { channelIds: null }],
  ['required actions', { actions: null }],
  ['required mode', { mode: null }],
  ['required expiry', { expiresAt: null }],
  ['unknown field', { extra: 'unapproved' }],
  ['tenant injection', { organizationId: 'foreign' }],
  ['actor injection', { actorId: 'foreign' }],
  ['authority injection', { authority: 'user' }],
  ['unknown budget field', { budget: { currency: 'USD', maximum: 0, unlimited: true } }],
  ['invalid action', { actions: ['anything'] }],
])('%s stays invalid before either approval callback', async (_name, extra) => {
  const raw = freeze({ ...input(), ...extra }), before = JSON.stringify(raw);
  const callbacks = { ...capability, describeApproval: jest.fn(), approvalContent: jest.fn() };
  expect(validate(raw).error).toBeDefined();
  expect(await registry.describeApprovalCall([callbacks], services, IDENTITY, toolName, raw)).toBeNull();
  expect(await registry.approvalContentDigest([callbacks], services, IDENTITY, toolName, raw))
    .toBe(registry.approvalFingerprint(`content:${toolName}`, { content: null }));
  expect(callbacks.describeApproval).not.toHaveBeenCalled();
  expect(callbacks.approvalContent).not.toHaveBeenCalled();
  expect(JSON.stringify(raw)).toBe(before);
});

const hookCall = (args, requestContext) => ({ toolName, input: args, context: { requestContext, toolCallId: 'grant-call' } });
const grantShown = async (context, raw, approvedArgs = raw) => {
  registry.grantApproval(context, registry.approvalFingerprint(toolName, approvedArgs));
  registry.grantApproval(context, registry.approvalContentFingerprint(toolName, approvedArgs, await digest(raw)));
};

test('normalizing a preview grants no authority: only the exact raw approved call passes the real permission gate', async () => {
  const raw = freeze(input());
  const hooks = registry.createCapabilityHooks([capability], new registry.DoorPolicyGate(permissionsService()), services);
  const exact = requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' });
  await grantShown(exact, raw);
  await expect(hooks.beforeToolCall(hookCall(raw, exact))).resolves.toBeUndefined();
  const missing = await hooks.beforeToolCall(hookCall(raw, requestContextFor(registry)));
  expect(missing.output.code).toBe('APPROVAL_MISMATCH');
  const normalized = requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' });
  await grantShown(normalized, raw, validate(raw).data);
  expect((await hooks.beforeToolCall(hookCall(raw, normalized))).output.code).toBe('APPROVAL_MISMATCH');
  const reader = requestContextFor(registry, { ...IDENTITY, role: 'USER' });
  await grantShown(reader, raw);
  expect((await hooks.beforeToolCall(hookCall(raw, reader))).output.code).toBe('PERMISSION_DENIED');
});

test('changing action, budget or exclusions after preview cannot reuse its content binding', async () => {
  const raw = input(), shown = await digest(raw);
  const hooks = registry.createCapabilityHooks([capability], new registry.DoorPolicyGate(permissionsService()), services);
  for (const extra of [
    { actions: [...raw.actions, 'publish'] },
    { budget: { currency: 'USD', maximum: 1 } },
    { exclusions: [] },
  ]) {
    const changed = { ...raw, ...extra }, context = requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' });
    expect(await digest(changed)).not.toBe(shown);
    registry.grantApproval(context, registry.approvalFingerprint(toolName, changed));
    registry.grantApproval(context, registry.approvalContentFingerprint(toolName, changed, shown));
    expect((await hooks.beforeToolCall(hookCall(changed, context))).output.code).toBe('APPROVAL_CONTENT_CHANGED');
  }
});
