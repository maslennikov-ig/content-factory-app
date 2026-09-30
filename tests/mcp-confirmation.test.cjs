'use strict';

/**
 * A «Да» asked in the conversation over MCP (`content-factory-next-kcxz.49`).
 *
 * Live walk 29.09.2026, step A4: claude.ai asked for an adaptation into a
 * channel on autopilot, got «consent on a card in the web chat», and the
 * owner's «да» in the chat changed nothing — a dead end. Now the call answers
 * with the question and a one-time code; the assistant asks the person and,
 * after their «да», repeats the call with the code. The code is bound to the
 * person, the workspace, the tool, the arguments and the post's text, works
 * once and lives ten minutes. Scheduling and moving a post ask the same way;
 * deleting, publishing at once, channels and keys stay in the product.
 */

const {
  IDENTITY,
  fixtures,
  loadRegistry,
  permissionsService,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const find = (id) => catalogue.find((one) => one.id === id);

const ADMIN = { ...IDENTITY, role: 'ADMIN', language: 'ru' };

/** One store for every tool of a test: codes cross calls, as Redis does. */
const setup = (id, services, { entrance = 'mcp', store } = {}) => {
  const confirmations = new registry.McpConfirmationService(store);
  const tool = registry.buildCapabilityTool(find(id), {
    services: servicesFrom({ ...services, McpConfirmationService: confirmations }),
    language: 'ru',
    entrance,
    ...(entrance === 'mcp' ? { gate: new registry.DoorPolicyGate(permissionsService()) } : {}),
  });
  return { tool, confirmations };
};

/** As the MCP server calls a tool: no agent, so no card and no suspend. */
const call = async (tool, input, identity = ADMIN) => {
  const output = await tool.execute(input, { requestContext: requestContextFor(registry, identity) });
  return registry.withoutEchoedInput(output);
};

/** `piece.adapt` into an autopilot channel, every service call recorded. */
const autopilotAdapt = () => {
  const calls = [];
  const base = fixtures()['piece.adapt'].services.PieceService;
  const PieceService = {
    ...base,
    adaptPlanMode: async () => 'autopilot',
    prepareAdapt: async (...args) => (calls.push(['prepareAdapt', args[2]]), base.prepareAdapt(...args)),
    adapt: async function* (organizationId, plan, userId, options) {
      calls.push(['adapt', options]);
      yield { name: 'adapt-started', channel: { id: 'c1', name: 'Тестовая группа', providerIdentifier: 'telegram' } };
      yield { name: 'adaptation', adaptation: { id: 'a1', state: 'queued' } };
    },
  };
  const IntegrationService = {
    getIntegrationsForChannelList: async () => [
      { id: 'c1', name: 'Тестовая группа', providerIdentifier: 'telegram' },
    ],
  };
  return { calls, services: { PieceService, IntegrationService } };
};

describe('kcxz.49: the autopilot consent over MCP is asked in the conversation', () => {
  test('the first call asks, spends nothing; the call with the code after «да» writes into the queue', async () => {
    const { calls, services } = autopilotAdapt();
    const { tool } = setup('piece.adapt', services);

    const asked = await call(tool, { pieceId: 'p1', channelId: 'c1' });
    expect(asked.ok).toBe(true);
    expect(asked.summary).toMatchObject({ done: false, needsConfirmation: true });
    expect(asked.summary.question.untrustedData.value).toBe(
      'Канал «Тестовая группа» на автопилоте: адаптация сразу встанет в очередь и выйдет сама. Писать?'
    );
    expect(asked.summary.confirmation).toMatch(/^cf-[A-Za-z0-9_-]{16}$/);
    expect(asked.summary.next).toContain('word for word');
    expect(calls).toEqual([]);

    const written = await call(tool, {
      pieceId: 'p1',
      channelId: 'c1',
      confirmation: asked.summary.confirmation,
    });
    expect(written).toMatchObject({ ok: true, summary: { adaptationId: 'a1', state: 'queued' } });
    // No card to answer the interview on: decided for the person, queue allowed.
    expect(calls).toEqual([
      ['prepareAdapt', expect.objectContaining({ integrationId: 'c1', skipInterview: true })],
      ['adapt', { queueAllowed: true }],
    ]);
    // The code never reaches the product's services.
    expect(JSON.stringify(calls)).not.toContain('confirmation');
  });

  test('a code works once', async () => {
    const { calls, services } = autopilotAdapt();
    const { tool } = setup('piece.adapt', services);
    const asked = await call(tool, { pieceId: 'p1', channelId: 'c1' });
    const input = { pieceId: 'p1', channelId: 'c1', confirmation: asked.summary.confirmation };
    await call(tool, input);
    calls.length = 0;
    expect(await call(tool, input)).toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    expect(calls).toEqual([]);
  });

  test('two calls with one code at once: only one writes', async () => {
    const { calls, services } = autopilotAdapt();
    const { tool } = setup('piece.adapt', services);
    const asked = await call(tool, { pieceId: 'p1', channelId: 'c1' });
    const input = { pieceId: 'p1', channelId: 'c1', confirmation: asked.summary.confirmation };
    const outputs = await Promise.all([call(tool, input), call(tool, input)]);
    expect(outputs.filter((one) => one.ok).length).toBe(1);
    expect(calls.filter(([name]) => name === 'adapt').length).toBe(1);
  });

  test.each([
    ['another channel', { channelId: 'c2' }, ADMIN],
    ['another wish', { wish: 'короче' }, ADMIN],
    ['another person', {}, { ...ADMIN, userId: 'user-2' }],
    ['another workspace', {}, { ...ADMIN, organizationId: 'org-2' }],
  ])('a code asked for other arguments is refused: %s', async (_name, change, identity) => {
    const { calls, services } = autopilotAdapt();
    const { tool } = setup('piece.adapt', services);
    const asked = await call(tool, { pieceId: 'p1', channelId: 'c1' });
    const refused = await call(
      tool,
      { pieceId: 'p1', channelId: 'c1', ...change, confirmation: asked.summary.confirmation },
      identity
    );
    expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    expect(calls).toEqual([]);
  });

  test('an invented code is refused, nothing runs', async () => {
    const { calls, services } = autopilotAdapt();
    const { tool } = setup('piece.adapt', services);
    const refused = await call(tool, { pieceId: 'p1', channelId: 'c1', confirmation: 'cf-madeupcode12345' });
    expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    expect(calls).toEqual([]);
  });

  test('a code expires after ten minutes', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z') });
    try {
      const { calls, services } = autopilotAdapt();
      const { tool } = setup('piece.adapt', services);
      const asked = await call(tool, { pieceId: 'p1', channelId: 'c1' });
      jest.setSystemTime(new Date('2026-09-29T12:10:01Z'));
      const refused = await call(tool, {
        pieceId: 'p1',
        channelId: 'c1',
        confirmation: asked.summary.confirmation,
      });
      expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
      expect(calls).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a channel not on autopilot needs no code: the adaptation runs at once', async () => {
    const { calls, services } = autopilotAdapt();
    services.PieceService.adaptPlanMode = async () => 'reserve';
    const { tool } = setup('piece.adapt', services);
    const written = await call(tool, { pieceId: 'p1', channelId: 'c1' });
    expect(written.ok).toBe(true);
    expect(written.summary.needsConfirmation).toBeUndefined();
    expect(calls[1]).toEqual(['adapt', { queueAllowed: false }]);
  });

  test('a store that does not answer refuses without running', async () => {
    const { calls, services } = autopilotAdapt();
    const broken = {
      incr: async () => 1,
      expire: async () => 1,
      del: async () => 1,
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    };
    const { tool } = setup('piece.adapt', services, { store: broken });
    expect(await call(tool, { pieceId: 'p1', channelId: 'c1' })).toMatchObject({
      ok: false,
      code: 'CONFIRMATION_UNAVAILABLE',
    });
    expect(
      await call(tool, { pieceId: 'p1', channelId: 'c1', confirmation: 'cf-anycode1234567' })
    ).toMatchObject({ ok: false, code: 'CONFIRMATION_UNAVAILABLE' });
    expect(calls).toEqual([]);
  });

  test('the web chat keeps its card: no `confirmation` field, the consent suspends', () => {
    const chat = setup('piece.adapt', autopilotAdapt().services, { entrance: 'chat' }).tool;
    const mcp = setup('piece.adapt', autopilotAdapt().services).tool;
    expect(Object.keys(chat.inputSchema.shape)).not.toContain('confirmation');
    expect(Object.keys(mcp.inputSchema.shape)).toContain('confirmation');
    // Tools that never ask take no code over MCP either.
    expect(Object.keys(setup('piece.rename', {}).tool.inputSchema.shape)).not.toContain('confirmation');
  });
});

describe('kcxz.49: scheduling and moving over MCP ask in the conversation', () => {
  const plan = (id) => {
    const fixture = fixtures()[id];
    const calls = [];
    const record = (service, name) =>
      new Proxy(service, {
        get: (target, key) =>
          typeof target[key] === 'function'
            ? (...args) => (calls.push([name, key]), target[key](...args))
            : target[key],
      });
    const services = Object.fromEntries(
      Object.entries(fixture.services).map(([name, service]) => [name, record(service, name)])
    );
    return { calls, services, input: { ...fixture.input, timeZone: 'Europe/Moscow' } };
  };
  const writes = (calls) =>
    calls.filter(([, key]) => ['scheduleAdaptation', 'changeDate'].includes(key)).map(([, key]) => key);

  // kcxz.52 (owner, live walk 30.09.2026): «если я уже сказал, что сделать,
  // зачем спрашивать повторно». The person's request names the action and
  // the time, so over MCP it runs at once — no question, no code.
  test('plan_schedule over MCP runs on the person’s request: no question, no code argument', async () => {
    const { calls, services, input } = plan('plan.schedule');
    const { tool } = setup('plan.schedule', services);
    const done = await call(tool, input);
    expect(done).toMatchObject({ ok: true, summary: { state: 'scheduled' } });
    expect(done.summary.needsConfirmation).toBeUndefined();
    expect(writes(calls)).toEqual(['scheduleAdaptation']);
    expect(Object.keys(tool.inputSchema.shape)).not.toContain('confirmation');
  });

  test('plan_move over MCP runs on the person’s request', async () => {
    const { calls, services, input } = plan('plan.move');
    const { tool } = setup('plan.move', services);
    const done = await call(tool, input);
    expect(done.ok).toBe(true);
    expect(writes(calls)).toEqual(['changeDate']);
  });

  test('without a named zone the question is not asked: the plan’s zone rule (kcxz.42)', async () => {
    const { calls, services, input } = plan('plan.schedule');
    const { tool } = setup('plan.schedule', services);
    const { timeZone, ...unzoned } = input;
    expect(await call(tool, unzoned)).toMatchObject({ ok: false, code: 'PLAN_TIME_ZONE_REQUIRED' });
    expect(writes(calls)).toEqual([]);
  });

  test('a USER token is offered neither', () => {
    const names = Object.keys(
      registry.buildMcpCapabilityTools(catalogue, {
        services: servicesFrom({}),
        gate: new registry.DoorPolicyGate(permissionsService()),
        language: 'ru',
        role: 'USER',
      })
    );
    expect(names).not.toContain('plan_schedule');
    expect(names).not.toContain('plan_move');
  });

  test('every tool that asks in the conversation carries a destructive hint over MCP: the host asks too', () => {
    for (const id of ['piece.adapt', 'plan.schedule', 'plan.move']) {
      expect(setup(id, {}).tool.mcp.annotations.destructiveHint).toBe(true);
    }
    // The web chat build keeps the risk class's own hints.
    expect(setup('piece.adapt', {}, { entrance: 'chat' }).tool.mcp.annotations.destructiveHint).toBe(false);
  });

  test('an error named like the question but carrying none is not a question', () => {
    expect(registry.isConfirmationNeeded(Object.assign(new Error('x'), { name: 'ConfirmationNeeded' }))).toBe(false);
    expect(registry.isConfirmationNeeded(new registry.ConfirmationNeeded('Писать?'))).toBe(true);
  });

  test('what cannot be undone from the product stays web-only', () => {
    const offered = catalogue.filter((one) => one.risk === 'confirm' && registry.isMcpCapability(one));
    expect(offered.map((one) => one.id)).toEqual(['plan.schedule', 'plan.move']);
    expect(offered.map((one) => one.mcpConfirm)).toEqual(['request', 'request']);
    expect(find('piece.adapt').mcpConfirm).toBe('ask');
  });
});
