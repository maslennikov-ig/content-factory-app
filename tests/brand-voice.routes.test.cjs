'use strict';

require('reflect-metadata');

/**
 * The routes behind screens 01–10, and the four things they must not confuse.
 *
 * A short corpus is not a failure — it arrives as a result carrying the two
 * numbers still missing. A model that refused is not an empty profile — an
 * empty profile reads as "your writing has no character", which is a false
 * statement about somebody's texts. A member without rights is not an empty
 * workspace. And the deterministic analysis never leaves the process, so a
 * workspace with no AI quota still sees its own manner in numbers.
 *
 * No model is called anywhere in this file: the transports are recorded
 * answers, and the one place a real client would be built is mocked so that
 * loading it proves a call was never possible.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const controllerPath = 'apps/backend/src/api/routes/brand-voice.controller.ts';
const dtoPath =
  'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts';

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
const contract = loadTypeScriptModule(
  `${voiceBase}/voice-wiring.contract.ts`,
  {},
  { sources }
);
/** The scales' own names, where both sides of the product read them from. */
const types = loadTypeScriptModule(
  `${voiceBase}/brand-voice.types.ts`,
  {},
  { sources }
);
// The exact function the brand-profile form's own activation route calls
// (`BrandProfileService.activateVersion`). Loaded directly here rather than
// through the service, so a vme.12 test can ask the same question the form
// would ask about content the voice section produced.
const { validateBrandProfileContent } = loadTypeScriptModule(
  `${profileBase}/brand-profile.validation.ts`,
  {},
  { sources }
);

/**
 * The assist service, loaded with every door to a real model mocked shut.
 *
 * If the file ever grew a second way out, this suite would build it here and
 * the mock would not cover it — which is the point of loading the real module
 * rather than reimplementing its retry rule.
 */
const assistMocks = {
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
};
const assistModule = loadTypeScriptModule(
  `${voiceBase}/voice-assist.service.ts`,
  assistMocks,
  { sources }
);

/* ---------------------------------------------------------------------- *
 * The controller, with the policy layer recorded rather than executed
 * ---------------------------------------------------------------------- */

const policyRecord = new Map();
const paramDecorators = new Set();

const controllerModule = loadTypeScriptModule(
  controllerPath,
  {
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: () => {
        paramDecorators.add('GetOrgFromRequest');
        return () => undefined;
      },
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: () => {
        paramDecorators.add('GetUserFromRequest');
        return () => undefined;
      },
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
const { BrandVoiceController } = controllerModule;

/* ---------------------------------------------------------------------- *
 * A database small enough to read
 * ---------------------------------------------------------------------- */

const {
  InMemoryVoicePrisma,
} = require('./helpers/voice-memory-prisma.cjs');


/* ---------------------------------------------------------------------- *
 * Fixtures
 * ---------------------------------------------------------------------- */

const QUOTE = 'Поставщика поменяли — старый срывал сроки';
const PARAGRAPH =
  `${QUOTE}. Новый возит по графику, и это видно по журналу смены. ` +
  'На складе стало спокойнее: остатки сходятся, отгрузки не переносим. Разница в том, что теперь ' +
  'мы считаем не на глаз, а по накладным. Никто не обещал чуда, но за месяц накопилось меньше ' +
  'просрочек, чем за прошлый квартал. Что мы поменяли: сначала график, потом приёмку, потом отчёт. ';

const items = (count) =>
  Array.from({ length: count }, (unused, index) => ({
    title: `Текст ${index + 1}`,
    text: `Запись номер ${index + 1}. ${PARAGRAPH.repeat(4)}`,
  }));

const admin = { organizationId: 'org-a', userId: 'user-admin', canManage: true };
const member = {
  organizationId: 'org-a',
  userId: 'user-member',
  canManage: false,
};

/** A model that answers correctly: a real quote from the sample it names. */
const groundedTransport = (calls) => ({
  complete: async ({ stage }) => {
    calls.push(stage);
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

/** A model that invents a quote that reads like the author but is not theirs. */
const ungroundedTransport = (calls) => ({
  complete: async ({ stage }) => {
    calls.push(stage);
    return {
      sampleCode: 'smp-01',
      observations: [
        {
          field: 'TONE',
          metric: null,
          quote: 'Мы всегда стремимся к безупречному качеству сервиса',
          claim: 'Автор подчёркивает приверженность качеству.',
        },
      ],
    };
  },
});

/** A model that is simply not there. */
const brokenTransport = (calls) => ({
  complete: async ({ stage }) => {
    calls.push(stage);
    throw new Error('upstream refused');
  },
});

function harness(options = {}) {
  const prisma = new InMemoryVoicePrisma();
  const samples = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );
  const service = new VoiceService(
    samples,
    profiles,
    options.assist ?? null,
    options.policy ?? {},
    options.now ?? (() => new Date('2026-08-22T12:00:00.000Z'))
  );
  return { prisma, samples, profiles, service };
}

/** Twelve texts of this length clear the 15 000-character corpus floor. */
const fill = async (service, count = 12, body = {}) =>
  service.intake(admin, {
    origin: 'PASTE',
    usagePurpose: 'OWN_VOICE',
    language: 'ru',
    items: items(count),
    ...body,
  });

/**
 * The five lines a hand-written voice needs before it can activate.
 *
 * Shared at module scope rather than redeclared per suite: every describe
 * block that activates a hand-written voice needs the same five values and
 * the same loop to write them, and a second copy of either would drift.
 */
const FIVE = {
  WHO_SPEAKS: 'Бригадир участка, от лица смены.',
  TONE: 'Спокойно и по делу, без обещаний.',
  AUDIENCE: 'Заказчики и снабженцы, которые читают на бегу.',
  SENTENCE_LENGTH: 'Короткие фразы, десять-двенадцать слов.',
  NEVER_SAY: 'гарантированный результат; лидер рынка',
};

const writeAll = async (service, over = {}) => {
  const values = { ...FIVE, ...over };
  for (const [key, text] of Object.entries(values)) {
    await service.manualField(admin, { key, text });
  }
  return values;
};

/* ---------------------------------------------------------------------- */

describe('every screen the contract lists has a route that answers it', () => {
  const declared = new Map();
  for (const property of Object.getOwnPropertyNames(
    BrandVoiceController.prototype
  )) {
    if (property === 'constructor') continue;
    const handler = BrandVoiceController.prototype[property];
    const routePath = Reflect.getMetadata('path', handler);
    const method = Reflect.getMetadata('method', handler);
    if (routePath === undefined) continue;
    declared.set(`${method}:${routePath}`, property);
  }

  const METHODS = { GET: 0, POST: 1, PUT: 2, DELETE: 3, PATCH: 4 };
  const base = contract.VOICE_API_BASE;

  const voiceSurfaces = Object.entries(contract.VOICE_SURFACES).filter(
    ([, surface]) =>
      surface.routes.every((route) => route.path.startsWith(base))
  );

  test('the registry and the controller agree, surface by surface', () => {
    const missing = [];
    for (const [key, surface] of voiceSurfaces) {
      for (const route of surface.routes) {
        const suffix = route.path.slice(base.length) || '/';
        const found = declared.get(`${METHODS[route.method]}:${suffix}`);
        if (!found) missing.push(`${key} ${route.method} ${route.path}`);
      }
    }

    expect(missing).toEqual([]);
    // Screens 01–09, the strip and the avatars list. `materials` and `brief`
    // hang off their own bases and are other tasks.
    expect(voiceSurfaces.map(([key]) => key)).toEqual([
      'empty',
      'paths',
      'samples',
      'analysis',
      'proposal',
      'passport',
      'scales',
      'redactions',
      'versions',
      'ribbon',
      'avatars',
      // Чему аватар научился на правках: без номера у дизайна, блок на
      // странице аватара (решение владельца 05.09.2026).
      'learning',
    ]);
  });

  test('every changing route carries a policy, and reading needs none', () => {
    const changing = [
      'addSamples',
      'deleteSamples',
      'runAnalysis',
      'proposalField',
      'manualProposalField',
      'activateProposal',
      'setCorridor',
      'restoreVersion',
      // Заводит, переименовывает, назначает и удаляет аватары — редактор.
      // Без этих четырёх «Аватары заводит редактор» осталось бы надписью.
      'createAvatar',
      'updateAvatar',
      'setDefaultAvatar',
      'deleteAvatar',
      // Учить аватара на правках стоит вызова модели, а отмена правила меняет
      // то, чем он пишет: обе двери — администратора, как и правка голоса.
      'learnFromEdits',
      'forgetLearnedRule',
    ];
    for (const handler of changing) {
      expect(policyRecord.has(handler)).toBe(true);
      const [action, section] = policyRecord.get(handler);
      expect(['create', 'update', 'delete']).toContain(action);
      // Раздел `editor`, а не `admin`, с 05.09.2026: решение владельца
      // (`content-factory-next-fn33.90`) отдало голос бренда и аватары
      // редактору. Порог сдвинулся, требование «на каждой меняющей двери
      // есть политика» — нет, и оно здесь главное.
      expect(section).toBe('editor');
    }
    // Without this the `restricted` state the screens draw would be a drawing:
    // a member would be told no and would still have been able to write.
    // Список аватаров читает и участник: выбрать аватар в черновике он может,
    // значит должен видеть, какие есть.
    for (const handler of [
      'overview',
      'paths',
      'samples',
      'passport',
      'avatars',
      // Что аватар выучил, читает всякий, кто его видит: это то же чтение,
      // что паспорт голоса.
      'learning',
    ]) {
      expect(policyRecord.has(handler)).toBe(false);
    }
  });

  test('the organisation comes from the request and never from a body', () => {
    expect(paramDecorators.has('GetOrgFromRequest')).toBe(true);
    expect(paramDecorators.has('GetUserFromRequest')).toBe(true);

    const code = fs
      .readFileSync(path.join(repositoryRoot, controllerPath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');
    // A tenant a caller can name is a tenant a caller can pick. Checked on the
    // access rather than on the word, so the file may explain the rule.
    expect(code).not.toMatch(/body[?.]*\.organizationId/u);
    expect(code).not.toMatch(/organizationId\s*:\s*body/u);

    const dto = fs.readFileSync(path.join(repositoryRoot, dtoPath), 'utf8');
    expect(dto).not.toMatch(/^\s+organizationId/mu);
  });
});

describe('a short corpus is a result, not a refusal', () => {
  test('the analysis answers with the two numbers still missing', async () => {
    const { service } = harness();
    await fill(service, 2);

    const answer = await service.runAnalysis(admin, {});

    expect(answer.outcome).toBe('insufficient');
    expect(answer.readiness.ready).toBe(false);
    expect(answer.readiness.missingSamples).toBeGreaterThan(0);
    expect(answer.readiness.missingChars).toBeGreaterThan(0);
    // A workspace eight thousand characters from the floor has done nothing
    // wrong, and "что-то пошло не так" throws the useful part away.
    expect(answer).not.toHaveProperty('code');
  });

  test('the proposal answers the same way before anything was measured', async () => {
    const { service } = harness();
    await fill(service, 2);

    const answer = await service.proposal(admin);

    expect(answer.outcome).toBe('insufficient');
    expect(answer.readiness.sampleCount).toBe(2);
  });

  test('a corpus over the floor is measured without any network call', async () => {
    const calls = [];
    const { service } = harness({
      assist: { propose: async () => calls.push('assist') },
    });
    await fill(service);

    const answer = await service.runAnalysis(admin, {});

    expect(answer.outcome).toBe('ready');
    expect(answer.analyzerVersion).toBe(contract.ANALYZER_VERSION);
    expect(answer.localePackVersion).toBe(contract.LOCALE_PACK_VERSION);
    expect(answer.sentenceCount).toBeGreaterThan(0);
    // The deterministic half stands alone: no key, no quota, no model.
    expect(calls).toEqual([]);
  });

  test('the corpus a run did not count is named as held back, not lost', async () => {
    // A corpus of eight is measured on six, and nothing is rejected. Without
    // the holdout count the step reports a smaller number than the corpus
    // step showed, with nothing said — the missing texts read as loss.
    const { service } = harness();
    await fill(service);

    const ran = await service.runAnalysis(admin, {});
    const read = await service.analysis(admin);

    expect(ran.holdoutCount).toBeGreaterThan(0);
    expect(read.holdoutCount).toBe(ran.holdoutCount);
    expect(ran.rejected).toEqual([]);
  });

  test('reading the analysis back says exactly what the run said', async () => {
    const { service } = harness();
    await fill(service);
    await service.intake(admin, {
      origin: 'PASTE',
      usagePurpose: 'OWN_VOICE',
      language: 'en',
      items: [{ title: 'Not Russian', text: `English note. ${PARAGRAPH}` }],
    });

    const ran = await service.runAnalysis(admin, {});
    const read = await service.analysis(admin);

    expect(read).toEqual(ran);
    // A text dropped before counting stays dropped and named, not silently
    // absorbed into "everything was counted".
    expect(read.rejected.map((one) => one.reason)).toContain('LANGUAGE');
  });
});

describe('a model that refused is not an empty profile', () => {
  test('a model that does not answer becomes VOICE_ASSIST_UNAVAILABLE', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(brokenTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);

    await expect(service.runAnalysis(admin, { withAssist: true })).rejects.toMatchObject(
      { code: 'VOICE_ASSIST_UNAVAILABLE', status: 502 }
    );
    expect(calls.length).toBeGreaterThan(0);
  });

  test('the numbers the refusal promises are there to read afterwards', async () => {
    // The refusal says «Числа разбора сохранены». It said so over a row that
    // was never written until the measurement moved ahead of the model call:
    // the corpus was recounted from nothing on the next attempt, and that
    // attempt is a paid call.
    const assist = {
      propose: (input) => assistModule.runVoiceAssist(brokenTransport([]), input),
    };
    const { service } = harness({ assist });
    await fill(service);

    await expect(
      service.runAnalysis(admin, { withAssist: true })
    ).rejects.toMatchObject({ code: 'VOICE_ASSIST_UNAVAILABLE' });

    const read = await service.analysis(admin);
    expect(read.outcome).toBe('ready');
    expect(read.charCount).toBeGreaterThan(0);
    expect(read.sampleCount).toBeGreaterThan(0);

    // And the proposal is honestly absent rather than half-written.
    const proposal = await service.proposal(admin);
    expect(proposal.state).toBe('empty');
  });

  test('a model that invents a quote is asked exactly once more, then refused', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(ungroundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);

    await expect(
      service.runAnalysis(admin, { withAssist: true })
    ).rejects.toMatchObject({ code: 'VOICE_ASSIST_UNGROUNDED', status: 502 });

    // Two runs of the pipeline over the same corpus and no third: a repeat is
    // worth one bill, not an unbounded one.
    const mapCalls = calls.filter((stage) => stage === 'map');
    expect(mapCalls.length % 2).toBe(0);
    expect(calls).not.toContain('reduce');
  });

  test('a grounded answer is kept with the quote it rests on', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);

    const answer = await service.runAnalysis(admin, { withAssist: true });
    expect(answer.outcome).toBe('ready');

    const proposal = await service.proposal(admin);
    expect(proposal.outcome).toBe('ready');
    expect(proposal.fields.map((field) => field.key)).toContain('WHO_SPEAKS');
    expect(proposal.observations[0].quote).toBe(QUOTE);
    expect(proposal.observations[0].sampleCode).toBe('smp-01');
    expect(proposal.fields.every((field) => field.status === 'UNDECIDED')).toBe(
      true
    );
  });

  test('the refusal is told apart from a short corpus by its shape', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(brokenTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service, 2);

    // Two samples: the corpus gate answers first and the model is never asked.
    const answer = await service.runAnalysis(admin, { withAssist: true });
    expect(answer.outcome).toBe('insufficient');
    expect(calls).toEqual([]);
  });
});

describe('accepting fields one at a time, and activating what was accepted', () => {
  const build = async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const harnessed = harness({ assist });
    await fill(harnessed.service);
    await harnessed.service.runAnalysis(admin, { withAssist: true });
    return harnessed;
  };

  test('editing one field leaves the others where they were', async () => {
    const { service } = await build();

    const after = await service.proposalField(admin, {
      key: 'WHO_SPEAKS',
      action: 'SAVE',
      text: 'Бригадир участка. Пишем от себя.',
    });

    const who = after.fields.find((field) => field.key === 'WHO_SPEAKS');
    const tone = after.fields.find((field) => field.key === 'TONE');
    expect(who.status).toBe('ACCEPTED');
    expect(who.text).toBe('Бригадир участка. Пишем от себя.');
    expect(tone.status).toBe('UNDECIDED');
  });

  test('activation without stated consent is refused', async () => {
    const { service } = await build();

    await expect(
      service.activateProposal(admin, { consentGiven: false })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED', status: 409 });
  });

  test('an accepted proposal becomes a version the passport reads back', async () => {
    const { service } = await build();
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });

    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 1',
    });

    expect(passport.state).toBe('default');
    expect(passport.voice.whoSpeaks).toMatch(/Бригадир/u);
    expect(passport.voice.tone).toMatch(/Спокойно/u);
    expect(passport.voice.neverSay).toContain('гарантированный результат');
    expect(passport.voice.versionLabel).toBe('Голос 1');
    expect(passport.voice.sampleCount).toBeGreaterThan(0);

    const overview = await service.overview(admin);
    expect(overview.hasVoice).toBe(true);
    expect(overview.state).toBe('default');
    expect(overview.contractVersion).toBe(contract.VOICE_CONTRACT_VERSION);
  });

  test('the name given at activation is the name the avatar list shows', async () => {
    // `content-factory-next-fn33.46`: nothing on the way in asked, so an
    // avatar arrived as «Без имени» and the list told its owner «тексты пишет
    // Без имени».
    const { service } = await build();
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });

    await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 1',
      avatarName: 'Бригадир участка',
    });

    const list = await service.avatars(admin);
    expect(list.avatars[0].name).toBe('Бригадир участка');
  });

  test('activating again never renames an avatar somebody already named', async () => {
    // The rename lives in the row's own menu. An activation quietly writing
    // over it would make «Включить аватар» a rename nobody asked for.
    const { service } = await build();
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, {
      consentGiven: true,
      avatarName: 'Бригадир участка',
    });
    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });

    await service.activateProposal(admin, {
      consentGiven: true,
      avatarName: 'Кто-то другой',
    });

    const list = await service.avatars(admin);
    expect(list.avatars[0].name).toBe('Бригадир участка');
  });

  test('restoring an earlier version writes a new one and keeps both', async () => {
    const { service } = await build();
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 1',
    });
    const first = await service.versions(admin);
    const firstId = first.versions[0].id;

    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });
    await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 2',
    });

    const after = await service.restoreVersion(admin, firstId);

    expect(after.versions).toHaveLength(3);
    expect(after.versions.map((version) => version.label)).toContain('Голос 2');
    expect(after.versions[0].active).toBe(true);
    expect(after.versions[0].id).not.toBe(firstId);
    expect(after.comparison.fields.some((field) => field.changed)).toBe(true);
  });
});

describe('the path that fills the five lines by hand', () => {
  /**
   * A profile with everything but a voice, the way the product writes one.
   *
   * Filled rather than empty on `audiences`/`contentGoals`/`traits`: this is
   * the same completeness the brand-profile form itself requires before it
   * will activate a version, and this fixture is meant to represent a
   * profile already in force, not one the form would have refused.
   */
  const PROFILE_CONTENT = {
    project: {
      name: 'Голос бренда',
      oneLineDescription: 'Профиль голоса, собранный по образцам организации.',
      offerings: [],
      audiences: [{ name: 'Аудитория организации' }],
      contentGoals: ['Публикации в фирменном голосе'],
    },
    voice: {
      defaultLanguage: 'ru',
      allowedLanguages: ['ru', 'en'],
      traits: [{ name: 'Черта', guidance: 'Пример черты, заданной формой.' }],
      pointOfView: 'company_we',
      formality: 'neutral',
      emojiPolicy: 'restrained',
      hashtagPolicy: 'none',
    },
    lexicon: { preferred: [], avoid: [] },
    guardrails: {
      prohibitedTopics: [],
      prohibitedClaims: [],
      requiredPhrases: [],
    },
    examples: [],
    platformOverrides: [],
  };

  test('the five lines start empty and nothing is written to open them', async () => {
    const { service, prisma } = harness();

    const screen = await service.manualProposal(admin);

    expect(screen.outcome).toBe('ready');
    expect(screen.mode).toBe('manual');
    expect(screen.fields.map((field) => field.key)).toEqual([
      'WHO_SPEAKS',
      'TONE',
      'AUDIENCE',
      'SENTENCE_LENGTH',
      'NEVER_SAY',
    ]);
    expect(screen.fields.every((field) => field.text === '')).toBe(true);
    expect(screen.state).toBe('empty');
    // A person who opened the path and changed their mind leaves nothing
    // behind: the draft appears at the first saved line.
    expect(prisma.state.versions).toHaveLength(0);
    expect(prisma.state.audits).toHaveLength(0);
  });

  test('no analysis and no measurement are involved at any point', async () => {
    const { service, prisma } = harness({
      assist: {
        propose: async () => {
          throw new Error('a hand-filled voice must never ask a model');
        },
      },
    });

    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    // The absence is the point: a `sampleCount: 0` measurement would make the
    // passport print «0 образцов», the corridors answer with nothing, and the
    // analysis screen claim a run that never happened.
    expect(prisma.state.brandVoiceMeasurement).toHaveLength(0);
    expect(prisma.state.brandVoiceSample).toHaveLength(0);

    const analysis = await service.analysis(admin);
    expect(analysis.outcome).toBe('insufficient');

    /**
     * «Сравнить не с чем» — это ответ, а не отказ.
     *
     * `content-factory-next-fn33.70`: путь «Заполнить вручную» обещает
     * «Ничего не читаем и не разбираем», а проверка отвечала 404 при каждом
     * открытии окна поста и советовала собрать голос заново из текстов —
     * ровно то, чего этот человек намеренно не делал.
     */
    const check = await service.textCheck(admin, { text: 'Короткий текст.' });
    expect(check.total).toBe(0);
    expect(check.outside).toEqual([]);
    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.similarity.reason).toBe('NO_PROFILE');
    // Словами, и без совета, которого этому человеку не выполнить молча.
    expect(check.summary).toContain('вручную');
    expect(check.silenceHint).toEqual(expect.any(String));
    expect(check.plainText).toBe('Короткий текст.');
  });

  test('all five written lines reach the passport, phrase length included', async () => {
    // The wizard says «Пять строк — это весь голос». The passport described
    // four: phrase length lived here only as a number from the analysis, so a
    // hand-written voice — which has none — lost the line its author wrote.
    const { service } = harness({
      assist: {
        propose: async () => {
          throw new Error('a hand-filled voice must never ask a model');
        },
      },
    });

    await writeAll(service);
    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    expect(passport.voice.sentenceStyle).toBe(FIVE.SENTENCE_LENGTH);
    // And the numeric pair stays absent, because nothing was measured.
    expect(passport.voice.sentenceLength).toBeUndefined();
  });

  test('the audience line is read back whole, not cut to its 120-character label', async () => {
    // One written line is filed as a 120-char `name` plus the full `need`.
    // Reading the label back cut the person's own sentence mid-word on the
    // passport and then offered that cut version for editing.
    const long = `${'Люди, которые ведут несколько каналов сами и считают время дороже красивых слов. '.repeat(
      2
    )}Разбираются в технике, но не в маркетинге.`;
    const { service } = harness({
      assist: {
        propose: async () => {
          throw new Error('a hand-filled voice must never ask a model');
        },
      },
    });

    await writeAll(service, { AUDIENCE: long });

    // The draft offers the whole line back, so saving it again cannot shorten
    // it — the wizard used to hand back the 120-character label.
    const reopened = await service.manualProposal(admin);
    expect(
      reopened.fields.find((field) => field.key === 'AUDIENCE').text
    ).toBe(long);

    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
    });
    expect(passport.voice.audience).toBe(long);
  });

  test('a saved line survives a reload, because it is a draft version', async () => {
    const { service, prisma } = harness();

    await service.manualField(admin, {
      key: 'TONE',
      text: FIVE.TONE,
    });
    const reopened = await service.manualProposal(admin);

    expect(
      reopened.fields.find((field) => field.key === 'TONE').text
    ).toBe(FIVE.TONE);
    expect(
      reopened.fields.find((field) => field.key === 'TONE').status
    ).toBe('ACCEPTED');
    expect(
      reopened.fields.find((field) => field.key === 'WHO_SPEAKS').status
    ).toBe('UNDECIDED');
    expect(prisma.state.versions).toHaveLength(1);
    expect(prisma.state.versions[0].lifecycle).toBe('DRAFT');
    expect(
      prisma.state.audits.some(
        (row) => row.action === 'VOICE_MANUAL_DRAFT_OPENED'
      )
    ).toBe(true);
  });

  test('the draft starts from the active profile with the voice emptied', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service, prisma } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });
    await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос модели',
    });

    await service.manualField(admin, { key: 'TONE', text: FIVE.TONE });
    const screen = await service.manualProposal(admin);

    // Nobody activates somebody else's sentences under «заполню сам».
    expect(
      screen.fields.find((field) => field.key === 'WHO_SPEAKS').text
    ).toBe('');
    expect(screen.fields.find((field) => field.key === 'TONE').text).toBe(
      FIVE.TONE
    );
    // The rest of the profile is untouched: the draft is a copy of it.
    const draft = prisma.state.versions.find(
      (version) => version.lifecycle === 'DRAFT'
    );
    expect(draft.content.project.name).toBeTruthy();
  });

  test('an incomplete voice is refused by name and stays a draft', async () => {
    const { service, prisma } = harness();
    await service.manualField(admin, { key: 'TONE', text: FIVE.TONE });
    await service.manualField(admin, {
      key: 'WHO_SPEAKS',
      text: FIVE.WHO_SPEAKS,
    });

    await expect(
      service.activateProposal(admin, { consentGiven: true, mode: 'manual' })
    ).rejects.toMatchObject({
      code: 'VOICE_FIELDS_INCOMPLETE',
      status: 409,
      // The refusal names which lines are missing rather than failing on the
      // first one it meets.
      subject: 'AUDIENCE, SENTENCE_LENGTH, NEVER_SAY',
    });
    expect(prisma.state.versions[0].lifecycle).toBe('DRAFT');
    expect((await service.passport(admin)).voice).toBeNull();
  });

  test('activation with nothing written at all is refused before anything else', async () => {
    const { service } = harness();

    await expect(
      service.activateProposal(admin, { consentGiven: true, mode: 'manual' })
    ).rejects.toMatchObject({ code: 'VOICE_PROFILE_NOT_FOUND', status: 404 });
  });

  test('an empty save is refused rather than stored as a decision', async () => {
    const { service } = harness();

    await expect(
      service.manualField(admin, { key: 'TONE', text: '   ' })
    ).rejects.toMatchObject({ code: 'VOICE_FIELDS_INCOMPLETE' });
  });

  test('activation without stated consent is refused on this path too', async () => {
    const { service } = harness();
    await writeAll(service);

    await expect(
      service.activateProposal(admin, { consentGiven: false, mode: 'manual' })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED', status: 409 });
  });

  test('the activated voice is the text that was typed, read back', async () => {
    const { service } = harness();
    await writeAll(service);

    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    expect(passport.state).toBe('default');
    expect(passport.voice.whoSpeaks).toBe(FIVE.WHO_SPEAKS);
    expect(passport.voice.tone).toBe(FIVE.TONE);
    expect(passport.voice.audience).toBe(FIVE.AUDIENCE);
    expect(passport.voice.neverSay).toEqual([
      'гарантированный результат',
      'лидер рынка',
    ]);
    expect(passport.voice.versionLabel).toBe('Голос вручную');

    const overview = await service.overview(admin);
    expect(overview.hasVoice).toBe(true);

    // The pointer follows the row's lifecycle: the published version is not a
    // draft any more, so the next visit starts a new one instead of editing a
    // version the repository would refuse.
    const after = await service.manualProposal(admin);
    expect(after.fields.every((field) => field.text === '')).toBe(true);
  });

  test('the five lines land over the profile in force, not over the copy', async () => {
    const { service, profiles } = harness();
    await service.manualField(admin, { key: 'TONE', text: FIVE.TONE });

    // Something else edited while the draft sat open: a project description
    // nobody was looking at. Activating the draft must not roll it back.
    const base = await profiles.createDraft('org-a', 'user-admin', {
      ...PROFILE_CONTENT,
      project: { ...PROFILE_CONTENT.project, name: 'Мастерская на Ленина' },
    });
    await profiles.activate('org-a', 'user-admin', base.id);

    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
    });

    const now = await profiles.overview('org-a');
    expect(now.activeVersion.content.project.name).toBe('Мастерская на Ленина');
    expect(now.activeVersion.content.voice.sentenceStyle).toBe(
      FIVE.SENTENCE_LENGTH
    );
  });

  test('a draft in the list is never compared against a published version', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true, label: 'v1' });
    await service.manualField(admin, { key: 'TONE', text: FIVE.TONE });

    const screen = await service.versions(admin);

    // One published version and one draft: there is nothing to compare, and
    // comparing against a half-written draft would report every empty line as
    // a field that changed to nothing.
    expect(screen.versions.some((one) => one.lifecycle === 'DRAFT')).toBe(true);
    expect(screen.comparison).toBeUndefined();
  });

  test('a member without rights cannot write a line', async () => {
    const { service } = harness();

    await expect(
      service.manualField(member, { key: 'TONE', text: FIVE.TONE })
    ).rejects.toMatchObject({ code: 'VOICE_FORBIDDEN', status: 403 });
  });
});

describe('a member without rights sees the voice and cannot move it', () => {
  test('the section reports restricted rather than empty', async () => {
    const { service } = harness();
    await fill(service);

    const overview = await service.overview(member);

    expect(overview.permissions.canRead).toBe(true);
    expect(overview.permissions.canEdit).toBe(false);
    expect(overview.permissions.canDelete).toBe(false);
    expect(overview.note).toBeTruthy();

    const paths = await service.pathsScreen(member);
    expect(paths.state).toBe('restricted');
    expect(paths.available.manual).toBe(false);
    // A closed path is shown closed with its reason rather than removed.
    expect(paths.disabledReasons.manual).toBeTruthy();
  });

  test('every changing call is refused with a code the screen can read', async () => {
    const { service } = harness();
    await fill(service);

    for (const call of [
      () => service.intake(member, { origin: 'PASTE', usagePurpose: 'OWN_VOICE', items: items(1) }),
      () => service.deleteSamples(member, { codes: ['smp-01'] }),
      () => service.runAnalysis(member, {}),
      () => service.activateProposal(member, { consentGiven: true }),
      () => service.setCorridor(member, { key: 'questions', low: 1, high: 2 }),
      () => service.restoreVersion(member, 'version-1'),
    ]) {
      await expect(call()).rejects.toMatchObject({
        code: 'VOICE_FORBIDDEN',
        status: 403,
        screenState: 'restricted',
      });
    }
  });

  test('the passport is readable by a member', async () => {
    const { service } = harness();
    const passport = await service.passport(member);

    // No voice is a working state, not a hole where one should be.
    expect(passport.state).toBe('empty');
    expect(passport.voice).toBeNull();
  });
});

describe('the corpus screen tells the truth about what arrived', () => {
  test('a duplicate and a fragment are named, not swallowed', async () => {
    const { service } = harness();
    await fill(service, 3);

    const again = await service.intake(admin, {
      origin: 'PASTE',
      usagePurpose: 'OWN_VOICE',
      items: [...items(1), { title: 'Обрывок', text: 'Слишком коротко.' }],
    });

    expect(again.accepted).toHaveLength(0);
    expect(again.rejected.map((one) => one.reason).sort()).toEqual([
      'DUPLICATE',
      'TOO_SHORT',
    ]);
    expect(again.readiness.sampleCount).toBe(3);
  });

  test('a reference needs confirmed rights and a retention date', async () => {
    const { service } = harness();

    await expect(
      service.intake(admin, {
        origin: 'PASTE',
        usagePurpose: 'STYLE_REFERENCE',
        items: items(1),
      })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED', status: 409 });

    await expect(
      service.intake(admin, {
        origin: 'PASTE',
        usagePurpose: 'STYLE_REFERENCE',
        rightsConfirmed: true,
        items: items(1),
      })
    ).rejects.toMatchObject({ code: 'VOICE_RIGHTS_REQUIRED' });
  });

  test('an organisation that closed the reference path is told so', async () => {
    const { service } = harness({ policy: { referencePathDisabled: true } });

    const paths = await service.pathsScreen(admin);
    expect(paths.available.reference).toBe(false);
    expect(paths.disabledReasons.reference).toBeTruthy();

    await expect(
      service.intake(admin, {
        origin: 'PASTE',
        usagePurpose: 'STYLE_REFERENCE',
        rightsConfirmed: true,
        retentionUntil: '2027-01-01T00:00:00.000Z',
        items: items(1),
      })
    ).rejects.toMatchObject({ code: 'VOICE_REFERENCE_DISABLED', status: 403 });
  });

  test('a deleted sample leaves the list and the analysis says it is stale', async () => {
    const { service } = harness();
    await fill(service);
    await service.runAnalysis(admin, {});

    const after = await service.deleteSamples(admin, { codes: ['smp-01'] });

    expect(after.samples.map((sample) => sample.code)).not.toContain('smp-01');
    expect(after.notice).toMatch(/устаревш/u);

    const proposal = await service.proposal(admin);
    expect(proposal.notice).toMatch(/устаревш/u);
  });

  test('deleting a code that is not there is refused by name', async () => {
    const { service } = harness();
    await fill(service, 3);

    await expect(
      service.deleteSamples(admin, { codes: ['smp-77'] })
    ).rejects.toMatchObject({
      code: 'VOICE_SAMPLE_NOT_FOUND',
      status: 404,
      subject: 'smp-77',
    });
  });

  test('a reference is scrubbed before storage, and the row says so', async () => {
    const { service, prisma } = harness();

    await service.intake(admin, {
      origin: 'PASTE',
      usagePurpose: 'STYLE_REFERENCE',
      rightsConfirmed: true,
      retentionUntil: '2027-01-01T00:00:00.000Z',
      items: [
        {
          title: 'Чужой пост',
          text: `Пишите на https://example.com/blog и @redakciya. ${PARAGRAPH.repeat(2)}`,
        },
      ],
    });

    const row = prisma.state.brandVoiceSample[0];
    // The barrier runs before the column is written: a link that reached the
    // database has already left the source's control.
    expect(row.text).not.toContain('example.com');
    expect(row.text).not.toContain('@redakciya');
    expect(row.retentionUntil).toBeTruthy();

    const screen = await service.redactions(admin);
    expect(screen.referenceCount).toBe(1);
    expect(screen.redactions.map((one) => one.category)).toContain('LINK');
    // The count travels, the value never does.
    expect(screen.state).toBe('default');
  });
});

describe('the scales, the strip and the check on generated text', () => {
  /**
   * A measurement AND an active version it explains.
   *
   * These screens describe the active voice (vme.11), so a measurement with
   * nothing activated over it is not enough to see anything on them any
   * more: `runAnalysis` alone used to be — the corpus was read and a
   * measurement stored, but nobody had said which version it belonged to.
   * Activating a proposal built from it is what stamps the link.
   */
  /**
   * A workspace with a measured, activated voice.
   *
   * `extra` adds ports the analysis itself does not need — the sentence repair
   * is one — without replacing the grounded `propose` every test here relies
   * on to get a voice activated in the first place.
   */
  const measured = async (extra = {}) => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
      ...(extra.assist ?? {}),
    };
    const harnessed = harness({ assist });
    await fill(harnessed.service);
    await harnessed.service.runAnalysis(admin, { withAssist: true });
    await harnessed.service.proposalField(admin, {
      key: 'WHO_SPEAKS',
      action: 'ACCEPT',
    });
    await harnessed.service.activateProposal(admin, { consentGiven: true });
    return harnessed;
  };

  test('an uncountable scale is a gap and never a zero', async () => {
    const { service } = await measured();

    const screen = await service.scales(admin);
    const entries = Object.values(screen.scales);

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(['value', 'gap']).toContain(entry.kind);
      if (entry.kind === 'gap') {
        // Zero would read as "this writer never asks questions", which is a
        // different claim and a false one.
        expect(entry).not.toHaveProperty('raw');
        expect(typeof entry.reason).toBe('string');
      }
    }
    expect(screen.canEditCorridors).toBe(true);
  });

  test('a hand-set corridor is marked as one and survives a read', async () => {
    const { service } = await measured();
    const before = await service.scales(admin);
    const key = Object.entries(before.scales).find(
      ([, entry]) => entry.kind === 'value'
    )[0];

    const after = await service.setCorridor(admin, {
      key,
      low: 3,
      high: 42,
    });

    expect(after.scales[key].low).toBe(3);
    expect(after.scales[key].high).toBe(42);
    expect(after.scales[key].manualCorridor).toBe(true);
  });

  test('a member sees the corridors and is told they cannot move them', async () => {
    const { service } = await measured();

    const screen = await service.scales(member);
    expect(Object.keys(screen.scales).length).toBeGreaterThan(0);
    expect(screen.canEditCorridors).toBe(false);
  });

  test('generated text is measured against this author corridors', async () => {
    const { service } = await measured();

    const check = await service.textCheck(admin, {
      text: PARAGRAPH.repeat(2),
    });

    expect(check.total).toBeGreaterThan(0);
    expect(check.inCorridor + check.outside.length).toBe(check.total);
    // Words, not a colour.
    expect(check.summary).toEqual(expect.any(String));
    expect(check.summary.length).toBeGreaterThan(0);
    for (const one of check.outside) {
      expect(['above', 'below']).toContain(one.placement);
    }

    // And words a writer knows. This sentence is read above the post form;
    // it used to print the identifier the counting code uses — «dashCopula 0%
    // — ниже коридора» (`content-factory-next-vme.21.12`).
    const labels = types.STYLE_SCALE_LABELS;
    for (const one of check.outside) {
      expect(check.summary).toContain(labels.ru[one.key].label);
      expect(check.summary).not.toContain(`${one.key} `);
    }
    // «2 шкалы», not «2 шкал».
    expect(check.summary).not.toMatch(/\b[234] шкал\b/u);
  });

  test('the print survives the model writing its proposal onto the same row', async () => {
    /**
     * Caught on the stand and by nothing else. The assist path rebuilt the
     * `metrics` envelope from a hand-written list of fields instead of
     * carrying over what was there, so every field the analyser gained after
     * that list was written vanished the moment a workspace ran the model —
     * which is every workspace that has a voice. The check then answered
     * «сравнить не с чем» on a voice built five minutes earlier.
     */
    const { prisma, service } = await measured();
    const [row] = prisma.state.brandVoiceMeasurement.slice(-1);

    expect(row.metrics.proposal).toBeTruthy();
    expect(row.metrics.voicePrint?.ngrams?.grams?.length).toBeGreaterThan(0);
    expect(row.metrics.postHabits).toBeTruthy();

    /**
     * Проверяется, что отпечаток пережил конверт, а не что вердикт вынесен.
     *
     * До 27.08.2026 это писалось как `verdict !== 'UNKNOWN'`, и работало по
     * совпадению: вердикт брался по константе `2/3`, которой хватало любого
     * отпечатка. Константа снята, вердикт теперь требует границ, снятых на
     * этом авторе, а двенадцати текстов на них не хватает — и `UNKNOWN` здесь
     * стал правильным ответом, ничего не говорящим о конверте. Голос и
     * расстояние считаются ровно тогда, когда отпечаток на месте, и они и есть
     * то, ради чего этот тест написан.
     */
    const check = await service.textCheck(admin, { text: PARAGRAPH.repeat(2) });
    expect(check.similarity.votes).not.toBeNull();
    expect(check.similarity.distance).not.toBeNull();
  });

  /**
   * Рабочая точка снимается на текстах чужого пространства, и ни одно из них
   * не покидает своего владельца.
   *
   * Это единственный бесплатный отрицательный материал, который в системе
   * есть. Своего разброса автору не хватает: замер 27.08.2026 на трёх
   * настоящих корпусах дал пятый перцентиль его собственных голосов равным
   * нулю, и правило по одному этому распределению пропускает сто процентов
   * сгенерированного текста.
   */
  describe('рабочая точка и чужие пространства', () => {
    /** Столько своих текстов, чтобы отложенных набралось хотя бы двадцать. */
    const ENOUGH = 70;

    const withNeighbour = async () => {
      const harnessed = harness();
      await fill(harnessed.service, ENOUGH);
      /**
       * Соседнее пространство со своей манерой. Кладётся прямо в хранилище:
       * оно принадлежит другому клиенту, и никакой ручкой этого продукта
       * владелец `org-a` его завести не может — в чём и смысл проверки.
       */
      /**
       * Сто пятьдесят, а не сорок: каждый шестой чужой текст уходит в
       * отрицательные примеры и в шеренгу не попадает, а порогу нужно хотя бы
       * двадцать наблюдений — иначе пятипроцентный допуск это доля одного.
       */
      for (let index = 0; index < 150; index += 1) {
        harnessed.prisma.state.brandVoiceSample.push({
          id: `alien-${index}`,
          organizationId: 'org-b',
          avatarId: 'avatar-b',
          origin: 'PASTE',
          usagePurpose: 'OWN_VOICE',
          title: `Регламент ${index}`,
          text:
            `Проведение мероприятий ${index} по обеспечению выполнения плановых ` +
            'показателей осуществляется в соответствии с утверждённым регламентом. ' +
            'Обеспечение соблюдения установленных требований возлагается на ' +
            'ответственных должностных лиц структурного подразделения организации. ' +
            'Организация обеспечивает предоставление необходимой документации в ' +
            'согласованные сроки при условии выполнения предусмотренных требований. ' +
            'Осуществление отгрузки продукции производится согласно утверждённому графику.',
          contentHash: `alien-hash-${index}`,
          charCount: 500,
          wordCount: 60,
          language: 'ru',
          rightsState: 'OWNED',
          retentionUntil: null,
          sourceId: null,
          postId: null,
          externalRef: null,
          redactions: null,
          deletedAt: null,
          createdAt: new Date(1_700_000_000_000 + index * 1_000),
          updatedAt: new Date(1_700_000_000_000 + index * 1_000),
        });
      }
      await harnessed.service.runAnalysis(admin);
      return harnessed;
    };

    test('границы снимаются, и названо, на чём', async () => {
      const { prisma } = await withNeighbour();
      const [row] = prisma.state.brandVoiceMeasurement.slice(-1);

      expect(row.metrics.calibration.high).not.toBeNull();
      expect(row.metrics.calibration.negatives).toBe('foreign_avatars');
      // Обе доли ошибок сохранены рядом с порогами: одно число вместо двух
      // прячет размен между ними, а показывать человеку надо именно его.
      expect(row.metrics.calibration.falseAccept.of).toBeGreaterThan(0);
      expect(row.metrics.calibration.falseReject.of).toBeGreaterThan(0);
    });

    test('через границу не переходит ни одного чужого предложения', async () => {
      const { prisma } = await withNeighbour();
      const [row] = prisma.state.brandVoiceMeasurement.slice(-1);
      const stored = JSON.stringify(row);

      expect(stored).not.toContain('Проведение мероприятий');
      expect(stored).not.toContain('org-b');
      expect(stored).not.toContain('avatar-b');
    });

    test('без соседа границ нет, и это сказано, а не подменено вердиктом', async () => {
      const harnessed = harness();
      await fill(harnessed.service, ENOUGH);
      await harnessed.service.runAnalysis(admin);
      const [row] = harnessed.prisma.state.brandVoiceMeasurement.slice(-1);

      /**
       * Отказ, а не порог по умолчанию. Единственное пространство в системе —
       * обычное состояние свежей установки, и мерка тогда молчит: что делает
       * с этим экран, проверяет `brand-voice.voiceprint`, где вердикт по
       * измерению без границ выходит `UNCALIBRATED`.
       */
      expect(row.metrics.calibration.high).toBeNull();
      expect(row.metrics.calibration.reason).toBe('TOO_FEW_FOREIGN');
    });
  });

  test('the check says there is nothing to compare against, and says it in words', async () => {
    // It used to refuse with 404 `VOICE_PROFILE_NOT_FOUND`, once per opening
    // of the post window, and the refusal was invisible on screen
    // (`content-factory-next-fn33.70`). Nothing to measure is an answer.
    const { service } = harness();

    const check = await service.textCheck(admin, { text: 'Короткий текст.' });

    expect(check.total).toBe(0);
    expect(check.inCorridor).toBe(0);
    expect(check.similarity.verdict).toBe('UNKNOWN');
    expect(check.similarity.reason).toBe('NO_PROFILE');
    expect(check.summary.length).toBeGreaterThan(0);
  });

  /**
   * One sentence at a time, with the meaning proved to have survived.
   *
   * The owner decided on 2026-08-24 that a low similarity warns and offers a
   * pointwise repair rather than a regeneration: regenerating loses the facts
   * and the order of thought the text was written for, costs a full call
   * instead of a short one, and can carry the style further away on the second
   * pass than the first did.
   */
  describe('repairing one sentence', () => {
    const CLERICAL =
      'Осуществление отгрузки продукции производится согласно утверждённому графику на 12 дней.';

    const repairing = (answers) => {
      const calls = [];
      const queue = [...answers];
      return {
        calls,
        assist: {
          repair: async (input) => {
            calls.push(input.prompt);
            return queue.shift();
          },
        },
      };
    };

    test('rewrites the named sentence and carries its numbers through', async () => {
      const { calls, assist } = repairing([
        {
          sentence: 'Отгружаем по графику — 12 дней.',
          note: 'Убрал канцелярит, оставил срок.',
        },
      ]);
      const { service } = await measured({ assist });

      const answer = await service.repairSentence(admin, {
        text: `${PARAGRAPH} ${CLERICAL}`,
        sentence: CLERICAL,
        note: 'Канцелярские слова: осуществление.',
      });

      expect(answer.sentence).toBe(CLERICAL);
      expect(answer.proposal).toBe('Отгружаем по графику — 12 дней.');
      expect(answer.keptFacts).toContain('12');
      // One sentence and its two neighbours reach the model, not the post.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(CLERICAL);
      expect(calls[0]).not.toContain(PARAGRAPH);
    });

    test('refuses a rewrite that dropped a number, twice', async () => {
      const { calls, assist } = repairing([
        { sentence: 'Отгружаем по графику.', note: 'Короче.' },
        { sentence: 'Отгрузка идёт по графику.', note: 'Ещё короче.' },
      ]);
      const { service } = await measured({ assist });

      await expect(
        service.repairSentence(admin, {
          text: `${PARAGRAPH} ${CLERICAL}`,
          sentence: CLERICAL,
        })
      ).rejects.toMatchObject({ code: 'VOICE_REPAIR_UNGROUNDED', status: 502 });
      // Asked twice and no more: a third attempt is the same bill for the same
      // answer.
      expect(calls).toHaveLength(2);
    });

    test('asks once when the model returns the sentence unchanged', async () => {
      const { calls, assist } = repairing([
        { sentence: CLERICAL, note: 'Здесь всё в порядке.' },
      ]);
      const { service } = await measured({ assist });

      await expect(
        service.repairSentence(admin, {
          text: `${PARAGRAPH} ${CLERICAL}`,
          sentence: CLERICAL,
        })
      ).rejects.toMatchObject({ code: 'VOICE_REPAIR_UNGROUNDED' });
      expect(calls).toHaveLength(1);
    });

    test('says the text moved rather than repairing the wrong sentence', async () => {
      const { assist } = repairing([]);
      const { service } = await measured({ assist });

      await expect(
        service.repairSentence(admin, {
          text: PARAGRAPH,
          sentence: 'Этого предложения в тексте нет.',
        })
      ).rejects.toMatchObject({
        code: 'VOICE_SENTENCE_NOT_FOUND',
        status: 409,
      });
    });

    test('offers nothing at all when no model is wired', async () => {
      const { service } = await measured();

      await expect(
        service.repairSentence(admin, {
          text: `${PARAGRAPH} ${CLERICAL}`,
          sentence: CLERICAL,
        })
      ).rejects.toMatchObject({ code: 'VOICE_ASSIST_UNAVAILABLE' });
    });

    test('the check hands back places, and none of them is a whole text', async () => {
      const { service } = await measured();
      const check = await service.textCheck(admin, {
        text: `${PARAGRAPH} ${CLERICAL}`,
      });

      expect(Array.isArray(check.spots)).toBe(true);
      for (const spot of check.spots) {
        expect(check.plainText.slice(spot.start, spot.end)).toBe(spot.sentence);
        expect(spot.note.length).toBeGreaterThan(0);
      }
    });
  });

  test('the strip says no-profile before a voice exists', async () => {
    const { service } = harness();

    const ribbon = await service.ribbon(admin);
    expect(ribbon.state).toBe('no-profile');

    await expect(
      service.injectionPlan(admin, { boundaries: ['thread-item'] })
    ).rejects.toMatchObject({ code: 'VOICE_PROFILE_NOT_FOUND' });
  });

  test('the voice is restated at every boundary and once at the start', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true });

    const plan = await service.injectionPlan(admin, {
      boundaries: ['thread-item', 'thread-item', 'section'],
    });

    expect(plan.injections.map((one) => one.boundary)).toEqual([
      'start',
      'thread-item',
      'thread-item',
      'section',
    ]);
    expect(plan.injections[0].text).toContain('BRAND VOICE');

    const ribbon = await service.ribbon(admin);
    expect(ribbon.state).toBe('fresh');
    expect(ribbon.details.versionLabel).toBeTruthy();
    // The strip joins the profile and the version with a dot. A profile with
    // no name of its own borrows the version's, and sending both would print
    // «v1 · v1» — two fields saying one thing.
    expect(ribbon.details.profileLabel).not.toBe(ribbon.details.versionLabel);
  });
});

describe('the passport explains the active version, not merely the last run (vme.11)', () => {
  test('a hand-written voice next to an old, unrelated measurement shows none of its numbers', async () => {
    const { service } = harness();
    await fill(service);
    // A measurement from a run nobody ever activated anything from: it stays
    // in the database, tied to no version at all.
    await service.runAnalysis(admin, {});

    await writeAll(service);
    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    // The hand-written voice, not the leftover analysis above: nothing was
    // ever measured on this version. Absent, not zero — zero would claim the
    // corpus was counted and found empty, and it was neither.
    expect(passport.voice).not.toHaveProperty('sampleCount');
    expect(passport.voice).not.toHaveProperty('charCount');
    expect(passport.voice).not.toHaveProperty('confidence');
    expect(passport.voice).not.toHaveProperty('sentenceLength');
    expect(passport.voice).not.toHaveProperty('dashShare');

    const scales = await service.scales(admin);
    expect(scales.state).toBe('empty');
    expect(scales.scales).toEqual({});

    await expect(
      service.setCorridor(admin, { key: 'questions', low: 1, high: 2 })
    ).rejects.toMatchObject({ code: 'VOICE_PROFILE_NOT_FOUND' });
    // The check answers instead of refusing, and answers nothing rather than
    // reading the unrelated measurement (`content-factory-next-fn33.70`).
    const check = await service.textCheck(admin, { text: PARAGRAPH.repeat(2) });
    expect(check.total).toBe(0);
    expect(check.similarity.reason).toBe('NO_PROFILE');
  });

  test('a measurement that IS linked to the active version still reads normally', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    const passport = await service.activateProposal(admin, {
      consentGiven: true,
    });

    expect(passport.voice.sampleCount).toBeGreaterThan(0);
    expect(passport.voice.confidence).toBeTruthy();

    const scales = await service.scales(admin);
    expect(scales.state).toBe('default');
    expect(Object.keys(scales.scales).length).toBeGreaterThan(0);

    const check = await service.textCheck(admin, { text: PARAGRAPH.repeat(2) });
    expect(check.total).toBeGreaterThan(0);
  });

  /**
   * The other half of vme.11, and the one its first pass broke.
   *
   * Restoring writes a NEW version rather than moving the pointer back, and
   * `cloneVersion` copies the content and its digest verbatim. The
   * measurement, though, is stamped with the version id it was activated
   * into — the old one — so a restored voice had no measurement of its own
   * and read as never analysed, while its content was byte-for-byte the
   * content that analysis produced. Worse than a wrong number on a card:
   * `setCorridor` and `textCheck` both refuse outright without a
   * measurement, so restoring a working voice took its corridors away.
   *
   * The fix is not to re-stamp the measurement — that would take the numbers
   * off the version it actually described. The restored version is matched on
   * its content digest instead: an analysis explains a body of content, not a
   * row, so it explains every version carrying that exact content.
   *
   * The path below is the ordinary one — try a hand-written voice, decide
   * against it, go back to the analysed one — and it is the path that lost
   * the corridors.
   */
  test('restoring a measured version keeps its numbers, its scales and its corridors', async () => {
    const { service } = harness({
      assist: {
        propose: (input) => assistModule.runVoiceAssist(groundedTransport([]), input),
      },
    });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true, label: 'Голос 1' });

    const measured = await service.passport(admin);
    const versions = await service.versions(admin);
    const measuredId = versions.versions[0].id;

    // A hand-written voice in between, so the restore below is a real return
    // rather than a no-op on the version already in force.
    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    const after = await service.restoreVersion(admin, measuredId);
    const restoredId = after.versions[0].id;
    expect(restoredId).not.toBe(measuredId);

    const passport = await service.passport(admin);
    expect(passport.voice.sampleCount).toBe(measured.voice.sampleCount);
    expect(passport.voice.charCount).toBe(measured.voice.charCount);
    expect(passport.voice.confidence).toBe(measured.voice.confidence);

    const scales = await service.scales(admin);
    expect(scales.state).toBe('default');
    expect(Object.keys(scales.scales).length).toBeGreaterThan(0);

    const check = await service.textCheck(admin, { text: PARAGRAPH.repeat(2) });
    expect(check.total).toBeGreaterThan(0);
  });

  /**
   * Content that differs lends nothing. A hand-written voice built on top of
   * a measured one descends from it and holds other content, and borrowing
   * the parent's numbers there would be exactly the lie vme.11 removed,
   * reintroduced through the back door.
   */
  test('a version holding different content borrows no numbers, however it descends', async () => {
    const { service } = harness({
      assist: {
        propose: (input) => assistModule.runVoiceAssist(groundedTransport([]), input),
      },
    });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true, label: 'Голос 1' });

    // Written by hand on top of the measured version: same ancestry, other
    // content, and no analysis that explains it.
    await writeAll(service);
    const passport = await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    expect(passport.voice).not.toHaveProperty('sampleCount');
    expect(passport.voice).not.toHaveProperty('charCount');
  });

  /**
   * The last hole vme.11 left, and the reason the pointer changed sides
   * (vme.18).
   *
   * One analysis becomes as many versions as somebody activates from it:
   * accept one field, activate, look at it, accept a second, activate again.
   * While the stamp lived on the measurement it could only name one of them,
   * and the second activation overwrote the first — so the voice a person had
   * been using an hour earlier read as never analysed, and going back to it
   * refused corridors and text checks outright.
   *
   * Same content digest cannot cover this one: the two voices hold different
   * fields on purpose, so they are genuinely different content explained by
   * the same numbers. That is the cardinality the column now follows.
   */
  test('activating a second voice from one analysis leaves the first one measured', async () => {
    const { service } = harness({
      assist: {
        propose: (input) => assistModule.runVoiceAssist(groundedTransport([]), input),
      },
    });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true, label: 'Голос 1' });

    const first = await service.passport(admin);
    const firstId = (await service.versions(admin)).versions[0].id;
    const boundaries = ['thread-item'];
    const firstPlan = await service.injectionPlan(admin, {
      versionId: firstId,
      boundaries,
    });
    expect(first.voice.sampleCount).toBeGreaterThan(0);

    // The ordinary second thought: the tone line was worth accepting after
    // all. Other content, same corpus, same numbers.
    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });
    const second = await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 2',
    });
    const secondId = (await service.versions(admin)).versions[0].id;
    expect(secondId).not.toBe(firstId);
    expect(second.voice.sampleCount).toBe(first.voice.sampleCount);

    // The first voice is still explained by the analysis it came from —
    // asked directly, and asked the way generation asks.
    expect(
      await service.injectionPlan(admin, { versionId: firstId, boundaries })
    ).toEqual(firstPlan);

    // And going back to it returns a working voice, not a stripped one.
    await service.restoreVersion(admin, firstId);
    const restored = await service.passport(admin);
    expect(restored.voice.sampleCount).toBe(first.voice.sampleCount);
    expect(restored.voice.confidence).toBe(first.voice.confidence);

    const corridor = await service.setCorridor(admin, {
      key: 'sentenceLength',
      low: 8,
      high: 14,
    });
    expect(corridor.state).toBe('default');
  });

  /**
   * The data already in the database when the column arrives.
   *
   * A workspace that activated a voice before vme.18 has the stamp only on
   * the measurement, and nothing backfills the version side: the apply guard
   * refuses `UPDATE` outright, and a stamp that was moved is not recoverable
   * anyway — the value it held before the move was overwritten in place. So
   * the old column stays readable, and this is what reads it. Simulated by
   * clearing the new stamp the way a pre-fix row has it: absent.
   */
  test('a voice activated before the column existed still finds its analysis', async () => {
    const { service, prisma } = harness({
      assist: {
        propose: (input) => assistModule.runVoiceAssist(groundedTransport([]), input),
      },
    });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    const fresh = await service.activateProposal(admin, {
      consentGiven: true,
      label: 'Голос 1',
    });

    for (const version of prisma.state.versions) delete version.measurementId;
    expect(prisma.state.brandVoiceMeasurement[0].profileVersionId).toBeTruthy();

    const passport = await service.passport(admin);
    expect(passport.voice.sampleCount).toBe(fresh.voice.sampleCount);
    expect(passport.voice.confidence).toBe(fresh.voice.confidence);
    const check = await service.textCheck(admin, { text: PARAGRAPH.repeat(2) });
    expect(check.total).toBeGreaterThan(0);
  });

  test('the analysis and proposal screens still answer with the latest run, wizard-side', async () => {
    // Screens 04/05 ask "what did the corpus measure most recently", which is
    // a question with no active version in it at all — `analysis()` and
    // `proposal()` keep `latestMeasurement` on purpose.
    const { service } = harness();
    await fill(service);
    await service.runAnalysis(admin, {});
    await fill(service, 1, { items: [{ title: 'Ещё', text: PARAGRAPH.repeat(8) }] });
    await service.runAnalysis(admin, {});

    const analysis = await service.analysis(admin);
    expect(analysis.outcome).toBe('ready');
  });
});

describe('activation shares the validation the brand-profile form applies (vme.12)', () => {
  test('an assist activation with nothing accepted is refused the same way the form would refuse it', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });

    // Nothing accepted: the resulting version would carry no voice traits at
    // all, which `validateBrandProfileContent(..., { forActivation: true })`
    // refuses for the form and now refuses here too. The message names what
    // is missing and where to fix it, not just that something failed.
    await expect(
      service.activateProposal(admin, { consentGiven: true })
    ).rejects.toMatchObject({
      code: 'VOICE_FIELDS_INCOMPLETE',
      status: 409,
      message: expect.stringContaining('черты голоса'),
    });
    await expect(
      service.activateProposal(admin, { consentGiven: true })
    ).rejects.toMatchObject({
      message: expect.stringContaining('«Профиль бренда»'),
    });
  });

  test('a version already active from before this fix keeps working; only the next activation is blocked, by name', async () => {
    const { service, profiles } = harness();

    // Reproduces exactly what the voice section could produce before vme.12:
    // an active, published version missing `contentGoals`, created by calling
    // the raw brand-profile repository the way `VoiceProfileRepository.activate()`
    // used to, with no validation in between.
    const legacyContent = {
      project: {
        name: 'Голос бренда',
        oneLineDescription: 'Активирован до этой правки.',
        offerings: [],
        audiences: [{ name: 'Кто-то, но без формы' }],
        contentGoals: [],
      },
      voice: {
        defaultLanguage: 'ru',
        allowedLanguages: ['ru', 'en'],
        traits: [{ name: 'Кто говорит', guidance: 'Голос до правки.' }],
        pointOfView: 'company_we',
        formality: 'neutral',
        emojiPolicy: 'restrained',
        hashtagPolicy: 'none',
      },
      lexicon: { preferred: [], avoid: [] },
      guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
      examples: [],
      platformOverrides: [],
    };
    const draft = await profiles.createDraft(
      'org-a',
      'user-admin',
      legacyContent,
      'Голос (до правки)'
    );
    // `profiles._profiles` is the raw `BrandProfileRepository` voice used to
    // call directly before this fix added `assertActivatable` in front of it.
    await profiles._profiles.activateVersion('org-a', 'user-admin', draft.id, {
      revision: draft.revision,
      contentDigest: draft.contentDigest,
    });

    const before = await service.passport(admin);
    expect(before.state).toBe('default');
    expect(before.voice.versionLabel).toBe('Голос (до правки)');

    // The next activation is blocked and names the missing field — but the
    // legacy version above was never touched by this check and is still
    // active.
    await writeAll(service);
    await expect(
      service.activateProposal(admin, { consentGiven: true, mode: 'manual' })
    ).rejects.toMatchObject({
      code: 'VOICE_FIELDS_INCOMPLETE',
      message: expect.stringContaining('цели контента'),
    });

    const after = await service.passport(admin);
    expect(after.state).toBe('default');
    expect(after.voice.versionLabel).toBe('Голос (до правки)');
    // The draft `writeAll` wrote sits beside the legacy version, unpromoted —
    // the failed attempt left it exactly as `updateDraft` wrote it, in
    // `DRAFT`, and created nothing new.
    const versions = await service.versions(admin);
    expect(versions.versions).toHaveLength(2);
    expect(
      versions.versions.filter((one) => one.lifecycle === 'DRAFT')
    ).toHaveLength(1);
  });

  test('a historical version missing brand fields cannot be restored, and the active voice is unaffected', async () => {
    const { service, profiles } = harness();

    // A complete voice, active first — `contentFrom` bases every later
    // activation on whatever is active when it runs, so this has to exist
    // before the legacy version below or the legacy content would poison it.
    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });
    const goodVersionId = (await profiles.overview('org-a')).activeVersion.id;

    // A version from before vme.12: created and activated via the raw
    // repository call `VoiceProfileRepository.activate()` used to make
    // directly, missing `contentGoals`. Becomes active in its place.
    const legacyContent = {
      project: {
        name: 'Голос бренда',
        oneLineDescription: 'Активирован до этой правки.',
        offerings: [],
        audiences: [{ name: 'Кто-то, но без формы' }],
        contentGoals: [],
      },
      voice: {
        defaultLanguage: 'ru',
        allowedLanguages: ['ru', 'en'],
        traits: [{ name: 'Кто говорит', guidance: 'Голос до правки.' }],
        pointOfView: 'company_we',
        formality: 'neutral',
        emojiPolicy: 'restrained',
        hashtagPolicy: 'none',
      },
      lexicon: { preferred: [], avoid: [] },
      guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
      examples: [],
      platformOverrides: [],
    };
    const legacyDraft = await profiles.createDraft(
      'org-a',
      'user-admin',
      legacyContent,
      'Голос (старая версия)'
    );
    await profiles._profiles.activateVersion(
      'org-a',
      'user-admin',
      legacyDraft.id,
      { revision: legacyDraft.revision, contentDigest: legacyDraft.contentDigest }
    );

    // Restoring the good version clones ITS content, not the legacy one —
    // succeeds, and puts the legacy version safely into history, non-active,
    // without the new active version inheriting its gap.
    const restoredGood = await service.restoreVersion(admin, goodVersionId);
    const activeId = restoredGood.versions.find((one) => one.active).id;
    expect(activeId).not.toBe(legacyDraft.id);

    const before = await service.passport(admin);
    expect(before.voice.versionLabel).toBe('Голос вручную');

    // Now the actual case: restoring the legacy, historical version.
    // Checked on the source content before any clone is written, so a
    // refused restore leaves nothing behind to clean up — see the comment on
    // `restoreAsNewVersion`.
    await expect(
      service.restoreVersion(admin, legacyDraft.id)
    ).rejects.toMatchObject({
      code: 'VOICE_FIELDS_INCOMPLETE',
      message: expect.stringContaining('цели контента'),
    });
    // The restore-specific sentence, not the activation one: retrying will
    // not help here, because restoring never produces different content.
    await expect(
      service.restoreVersion(admin, legacyDraft.id)
    ).rejects.toMatchObject({
      message: expect.stringMatching(/восстановить|восстановление/u),
    });

    const after = await service.passport(admin);
    expect(after.voice.versionLabel).toBe('Голос вручную');
    const versions = await service.versions(admin);
    // The good original, the legacy one, and the clone restored from the
    // good one — nothing more: the failed restore attempts wrote nothing.
    expect(versions.versions).toHaveLength(3);
  });

  test('restoring a version that already satisfies the brand-profile form still works', async () => {
    // The reverse case: `content-factory-next-vme.12` must not make an
    // ordinary restore harder. The pre-existing "restoring an earlier
    // version writes a new one and keeps both" test above already restores a
    // version built by `activateProposal` — which, since this fix, only ever
    // activates content that already passes `forActivation` — so its
    // continued pass is itself proof the ordinary path is untouched. This
    // test names that fact explicitly rather than leaving it implicit.
    const { service, profiles } = harness();
    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });
    const first = await service.versions(admin);
    const firstId = first.versions[0].id;

    const restored = await service.restoreVersion(admin, firstId);

    expect(restored.versions).toHaveLength(2);
    expect(restored.versions[0].active).toBe(true);
    expect(restored.versions[0].id).not.toBe(firstId);
  });

  test('the assist-activated version passes the same validation the form uses', async () => {
    const calls = [];
    const assist = {
      propose: (input) =>
        assistModule.runVoiceAssist(groundedTransport(calls), input),
    };
    const { service, profiles } = harness({ assist });
    await fill(service);
    await service.runAnalysis(admin, { withAssist: true });
    await service.proposalField(admin, { key: 'WHO_SPEAKS', action: 'ACCEPT' });
    await service.proposalField(admin, { key: 'TONE', action: 'ACCEPT' });
    await service.activateProposal(admin, { consentGiven: true, label: 'Голос 1' });

    const { activeVersion } = await profiles.overview('org-a');
    const validation = validateBrandProfileContent(activeVersion.content, {
      forActivation: true,
    });
    expect(validation).toEqual({ valid: true });
  });

  test('the hand-written voice activates a version that passes the same validation the form uses', async () => {
    const { service, profiles } = harness();
    await writeAll(service);
    await service.activateProposal(admin, {
      consentGiven: true,
      mode: 'manual',
      label: 'Голос вручную',
    });

    const { activeVersion } = await profiles.overview('org-a');
    const validation = validateBrandProfileContent(activeVersion.content, {
      forActivation: true,
    });
    expect(validation).toEqual({ valid: true });
  });
});

describe('the routes prepare text and reach nothing else', () => {
  const blanked = (relativePath) =>
    fs
      .readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/(^|[^:])\/\/.*$/gmu, '$1 ');

  test('the deterministic service imports no model client and no platform', () => {
    const code = blanked(`${voiceBase}/voice.service.ts`);

    // Checked on imports and calls rather than on words: the file states the
    // rules it keeps, and a scan for the words would fail it for saying so.
    expect(code).not.toMatch(/^import\s+(?!type\b)[^;]*openai/mu);
    expect(code).not.toMatch(/\bfetch\s*\(|\baxios\b/u);
    expect(code).not.toMatch(/\.(?:publish|schedule|deliver)\s*\(/u);
    expect(code).not.toMatch(/\$queryRaw|\$executeRaw/u);
    // The model lives behind a port, and the port is a type.
    expect(code).toMatch(/import type \{ VoiceAssistPort \}/u);
  });

  test('the controller hands the refusal code on rather than a generic error', () => {
    const code = blanked(controllerPath);

    expect(code).toMatch(/function safeHttpError/u);
    expect(code).toMatch(/code:\s*error\.code/u);
    const routes = code.match(/@(?:Get|Post|Delete)\(/gu);
    const handlers = code.match(/catch \(error\) \{\s*safeHttpError\(error\);/gu);
    // Every route, not most of them: one handler swallowing its cause is the
    // one screen that shows "что-то пошло не так" over a named reason.
    expect(handlers.length).toBe(routes.length);
  });
});
