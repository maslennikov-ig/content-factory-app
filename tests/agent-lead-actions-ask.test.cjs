'use strict';

/**
 * `content-factory-next-kcxz.45` (review W4-23 F7, two review rounds of the
 * word rule): in the web chat `ideas.archive`, `ideas.dismiss` and
 * `ideas.take` always wait for «Да» on an approval card that names what they
 * act on, read by id; the hooks hold the same rule, bound to the call's
 * arguments. Over MCP they stay plain `write`. «Не надо» takes a batch, so one
 * card covers «отклони все про футбол».
 *
 * The recorded scenarios `idea-injected-lead-no-card`, `idea-dismiss-asked`,
 * `idea-take-card-approved`, `idea-panel-take-injected-title` prove it end to end.
 */

const { IDENTITY, loadRegistry, requestContextFor, servicesFrom } = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const find = (id) => catalogue.find((capability) => capability.id === id);
const ASKING = ['ideas.archive', 'ideas.dismiss', 'ideas.take'];

/** Leads and subscriptions as `ContentLeadService` answers, with what was declined. */
const leadsFake = (extra = {}) => {
  const rows = {
    'lead-1': { id: 'lead-1', title: 'Футбол', status: 'NEW' },
    'lead-2': { id: 'lead-2', title: 'Хоккей: итоги тура', status: 'NEW' },
    'lead-3': { id: 'lead-3', title: 'Теннис', status: 'ACCEPTED' },
    'lead-4': { id: 'lead-4', title: 'Шахматы', status: 'DISMISSED' },
    ...extra,
  };
  const batches = [];
  return {
    batches,
    getLead: async (org, id) => {
      if (org !== 'org-1' || !rows[id]) throw Object.assign(new Error('x'), { code: 'LEAD_NOT_FOUND' });
      return { ...rows[id], sourceUrl: `https://vc.ru/${id}` };
    },
    dismissLeads: async (_org, ids) => {
      batches.push(ids);
      return {
        dismissed: ids.filter((id) => rows[id].status === 'NEW'),
        alreadyDismissed: ids.filter((id) => rows[id].status === 'DISMISSED'),
      };
    },
    listSubscriptions: async () => ({
      subscriptions: [{ id: 'sub-1', kind: 'RSS', displayName: 'vc.ru', canonicalUrl: 'https://vc.ru/rss' }],
      capabilities: { feedCheck: true, topicCheck: true },
    }),
  };
};

describe('always a card in the web chat, never one of ours over MCP', () => {
  const tools = registry.buildMastraCapabilityTools(catalogue, { services: servicesFrom({}), language: 'ru' });

  test('the three ask, as `confirm` does; feed add and check do not (decided for the owner)', () => {
    expect(catalogue.filter((one) => one.asksInWebChat).map((one) => one.id)).toEqual(ASKING);
    for (const id of ASKING) expect(tools[registry.toolNameOf(id)].requireApproval).toBe(true);
    expect(tools.ideas_feed_add.requireApproval).toBe(false);
    expect(tools.ideas_check.requireApproval).toBe(false);
  });

  test('over MCP no approval of ours, and admission needs none', async () => {
    const gate = { check: async () => ({ allowed: true, policies: [] }) };
    const inputs = { 'ideas.archive': { subscriptionId: 'sub-1' }, 'ideas.dismiss': { leadIds: ['lead-1'] }, 'ideas.take': { leadId: 'lead-1' } };
    for (const id of ASKING) {
      const mcp = registry.buildCapabilityTool(find(id), { services: servicesFrom({}), language: 'ru', entrance: 'mcp', gate });
      expect(mcp.requireApproval).toBe(false);
      await expect(
        registry.admitCapabilityCall(find(id), inputs[id], requestContextFor(registry), gate, { countPaid: false })
      ).resolves.toBeNull();
    }
  });
});

describe('the hooks: «Да» bound to exactly that call', () => {
  const gate = () => ({
    calls: 0,
    async check() {
      this.calls += 1;
      return { allowed: true, policies: [] };
    },
  });
  const call = (id, input, requestContext) => ({
    toolName: registry.toolNameOf(id),
    input,
    context: { requestContext, toolCallId: 'call-1' },
  });

  test('without «Да»: declined before the door is asked, nothing runs', async () => {
    const policy = gate();
    const hooks = registry.createCapabilityHooks(catalogue, policy);
    for (const [id, input] of [
      ['ideas.dismiss', { leadIds: ['lead-1'] }],
      ['ideas.archive', { subscriptionId: 'sub-1' }],
      ['ideas.take', { leadId: 'lead-1' }],
    ]) {
      const result = await hooks.beforeToolCall(call(id, input, requestContextFor(registry)));
      expect(result).toEqual({ proceed: false, output: expect.objectContaining({ ok: false, code: 'APPROVAL_MISMATCH' }) });
    }
    expect(policy.calls).toBe(0);
  });

  test('«Да» runs that call once; another batch or another lead is declined', async () => {
    const hooks = registry.createCapabilityHooks(catalogue, gate());
    const context = requestContextFor(registry);
    registry.grantApproval(context, registry.approvalFingerprint('ideas_dismiss', { leadIds: ['lead-1', 'lead-2'] }));
    const wider = await hooks.beforeToolCall(call('ideas.dismiss', { leadIds: ['lead-1', 'lead-2', 'lead-3'] }, context));
    expect(wider.output.code).toBe('APPROVAL_MISMATCH');
    const approved = call('ideas.dismiss', { leadIds: ['lead-1', 'lead-2'] }, context);
    await expect(hooks.beforeToolCall(approved)).resolves.toBeUndefined();
    await hooks.afterToolCall({ ...approved, output: { ok: true } });
    expect((await hooks.beforeToolCall(approved)).output.code).toBe('APPROVAL_MISMATCH');
  });
});

describe('«Не надо» for a batch', () => {
  const schema = find('ideas.dismiss').input;
  const run = (fake, leadIds) =>
    find('ideas.dismiss').run({ ...IDENTITY, service: servicesFrom({ ContentLeadService: fake }) }, { leadIds });

  test('one to ten ids, each once', () => {
    expect(schema.safeParse({ leadIds: ['lead-1'] }).success).toBe(true);
    expect(schema.safeParse({ leadIds: Array.from({ length: 10 }, (_, i) => `lead-${i}`) }).success).toBe(true);
    expect(schema.safeParse({ leadIds: Array.from({ length: 11 }, (_, i) => `lead-${i}`) }).success).toBe(false);
    expect(schema.safeParse({ leadIds: [] }).success).toBe(false);
    expect(schema.safeParse({ leadIds: ['lead-1', 'lead-1'] }).success).toBe(false);
    expect(schema.safeParse({ leadId: 'lead-1' }).success).toBe(false);
  });

  test('one call to the repository’s batch; already-declined leads reported, not failed', async () => {
    const fake = leadsFake();
    const output = await run(fake, ['lead-1', 'lead-4', 'lead-2']);
    expect(fake.batches).toEqual([['lead-1', 'lead-4', 'lead-2']]);
    expect(output).toEqual({
      count: 2,
      dismissed: [
        { leadId: 'lead-1', title: 'Футбол' },
        { leadId: 'lead-2', title: 'Хоккей: итоги тура' },
      ],
      alreadyDismissed: [{ leadId: 'lead-4', title: 'Шахматы' }],
    });
  });
});

describe('the card names what is acted on, read by id', () => {
  const services = servicesFrom({ ContentLeadService: leadsFake() });
  const words = (tool, args, identity = IDENTITY) => registry.describeApprovalCall(catalogue, services, identity, tool, args);

  test('one lead, a batch, a subscription, a take; both languages; an unknown id falls back to the label', async () => {
    expect(await words('ideas_dismiss', { leadIds: ['lead-1'] })).toBe(
      '«Не надо» для повода «Футбол»: он уйдёт из очереди и не вернётся из той же подписки'
    );
    expect(await words('ideas_dismiss', { leadIds: ['lead-1', 'lead-2'] })).toBe(
      '«Не надо» для 2 поводов — уйдут из очереди и не вернутся из тех же подписок: «Футбол», «Хоккей: итоги тура»'
    );
    expect(await words('ideas_dismiss', { leadIds: ['lead-1', 'lead-2'] }, { ...IDENTITY, language: 'en' })).toMatch(
      /^“Not this one” for 2 leads .*: “Футбол”, “Хоккей: итоги тура”$/
    );
    expect(await words('ideas_archive', { subscriptionId: 'sub-1' })).toMatch(/^Отписаться от ленты «vc\.ru»/);
    expect(await words('ideas_take', { leadId: 'lead-1' })).toMatch(/^Взять в работу повод «Футбол»/);
    expect(await words('ideas_dismiss', { leadIds: ['lead-9'] })).toBe('Не надо');
    expect(await words('ideas_feed_add', { url: 'https://vc.ru/rss' })).toBeNull();
  });

  test('only leads that will change are promised; the others are said as they are', async () => {
    expect(await words('ideas_dismiss', { leadIds: ['lead-1', 'lead-4'] })).toBe(
      '«Не надо» для повода «Футбол»: он уйдёт из очереди и не вернётся из той же подписки. Уже отклонены, не изменятся: «Шахматы»'
    );
    expect(await words('ideas_dismiss', { leadIds: ['lead-4'] })).toBe('Уже отклонены, не изменятся: «Шахматы»');
    expect(await words('ideas_dismiss', { leadIds: ['lead-1', 'lead-3'] })).toBe(
      '«Не надо» не сработает: уже взяты в работу «Теннис» — ничего не изменится'
    );
  });

  test('a batch of ten long titles: every one is on the card, each title cut, within the card’s limit', async () => {
    const ten = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `l${i}`,
        { id: `l${i}`, title: `Повод номер ${i}: очень длинный заголовок, который не помещается целиком никак`, status: 'NEW' },
      ])
    );
    const line = await registry.describeApprovalCall(
      catalogue,
      servicesFrom({ ContentLeadService: leadsFake(ten) }),
      IDENTITY,
      'ideas_dismiss',
      { leadIds: Object.keys(ten) }
    );
    expect(line).toMatch(/^«Не надо» для 10 поводов/);
    for (let i = 0; i < 10; i += 1) expect(line).toContain(`«Повод номер ${i}: `);
    expect(line).not.toMatch(/и ещё/);
    expect(line.endsWith('»')).toBe(true);
    expect(line.length).toBeLessThanOrEqual(registry.AGENT_APPROVAL_SUMMARY_MAX);
  });
});

describe('the registry rule', () => {
  const base = find('ideas.dismiss');
  test('asking in the web chat needs the card’s words and the write class', () => {
    expect(() => registry.assertCapabilityRegistry([{ ...base, describeApproval: undefined }])).toThrow(
      /describes its approval card/
    );
    expect(() => registry.assertCapabilityRegistry([{ ...base, risk: 'read' }])).toThrow(/only a write capability/);
  });
});
