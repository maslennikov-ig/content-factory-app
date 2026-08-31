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
