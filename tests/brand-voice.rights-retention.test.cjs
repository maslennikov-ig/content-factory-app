'use strict';

require('reflect-metadata');

/**
 * Three things the screens draw and the product owes them: a right, a reason,
 * and a way out of the data.
 *
 * A member without the right to change a voice sees the passport and no
 * buttons — the `restricted` state is a policy decision, not a prop, and a
 * blank screen would be a lie about what the workspace holds.
 *
 * Samples are other people's writing, even when the organisation wrote them.
 * Deleting one erases the words and keeps the fact that the corpus once held
 * them; a reference corpus erases itself on its own date, and the measurement
 * derived from it stays readable afterwards because it carries the numbers it
 * was computed on.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const controllerPath = 'apps/backend/src/api/routes/brand-voice.controller.ts';
const schedulerPath =
  'apps/backend/src/services/content-intelligence/voice-retention.scheduler.ts';

const relativeSources = () => {
  const map = {};
  for (const file of fs.readdirSync(path.join(repositoryRoot, voiceBase))) {
    if (!file.endsWith('.ts')) continue;
    map[`./${file.replace(/\.ts$/u, '')}`] = `${voiceBase}/${file}`;
  }
  return map;
};

const sources = {
  ...relativeSources(),
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${profileBase}/brand-profile.types.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation': `${profileBase}/brand-profile.validation.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository': `${profileBase}/brand-profile.repository.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${voiceBase}/voice-wiring.contract.ts`,
  // The controller's own neighbours: the batch guard and the `MulterError`
  // filter, compiled rather than stubbed, so this suite fails if either goes.
  './brand-voice.upload': 'apps/backend/src/api/routes/brand-voice.upload.ts',
  './brand-voice.paste': 'apps/backend/src/api/routes/brand-voice.paste.ts',
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const { VoiceService } = loadTypeScriptModule(
  `${voiceBase}/voice.service.ts`,
  prismaMocks,
  { sources }
);
const { VoiceSampleRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-sample.repository.ts`,
  prismaMocks,
  { sources }
);
const { VoiceProfileRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-profile.repository.ts`,
  prismaMocks,
  { sources }
);
const { BrandProfileRepository } = loadTypeScriptModule(
  `${profileBase}/brand-profile.repository.ts`,
  prismaMocks,
  { sources }
);

const policyRecord = new Map();
const { BrandVoiceController } = loadTypeScriptModule(
  controllerPath,
  {
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => () => undefined,
    },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: (policies) => (target, property) => {
        policyRecord.set(property, policies);
      },
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      {
        AuthorizationActions: {
          Create: 'create',
          Read: 'read',
          Update: 'update',
          Delete: 'delete',
        },
        Sections: { ADMIN: 'admin', EDITOR: 'editor' },
      },
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/brand-voice.dto':
      {},
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service':
      { VoiceService },
  },
  { sources }
);

/**
 * The agent pass, with every door to a real model mocked shut. The proposal
 * has to exist before a profile can be deleted, and building it through the
 * real pipeline is what keeps this suite honest about what deletion removes.
 */
const assistModule = loadTypeScriptModule(
  `${voiceBase}/voice-assist.service.ts`,
  {
    'openai/helpers/zod': { zodResponseFormat: () => ({}) },
    '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
      requireActiveAiConfig: async () => ({ textModel: 'test-model' }),
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getOpenAiClient: async () => {
        throw new Error('a test must never reach a model');
      },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      AiUsageService: class AiUsageService {},
    },
  },
  { sources }
);

const intervals = [];
const { VoiceRetentionScheduler } = loadTypeScriptModule(
  schedulerPath,
  {
    '@nestjs/schedule': {
      Interval: (ms) => (target, property) => {
        intervals.push({ ms, property });
      },
    },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service':
      { VoiceService },
  },
  { sources }
);

const QUOTE = 'Поставщика поменяли — старый срывал сроки';
const PARAGRAPH =
  `${QUOTE}. Новый возит по графику, и это видно по журналу смены. ` +
  'На складе стало спокойнее: остатки сходятся, отгрузки не переносим. Разница в том, что теперь ' +
  'мы считаем не на глаз, а по накладным. Никто не обещал чуда, но за месяц накопилось меньше ' +
  'просрочек, чем за прошлый квартал. Что мы поменяли: сначала график, потом приёмку, потом отчёт. ';

const items = (count, prefix = 'Текст') =>
  Array.from({ length: count }, (unused, index) => ({
    title: `${prefix} ${index + 1}`,
    text: `Запись номер ${index + 1}. ${PARAGRAPH.repeat(4)}`,
  }));

const admin = { organizationId: 'org-a', userId: 'user-admin', canManage: true };
const member = {
  organizationId: 'org-a',
  userId: 'user-member',
  canManage: false,
};

const NOW = new Date('2026-08-22T12:00:00.000Z');

const groundedTransport = () => ({
  complete: async ({ stage }) => {
    if (stage === 'map') {
      return {
        sampleCode: 'smp-01',
        observations: [
          {
            field: 'WHO_SPEAKS',
            metric: 'firstPerson',
            quote: QUOTE,
            claim: 'Автор пишет от лица бригады и называет действие прямо.',
          },
        ],
      };
    }
    return {
      fields: [
        {
          field: 'WHO_SPEAKS',
          text: 'Бригадир участка, от первого лица множественного числа.',
          observationRefs: ['smp-01#1'],
        },
        {
          field: 'TONE',
          text: 'Спокойно и по делу, без обещаний.',
          observationRefs: ['smp-01#1'],
        },
      ],
      pointOfView: 'first_person',
      formality: 'conversational',
      emojiPolicy: 'none',
      hashtagPolicy: 'none',
      neverSay: ['гарантированный результат'],
    };
  },
});

function harness(now = () => NOW) {
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction,
    now
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  const assist = {
    propose: (input) =>
      assistModule.runVoiceAssist(groundedTransport(), input),
  };
  const service = new VoiceService(samples, profiles, assist, {}, now);
  return { prisma, samples, profiles, service };
}

const fill = (service, count = 12) =>
  service.intake(admin, {
    origin: 'PASTE',
    usagePurpose: 'OWN_VOICE',
    language: 'ru',
    items: items(count),
  });

describe('a right is a policy, not a prop', () => {
  test('deleting a voice profile is an editor route', () => {
    // `content-factory-next-fn33.90`: голос бренда — работа редактора, и
    // удаление профиля вместе с ним. Пользователю дверь по-прежнему закрыта,
    // и `VOICE_FORBIDDEN` ниже — по-прежнему 403.
    expect(policyRecord.get('deleteProfile')).toEqual(['delete', 'editor']);
  });

  test('a member is refused with the code the screen turns into restricted', async () => {
    const { service } = harness();

    await expect(service.deleteProfile(member)).rejects.toMatchObject({
      code: 'VOICE_FORBIDDEN',
      status: 403,
    });
  });

  test('the refusal names a reason a person can read', async () => {
    const { service } = harness();

    // "Что-то пошло не так" over a server that named the reason is a reason
    // thrown away between two processes.
    await service.deleteProfile(member).catch((error) => {
      expect(error.message.length).toBeGreaterThan(20);
      expect(error.message).not.toMatch(/error|failed/i);
    });
  });
});

describe('deleting the profile leaves the history and loses the voice', () => {
  test('the passport goes back to the "no voice" view, which is a working state', async () => {
    const { service } = harness();
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    // At least one field accepted: an activation with nothing accepted would
    // carry no traits at all, which the shared brand-profile validation
    // (vme.12) now refuses for the same reason the form already did.
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true });

    const before = await service.passport(admin);
    expect(before.voice).not.toBeNull();

    await service.deleteProfile(admin);
    const after = await service.passport(admin);

    expect(after.voice).toBeNull();
    expect(after.state).toBe('empty');
  });

  test('versions stay in the history rather than disappearing with the pointer', async () => {
    const { service } = harness();
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    // At least one field accepted: an activation with nothing accepted would
    // carry no traits at all, which the shared brand-profile validation
    // (vme.12) now refuses for the same reason the form already did.
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true });

    const before = await service.versions(admin);
    await service.deleteProfile(admin);
    const after = await service.versions(admin);

    expect(after.versions.length).toBe(before.versions.length);
    expect(after.versions.some((version) => version.active)).toBe(false);
  });

  test('the measurement survives and still says what it was computed on', async () => {
    const { prisma, service } = harness();
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    // At least one field accepted: an activation with nothing accepted would
    // carry no traits at all, which the shared brand-profile validation
    // (vme.12) now refuses for the same reason the form already did.
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true });
    await service.deleteProfile(admin);

    const [measurement] = prisma.state.brandVoiceMeasurement;

    // A corridor nobody can reproduce is a number the generator obeys for no
    // stated reason. Deleting the profile must not turn one into the other.
    expect(measurement.analyzerVersion).toMatch(/^brand-voice-analyzer\//);
    expect(measurement.localePackVersion).toMatch(/^ru-/);
    expect(measurement.sampleCount).toBeGreaterThan(0);
    expect(measurement.stale).toBe(false);
  });
});

describe('a reference corpus erases itself on its own date', () => {
  const reference = (retentionUntil) => ({
    origin: 'PASTE',
    usagePurpose: 'STYLE_REFERENCE',
    language: 'ru',
    rightsConfirmed: true,
    retentionUntil,
    items: items(3, 'Чужой текст'),
  });

  test('an expired reference keeps its row and loses its words', async () => {
    const { prisma, service, samples } = harness();
    await service.intake(admin, reference('2026-08-01T00:00:00.000Z'));

    const erased = await samples.purgeExpiredReferences();

    expect(erased).toBe(3);
    const rows = prisma.state.brandVoiceSample;
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.text === '')).toBe(true);
    // The row stays so the corpus history is honest about what it once held.
    expect(rows.every((row) => row.charCount > 0)).toBe(true);
  });

  test('a reference still inside its date is left alone', async () => {
    const { prisma, service, samples } = harness();
    await service.intake(admin, reference('2026-12-31T00:00:00.000Z'));

    expect(await samples.purgeExpiredReferences()).toBe(0);
    expect(prisma.state.brandVoiceSample.every((row) => row.text)).toBe(true);
  });

  test("the workspace's own texts have no expiry and are never touched", async () => {
    const { prisma, service, samples } = harness();
    await fill(service, 3);

    expect(await samples.purgeExpiredReferences()).toBe(0);
    expect(prisma.state.brandVoiceSample.every((row) => row.text)).toBe(true);
  });

  test('an expiry does not make the measurement stale — it was expected', async () => {
    const { prisma, service, samples } = harness();
    await service.intake(admin, reference('2026-08-01T00:00:00.000Z'));
    await fill(service);
    await service.runAnalysis(admin, {});

    await samples.purgeExpiredReferences();

    // Deleting a sample marks measurements stale because a person changed
    // their mind. An expiry is the agreement working, and the numbers derived
    // from the text are exactly what the agreement said would remain.
    expect(
      prisma.state.brandVoiceMeasurement.every((row) => row.stale === false)
    ).toBe(true);
  });
});

describe('the erasure runs on its own rather than on a page view', () => {
  test('a scheduler exists and sweeps on an interval', () => {
    expect(typeof VoiceRetentionScheduler.prototype.sweep).toBe('function');
    expect(intervals).toHaveLength(1);
    expect(intervals[0].property).toBe('sweep');
    // Once a day is enough for a retention date, and often enough that an
    // expired text does not sit in the database for a week.
    expect(intervals[0].ms).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(intervals[0].ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test('the sweep asks the repository and reports what it erased', async () => {
    const calls = [];
    const scheduler = new VoiceRetentionScheduler({
      purgeExpiredReferences: async () => {
        calls.push('purge');
        return 4;
      },
    });

    expect(await scheduler.sweep()).toBe(4);
    expect(calls).toEqual(['purge']);
  });
});
