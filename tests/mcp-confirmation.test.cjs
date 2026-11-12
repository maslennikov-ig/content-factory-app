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
 * Existing adaptation publish-now, deletion, channels and keys stay in the product.
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

describe('publish a ready Telegram post over MCP', () => {
  const caption = process.env.CF_TEST_READY_CAPTION_HTML ||
    '<p>Открыли доступ к новой модели.</p><p><strong>Цена задачи</strong> · <a href="https://example.org/test">Замеры</a></p>';
  const input = {
    requestId: '3ed97ca3-5bfc-4caf-bfa0-12770ee3403e',
    channelId: 'tg-editorial',
    coverMediaId: '1926f180-7f69-48fa-b83f-c268ce2c385e',
    html: caption,
  };
  const coverPath = '/uploads/telegram-cover.png';

  function fixture() {
    const saved = new Map();
    const channel = {
      id: input.channelId, internalId: 'editorial_test', organizationId: ADMIN.organizationId,
      name: 'Редакционный тест', providerIdentifier: 'telegram',
    };
    const cover = { id: input.coverMediaId, name: 'telegram-cover.png', path: coverPath, organizationId: ADMIN.organizationId };
    const createPost = jest.fn(async (org, body) => {
      const { integration, value } = body.posts[0];
      const { id } = value[0];
      if (saved.has(id)) throw Object.assign(new Error('duplicate primary key'), { code: 'P2002' });
      saved.set(id, { id, integrationId: integration.id, state: 'QUEUE', releaseURL: null, org });
    });
    const services = {
      IntegrationService: { getIntegrationById: async () => channel },
      MediaService: { getMediaById: async () => cover },
      PostsRepository: { getPost: async (id, _includeIntegration, org) =>
        saved.get(id)?.org === org ? saved.get(id) : null },
      PostsService: {
        mapTypeToPost: async (body) => body,
        validatePosts: async () => [{ valid: true, errors: true, emptyContent: false, tooLong: false }],
        createPost,
      },
    };
    return { saved, channel, cover, createPost, services };
  }

  test('binds confirmation to formatted text, channel and cover, then reports the Telegram receipt', async () => {
    const { saved, cover, createPost, services } = fixture();
    const { tool } = setup('telegram.publish_ready', services);
    const status = setup('telegram.publication_status', services).tool;
    const asked = await call(tool, input);
    expect(asked.summary).toMatchObject({ needsConfirmation: true });
    expect(asked.summary.question.untrustedData.value).toContain('«Редакционный тест»');
    expect(asked.summary.question.untrustedData.value).toContain('@editorial_test');
    expect(asked.summary.question.untrustedData.value).toContain('telegram-cover.png');
    expect(createPost).not.toHaveBeenCalled();
    const confirmation = asked.summary.confirmation;
    expect(await call(tool, { ...input, html: '<p>Другой текст</p>', confirmation }))
      .toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    cover.path = '/uploads/replacement.png';
    expect(await call(tool, { ...input, confirmation }))
      .toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    cover.path = coverPath;

    const queued = await call(tool, { ...input, confirmation });
    expect(queued.summary).toMatchObject({ state: 'QUEUE', telegramUrl: null });
    expect(createPost).toHaveBeenCalledWith(ADMIN.organizationId, expect.objectContaining({
      type: 'now', shortLink: false,
      posts: [expect.objectContaining({ value: [{
        id: queued.summary.postId, content: caption, delay: 0,
        image: [{ id: input.coverMediaId, path: coverPath }],
      }] })],
    }), 'API', { createOnly: true });
    expect(await call(tool, { ...input, confirmation }))
      .toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    saved.get(queued.summary.postId).state = 'PUBLISHED';
    saved.get(queued.summary.postId).releaseURL = 'https://t.me/editorial_test/42';
    expect(await call(status, { requestId: input.requestId })).toMatchObject({
      ok: true, summary: { state: 'PUBLISHED', telegramUrl: 'https://t.me/editorial_test/42' },
    });
    expect(await call(status, { requestId: input.requestId }, { ...ADMIN, userId: 'other' }))
      .toMatchObject({ ok: true, summary: { state: 'NOT_FOUND' } });
  });

  test('two confirmations for one request create one post and return the same receipt', async () => {
    const { saved, services } = fixture();
    const { tool } = setup('telegram.publish_ready', services);
    const asked = await Promise.all([call(tool, input), call(tool, input)]);
    const result = await Promise.all(asked.map(({ summary }) =>
      call(tool, { ...input, confirmation: summary.confirmation })));
    expect(result[0]).toMatchObject({ ok: true, summary: { state: 'QUEUE' } });
    expect(result[1]).toEqual(result[0]);
    expect(saved.size).toBe(1);
  });

  test('rejects a foreign cover and a caption beyond the Telegram photo limit before confirmation', async () => {
    const { cover, createPost, services } = fixture();
    const { tool } = setup('telegram.publish_ready', services);
    cover.organizationId = 'another-workspace';
    expect(await call(tool, input)).toMatchObject({ ok: false, code: 'TELEGRAM_COVER_UNAVAILABLE' });
    cover.organizationId = ADMIN.organizationId;
    expect(await call(tool, { ...input, html: `<p>${'я'.repeat(1025)}</p>` }))
      .toMatchObject({ ok: false, code: 'TELEGRAM_CAPTION_INVALID' });
    expect(createPost).not.toHaveBeenCalled();
  });
});

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

  test.each([
    ['video.heygen_voice_intake', 'voiceIntake'],
    ['video.heygen_voice_select', 'voiceSelect'],
  ])('%s saves the human choice once after MCP confirmation', async (id, method) => {
    const { input, services } = fixtures()[id];
    const voice = services.HeygenStyleVoiceServiceV1;
    const write = jest.fn(voice[method]);
    const { tool } = setup(id, { ...services, HeygenStyleVoiceServiceV1: { ...voice, [method]: write } });
    const asked = await call(tool, input);
    expect(asked.summary).toMatchObject({ done: false, needsConfirmation: true });
    expect(write).not.toHaveBeenCalled();

    const confirmed = { ...input, confirmation: asked.summary.confirmation };
    expect(await call(tool, confirmed)).toMatchObject({ ok: true });
    expect(write).toHaveBeenCalledWith(ADMIN.organizationId, ADMIN.userId, input,
      expect.objectContaining({ source: 'confirmed_chat_action', toolId: id }));
    expect(await call(tool, confirmed)).toMatchObject({ ok: false, code: 'CONFIRMATION_INVALID' });
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('only the listed confirmed choices are offered over MCP', () => {
    const offered = catalogue.filter((one) => one.risk === 'confirm' && registry.isMcpCapability(one));
    expect(offered.map(({ id, mcpConfirm }) => [id, mcpConfirm])).toEqual([
      ['telegram.publish_ready', 'ask'],
      ['video.heygen_voice_intake', 'ask'],
      ['video.heygen_voice_select', 'ask'],
      ['plan.schedule', 'request'],
      ['plan.move', 'request'],
    ]);
    expect(find('piece.adapt').mcpConfirm).toBe('ask');
  });
});
