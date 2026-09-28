'use strict';

/**
 * Avatars from the chat (`content-factory-next-kcxz.18`): what the recorded
 * scenarios do not reach.
 *
 * - A sample file never passes through the model: the composer uploads it to
 *   the avatar door and the message carries a bounded receipt, which the chat
 *   door turns into untrusted data and the screen reads back as the files'
 *   line.
 * - USER cannot create or analyse, even if a tool call reaches the hooks.
 * - The analysis is read to its end when the chat drops, so the proposal is
 *   stored and the next call pays nothing.
 * - One resume rule for the screen and the chat; every voice code has words.
 */

const {
  IDENTITY,
  executeTool,
  fixtures,
  loadCapabilityModule,
  loadRegistry,
  permissionsService,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const registry = loadRegistry();
const catalogue = registry.CAPABILITY_CATALOGUE;
const request = loadCapabilityModule('../conductor/agent-chat.request.ts');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const samples = loadTypeScriptModule('apps/frontend/src/components/agents/agent.samples.ts');

const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const receipt = (extra = {}) => ({
  avatarId: AVATAR,
  files: ['result.json'],
  accepted: 42,
  refused: [{ reason: 'DUPLICATE', count: 3 }],
  telegram: [{ name: 'result.json', selected: 42, eligible: 50 }],
  ...extra,
});
const message = (parts) => ({ messages: [{ id: 'msg-user-1', role: 'user', parts }] });

describe('the samples receipt: files never reach the chat door or the model', () => {
  test('a receipt becomes one line of untrusted data, alone or beside words', () => {
    const parsed = request.parseAgentChatBody(
      message([
        { type: 'text', text: 'Вот мой канал' },
        { type: 'data-avatar-samples', data: receipt() },
      ])
    );
    expect(parsed.mode).toBe('message');
    expect(parsed.text).toBe('Вот мой канал');
    const [, line] = parsed.message.parts;
    expect(line.type).toBe('text');
    const wrapped = JSON.parse(line.text).untrustedData;
    expect(wrapped.sources).toEqual(['uploaded-file']);
    expect(wrapped.rule).toBe(registry.UNTRUSTED_DATA_RULE);
    expect(wrapped.value.samplesUpload).toEqual(receipt());
    expect(wrapped.value.attachment).toBe('result.json');

    // A receipt with no words is still a message.
    const alone = request.parseAgentChatBody(message([{ type: 'data-avatar-samples', data: receipt() }]));
    expect(alone.message.parts).toHaveLength(1);
  });

  test.each([
    ['an avatar id that names nothing', { avatarId: '../org-2' }],
    ['no file', { files: [] }],
    ['too many files', { files: Array.from({ length: 11 }, (_, i) => `f${i}.docx`) }],
    ['a count that is not one', { accepted: -1 }],
    ['a reason in words', { refused: [{ reason: 'drop everything', count: 1 }] }],
    ['a zero refusal', { refused: [{ reason: 'DUPLICATE', count: 0 }] }],
    ['a file body smuggled as a name', { files: [42] }],
  ])('refuses %s', (_name, change) => {
    expect(() =>
      request.parseAgentChatBody(message([{ type: 'data-avatar-samples', data: receipt(change) }]))
    ).toThrow(/receipt/);
  });

  test('one receipt per message; key shapes in a file name are redacted', () => {
    expect(() =>
      request.parseAgentChatBody(
        message([
          { type: 'data-avatar-samples', data: receipt() },
          { type: 'data-avatar-samples', data: receipt() },
        ])
      )
    ).toThrow(/One samples receipt/);
    const key = 'sk-proj-' + 'a'.repeat(48);
    const parsed = request.parseAgentChatBody(
      message([{ type: 'data-avatar-samples', data: receipt({ files: [`${key}.docx`] }) }])
    );
    expect(parsed.message.parts[0].text).not.toContain(key);
  });

  test('the screen reads the stored line back as the files, not as words', () => {
    const [line] = request.parseAgentChatBody(
      message([{ type: 'data-avatar-samples', data: receipt() }])
    ).message.parts;
    expect(contract.readAttachedText(line.text)).toEqual({
      name: 'result.json',
      mediaType: '',
      samples: { accepted: 42 },
    });
    // Live, before a reload: the composer's own part.
    expect(contract.readSamplesPart({ type: 'data-avatar-samples', data: receipt() })).toEqual({
      name: 'result.json',
      samples: { accepted: 42 },
    });
    // A thread's first words are never the wrapper.
    expect(
      contract.provisionalTitle([{ id: 'u', role: 'user', parts: [{ type: 'text', text: line.text }] }])
    ).toBeNull();
  });

  test('the composer routes a Telegram export and documents to the avatar door, the rest to the chat', () => {
    expect(samples.isSamplesFile({ name: 'result.json' })).toBe(true);
    expect(samples.isSamplesFile({ name: 'ChatExport/result.json' })).toBe(true);
    expect(samples.isSamplesFile({ name: 'posts.docx' })).toBe(true);
    expect(samples.isSamplesFile({ name: 'posts.PDF' })).toBe(true);
    expect(samples.isSamplesFile({ name: 'notes.txt' })).toBe(false);
    expect(samples.isSamplesFile({ name: 'data.json' })).toBe(false);
    expect(samples.SAMPLES_LIMITS).toEqual({
      maxFiles: 10,
      maxFileBytes: 20 * 1024 * 1024,
      maxBatchBytes: 40 * 1024 * 1024,
    });
  });

  test('the receipt is counts and reasons from the door’s answer — never a text', () => {
    const answer = {
      accepted: [{ code: 'smp-01', title: 'Пост про созвоны' }, { code: 'smp-02', title: 'Второй' }],
      rejected: [
        { title: 'Короткий пост', reason: 'TOO_SHORT' },
        { title: 'Ещё короче', reason: 'TOO_SHORT' },
        { title: 'x', reason: 'weird reason' },
      ],
      telegramSelection: [{ name: 'result.json', selected: 2, eligible: 5 }],
    };
    const made = samples.samplesReceipt(answer, [{ name: 'result.json' }], AVATAR);
    expect(made).toEqual({
      avatarId: AVATAR,
      files: ['result.json'],
      accepted: 2,
      refused: [
        { reason: 'TOO_SHORT', count: 2 },
        { reason: 'UNREADABLE', count: 1 },
      ],
      telegram: [{ name: 'result.json', selected: 2, eligible: 5 }],
    });
    expect(JSON.stringify(made)).not.toContain('созвоны');
    // What the composer makes, the door takes.
    expect(() =>
      request.parseAgentChatBody(message([{ type: 'data-avatar-samples', data: made }]))
    ).not.toThrow();
  });

  test('the upload is the samples screen’s own request, scoped to the avatar', async () => {
    const sent = [];
    const fetcher = async (url, init) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ accepted: [{}], rejected: [] }), { status: 200 });
    };
    const file = new File(['{}'], 'result.json', { type: 'application/json' });
    const made = await samples.uploadSamples(fetcher, [file], { avatarId: AVATAR, locale: 'ru' });
    expect(made.accepted).toBe(1);
    expect(sent[0].url).toBe(`/content-intelligence/voice/samples/files?avatar=${AVATAR}`);
    const form = sent[0].init.body;
    expect(form.get('usagePurpose')).toBe('OWN_VOICE');
    expect(form.get('language')).toBe('ru');
    expect(form.getAll('files')).toHaveLength(1);

    const refused = async () =>
      new Response(JSON.stringify({ code: 'VOICE_UPLOAD_REJECTED', message: 'Слишком много.' }), { status: 413 });
    await expect(samples.uploadSamples(refused, [file], { avatarId: null, locale: 'ru' })).rejects.toMatchObject({
      code: 'VOICE_UPLOAD_REJECTED',
    });
  });
});

describe('who may do what', () => {
  const gate = new registry.DoorPolicyGate(permissionsService());
  const contextFor = (role) => requestContextFor(registry, { ...IDENTITY, role });
  const find = (id) => catalogue.find((capability) => capability.id === id);

  test.each(['avatar.create', 'avatar.analyse', 'avatar.samples.add', 'avatar.learn'])(
    'a USER call of %s is refused by the hooks even if it gets there',
    async (id) => {
      const refused = await registry.admitCapabilityCall(find(id), fixtures()[id].input, contextFor('USER'), gate, {
        countPaid: true,
      });
      expect(refused).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    }
  );

  test('an EDITOR passes the same door', async () => {
    const admitted = await registry.admitCapabilityCall(
      find('avatar.create'),
      { kind: 'person' },
      contextFor('EDITOR'),
      gate,
      { countPaid: true }
    );
    expect(admitted).toBeNull();
  });

  test('every avatar capability names a door of the avatar screen or the channel card', () => {
    const avatarGroup = catalogue.filter((capability) => capability.group === 'avatar');
    expect(avatarGroup.length).toBe(20);
    for (const capability of avatarGroup) {
      expect([capability.id, capability.door.controller.name]).toEqual([
        capability.id,
        capability.id === 'avatar.bind' ? 'IntegrationsController' : 'BrandVoiceController',
      ]);
    }
  });
});

describe('the analysis', () => {
  const find = (id) => catalogue.find((capability) => capability.id === id);

  test('a dropped chat does not stop the run: it is read to the end and stored', async () => {
    let finished = false;
    let stored = false;
    const voice = {
      ...fixtures()['avatar.analyse'].services.VoiceService,
      analysis: async () =>
        stored
          ? { outcome: 'ready', corpusChanged: false, hasProposal: true, measuredAt: new Date().toISOString() }
          : { outcome: 'insufficient' },
      analysisStream: async function* () {
        yield { name: 'started', samples: 0, planned: 0 };
        yield { name: 'measured', sampleCount: 3 };
        yield { name: 'call', stage: 'map', index: 1, total: 1, ok: true };
        stored = true;
        yield { name: 'done', analysis: { outcome: 'ready', sampleCount: 3 } };
        finished = true;
      },
    };
    const tool = registry.buildCapabilityTool(find('avatar.analyse'), {
      services: servicesFrom({ VoiceService: voice }),
      language: 'ru',
      entrance: 'chat',
    });
    let written = 0;
    const run = (dropAfter) =>
      tool.execute(
        { avatarId: AVATAR },
        {
          requestContext: requestContextFor(registry),
          writer: {
            custom: async () => {
              written += 1;
              if (written > dropAfter) throw new Error('the browser went away');
            },
          },
          agent: {},
        }
      );
    // The browser goes away after the first progress line: the run is read
    // to its end all the same (the card that follows has nowhere to go).
    await run(1).catch(() => undefined);
    expect(finished).toBe(true);
    expect(stored).toBe(true);
    // The next call finds the proposal and pays nothing.
    written = 0;
    finished = false;
    const again = await run(Infinity);
    expect(again).toMatchObject({ ok: true, summary: { outcome: 'proposal', spent: false } });
    expect(finished).toBe(false);
  });

  test('one resume rule: the screen re-exports the library’s', () => {
    const shared = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/brand-voice/analysis-resume.ts'
    );
    const wizard = loadTypeScriptModule('apps/frontend/src/components/brand-voice/voice-wizard.adapter.ts');
    const at = Date.parse('2026-09-28T10:00:00.000Z');
    const cases = [
      null,
      { outcome: 'insufficient' },
      { outcome: 'ready', corpusChanged: false, hasProposal: true },
      { outcome: 'ready', corpusChanged: false, measuredAt: '2026-09-28T09:55:00.000Z' },
      { outcome: 'ready', corpusChanged: false, measuredAt: '2026-09-28T08:00:00.000Z' },
      { outcome: 'ready', corpusChanged: true, hasProposal: true },
    ];
    expect(cases.map((one) => shared.resumeStepFor(one, at))).toEqual([
      'samples',
      'samples',
      'proposal',
      'waiting',
      'analysis',
      'samples',
    ]);
    expect(cases.map((one) => wizard.resumeStepFor(one, at))).toEqual(
      cases.map((one) => shared.resumeStepFor(one, at))
    );
    expect(wizard.ANALYSIS_BACKGROUND_WINDOW_MS).toBe(shared.ANALYSIS_BACKGROUND_WINDOW_MS);
  });

  test('progress stages have words, and a forgotten rule reads as final', () => {
    const { agentCopy, stageWordFor } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
    for (const locale of ['ru', 'en']) {
      const words = agentCopy[locale];
      expect(stageWordFor(words, 'voice-measured')).toBe(words.progress.stages.measuring);
      expect(stageWordFor(words, 'voice-call')).toBe(words.progress.stages.proposing);
    }
    const [block] = contract.readMessageBlocks({
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-avatar_rule_forget',
          toolCallId: 'call_1',
          state: 'approval-requested',
          input: { ruleId: 'r-1' },
          approval: { id: 'run-1::call_1' },
        },
      ],
    });
    expect(block).toMatchObject({ type: 'approval', irreversible: true });
  });
});

describe('error words', () => {
  test('every voice code has what happened and what next, in both languages', () => {
    const { VOICE_ERROR_CODES } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts'
    );
    const { agentCopy } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
    const missing = [];
    for (const locale of ['ru', 'en']) {
      // The avatar's own codes; the materials and radar ones share the table.
      for (const code of Object.keys(VOICE_ERROR_CODES).filter((one) => one.startsWith('VOICE_'))) {
        const words = agentCopy[locale].error.codes[code];
        if (!words?.what || !words?.next) missing.push(`${locale}:${code}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test('the samples line names the files and the count', () => {
    const { agentCopy } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
    expect(agentCopy.ru.conversation.samplesAdded('result.json', 42)).toBe(
      'result.json — в образцы аватара: 42 текста'
    );
    expect(agentCopy.en.conversation.samplesAdded('result.json', 1)).toBe(
      "result.json — to the avatar's samples: 1 text"
    );
  });
});

describe('the untouched workspace', () => {
  test('the avatar screen’s own read is what the overview reports, with the resume step', async () => {
    const tool = registry.buildCapabilityTool(
      catalogue.find((capability) => capability.id === 'avatar.overview'),
      {
        services: servicesFrom({
          VoiceService: {
            overview: async () => ({ hasVoice: false, readiness: { ready: true, sampleCount: 8, charCount: 9000 } }),
            analysis: async () => ({
              outcome: 'ready',
              corpusChanged: false,
              hasProposal: false,
              measuredAt: '2026-09-01T00:00:00.000Z',
            }),
          },
        }),
        language: 'ru',
        entrance: 'chat',
      }
    );
    const { output } = await executeTool(tool, {}, { requestContext: requestContextFor(registry) });
    expect(output.summary).toMatchObject({
      avatarId: null,
      hasVoice: false,
      resumeAt: 'analysis',
      measuredAt: '2026-09-01T00:00:00.000Z',
      samples: { ready: true, sampleCount: 8, charCount: 9000 },
    });
  });
});

/* ---- Correctness review W3-18 ------------------------------------------- */

describe('review W3-18: what the scenarios do not reach', () => {
  const find = (id) => catalogue.find((capability) => capability.id === id);
  const toolOf = (id, VoiceService) =>
    registry.buildCapabilityTool(find(id), {
      services: servicesFrom({ VoiceService }),
      language: 'ru',
      entrance: 'chat',
    });

  test('F3: the door hands the receipt’s avatar to the ownership check and says the counts are a report', () => {
    const parsed = request.parseAgentChatBody(message([{ type: 'data-avatar-samples', data: receipt() }]));
    expect(parsed.samplesAvatarId).toBe(AVATAR);
    const wrapped = JSON.parse(parsed.message.parts[0].text).untrustedData.value;
    expect(wrapped.note).toMatch(/browser reports/);
    const unnamed = request.parseAgentChatBody(
      message([{ type: 'data-avatar-samples', data: receipt({ avatarId: null }) }])
    );
    expect(unnamed.samplesAvatarId).toBeNull();
    const plain = request.parseAgentChatBody(message([{ type: 'text', text: 'Привет' }]));
    expect('samplesAvatarId' in plain).toBe(false);
  });

  test('F2: only an avatar made in this conversation chooses where samples go — not a read card', () => {
    const CREATED = '00000000-0000-4000-8000-000000000100';
    const assistant = (parts) => ({ id: `m-${parts[0].toolCallId}`, role: 'assistant', parts });
    const read = assistant([
      {
        type: 'tool-avatar_proposal',
        toolCallId: 'c1',
        state: 'output-available',
        input: { avatarId: AVATAR },
        output: { ok: true, summary: {}, card: { kind: 'avatar', id: AVATAR } },
      },
    ]);
    expect(contract.createdAvatarOf([read])).toBeNull();
    const made = assistant([
      {
        type: 'tool-avatar_create',
        toolCallId: 'c2',
        state: 'output-available',
        input: { name: 'Бренд' },
        output: { ok: true, summary: {}, card: { kind: 'avatar', id: CREATED } },
      },
    ]);
    expect(contract.createdAvatarOf([made, read])).toEqual({ id: CREATED, name: 'Бренд' });
    // Deleted later in the conversation: no longer a target.
    expect(contract.createdAvatarOf([made], new Set([`avatar:${CREATED}`]))).toBeNull();
  });

  test('F2: an avatar that is gone falls back to the default once, and says so', async () => {
    const urls = [];
    const fetcher = async (url) => {
      urls.push(url);
      return url.includes('?avatar=')
        ? new Response(JSON.stringify({ code: 'VOICE_AVATAR_NOT_FOUND', message: 'Нет.' }), { status: 404 })
        : new Response(JSON.stringify({ accepted: [{}], rejected: [] }), { status: 200 });
    };
    const file = new File(['{}'], 'result.json', { type: 'application/json' });
    const sent = await samples.sendSamplesTo(fetcher, [file], { avatarId: AVATAR, locale: 'ru' });
    expect(sent.fellBack).toBe(true);
    expect(sent.receipt).toMatchObject({ avatarId: null, accepted: 1 });
    expect(urls).toEqual([
      `/content-intelligence/voice/samples/files?avatar=${AVATAR}`,
      '/content-intelligence/voice/samples/files',
    ]);
    // Any other refusal is the person's to read; nothing is retried.
    const refused = async () =>
      new Response(JSON.stringify({ code: 'VOICE_UPLOAD_REJECTED', message: 'Много.' }), { status: 413 });
    await expect(samples.sendSamplesTo(refused, [file], { avatarId: AVATAR, locale: 'ru' })).rejects.toMatchObject({
      code: 'VOICE_UPLOAD_REJECTED',
    });
  });

  test('F4: an analysis that spent nothing gives the turn’s paid slot back', async () => {
    const tool = toolOf('avatar.analyse', {
      analysis: async () => ({
        outcome: 'ready',
        corpusChanged: false,
        hasProposal: true,
        measuredAt: new Date().toISOString(),
        sampleCount: 3,
      }),
      avatars: async () => ({ avatars: [{ id: AVATAR, name: 'Игорь', isDefault: true, analysed: true }] }),
    });
    const context = requestContextFor(registry);
    expect(registry.reservePaidSlot(context).ok).toBe(true);
    const { output } = await executeTool(tool, { avatarId: AVATAR }, { requestContext: context });
    expect(output.summary).toMatchObject({ outcome: 'proposal', spent: false });
    expect(registry.reservePaidSlot(context).ok).toBe(true);
  });

  test('F8: pasted samples fit one message of the person, each and together', () => {
    const input = find('avatar.samples.add').input;
    const long = 'а'.repeat(request.AGENT_MESSAGE_MAX_CHARS + 1);
    expect(input.safeParse({ samples: [{ text: long }] }).success).toBe(false);
    const half = 'а'.repeat(request.AGENT_MESSAGE_MAX_CHARS / 2 + 1);
    expect(input.safeParse({ samples: [{ text: half }, { text: half }] }).success).toBe(false);
    expect(input.safeParse({ samples: [{ text: 'Мой пост.' }] }).success).toBe(true);
  });

  test('F10: an avatar id that is not a UUID is VOICE_AVATAR_NOT_FOUND, before any service', async () => {
    let asked = 0;
    const tool = toolOf('avatar.activate', {
      activationBlocker: async () => {
        asked += 1;
        return null;
      },
    });
    const { output } = await executeTool(tool, { avatarId: 'undefined' }, { requestContext: requestContextFor(registry) });
    expect(output).toMatchObject({ ok: false, code: 'VOICE_AVATAR_NOT_FOUND' });
    expect(asked).toBe(0);
  });

  test('F11: what the avatar learned is bounded in count and length', async () => {
    const rules = Array.from({ length: 40 }, (_, index) => ({ id: `r-${index}`, text: 'п'.repeat(2000), pairs: 5 }));
    const tool = toolOf('avatar.learning', {
      learning: async () => ({ pending: 0, minPairs: 5, rules, lastRunAt: null }),
    });
    const { output } = await executeTool(tool, { avatarId: AVATAR }, { requestContext: requestContextFor(registry) });
    const value = output.summary.untrustedData.value;
    expect(value.rules).toHaveLength(12);
    expect(value.rulesTotal).toBe(40);
    expect(Math.max(...value.rules.map((rule) => rule.text.length))).toBeLessThanOrEqual(300);
  });

  test('F11: a card for an avatar that is not there says so instead of «без имени», and the call refuses', async () => {
    const MISSING = 'b0b0b0b0-0000-4000-8000-00000000b0b0';
    const services = servicesFrom({
      VoiceService: {
        avatars: async () => ({ avatars: [{ id: AVATAR, name: 'Игорь', isDefault: true, analysed: true }] }),
        deleteProfile: async () => {
          throw new Error('must not run');
        },
      },
    });
    const line = await registry.describeApprovalCall(catalogue, services, { ...IDENTITY, language: 'ru' }, 'avatar_retire', {
      avatarId: MISSING,
    });
    expect(line).toBe(`Аватара ${MISSING} в этом пространстве нет — ничего не изменится`);
    const tool = registry.buildCapabilityTool(find('avatar.retire'), { services, language: 'ru', entrance: 'chat' });
    const { output } = await executeTool(tool, { avatarId: MISSING }, { requestContext: requestContextFor(registry) });
    expect(output).toMatchObject({ ok: false, code: 'VOICE_AVATAR_NOT_FOUND' });
  });
});
