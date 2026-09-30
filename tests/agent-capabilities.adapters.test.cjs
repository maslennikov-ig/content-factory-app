'use strict';

/**
 * The two adapters of the capability registry (`content-factory-next-kcxz.6`):
 * native Mastra tools for the web chat and MCP tools from the same
 * declarations, one capability of each risk class run end to end against fake
 * services, and the ledger rows a paid capability leaves inside an agent turn
 * (premortem U1).
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const {
  IDENTITY,
  INJECTION,
  fixtures,
  loadRegistry,
  permissionsService,
  providerConfig,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

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

describe('native Mastra tools', () => {
  const tools = registry.buildMastraCapabilityTools(catalogue, {
    services: servicesFrom({}),
    language: 'ru',
  });

  test('one tool per capability, named after its id', () => {
    expect(Object.keys(tools)).toEqual([
      'workspace_snapshot',
      'channels_list',
      'piece_list',
      'piece_open',
      'piece_rename',
      'piece_archive',
      'piece_create',
      'piece_answer',
      'piece_core_edit',
      'piece_material_add',
      'piece_core_restore',
      'piece_core_rebuild',
      'piece_research',
      'piece_check_facts',
      'piece_rewrite',
      'piece_adapt',
      'channel_writing_remember',
      'adaptation_review',
      'adaptation_rewrite',
      'adaptation_edit',
      'adaptation_image',
      'adaptation_delete',
      'piece_delete',
      'plan_ahead',
      'plan_calendar',
      'plan_ready',
      'plan_place',
      'plan_unschedule',
      'plan_schedule',
      'plan_publish_now',
      'plan_move',
      'plan_apply',
      'avatar_list',
      'avatar_overview',
      'avatar_proposal',
      'avatar_manual',
      'avatar_samples',
      'avatar_learning',
      'avatar_create',
      'avatar_rename',
      'avatar_default',
      'avatar_bind',
      'avatar_samples_add',
      'avatar_proposal_field',
      'avatar_manual_field',
      'avatar_analyse',
      'avatar_learn',
      'avatar_activate',
      'avatar_samples_delete',
      'avatar_delete',
      'avatar_rule_forget',
      'avatar_retire',
      'channel_open',
      'channel_posts',
      'channel_writing',
      'channel_plan',
      'channel_times',
      'channel_autopilot',
      'channel_connect',
      'channel_bot_rename',
      'channel_disable',
      'channel_delete',
      'ai_settings',
      'ai_usage',
      'ai_mode',
      'ai_key_enter',
      'ai_key_clear',
      'ai_search_key_clear',
      'ideas_list',
      'ideas_queue',
      'ideas_feed_add',
      'ideas_topic_add',
      'ideas_archive',
      'ideas_check',
      'ideas_dismiss',
      'ideas_take',
      'facts_list',
      'facts_add',
      'facts_retract',
      'facts_restore',
      'texts_related',
      'text_slop_check',
      'analytics_production',
      'analytics_channel',
      'media_library',
      'media_generate',
      'media_keep',
    ]);
    for (const [name, tool] of Object.entries(tools)) expect(tool.id).toBe(name);
  });

  test('the title is the label in the interface language; the model gets the description', () => {
    expect(tools.piece_rename.title).toBe('Переименовать заготовку');
    const english = registry.buildMastraCapabilityTools(catalogue, {
      services: servicesFrom({}),
      language: 'en',
    });
    expect(english.piece_rename.title).toBe('Rename a piece');
    expect(tools.piece_rename.description).toBe(find('piece.rename').description);
  });

  test('the confirm class, and a write one that asks in the web chat (kcxz.45), ask for approval; every input and a paid one with a mid-run choice suspend', () => {
    for (const capability of catalogue) {
      const tool = tools[registry.toolNameOf(capability.id)];
      expect({ id: capability.id, approval: tool.requireApproval === true }).toEqual({
        id: capability.id,
        approval: capability.risk === 'confirm' || !!capability.asksInWebChat,
      });
      expect({ id: capability.id, suspends: !!(tool.suspendSchema && tool.resumeSchema) }).toEqual({
        id: capability.id,
        suspends:
          capability.risk === 'input' ||
          (capability.risk === 'paid' && !!capability.suspendSchema),
      });
    }
    // kcxz.12: the intake pauses at the research facts (spec §5.2 «paid + input»).
    expect(
      catalogue
        .filter((capability) => capability.suspendSchema)
        .map((capability) => [capability.id, capability.risk])
    ).toEqual([
      ['piece.create', 'paid'],
      ['piece.research', 'paid'],
      ['piece.check_facts', 'paid'],
      ['piece.rewrite', 'paid'],
      ['piece.adapt', 'paid'],
      ['adaptation.review', 'paid'],
      ['adaptation.rewrite', 'paid'],
      ['avatar.activate', 'input'],
      // The browser that showed the agent a picture keeps it (28.09).
      ['media.keep', 'input'],
    ]);
  });

  test('the registry refuses a question on a class that cannot ask, and half a question', () => {
    const base = catalogue.find((capability) => capability.id === 'piece.rename');
    const { z } = require('zod');
    const asking = { suspendSchema: z.object({}), resumeSchema: z.object({}) };
    expect(() => registry.assertCapabilityRegistry([{ ...base, ...asking }])).toThrow(
      /only an input or a paid one/
    );
    const create = catalogue.find((capability) => capability.id === 'piece.create');
    expect(() =>
      registry.assertCapabilityRegistry([{ ...create, resumeSchema: undefined }])
    ).toThrow(/only an input or a paid one/);
  });

  test('every tool validates the server-built identity before it runs', async () => {
    const { RequestContext } = require('@mastra/core/request-context');
    for (const tool of Object.values(tools)) {
      expect(tool.requestContextSchema).toBe(registry.capabilityContextSchema);
    }
    const refused = await tools.channels_list.execute({}, { requestContext: new RequestContext() });
    expect(refused.error).toBe(true);
    expect(refused.message).toMatch(/Request context validation failed/);
  });

  test('MCP annotations follow the risk class', () => {
    expect(tools.channels_list.mcp.annotations).toEqual(
      expect.objectContaining({ readOnlyHint: true, destructiveHint: false })
    );
    expect(tools.piece_delete.mcp.annotations).toEqual(
      expect.objectContaining({ readOnlyHint: false, destructiveHint: true })
    );
    expect(tools.piece_create.mcp.annotations.openWorldHint).toBe(true);
  });

  test('an error shown in the browser or the transcript carries a code, never a stack', () => {
    const error = Object.assign(new Error('at /home/me/code/secret/path.ts:12'), {
      code: 'PIECE_NOT_FOUND',
    });
    for (const target of ['display', 'transcript']) {
      expect(tools.piece_rename.transform[target].error({ error })).toEqual({
        code: 'PIECE_NOT_FOUND',
      });
      expect(tools.piece_rename.transform[target].error({ error: new Error('boom') })).toEqual({
        code: 'CAPABILITY_FAILED',
      });
    }
  });
});

describe('one capability of each class, end to end', () => {
  const all = fixtures();

  test('read: the workspace snapshot counts rows and names the pieces in work, as data', async () => {
    const { output, parts } = await executeTool(
      build('workspace.snapshot', all['workspace.snapshot'].services),
      {},
      { requestContext: requestContextFor(registry) }
    );
    expect(output.ok).toBe(true);
    expect(parts).toEqual([]);
    expect(output.summary.untrustedData.value).toEqual({
      counts: { channels: 1, pieces: 1, drafts: 0 },
      // «С чего начать» over the same counts (kcxz.21): a missing count is
      // not done, so only the channel and the piece are.
      onboarding: { done: ['channel', 'piece'], next: 'avatar', channelByAdmin: false },
      pieces: [{ id: 'p1', code: 'cnt-1', title: INJECTION }],
      // The rest of spec §4.6 (`content-factory-next-kcxz.7`): channels with
      // their plan mode, avatars with the default one, the allowance left.
      channels: [
        { id: 'c1', name: INJECTION, platform: 'telegram', disabled: false, planMode: 'reserve', planModeChosen: true },
      ],
      avatars: [{ id: 'a1', name: INJECTION, isDefault: true, analysed: true }],
      defaultAvatarId: 'a1',
      allowance: {
        mode: 'included',
        remaining: 197,
        limit: 200,
        resetsAt: '2026-10-01T00:00:00.000Z',
      },
    });
  });

  test('write: renaming calls the door\'s service and leaves a persisted piece card by id', async () => {
    const calls = [];
    const { output, parts } = await executeTool(
      build('piece.rename', {
        PieceService: {
          updateTitle: async (...args) => {
            calls.push(args);
            return { title: 'Новое имя' };
          },
        },
      }),
      { pieceId: 'p1', title: '  Новое имя ' },
      { requestContext: requestContextFor(registry) }
    );
    expect(calls).toEqual([['org-1', 'p1', 'Новое имя']]);
    expect(parts).toEqual([
      { type: 'data-piece', data: { kind: 'piece', id: 'p1', title: 'Новое имя' } },
    ]);
    expect(output.card).toEqual({ kind: 'piece', id: 'p1' });
  });

  test('secret: the key card names the field; the model hears only that it is shown (kcxz.20)', async () => {
    const calls = [];
    const services = {
      AiProviderService: {
        getSettings: async (organizationId) => {
          calls.push(['getSettings', organizationId]);
          return { usageMode: 'workspace_key', provider: 'openai', hasKey: true, workspaceSearchKeys: { exa: false } };
        },
        updateSettings: async () => {
          throw new Error('the key card posts from the browser, never from the tool');
        },
      },
    };
    const capability = find('ai.key.enter');
    expect(capability.risk).toBe('secret');
    // Only a field name can be passed: there is nowhere to type a key.
    expect(registry.freeTextPaths(capability.input)).toEqual([]);
    const tool = build('ai.key.enter', services);
    const { output, parts, model } = await executeTool(tool, { field: 'exa' }, {
      requestContext: requestContextFor(registry, { ...IDENTITY, role: 'ADMIN' }),
    });
    expect(calls).toEqual([['getSettings', 'org-1']]);
    expect(parts).toEqual([
      {
        type: 'data-secret',
        data: { kind: 'secret', id: 'search-key:exa', field: 'search-key', engine: 'exa' },
      },
    ]);
    expect(model.value).toEqual({
      ok: true,
      summary: {
        field: 'exa',
        shown: 'card',
        stored: false,
        next: 'The person types the key into the card; it never reaches you. Wait for them to say it is saved, then read ai.settings.',
      },
      card: { kind: 'secret', id: 'search-key:exa' },
    });
    expect(output.ok).toBe(true);
    // Refused on «Ключи системы»: the own search keys sleep there (97dq.6).
    const asleep = build('ai.key.enter', {
      AiProviderService: { getSettings: async () => ({ usageMode: 'included', provider: 'openai' }) },
    });
    const refused = await executeTool(asleep, { field: 'tavily' }, { requestContext: requestContextFor(registry) });
    expect(refused.output).toMatchObject({ ok: false, code: 'AI_SEARCH_KEY_ON_SYSTEM_KEYS' });
    expect(refused.parts).toEqual([]);
  });

  test('a service refusal keeps its code for the model', async () => {
    const { output } = await executeTool(
      build('piece.rename', {
        PieceService: {
          updateTitle: async () => {
            throw Object.assign(new Error('Такой заготовки нет.'), {
              code: 'PIECE_NOT_FOUND',
              status: 404,
            });
          },
        },
      }),
      { pieceId: 'nope', title: 'x' },
      { requestContext: requestContextFor(registry) }
    );
    expect(output).toEqual({ ok: false, code: 'PIECE_NOT_FOUND', reason: 'Такой заготовки нет.' });
  });

  test('paid: the intake generator\'s events stream as transient progress, the piece card is persisted', async () => {
    const prepared = [];
    const services = {
      IntakeService: {
        ...all['piece.create'].services.IntakeService,
        prepare: async (organizationId, body) => {
          prepared.push([organizationId, body]);
          return { plan: true };
        },
      },
    };
    const { output, parts } = await executeTool(
      build('piece.create', services),
      all['piece.create'].input,
      { requestContext: requestContextFor(registry) }
    );
    expect(prepared).toEqual([
      [
        'org-1',
        {
          input: 'Мысль человека про контент-завод',
          inputKind: 'thought',
          language: 'ru',
          options: { researchEnabled: false, researchLevel: 'standard' },
        },
      ],
    ]);
    const progress = parts.filter((part) => part.type === 'data-progress');
    expect(progress.map((part) => part.data.stage)).toEqual([
      'intake-started',
      'piece',
      'piece-questions',
      'done',
    ]);
    expect(progress.every((part) => part.transient === true)).toBe(true);
    const cards = parts.filter((part) => part.type === 'data-piece');
    expect(cards).toEqual([
      { type: 'data-piece', data: { kind: 'piece', id: 'p9', code: 'cnt-9', questions: 1 } },
    ]);
    expect(output.summary).toEqual({ pieceId: 'p9', code: 'cnt-9', questions: 1 });
  });

  test('paid: an error line of the generator becomes a coded refusal', async () => {
    const { output } = await executeTool(
      build('piece.create', {
        IntakeService: {
          prepare: async () => ({}),
          run: async function* () {
            yield { name: 'error', code: 'AI_ALLOWANCE_EXHAUSTED', message: 'Лимит исчерпан.' };
          },
        },
      }),
      { text: 'мысль' },
      { requestContext: requestContextFor(registry) }
    );
    expect(output).toEqual({
      ok: false,
      code: 'AI_ALLOWANCE_EXHAUSTED',
      reason: 'Лимит исчерпан.',
    });
  });

  test('confirm: deleting runs the door\'s service once the call is let through', async () => {
    const calls = [];
    const { output } = await executeTool(
      build('piece.delete', { PieceService: { delete: async (...args) => void calls.push(args) } }),
      { pieceId: 'p1' },
      { requestContext: requestContextFor(registry) }
    );
    expect(calls).toEqual([['org-1', 'p1']]);
    expect(output.summary).toEqual({ pieceId: 'p1', deleted: true });
  });

  describe('input: activating an avatar needs the person\'s own consent', () => {
    const voice = (blocker = null) => {
      const calls = [];
      const asked = [];
      return {
        calls,
        asked,
        services: {
          VoiceService: {
            activationBlocker: async (...args) => {
              asked.push(args);
              return blocker;
            },
            activateProposal: async (...args) => void calls.push(args),
          },
        },
      };
    };

    test('kcxz.29 D7: an avatar that is not ready is refused with its reason, and nobody is asked to consent', async () => {
      const refusal = Object.assign(new Error('Голос нельзя включить, пока пусто строк: 1.'), {
        name: 'VoiceError',
        code: 'VOICE_FIELDS_INCOMPLETE',
      });
      const { calls, asked, services } = voice(refusal);
      const { output, suspended } = await executeTool(
        build('avatar.activate', services),
        { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1', mode: 'manual' },
        { requestContext: requestContextFor(registry) }
      );
      expect(asked).toEqual([
        [{ organizationId: 'org-1', userId: 'user-1', canManage: true, avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1' }, 'manual'],
      ]);
      expect(suspended).toEqual([]);
      expect(calls).toEqual([]);
      expect(output).toEqual(
        expect.objectContaining({ ok: false, code: 'VOICE_FIELDS_INCOMPLETE' })
      );
    });

    test('the first call only asks: a question card, nothing activated', async () => {
      const { calls, services } = voice();
      const { output, suspended } = await executeTool(
        build('avatar.activate', services),
        { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1' },
        { requestContext: requestContextFor(registry) }
      );
      expect(output).toBeUndefined();
      expect(calls).toEqual([]);
      expect(suspended).toEqual([
        {
          question: expect.stringContaining('право писать этим голосом'),
          avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1',
          mode: 'assist',
          // The avatar could not be read here: the card asks for a name, as
          // before, and the consent is not blocked (W3 walk P3-F, P3-G).
          avatarName: null,
          avatarKind: 'person',
          canDecideForPerson: false,
        },
      ]);
      expect(registry.avatarActivate.suspendSchema.safeParse(suspended[0]).success).toBe(true);
    });

    test('the model cannot pass consent: an extra field in its input is dropped and the card is still shown', async () => {
      const { calls, services } = voice();
      const { suspended } = await executeTool(
        build('avatar.activate', services),
        { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1', consentGiven: true },
        { requestContext: requestContextFor(registry) }
      );
      expect(suspended).toHaveLength(1);
      expect(calls).toEqual([]);
    });

    test('the person\'s «да» activates through the door\'s service, with the role deciding who may manage', async () => {
      const { calls, services } = voice();
      const { output, parts } = await executeTool(
        build('avatar.activate', services),
        { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1' },
        {
          requestContext: requestContextFor(registry),
          resumeData: { consentGiven: true, avatarName: 'Игорь' },
        }
      );
      expect(calls).toEqual([
        [
          { organizationId: 'org-1', userId: 'user-1', canManage: true, avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1' },
          { version: 2, consentGiven: true, avatarName: 'Игорь', mode: undefined },
        ],
      ]);
      // W3 recheck R-1: the answer says the consent is done and nothing waits.
      expect(output.summary).toEqual({
        avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1',
        activated: true,
        ...(output.summary.name ? { name: output.summary.name } : {}),
        message: expect.stringContaining('nothing waits for a confirmation'),
      });
      // Named as the person named it on the card (kcxz.29, D12).
      expect(parts).toEqual([
        { type: 'data-avatar', data: { kind: 'avatar', id: 'a1a1a1a1-0000-4000-8000-0000000000a1', name: 'Игорь' } },
      ]);
    });

    test('the person\'s «нет» activates nothing', async () => {
      const { calls, services } = voice();
      const { output } = await executeTool(
        build('avatar.activate', services),
        { avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1' },
        { requestContext: requestContextFor(registry), resumeData: { consentGiven: false } }
      );
      expect(calls).toEqual([]);
      expect(output.summary).toEqual({
        avatarId: 'a1a1a1a1-0000-4000-8000-0000000000a1',
        activated: false,
        message: expect.stringContaining('the avatar stays off'),
      });
    });
  });
});

describe('MCP tools from the same registry', () => {
  const all = fixtures();
  const gate = () => new registry.DoorPolicyGate(permissionsService());
  const mcpTools = (role, services = {}) =>
    registry.buildMcpCapabilityTools(catalogue, {
      services: servicesFrom(services),
      gate: gate(),
      language: 'en',
      role,
    });

  test('confirm, input and secret never reach MCP — but scheduling and moving, asked in the conversation (kcxz.49)', () => {
    const names = Object.keys(mcpTools('ADMIN'));
    expect(names).toEqual([
      'workspace_snapshot',
      'channels_list',
      'piece_list',
      'piece_open',
      'piece_rename',
      'piece_archive',
      'piece_create',
      'piece_answer',
      'piece_core_edit',
      'piece_material_add',
      'piece_core_restore',
      'piece_core_rebuild',
      'piece_research',
      'piece_check_facts',
      'piece_rewrite',
      'piece_adapt',
      'channel_writing_remember',
      'adaptation_review',
      'adaptation_rewrite',
      'adaptation_edit',
      'adaptation_image',
      // The plan's reads and the reserve; scheduling and moving are confirm,
      // asked in the conversation with a one-time code (kcxz.49).
      'plan_ahead',
      'plan_calendar',
      'plan_ready',
      'plan_place',
      'plan_unschedule',
      'plan_schedule',
      'plan_move',
      // Avatars (kcxz.18): reads, changes and the paid runs; activating,
      // deleting, forgetting and retiring ask on a card and stay web-only.
      'avatar_list',
      'avatar_overview',
      'avatar_proposal',
      'avatar_manual',
      'avatar_samples',
      'avatar_learning',
      'avatar_create',
      'avatar_rename',
      'avatar_default',
      'avatar_bind',
      'avatar_samples_add',
      'avatar_proposal_field',
      'avatar_manual_field',
      'avatar_analyse',
      'avatar_learn',
      'channel_open',
      'channel_posts',
      'channel_writing',
      'channel_plan',
      'channel_times',
      // AI settings (kcxz.20): the reads only; the mode, the key card and
      // removing a key stay web-only.
      'ai_settings',
      'ai_usage',
      // Ideas (kcxz.23): all but a topic subscription, which asks on a card
      // (a standing paid search) and stays web-only.
      'ideas_list',
      'ideas_queue',
      'ideas_feed_add',
      'ideas_archive',
      'ideas_check',
      'ideas_dismiss',
      'ideas_take',
      // Facts, own texts, the cliché check and analytics (kcxz.24): all but
      // retracting a fact, which asks on a card and stays web-only.
      'facts_list',
      'facts_add',
      'facts_restore',
      'texts_related',
      'text_slop_check',
      'analytics_production',
      'analytics_channel',
      // The media library and a generated picture (kcxz.25): a paid run over
      // MCP is bounded by the allowance (or the own key) and the MCP
      // throttler — MCP admits with `countPaid: false`, so there is no
      // per-turn paid cap (review W4-25 F9); the pictures receipt is web-only.
      'media_library',
      'media_generate',
    ]);
    // MCP has no question card: the intake's facts choice is not offered there.
    expect(mcpTools('ADMIN').piece_create.suspendSchema).toBeUndefined();
    for (const capability of catalogue.filter(
      (entry) => ['confirm', 'input', 'secret'].includes(entry.risk) && !entry.mcpConfirm
    )) {
      expect(names).not.toContain(registry.toolNameOf(capability.id));
    }
  });

  test('a USER token lists only the reads', () => {
    expect(Object.keys(mcpTools('USER'))).toEqual([
      'workspace_snapshot',
      'channels_list',
      'piece_list',
      'piece_open',
      'plan_ahead',
      'plan_calendar',
      'plan_ready',
      'avatar_list',
      'avatar_overview',
      'avatar_proposal',
      'avatar_manual',
      'avatar_samples',
      'avatar_learning',
      'channel_open',
      'channel_posts',
      'ideas_list',
      'ideas_queue',
      // Facts, own texts and analytics are read by every member (kcxz.24);
      // the cliché check is an editor's (its door's policy).
      'facts_list',
      'texts_related',
      'analytics_production',
      'analytics_channel',
      // The media library is read by every member (kcxz.25).
      'media_library',
    ]);
  });

  test('the first two capabilities work through MCP as through the chat', async () => {
    for (const id of ['workspace.snapshot', 'channels.list']) {
      const services = all[id].services;
      const chat = await executeTool(build(id, services), {}, {
        requestContext: requestContextFor(registry),
      });
      const mcp = await executeTool(mcpTools('EDITOR', services)[registry.toolNameOf(id)], {}, {
        requestContext: requestContextFor(registry),
      });
      expect(mcp.output).toEqual(chat.output);
      expect(mcp.output.ok).toBe(true);
    }
  });

  test('over MCP the intake decides the facts for the person: no card to ask on (kcxz.12)', async () => {
    const prepared = [];
    const services = {
      IntakeService: {
        prepare: async (_organizationId, body) => {
          prepared.push(body);
          return { body };
        },
        run: async function* (_organizationId, plan) {
          if (!plan.body.researchSelections) {
            yield {
              name: 'research-selection-required',
              level: 'quick',
              snapshotKey: 'snap-9',
              facts: [
                { factKey: 'f1', statement: 'one', selected: true },
                { factKey: 'f2', statement: 'two', selected: false },
              ],
            };
            yield { name: 'done', pieceId: null };
            return;
          }
          yield { name: 'piece', pieceId: 'p9', code: 'cnt-9' };
          yield { name: 'done', pieceId: 'p9' };
        },
      },
    };
    const tool = mcpTools('EDITOR', services).piece_create;
    // As the MCP server calls it: no agent, so no suspend.
    const output = await tool.execute(
      { text: 'Напиши пост про созвоны', inputKind: 'instruction', research: 'quick' },
      { requestContext: requestContextFor(registry) }
    );
    expect(output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p9', research: 'quick', factsKept: 1, factsCard: 'not_shown' },
    });
    expect(prepared.map((body) => [body.researchSelections ?? null, body.snapshotKey ?? null])).toEqual([
      [null, null],
      [['f1'], 'snap-9'],
    ]);
  });

  test('over MCP accepting a proposal is refused before anything is spent (kcxz.13)', async () => {
    const calls = [];
    const services = {
      PieceService: {
        researchCore: async () => void calls.push('researchCore'),
        reviewV2: async () => void calls.push('reviewV2'),
      },
    };
    const tools = mcpTools('EDITOR', services);
    for (const [name, input] of [
      ['piece_research', { pieceId: 'p1' }],
      ['piece_check_facts', { pieceId: 'p1' }],
      ['piece_rewrite', { pieceId: 'p1', instruction: 'короче' }],
    ]) {
      const output = await tools[name].execute(input, { requestContext: requestContextFor(registry) });
      expect({ name, code: output.code }).toEqual({ name, code: 'INPUT_NEEDS_PERSON' });
    }
    expect(calls).toEqual([]);
  });

  test('each MCP call re-checks the door, since MCP has no agent hooks', async () => {
    let calls = 0;
    const tools = mcpTools('EDITOR', {
      PieceService: { updateTitle: async () => void (calls += 1) },
    });
    // The member was an editor when the list was built and is a USER now.
    const { output } = await executeTool(
      tools.piece_rename,
      { pieceId: 'p1', title: 'x' },
      { requestContext: requestContextFor(registry, { ...IDENTITY, role: 'USER' }) }
    );
    expect(output.code).toBe('PERMISSION_DENIED');
    expect(calls).toBe(0);
  });

  test('an MCP tool cannot be built without the policy gate', () => {
    expect(() =>
      registry.buildCapabilityTool(find('channels.list'), {
        services: servicesFrom({}),
        language: 'en',
        entrance: 'mcp',
      })
    ).toThrow(/policy gate/);
  });
});

describe('U1: a paid capability inside a turn writes its own ledger row', () => {
  const workspaceKey = {
    usageMode: 'workspace_key',
    provider: 'openai',
    apiKey: 'workspace-key',
    textModel: 'text-model',
    imageModel: 'image-model',
    search: { enabled: false, apiKey: '' },
  };

  const setup = () => {
    const real = providerConfig();
    const aiConfig = { ...real, loadAiConfig: async () => workspaceKey };
    const rows = [];
    const { AiUsageService } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/openai/ai.usage.service.ts',
      {
        '@prisma/client': {
          Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
        },
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
          PrismaService: class {},
        },
        '@contentfactory/nestjs-libraries/openai/ai.provider.config': aiConfig,
        '@contentfactory/nestjs-libraries/user/acting.user': {
          getActingUserId: () => 'user-1',
        },
      }
    );
    const usage = new AiUsageService({
      aiUsageRecord: {
        create: async ({ data }) => {
          const row = { id: `row-${rows.length + 1}`, ...data };
          rows.push(row);
          return row;
        },
        update: async ({ where, data }) => {
          Object.assign(rows.find((row) => row.id === where.id), data);
          return {};
        },
      },
    });
    const local = loadRegistry({ aiConfig });
    const intake = {
      prepare: async () => ({}),
      // The door's generator: its own paid step is an `intake` operation.
      run: async function* (organizationId) {
        await usage.executeAiOperation(organizationId, 'intake', async () => 'extracted');
        yield { name: 'piece', pieceId: 'p9', code: 'cnt-9' };
        yield { name: 'done', pieceId: 'p9' };
      },
    };
    return { usage, rows, local, intake };
  };

  const turn = (usage, callback) =>
    usage.executeAiOperation(IDENTITY.organizationId, 'agent', callback);

  test('through the paid adapter: exactly one agent row and one intake row, each with its own role', async () => {
    const { usage, rows, local, intake } = setup();
    const tool = local.buildCapabilityTool(local.pieceCreate, {
      services: servicesFrom({ IntakeService: intake }),
      language: 'ru',
      entrance: 'chat',
    });
    const { output } = await turn(usage, () =>
      executeTool(tool, { text: 'мысль' }, { requestContext: requestContextFor(local) })
    );
    expect(output.ok).toBe(true);
    expect(rows.map((row) => [row.operation, row.role, row.userId, row.status])).toEqual([
      // Role `agent` since the conductor got its own AI role (kcxz.7).
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
  });

  test('control: the same service called inside the turn without the adapter is absorbed', async () => {
    const { usage, rows, intake } = setup();
    await turn(usage, async () => {
      for await (const _event of intake.run(IDENTITY.organizationId)) {
        // drained inside the turn's admission
      }
    });
    expect(rows.map((row) => row.operation)).toEqual(['agent']);
  });
});
