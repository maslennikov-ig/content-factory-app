'use strict';

/**
 * Fixes of the W2 correctness review of the agent chat (epic
 * `content-factory-next-kcxz`), proven on the capabilities themselves: the
 * guarantee «no queue without a card» carried to the write (F2), the time zone
 * fallback (F6), the intake's facts card (F8), the approval lines (F10), MCP
 * adapting once (F12), service text kept from the model (F13), the error slot
 * (F14) and the fall-back day (F15). The door and the stream are proven in
 * `agent-doors.test.cjs` and the recorded scenarios.
 */

const {
  IDENTITY,
  loadRegistry,
  permissionsService,
  servicesFrom,
  requestContextFor,
  executeTool,
  loadCapabilityModule,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const find = (id) => catalogue.find((capability) => capability.id === id);
const build = (id, services, options = {}) =>
  registry.buildCapabilityTool(find(id), {
    services: servicesFrom(services),
    language: 'ru',
    entrance: 'chat',
    ...options,
  });
const mcpTool = (id, services) =>
  registry.buildMcpCapabilityTools(catalogue, {
    services: servicesFrom(services),
    gate: new registry.DoorPolicyGate(permissionsService()),
    language: 'en',
    role: 'EDITOR',
  })[registry.toolNameOf(id)];

/** An adapt door that records the consent each pass carried. */
const adaptDoor = ({ mode = 'reserve', asks = true } = {}) => {
  const passes = [];
  return {
    passes,
    services: {
      IntegrationService: {
        getIntegrationsForChannelList: async () => [{ id: 'c1', name: 'Канал', providerIdentifier: 'telegram' }],
      },
      PieceService: {
        adaptPlanMode: async () => mode,
        prepareAdapt: async (_organizationId, pieceId, request) => ({ pieceId, request }),
        adapt: async function* (_organizationId, plan, _userId, consent) {
          passes.push({ request: plan.request, consent });
          yield { name: 'adapt-started', channel: { id: 'c1', name: 'Канал', providerIdentifier: 'telegram' } };
          if (asks && !plan.request.answers && !plan.request.skipInterview) {
            yield { name: 'questions', questions: [{ key: 'ask-1', question: 'Для кого?', suggested: null }], round: 1 };
            return;
          }
          const queued = mode === 'autopilot' && consent?.queueAllowed !== false;
          yield {
            name: 'adaptation',
            adaptation: {
              id: 'a1',
              state: queued ? 'queued' : 'draft',
              plan: queued
                ? { status: 'queued' }
                : { status: 'reserved', note: mode === 'autopilot' ? 'Канал на автопилоте, но в очередь не просили.' : null },
            },
          };
        },
        detail: async () => ({ piece: { code: 'cnt-1' }, adaptations: [{ id: 'a1', integrationId: 'c1' }] }),
      },
    },
  };
};

describe('F2: piece.adapt queues only with consent given on this call', () => {
  const input = { pieceId: 'p1', channelId: 'c1' };
  const context = () => ({ requestContext: requestContextFor(registry) });

  test('no consent card asked: every pass tells the write not to queue', async () => {
    const door = adaptDoor({ mode: 'reserve' });
    const tool = build('piece.adapt', door.services);
    const asked = await executeTool(tool, input, context());
    expect(asked.suspended[0]).toMatchObject({ kind: 'interview' });
    expect(asked.suspended[0]).not.toHaveProperty('afterConsent');
    await executeTool(tool, input, {
      ...context(),
      resumeData: { decideForPerson: true },
      suspendPayload: asked.suspended[0],
    });
    expect(door.passes.map((pass) => pass.consent)).toEqual([{ queueAllowed: false }, { queueAllowed: false }]);
  });

  test('the channel went on autopilot while the interview waited: the result says the post stayed planned', async () => {
    const door = adaptDoor({ mode: 'reserve' });
    const tool = build('piece.adapt', door.services);
    const asked = await executeTool(tool, input, context());
    door.services.PieceService.adaptPlanMode = async () => 'autopilot';
    const reserveDoor = adaptDoor({ mode: 'autopilot' });
    door.services.PieceService.adapt = reserveDoor.services.PieceService.adapt;
    const { output } = await executeTool(tool, input, {
      ...context(),
      resumeData: { decideForPerson: true },
      suspendPayload: asked.suspended[0],
    });
    expect(reserveDoor.passes.map((pass) => pass.consent)).toEqual([{ queueAllowed: false }]);
    expect(output.summary).toMatchObject({ state: 'draft', plan: 'reserved', note: expect.stringContaining('автопилоте') });
  });

  test('«Да» on the consent card lets this call queue — through the interview that follows it too', async () => {
    const door = adaptDoor({ mode: 'autopilot' });
    const tool = build('piece.adapt', door.services);
    const consent = (await executeTool(tool, input, context())).suspended[0];
    expect(consent).toMatchObject({ kind: 'consent', subject: 'autopilot' });
    const interview = (
      await executeTool(tool, input, { ...context(), resumeData: { consentGiven: true }, suspendPayload: consent })
    ).suspended[0];
    // Kept on the server, never shown: the consent this interview follows.
    expect(interview).toMatchObject({ kind: 'interview', afterConsent: true });
    expect(registry.questionCardView(interview)).not.toHaveProperty('afterConsent');
    const { output } = await executeTool(tool, input, {
      ...context(),
      resumeData: { decideForPerson: true },
      suspendPayload: interview,
    });
    expect(door.passes.map((pass) => pass.consent)).toEqual([{ queueAllowed: true }, { queueAllowed: true }]);
    expect(output.summary).toMatchObject({ state: 'queued' });
  });

  test('the two cards take their own answers only (F3, strict schemas)', async () => {
    const door = adaptDoor({ mode: 'autopilot' });
    const tool = build('piece.adapt', door.services);
    const consent = (await executeTool(tool, input, context())).suspended[0];
    const onConsent = await executeTool(tool, input, {
      ...context(),
      resumeData: { answers: [], decideForPerson: true },
      suspendPayload: consent,
    });
    expect(door.passes).toEqual([]);
    expect(onConsent.output).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });
    const interview = { kind: 'interview', question: 'q', questions: [{ key: 'ask-1', question: 'Для кого?', suggested: null }], canDecideForPerson: true, channel: null };
    const onInterview = await executeTool(tool, input, {
      ...context(),
      resumeData: { consentGiven: false },
      suspendPayload: interview,
    });
    expect(door.passes).toEqual([]);
    expect(onInterview.output).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });
  });

  test('F12: over MCP a first channel is written in one paid pass, never asked then written', async () => {
    const door = adaptDoor({ mode: 'reserve' });
    const output = await mcpTool('piece.adapt', door.services).execute(input, {
      requestContext: requestContextFor(registry),
    });
    expect(output).toMatchObject({ ok: true });
    expect(door.passes).toEqual([
      { request: expect.objectContaining({ skipInterview: true }), consent: { queueAllowed: false } },
    ]);
  });
});

describe('F2: plan.place reserves without consent, and the service decides under its lock', () => {
  test('the reserve is placed with queueAllowed: false; the service’s refusal reads as the capability’s', async () => {
    const placed = [];
    const services = {
      PieceService: {
        detail: async () => ({
          piece: { code: 'cnt-1' },
          adaptations: [{ id: 'a1', integrationId: 'c1', integrationName: 'Канал', state: 'draft', postId: 'post-1' }],
        }),
        adaptPlanMode: async () => 'reserve',
        placeAdaptation: async (...args) => {
          placed.push(args.slice(5));
          throw Object.assign(new Error('Поставить так значит отправить без подтверждения.'), {
            code: 'ADAPTATION_QUEUE_NEEDS_CONSENT',
          });
        },
      },
    };
    const { output } = await executeTool(
      build('plan.place', services),
      { pieceId: 'p1', adaptationId: 'a1', at: '2031-03-04T10:00:00+03:00' },
      { requestContext: requestContextFor(registry) }
    );
    // A reserve is asked for (kcxz.31 D5): «Без плана» gets the post's own «Бронь».
    expect(placed).toEqual([[{ queueAllowed: false, reserve: true }]]);
    expect(output).toMatchObject({ ok: false, code: 'PLAN_PLACE_AUTOPILOT' });
  });
});

describe('F8: the intake’s facts card answers only what it offered', () => {
  const input = { text: 'Напиши про созвоны', inputKind: 'instruction', research: 'quick' };
  const intake = () => {
    const runs = [];
    return {
      runs,
      services: {
        IntakeService: {
          prepare: async (_organizationId, body) => ({ body }),
          run: async function* (_organizationId, plan) {
            runs.push(plan.body);
            yield { name: 'piece', pieceId: 'p9', code: 'cnt-9' };
          },
        },
      },
    };
  };
  const card = (extra = {}) => ({
    kind: 'selection',
    question: 'Отметьте опоры',
    answerKey: 'factKeys',
    options: [{ id: 'f1', label: 'Факт', selected: true }],
    canDecideForPerson: true,
    snapshotKey: 'snap-1',
    level: 'quick',
    ...extra,
  });

  test('without the stored card, rows the browser names are refused and nothing is paid again', async () => {
    const door = intake();
    const { output } = await executeTool(build('piece.create', door.services), input, {
      requestContext: requestContextFor(registry),
      resumeData: { factKeys: ['never-offered'] },
      suspendPayload: undefined,
    });
    expect(output).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });
    expect(door.runs).toEqual([]);
  });

  test('a card answered after its first pass expired says so instead of searching again', async () => {
    const door = intake();
    const { output } = await executeTool(build('piece.create', door.services), input, {
      requestContext: requestContextFor(registry),
      resumeData: { factKeys: ['f1'] },
      suspendPayload: card({ askedAt: Date.now() - 2 * 60 * 60 * 1000 }),
    });
    expect(output).toMatchObject({ ok: false, code: 'INTAKE_SELECTION_EXPIRED', reason: expect.stringContaining('paid again') });
    expect(door.runs).toEqual([]);
  });

  test('in time, only offered rows go on, with the stored snapshot', async () => {
    const door = intake();
    const { output } = await executeTool(build('piece.create', door.services), input, {
      requestContext: requestContextFor(registry),
      resumeData: { factKeys: ['f1', 'never-offered'] },
      suspendPayload: card({ askedAt: Date.now() }),
    });
    expect(output).toMatchObject({ ok: true });
    expect(door.runs).toEqual([expect.objectContaining({ researchSelections: ['f1'], snapshotKey: 'snap-1' })]);
  });
});

describe('F10: the approval lines say what else happens, and what cannot happen', () => {
  const rows = (mine, others = []) => ({
    PieceService: {
      detail: async () => ({
        piece: { code: 'cnt-1' },
        adaptations: [
          { id: 'a1', integrationId: 'c1', integrationName: 'Канал', body: 'Первая строка поста.\nВторая.', mediaId: 'm1', ...mine },
          ...others,
        ],
      }),
      adaptPlanMode: async () => 'reserve',
    },
  });
  const describe_ = (id, services, input) =>
    registry.describeApprovalCall(catalogue, servicesFrom(services), IDENTITY, registry.toolNameOf(id), input);

  test('another queued version and the other drafts are named; the text and its picture are quoted', async () => {
    const line = await describe_(
      'plan.publish_now',
      rows({ state: 'draft' }, [
        { id: 'a2', integrationId: 'c1', state: 'queued' },
        { id: 'a3', integrationId: 'c1', state: 'draft' },
        { id: 'a4', integrationId: 'c2', state: 'draft' },
      ]),
      { pieceId: 'p1', adaptationId: 'a1' }
    );
    expect(line).toBe(
      'Опубликовать сейчас пост заготовки cnt-1 в канале «Канал»: он уйдёт в канал сразу; другая версия этого поста снимется с очереди; черновики других версий (1) уйдут из календаря. «Первая строка поста. Вторая.» + картинка'
    );
  });

  test('a post already scheduled or out is not described as something that will happen', async () => {
    expect(
      await describe_('plan.schedule', rows({ state: 'queued' }), {
        pieceId: 'p1',
        adaptationId: 'a1',
        at: '2031-03-04T10:00:00+03:00',
      })
    ).toMatch(/— но он уже запланирован, ничего не изменится$/);
    expect(
      await describe_('plan.publish_now', rows({ state: 'published' }), { pieceId: 'p1', adaptationId: 'a1' })
    ).toMatch(/— но он уже вышел, ничего не изменится$/);
  });

  test('«Ко всем N» binds N: the content a bound approval reads is the count and the mode', async () => {
    const services = servicesFrom({
      PieceService: { channelPlanImpact: async () => ({ planMode: 'autopilot', count: 3 }) },
    });
    const three = await registry.approvalContentDigest(catalogue, services, IDENTITY, 'plan_apply', {
      channelId: 'c1',
      planMode: 'autopilot',
    });
    const four = await registry.approvalContentDigest(
      catalogue,
      servicesFrom({ PieceService: { channelPlanImpact: async () => ({ planMode: 'autopilot', count: 4 }) } }),
      IDENTITY,
      'plan_apply',
      { channelId: 'c1', planMode: 'autopilot' }
    );
    expect(three).not.toBe(four);
    // A deletion binds only its call.
    expect(
      await registry.approvalContentDigest(catalogue, services, IDENTITY, 'adaptation_delete', {
        pieceId: 'p1',
        adaptationId: 'a1',
      })
    ).toBeNull();
  });
});

describe('F13: only product words reach the model', () => {
  test('a driver or network error is a code and a fixed sentence; a product refusal keeps its words', () => {
    expect(registry.codedRefusal(Object.assign(new Error('Invalid `prisma.post.update()` in /srv/app.js'), { code: 'P2025' }))).toEqual({
      ok: false,
      code: 'CAPABILITY_FAILED',
      reason: expect.not.stringContaining('prisma'),
    });
    expect(registry.codedRefusal(Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' })).reason).not.toContain('10.0.0.5');
    expect(registry.codedRefusal(Object.assign(new Error('bad arg'), { code: 'ERR_INVALID_ARG_TYPE' })).code).toBe('CAPABILITY_FAILED');
    expect(registry.codedRefusal(Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' }))).toEqual({
      ok: false,
      code: 'PIECE_NOT_FOUND',
      reason: 'Заготовка не найдена.',
    });
  });

  test('a generator’s caught exception reaches the model as the generic words, a named refusal as its own', () => {
    const raw = registry.eventFailure('GENERATION_FAILED', 'Cannot read properties of undefined (reading "x") at /srv/a.js:1', 'GENERATION_FAILED', 'The adaptation could not be written.');
    expect([raw.code, raw.message]).toEqual(['GENERATION_FAILED', 'The adaptation could not be written.']);
    const named = registry.eventFailure('AI_ALLOWANCE_EXHAUSTED', 'В этом месяце операции кончились.', 'GENERATION_FAILED', 'x');
    expect([named.code, named.message]).toEqual(['AI_ALLOWANCE_EXHAUSTED', 'В этом месяце операции кончились.']);
    const odd = registry.eventFailure('ECONNRESET', 'socket hang up 10.0.0.5', 'INTAKE_FAILED', 'The piece could not be written.');
    expect([odd.code, odd.message]).toEqual(['INTAKE_FAILED', 'The piece could not be written.']);
  });
});

describe('F14, F15: the plan’s own words and days', () => {
  test('a post that did not go out is an error slot, never a draft', () => {
    expect(registry.slotStateOf({ id: 'a1', state: 'error', plan: { status: 'reserved' } })).toBe('error');
    expect(registry.slotStateOf({ id: 'a1', state: 'draft', plan: { status: 'reserved' } })).toBe('reserve');
  });

  test('a fall-back day keeps its 25th hour in the calendar range', async () => {
    const asked = [];
    const services = {
      PostsService: {
        getPosts: async (_organizationId, query) => {
          asked.push(query);
          return [];
        },
      },
    };
    const berlin = requestContextFor(registry, { ...IDENTITY, timeZone: 'Europe/Berlin' });
    // 25.10.2026: CEST → CET at 03:00; the day ends at 26.10 00:00 CET = 25.10 23:00Z.
    await executeTool(build('plan.calendar', services), { from: '2026-10-25', to: '2026-10-25' }, { requestContext: berlin });
    // 29.03.2026: CET → CEST, a 23-hour day ending at 30.03 00:00 CEST = 29.03 22:00Z.
    await executeTool(build('plan.calendar', services), { from: '2026-03-29', to: '2026-03-29' }, { requestContext: berlin });
    expect(asked.map((query) => [query.startDate, query.endDate])).toEqual([
      ['2026-10-24T22:00:00Z', '2026-10-25T22:59:59Z'],
      ['2026-03-28T23:00:00Z', '2026-03-29T21:59:59Z'],
    ]);
  });
});

describe('F6: a saved offset is a fixed zone, and the model is told so', () => {
  const { conductorInstructions } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/conductor/conductor.instructions.ts',
    {
      '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    }
  );
  const say = (timeZone) =>
    conductorInstructions({ language: 'ru', role: 'EDITOR', now: new Date('2026-09-27T10:00:00Z'), timeZone, snapshot: null });

  test('an offset zone asks the model to confirm a firm time; a named zone does not', () => {
    expect(say('+03:00')).toContain('fixed offset saved in the profile, without summer time');
    expect(say('Europe/Moscow')).not.toContain('fixed offset saved in the profile');
    expect(loadCapabilityModule('person-time.ts').agentTimeZone(undefined, 60)).toBe('+01:00');
  });
});
