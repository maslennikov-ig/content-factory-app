'use strict';

const {
  IDENTITY, INJECTION, executeTool, loadCapabilityModule, loadRegistry,
  permissionsService, requestContextFor, servicesFrom,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((entry) => entry.id === id);
const gate = new registry.DoorPolicyGate(permissionsService());
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const { VoiceService } = loadTypeScriptModule(`${base}/voice.service.ts`, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {}, PrismaTransaction: class {},
  },
});
const { VoiceError } = loadTypeScriptModule(`${base}/voice-errors.ts`);
const AVATAR = 'a1a1a1a1-0000-4000-8000-000000000001';
const FOREIGN = 'a2a2a2a2-0000-4000-8000-000000000002';
const toneOf = (content) => content.voice.traits.find((trait) => trait.name === 'Тон').guidance;

// Real VoiceService and generated Mastra tool; persistence is an in-memory
// repository. No model, database or network is involved. Manual v2 is written
// through the same method the UI uses, before the chat reads or edits it.
const harness = () => {
  const initialContent = {
    version: 'v1',
    project: {
      name: 'Учебный проект', description: 'Описание, которое никто не менял',
      audiences: [{ name: 'Редакторы', need: 'Редакторы' }], contentGoals: ['Разборы'],
    },
    voice: {
      traits: [{ name: 'Кто говорит', guidance: 'Редактор' }, { name: 'Тон', guidance: 'Исходный тон' }],
      sentenceStyle: 'Короткие фразы', addressForm: 'vy',
      lexicon: { preferred: ['практика'], forbidden: ['синергия'] },
    },
    guardrails: { prohibitedClaims: ['мы лучшие'] },
    platformOverrides: { telegram: { notes: 'Сохранить настройку канала' } },
  };
  const versions = [{
    id: 'ver-1', versionNumber: 1, label: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    content: structuredClone(initialContent),
  }];
  let active = versions[0];
  const scope = (org, avatar) => {
    if (org !== IDENTITY.organizationId || avatar !== AVATAR) {
      throw new VoiceError('VOICE_AVATAR_NOT_FOUND', 'Аватар не найден.');
    }
  };
  const profiles = {
    overview: jest.fn(async (org, avatar) => {
      scope(org, avatar);
      return { activeVersion: active, versions, profile: { activeVersionId: active?.id } };
    }),
    peersWithSameContent: async () => ({ versionIds: [], measurementIds: [] }),
    createDraft: jest.fn(async (org, user, content, label, avatar) => {
      scope(org, avatar);
      const number = versions.length + 1;
      const version = { ...versions[0], id: `ver-${number}`, versionNumber: number, label, content };
      versions.push(version);
      return version;
    }),
    activate: jest.fn(async (org, user, id) => {
      expect(org).toBe(IDENTITY.organizationId);
      expect(user).toBe(IDENTITY.userId);
      active = versions.find((version) => version.id === id);
    }),
  };
  const samples = { measurementByIds: async () => null, measurementForVersions: async () => null };
  const service = new VoiceService(samples, profiles, null, {}, () => new Date('2026-01-01T00:00:00Z'));
  service.manualProposal = jest.fn(() => { throw new Error('Active passport must not read the manual draft'); });
  service.proposal = jest.fn(() => { throw new Error('Active passport must not read the analysis proposal'); });
  const call = async (id, input, identity = IDENTITY) => {
    const capability = find(id);
    expect(capability).toBeDefined();
    const requestContext = requestContextFor(registry, identity);
    const refusal = await registry.admitCapabilityCall(capability, input, requestContext, gate, { countPaid: true });
    if (refusal) return { output: refusal, suspended: [] };
    const tool = registry.buildCapabilityTool(capability, {
      services: servicesFrom({ VoiceService: service }), language: 'ru', entrance: 'chat',
    });
    return executeTool(tool, input, { requestContext });
  };
  return {
    service, profiles, versions, initialContent, call,
    actor: { organizationId: IDENTITY.organizationId, userId: IDENTITY.userId, avatarId: AVATAR, canManage: true },
    active: () => active,
    clearVoice: () => { active = null; },
  };
};

describe('active avatar passport has the same native read and edit path in chat', () => {
  test('the native doors and explicit avatar input match the manual passport', () => {
    for (const [id, handler, risk] of [
      ['avatar.passport', 'passport', 'read'],
      ['avatar.passport.field', 'setPassportField', 'write'],
    ]) {
      const capability = find(id);
      expect(capability).toBeDefined();
      expect(capability.door.controller.name).toBe('BrandVoiceController');
      expect(capability.door.method).toBe(handler);
      expect(capability.risk).toBe(risk);
      expect(capability.untrusted).toEqual(['workspace-text']);
      expect(capability.input.safeParse({ field: 'TONE', text: 'Спокойно' }).success).toBe(false);
    }
  });

  test('a chat edit based on v1 cannot replace a manual v2 saved after the chat read', async () => {
    const h = harness();
    const read = await h.call('avatar.passport', { avatarId: AVATAR });
    expect(read.output.summary.untrustedData.value.versionLabel).toBe('v1');
    await h.service.setPassportField(h.actor, { key: 'TONE', text: 'Свежая ручная правка' });
    const result = await h.call('avatar.passport.field', {
      avatarId: AVATAR, field: 'TONE', expectedVersionId: 'ver-1',
      text: 'Исходный тон. Дополнение из чата.',
    });
    expect(result.output).toMatchObject({ ok: false, code: 'VOICE_VERSION_CONFLICT' });
    expect(toneOf(h.active().content)).toBe('Свежая ручная правка');
    expect(h.versions).toHaveLength(2);
  });

  test('manual v2 is read and extended into native v3 without losing the manual edit or other content', async () => {
    const h = harness();
    const manualTone = 'Ручная правка: спокойно, точно, без пафоса.';
    await h.service.setPassportField(h.actor, { key: 'TONE', text: manualTone });
    expect(h.versions).toHaveLength(2);
    const before = structuredClone(h.active().content);
    const read = await h.call('avatar.passport', { avatarId: AVATAR });
    expect(read.output.ok).toBe(true);
    const current = read.output.summary.untrustedData.value;
    expect(current).toMatchObject({ avatarId: AVATAR, hasVoice: true, versionLabel: 'v2' });
    expect(current.fields.find((field) => field.key === 'TONE')).toEqual({ key: 'TONE', text: manualTone });
    expect(current.fields).toHaveLength(6);

    const extended = `${manualTone} Всегда отделять факт от предположения.`;
    const edited = await h.call('avatar.passport.field', { avatarId: AVATAR, field: 'TONE', expectedVersionId: h.active().id, text: extended });
    expect(edited.output.ok).toBe(true);
    expect(edited.suspended).toEqual([]);
    expect(edited.output.summary.untrustedData.value).toMatchObject({ avatarId: AVATAR, versionLabel: 'v3' });
    expect(h.versions).toHaveLength(3);
    expect(toneOf(h.versions[1].content)).toBe(manualTone);
    const expected = structuredClone(before);
    expected.voice.traits.find((trait) => trait.name === 'Тон').guidance = extended;
    expect(h.active().content).toEqual(expected);
    expect(h.profiles.createDraft.mock.calls.at(-1).slice(0, 2)).toEqual([IDENTITY.organizationId, IDENTITY.userId]);
    expect(h.profiles.createDraft.mock.calls.at(-1)[4]).toBe(AVATAR);
    expect(h.service.manualProposal).not.toHaveBeenCalled();
    expect(h.service.proposal).not.toHaveBeenCalled();

    await h.call('avatar.passport.field', { avatarId: AVATAR, field: 'TONE', expectedVersionId: h.active().id, text: extended });
    expect(h.versions).toHaveLength(3);
  });

  test('USER can read; the actual editor door refuses USER writes before native persistence', async () => {
    const h = harness();
    const identity = { ...IDENTITY, role: 'USER' };
    expect((await h.call('avatar.passport', { avatarId: AVATAR }, identity)).output.ok).toBe(true);
    const refused = await h.call('avatar.passport.field', { avatarId: AVATAR, field: 'TONE', expectedVersionId: 'ver-1', text: 'Новый тон' }, identity);
    expect(refused.output).toMatchObject({ ok: false, code: 'PERMISSION_DENIED' });
    expect(h.profiles.createDraft).not.toHaveBeenCalled();
  });

  test.each(['avatar.passport', 'avatar.passport.field'])('%s preserves foreign-avatar and invalid-id native refusals', async (id) => {
    const h = harness();
    for (const avatarId of [FOREIGN, 'undefined']) {
      const result = await h.call(id, { avatarId, field: 'TONE', expectedVersionId: 'ver-1', text: 'Новый тон' });
      expect(result.output).toMatchObject({ ok: false, code: 'VOICE_AVATAR_NOT_FOUND' });
    }
    const result = await h.call(id, { avatarId: AVATAR, field: 'TONE', expectedVersionId: 'ver-1', text: 'Новый тон' }, { ...IDENTITY, organizationId: 'org-other' });
    expect(result.output).toMatchObject({ ok: false, code: 'VOICE_AVATAR_NOT_FOUND' });
    expect(h.profiles.createDraft).not.toHaveBeenCalled();
  });

  test('empty active voice is readable and its edit keeps the native missing-voice error', async () => {
    const h = harness();
    h.clearVoice();
    const read = await h.call('avatar.passport', { avatarId: AVATAR });
    expect(read.output.summary.untrustedData.value).toMatchObject({ hasVoice: false, fields: [], versionLabel: null });
    const edited = await h.call('avatar.passport.field', { avatarId: AVATAR, field: 'TONE', expectedVersionId: 'ver-1', text: 'Новый тон' });
    expect(edited.output).toMatchObject({ ok: false, code: 'VOICE_PROFILE_NOT_FOUND' });
    expect(h.profiles.createDraft).not.toHaveBeenCalled();
  });

  test('the one-field schema enforces the same six keys and 600-character text bound', () => {
    const capability = find('avatar.passport.field');
    expect(capability).toBeDefined();
    for (const input of [{ field: 'UNKNOWN', text: 'Тон' }, { field: 'TONE', text: '  ' }, { field: 'TONE', text: 'я'.repeat(601) }]) {
      expect(capability.input.safeParse({ avatarId: AVATAR, expectedVersionId: 'ver-1', ...input }).success).toBe(false);
    }
    expect(capability.input.safeParse({ avatarId: AVATAR, field: 'TONE', expectedVersionId: 'ver-1', text: 'я'.repeat(600) }).success).toBe(true);
    expect(capability.input.safeParse({ avatarId: AVATAR, field: 'TONE', text: 'Тон без прочитанной версии' }).success).toBe(false);
  });

  test('passport text is bounded untrusted data; examples and arbitrary native properties never reach the model', async () => {
    const h = harness();
    h.service.passport = async () => ({ state: 'default', voice: {
      whoSpeaks: INJECTION, tone: 'я'.repeat(5000), audience: '', sentenceStyle: '',
      neverSay: Array(100).fill('н'.repeat(1000)), topics: '',
      versionLabel: INJECTION, addressForm: 'vy', delegatedPolicy: 'knowledge',
      examples: [{ text: 'PRIVATE_SAMPLE' }], arbitrary: 'PRIVATE_DATA',
    } });
    const result = await h.call('avatar.passport', { avatarId: AVATAR });
    const data = result.output.summary.untrustedData;
    expect(data.sources).toEqual(['workspace-text']);
    expect(data.rule).toBe(registry.UNTRUSTED_DATA_RULE);
    expect(data.value.fields.find((field) => field.key === 'WHO_SPEAKS').text).toBe(INJECTION);
    expect(data.value.fields.find((field) => field.key === 'TONE')).toMatchObject({ truncated: true });
    expect(Math.max(...data.value.fields.map((field) => field.text.length))).toBeLessThanOrEqual(600);
    expect(JSON.stringify(result.model)).not.toMatch(/PRIVATE_SAMPLE|PRIVATE_DATA/);
  });

  test('the avatar skill reads active passport before extending a line and keeps creation separate', () => {
    const { CONDUCTOR_SKILL_SPECS } = loadCapabilityModule('../conductor/conductor.skills.ts');
    const avatar = CONDUCTOR_SKILL_SPECS.find((skill) => skill.name === 'avatars');
    expect(avatar.instructions).toMatch(/avatar\.passport/);
    expect(avatar.instructions).toMatch(/avatar\.passport\.field/);
    expect(avatar.instructions).toMatch(/preserv/i);
    expect(avatar.instructions).toMatch(/avatar\.manual\.field/);
    expect(avatar.instructions).toMatch(/avatar\.activate/);
  });
});
