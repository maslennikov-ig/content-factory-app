'use strict';

require('reflect-metadata');

/**
 * The pair that is compared, and the line that is edited where it is read.
 *
 * Two defects met on one screen and neither was visible from the other side.
 *
 * `GET /versions` compared the two newest versions and took no arguments,
 * while the list above it invited a person to tick any two. Most pairs
 * therefore had no table behind them and the screen printed «выберите две
 * версии» over two that were already ticked; and the picker, holding two at
 * most, made room for a third tick by clearing one of the first two, so a box
 * nobody had touched cleared itself. The pair is now part of the request.
 *
 * And the five voice lines were editable only through a draft that had to be
 * completed in full and consented to. `POST /passport/field` writes one line
 * over the version in force and activates the result, so an edit is a version
 * rather than a mutation of the row old posts still point at.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const voiceBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const profileBase =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';

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
};

const { VoiceService } = loadTypeScriptModule(
  `${voiceBase}/voice.service.ts`,
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  },
  { sources }
);

/* ------------------------------------------------------------------ fixtures */

const contentWith = (who, tone) => ({
  version: 'v1',
  project: { name: 'Завод', audiences: [{ name: 'К своим' }] },
  voice: {
    traits: [
      { name: 'Кто говорит', guidance: who },
      { name: 'Тон', guidance: tone },
    ],
    sentenceStyle: 'Короткие фразы',
  },
  guardrails: { prohibitedClaims: ['мы рады сообщить'] },
});

const version = (number, over = {}) => ({
  id: `ver-${number}`,
  versionNumber: number,
  label: `v${number}`,
  lifecycle: 'PUBLISHED',
  revision: 1,
  updatedAt: new Date(`2026-0${number}-01T10:00:00.000Z`),
  createdAt: new Date(`2026-0${number}-01T10:00:00.000Z`),
  updatedByUserId: 'usr-1',
  content: contentWith(`Автор ${number}`, `Тон ${number}`),
  ...over,
});

const VERSIONS = [
  version(1),
  version(2),
  version(3),
  version(4, { lifecycle: 'DRAFT', content: contentWith('', '') }),
];

const actor = (over = {}) => ({
  organizationId: 'org-1',
  userId: 'usr-1',
  canManage: true,
  locale: 'ru',
  ...over,
});

/** A repository stub that answers the three calls these paths make. */
const profilesStub = (over = {}) => ({
  overview: async () => ({
    versions: VERSIONS,
    activeVersion: VERSIONS[2],
    profile: { activeVersionId: 'ver-3' },
  }),
  actorNames: async () => new Map([['usr-1', 'А. Ким']]),
  ...over,
});

const serviceWith = (profiles, samples = {}) =>
  new VoiceService(samples, profiles, null, {}, () => new Date('2026-08-29'));

/* -------------------------------------------------------------------- pairs */

describe('какие две версии сравниваются', () => {
  it('без пары — две последние действовавшие, как и раньше', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor());

    expect(answer.comparison.from).toBe('v2');
    expect(answer.comparison.to).toBe('v3');
    expect(answer.comparisonNotice).toBeUndefined();
  });

  it('названная пара сравнивается, даже если она не последняя', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor(), {
      from: 'ver-1',
      to: 'ver-3',
    });

    // Раньше этой таблицы не существовало: маршрут аргументов не принимал, и
    // экран печатал «выберите две версии» над двумя уже отмеченными.
    expect(answer.comparison.from).toBe('v1');
    expect(answer.comparison.to).toBe('v3');
    const who = answer.comparison.fields.find(
      (field) => field.field === 'WHO_SPEAKS'
    );
    expect(who).toMatchObject({ was: 'Автор 1', became: 'Автор 3', changed: true });
  });

  it('порядок в таблице хронологический, что бы ни отметили первым', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor(), {
      from: 'ver-3',
      to: 'ver-1',
    });

    // «Было» — всегда старшая из двух: иначе одна и та же пара читалась бы
    // задом наперёд в зависимости от того, по какой строке кликнули раньше.
    expect(answer.comparison.from).toBe('v1');
    expect(answer.comparison.to).toBe('v3');
  });

  it('черновик не сравнивается, и сказано почему', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor(), {
      from: 'ver-4',
      to: 'ver-3',
    });

    expect(answer.comparison).toBeUndefined();
    // В черновике строки ещё пустые, и они прочитались бы как изменения —
    // утверждение о незаполненной форме, а не о голосе.
    expect(answer.comparisonNotice).toMatch(/Черновик не сравнивается/);
  });

  it('неизвестный идентификатор — отказ словами, а не пустое место', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor(), {
      from: 'ver-9',
      to: 'ver-3',
    });

    expect(answer.comparison).toBeUndefined();
    expect(answer.comparisonNotice).toMatch(/не удалось прочитать/);
  });

  it('одна половина пары — это не сравнение', async () => {
    const answer = await serviceWith(profilesStub()).versions(actor(), {
      from: 'ver-3',
    });

    expect(answer.comparison).toBeUndefined();
    expect(answer.comparisonNotice).toMatch(/Выбрана одна версия/);
  });
});

/* ---------------------------------------------------------- recalibration */

describe('пересчёт чисел: что предлагается и что переживает разбор', () => {
  const scale = (over = {}) => ({
    kind: 'value',
    raw: 14,
    display: 28,
    low: 10,
    high: 18,
    corridorSource: 'MEASURED',
    observations: 900,
    sampleCount: 16,
    exampleSampleCode: 'smp-01',
    exampleText: 'Причина — поставка.',
    ...over,
  });

  const withScales = (scales, calibration) => ({
    id: 'msr-1',
    sampleCount: 16,
    charCount: 15200,
    language: 'ru',
    metrics: { scales, ...(calibration ? { calibration } : {}) },
  });

  it('предлагается, когда числа сняты меркой старее отгруженной', async () => {
    const measurement = withScales(
      { sentenceLength: scale() },
      { version: 'voice-calibration/1.0.0' }
    );
    const service = serviceWith(profilesStub(), {
      listActive: async () => [],
    });
    service.measurementForActiveVersion = async () => measurement;

    const answer = await service.scales(actor());

    expect(answer.recalibration).toEqual({ movedByHand: 0 });
  });

  it('не предлагается, когда мерка уже нынешняя', async () => {
    const { CALIBRATION_VERSION } = loadTypeScriptModule(
      `${voiceBase}/voice-calibration.ts`,
      {},
      { sources }
    );
    const service = serviceWith(profilesStub(), { listActive: async () => [] });
    service.measurementForActiveVersion = async () =>
      withScales({ sentenceLength: scale() }, { version: CALIBRATION_VERSION });

    // Нечего предлагать: числа сняты той же меркой, что отгружена сегодня.
    expect((await service.scales(actor())).recalibration).toBeUndefined();
  });

  it('считает, сколько полос человек подвинул сам', async () => {
    const service = serviceWith(profilesStub(), { listActive: async () => [] });
    service.measurementForActiveVersion = async () =>
      withScales(
        {
          sentenceLength: scale({ corridorSource: 'MANUAL' }),
          questions: scale({ corridorSource: 'MANUAL' }),
          shortSentences: scale(),
        },
        { version: 'voice-calibration/1.0.0' }
      );

    expect((await service.scales(actor())).recalibration).toEqual({
      movedByHand: 2,
    });
  });

  it('подвинутые рукой границы переживают пересчёт, и рядом ложится измеренное', async () => {
    const oldMeasurement = withScales(
      {
        sentenceLength: scale({ corridorSource: 'MANUAL', low: 11, high: 17 }),
        questions: scale(),
      },
      { version: 'voice-calibration/1.0.0' }
    );
    // Свежий разбор намерил бы другое — и именно это раньше молча затирало
    // то, что человек поставил сам.
    const freshMetrics = {
      scales: { sentenceLength: scale({ low: 4, high: 25 }), questions: scale() },
    };
    let written = null;
    const service = serviceWith(
      profilesStub({ stampMeasurement: async () => undefined }),
      {
        getMeasurement: async () => ({ metrics: freshMetrics }),
        updateMeasurement: async (_org, _id, data) => {
          written = data.metrics;
          return 1;
        },
      }
    );
    service.measurementForActiveVersion = async () => oldMeasurement;
    service.runAnalysis = async () => ({
      outcome: 'ready',
      measurementId: 'msr-2',
    });

    await service.refreshMeasure(actor());

    const carried = written.scales.sentenceLength;
    expect(carried.low).toBe(11);
    expect(carried.high).toBe(17);
    expect(carried.corridorSource).toBe('MANUAL');
    // Что намерил продукт — рядом, иначе экрану нечего предложить принять.
    expect(carried.measuredLow).toBe(4);
    expect(carried.measuredHigh).toBe(25);
    // Шкала, которую никто не двигал, остаётся измеренной.
    expect(written.scales.questions.corridorSource).toBe('MEASURED');
  });

  it('без подвинутых рукой полос пересчёт ничего не переписывает', async () => {
    let touched = false;
    const service = serviceWith(
      profilesStub({ stampMeasurement: async () => undefined }),
      {
        getMeasurement: async () => ({ metrics: { scales: {} } }),
        updateMeasurement: async () => {
          touched = true;
          return 1;
        },
      }
    );
    service.measurementForActiveVersion = async () =>
      withScales({ sentenceLength: scale() }, { version: 'voice-calibration/1.0.0' });
    service.runAnalysis = async () => ({ outcome: 'ready', measurementId: 'msr-2' });

    await service.refreshMeasure(actor());

    expect(touched).toBe(false);
  });
});

/* ------------------------------------------------------------ passport edit */

describe('одна строка паспорта, переписанная там, где её читают', () => {
  const setup = () => {
    const written = [];
    const activated = [];
    const profiles = profilesStub({
      createDraft: async (organizationId, userId, content, label, avatarId) => {
        written.push({ organizationId, userId, content, label, avatarId });
        return { id: 'ver-5' };
      },
      activate: async (organizationId, userId, versionId) => {
        activated.push(versionId);
      },
    });
    const service = serviceWith(profiles);
    // `passport` reads a measurement; there is none here, and that is a
    // working state the card already draws.
    service.measurementForActiveVersion = async () => null;
    return { service, written, activated };
  };

  it('пишет новую версию с одной изменённой строкой поверх действующей', async () => {
    const { service, written, activated } = setup();

    await service.setPassportField(actor(), {
      key: 'TONE',
      text: 'Сухо и коротко',
    });

    expect(written).toHaveLength(1);
    const traits = written[0].content.voice.traits;
    expect(traits.find((one) => one.name === 'Тон').guidance).toBe(
      'Сухо и коротко'
    );
    // Всё остальное переносится: правка одной фразы голоса не должна тихо
    // стирать описание проекта, словарь или настройки площадок.
    expect(traits.find((one) => one.name === 'Кто говорит').guidance).toBe(
      'Автор 3'
    );
    expect(written[0].content.project.name).toBe('Завод');
    expect(activated).toEqual(['ver-5']);
  });

  it('пустая строка не сохраняется', async () => {
    const { service, written } = setup();

    await expect(
      service.setPassportField(actor(), { key: 'TONE', text: '   ' })
    ).rejects.toMatchObject({ code: 'VOICE_FIELDS_INCOMPLETE' });
    expect(written).toHaveLength(0);
  });

  it('строка, совпадающая с нынешней, не плодит версию', async () => {
    const { service, written } = setup();

    await service.setPassportField(actor(), { key: 'TONE', text: 'Тон 3' });

    // Иначе открыть поле, ничего не изменить и сохранить — значит получить
    // версию, у которой в сравнении не изменилось ни одно поле.
    expect(written).toHaveLength(0);
  });

  it('читателю без прав отказано по имени', async () => {
    const { service } = setup();

    await expect(
      service.setPassportField(actor({ canManage: false }), {
        key: 'TONE',
        text: 'Сухо',
      })
    ).rejects.toMatchObject({ code: 'VOICE_FORBIDDEN' });
  });

  it('без действующего голоса правка отказана и сказано, что делать', async () => {
    const profiles = profilesStub({
      overview: async () => ({
        versions: [],
        activeVersion: null,
        profile: null,
      }),
    });
    const service = serviceWith(profiles);

    await expect(
      service.setPassportField(actor(), { key: 'TONE', text: 'Сухо' })
    ).rejects.toMatchObject({ code: 'VOICE_PROFILE_NOT_FOUND' });
  });
});

/* ------------------------------------------------------ passport address */

/**
 * «Обращение» аватара (`content-factory-next-97dq.38`): та же дверь
 * `POST /passport/field`, тело `{ addressForm: 'ty' | 'vy' | null }`.
 */
describe('обращение аватара в паспорте', () => {
  const setup = (activeVoice = {}) => {
    const written = [];
    const activated = [];
    const active = {
      ...VERSIONS[2],
      content: {
        ...VERSIONS[2].content,
        voice: { ...VERSIONS[2].content.voice, ...activeVoice },
      },
    };
    const profiles = profilesStub({
      overview: async () => ({
        versions: VERSIONS,
        activeVersion: active,
        profile: { activeVersionId: active.id },
      }),
      createDraft: async (organizationId, userId, content, label, avatarId) => {
        written.push({ organizationId, content, avatarId });
        return { id: 'ver-9' };
      },
      activate: async (organizationId, userId, versionId) => {
        activated.push(versionId);
      },
    });
    const service = serviceWith(profiles);
    service.measurementForActiveVersion = async () => null;
    return { service, written, activated };
  };

  it('«на вы» — новая версия с одним изменённым полем, включена сразу', async () => {
    const { service, written, activated } = setup();

    await service.setPassportField(actor(), { addressForm: 'vy' });

    expect(written).toHaveLength(1);
    expect(written[0].content.voice.addressForm).toBe('vy');
    expect(written[0].content.voice.traits).toEqual(VERSIONS[2].content.voice.traits);
    expect(written[0].content.project.name).toBe('Завод');
    expect(activated).toEqual(['ver-9']);
  });

  it('новая версия несёт замеры действующей: паспорт не пишет «Числа не посчитаны» (97dq.43)', async () => {
    const stamped = [];
    const profiles = profilesStub({
      overview: async () => ({
        versions: VERSIONS,
        activeVersion: VERSIONS[2],
        profile: { activeVersionId: VERSIONS[2].id },
      }),
      createDraft: async () => ({ id: 'ver-9' }),
      activate: async () => undefined,
      stampMeasurement: async (organizationId, versionId, measurementId) => {
        stamped.push({ versionId, measurementId });
      },
    });
    const service = serviceWith(profiles);
    let reads = 0;
    service.measurementForActiveVersion = async () => {
      reads += 1;
      // Before the edit the active version is measured; the passport read
      // after it is not what this test is about.
      return reads === 1 ? { id: 'msr-1' } : null;
    };

    await service.setPassportField(actor(), { addressForm: 'vy' });

    expect(stamped).toEqual([{ versionId: 'ver-9', measurementId: 'msr-1' }]);
  });

  it('строка паспорта тоже не теряет замеры, а без замеров штампа нет', async () => {
    const stamped = [];
    const profiles = profilesStub({
      createDraft: async () => ({ id: 'ver-5' }),
      activate: async () => undefined,
      stampMeasurement: async (organizationId, versionId, measurementId) => {
        stamped.push({ versionId, measurementId });
      },
    });
    const service = serviceWith(profiles);
    let reads = 0;
    service.measurementForActiveVersion = async () =>
      (reads += 1) === 1 ? { id: 'msr-7' } : null;
    await service.setPassportField(actor(), { key: 'TONE', text: 'Сухо' });
    expect(stamped).toEqual([{ versionId: 'ver-5', measurementId: 'msr-7' }]);

    const bare = serviceWith(
      profilesStub({
        createDraft: async () => ({ id: 'ver-6' }),
        activate: async () => undefined,
        stampMeasurement: async () => {
          throw new Error('no measurement, no stamp');
        },
      })
    );
    bare.measurementForActiveVersion = async () => null;
    await bare.setPassportField(actor(), { key: 'TONE', text: 'Сухо' });
  });

  it('`null` — «Не задано»: поле снято, а не записано пустым', async () => {
    const { service, written } = setup({ addressForm: 'ty' });

    await service.setPassportField(actor(), { addressForm: null });

    expect(written).toHaveLength(1);
    expect(written[0].content.voice).not.toHaveProperty('addressForm');
  });

  it('то же значение версии не плодит, а паспорт его показывает', async () => {
    const { service, written } = setup({ addressForm: 'vy' });

    const answer = await service.setPassportField(actor(), { addressForm: 'vy' });

    expect(written).toHaveLength(0);
    expect(answer.voice.addressForm).toBe('vy');
    expect((await service.passport(actor())).voice.addressForm).toBe('vy');
  });

  it('без права править — отказ по имени', async () => {
    const { service } = setup();

    await expect(
      service.setPassportField(actor({ canManage: false }), { addressForm: 'ty' })
    ).rejects.toMatchObject({ code: 'VOICE_FORBIDDEN' });
  });

  it('тело двери: строка паспорта как была, обращение — только из трёх значений', () => {
    const { plainToInstance } = require('class-transformer');
    const { validateSync } = require('class-validator');
    const { VoicePassportFieldDto } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts'
    );
    const refusals = (body) =>
      validateSync(plainToInstance(VoicePassportFieldDto, body), {
        whitelist: true,
      }).map((failure) => failure.property);

    expect(refusals({ key: 'TONE', text: 'Сухо' })).toEqual([]);
    expect(refusals({ addressForm: 'vy' })).toEqual([]);
    expect(refusals({ addressForm: null })).toEqual([]);
    expect(refusals({ addressForm: 'thou' })).toEqual(['addressForm']);
    expect(refusals({}).sort()).toEqual(['key', 'text']);
  });
});

/**
 * «Разрешить ИИ придумывать примеры от моего лица» (`content-factory-next-97dq.99`):
 * та же дверь `POST /passport/field`, тело `{ delegatedPolicy }`. Хранится в
 * голосе аватара (`voice.delegatedPolicy`) без новой схемы; `knowledge` —
 * умолчание, поэтому снимает поле.
 */
describe('политика «Решите за меня» в паспорте', () => {
  const setup = (activeVoice = {}) => {
    const written = [];
    const active = {
      ...VERSIONS[2],
      content: {
        ...VERSIONS[2].content,
        voice: { ...VERSIONS[2].content.voice, ...activeVoice },
      },
    };
    let current = active;
    const profiles = profilesStub({
      overview: async () => ({
        versions: VERSIONS,
        activeVersion: current,
        profile: { activeVersionId: current.id },
      }),
      createDraft: async (organizationId, userId, content, label, avatarId) => {
        written.push({ content, avatarId });
        return { id: 'ver-9' };
      },
      // The door answers with the passport of the version it activated.
      activate: async () => {
        current = { ...active, id: 'ver-9', content: written[written.length - 1].content };
      },
    });
    const service = serviceWith(profiles);
    service.measurementForActiveVersion = async () => null;
    return { service, written };
  };

  it('паспорт без поля читает умолчание: «knowledge»', async () => {
    const { service } = setup();
    expect((await service.passport(actor())).voice.delegatedPolicy).toBe('knowledge');
  });

  it('включение — новая версия с одним полем, и паспорт его показывает (туда и обратно)', async () => {
    const { service, written } = setup();

    const on = await service.setPassportField(actor(), { delegatedPolicy: 'examples' });
    expect(written).toHaveLength(1);
    expect(written[0].content.voice.delegatedPolicy).toBe('examples');
    expect(written[0].content.voice.traits).toEqual(VERSIONS[2].content.voice.traits);
    expect(written[0].content.voice.sentenceStyle).toBe('Короткие фразы');
    expect(on.voice.delegatedPolicy).toBe('examples');

    const off = await service.setPassportField(actor(), { delegatedPolicy: 'knowledge' });
    expect(written).toHaveLength(2);
    expect(written[1].content.voice).not.toHaveProperty('delegatedPolicy');
    expect(off.voice.delegatedPolicy).toBe('knowledge');
  });

  it('то же значение версии не плодит: выключенное и отсутствующее — одно', async () => {
    const { service, written } = setup();
    await service.setPassportField(actor(), { delegatedPolicy: 'knowledge' });
    expect(written).toHaveLength(0);

    const already = setup({ delegatedPolicy: 'examples' });
    await already.service.setPassportField(actor(), { delegatedPolicy: 'examples' });
    expect(already.written).toHaveLength(0);
  });

  it('без права править — отказ по имени', async () => {
    const { service } = setup();
    await expect(
      service.setPassportField(actor({ canManage: false }), { delegatedPolicy: 'examples' })
    ).rejects.toMatchObject({ code: 'VOICE_FORBIDDEN' });
  });

  it('тело двери: только два значения, строка паспорта и обращение как были', () => {
    const { plainToInstance } = require('class-transformer');
    const { validateSync } = require('class-validator');
    const { VoicePassportFieldDto } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-voice.dto.ts'
    );
    const refusals = (body) =>
      validateSync(plainToInstance(VoicePassportFieldDto, body), {
        whitelist: true,
      }).map((failure) => failure.property);

    expect(refusals({ delegatedPolicy: 'examples' })).toEqual([]);
    expect(refusals({ delegatedPolicy: 'knowledge' })).toEqual([]);
    expect(refusals({ delegatedPolicy: 'invent' })).toEqual(['delegatedPolicy']);
    expect(refusals({ delegatedPolicy: null })).toEqual(['delegatedPolicy']);
    expect(refusals({ key: 'TONE', text: 'Сухо' })).toEqual([]);
    expect(refusals({ addressForm: 'vy' })).toEqual([]);
    expect(refusals({}).sort()).toEqual(['key', 'text']);
  });

  it('валидатор профиля знает поле и держит значение', () => {
    const validation = loadTypeScriptModule(`${profileBase}/brand-profile.validation.ts`);
    const content = (voice = {}) => ({
      project: {
        name: 'Пространство',
        oneLineDescription: 'Профиль голоса.',
        offerings: [],
        audiences: [{ name: 'Читатели' }],
        contentGoals: ['Посты'],
      },
      voice: {
        defaultLanguage: 'ru',
        allowedLanguages: ['ru'],
        traits: [{ name: 'Тон', guidance: 'Прямой.' }],
        pointOfView: 'first_person',
        formality: 'conversational',
        emojiPolicy: 'restrained',
        hashtagPolicy: 'none',
        ...voice,
      },
      lexicon: { preferred: [], avoid: [] },
      guardrails: { prohibitedTopics: [], prohibitedClaims: [], requiredPhrases: [] },
      examples: [{ kind: 'on_brand', text: 'Пост автора.' }],
      platformOverrides: [],
    });
    const issues = (value) => {
      const result = validation.validateBrandProfileContent(value, { forActivation: true });
      return 'issues' in result ? result.issues : [];
    };
    expect(issues(content())).toEqual([]);
    expect(issues(content({ delegatedPolicy: 'examples' }))).toEqual([]);
    expect(issues(content({ delegatedPolicy: 'knowledge' }))).toEqual([]);
    expect(issues(content({ delegatedPolicy: 'always' }))).toEqual(['voice.delegatedPolicy:invalid']);
  });
});
