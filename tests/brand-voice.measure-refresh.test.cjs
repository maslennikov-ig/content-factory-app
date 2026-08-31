'use strict';

require('reflect-metadata');

/**
 * Мерку похожести можно снять, не заплатив ни разу.
 *
 * До 28.08.2026 у продукта был ровно один вход в разбор — мастер, — и он
 * всегда звал модель. Голосу, разобранному до появления мерки, это стоило 29
 * вызовов за портрет, который у него уже был, ради арифметики, которая не
 * стоит ничего. `withAssist: false` сервис умел с самого начала; входа не было.
 *
 * Проверяется здесь не то, что кнопка вызывает маршрут, а четыре обещания.
 *
 * 1. **Модель не спрашивают.** Ни разу, ни при каких входных данных.
 * 2. **Штамп переставляется.** Разбор, оставленный без штампа, не меняет на
 *    экране ничего: `textCheck` читает не свежий разбор, а тот, что
 *    проштампован на действующей версии. Кнопка, рапортующая об успехе над
 *    молчащим вердиктом, хуже отсутствующей кнопки.
 * 3. **Недостача корпуса — это ответ, а не поломка**, и штампа тогда нет.
 * Кнопки в интерфейсе у этого действия нет и не должно быть: решение
 * владельца 28.08.2026 — обычный человек не обязан знать, что такое
 * калибровка. Маршрут остаётся дверью для оператора, и держат её эти
 * проверки, а не экран.
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
const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

const ORG = 'org-1';
const AVATAR = 'avatar-1';
const VERSION = 'version-1';

const CONTENT = {
  version: 'v1',
  project: {
    name: 'Мастерская',
    audiences: [{ name: 'Малый бизнес', need: 'Хотят писать сами' }],
  },
  voice: {
    traits: [
      { name: 'Кто говорит', guidance: 'Автор от первого лица' },
      { name: 'Тон', guidance: 'Разговорный и прямой' },
    ],
    sentenceStyle: 'Короткие фразы вперемешку с длинными',
  },
  guardrails: { prohibitedClaims: ['гарантированный доход'] },
};

/**
 * Пост длиной около тысячи знаков: двадцать таких переваливают за корпусный
 * порог в пятнадцать тысяч, и разбор доходит до `ready`.
 */
const post = (index) => `
Поставщика поменяли — старый срывал сроки третий месяц подряд, и это было видно
по журналу смены, а не по разговорам. Новый везёт из Челябинска, доставка на два
дня дольше. Зато по графику, и график этот держится с апреля.

Мы вчера догнали план. Правда, ценой субботней смены, и у нас на участке это уже
третий раз за квартал. Мастер предупредил заранее — за неделю, а не в пятницу
вечером, и это единственная причина, по которой смена вышла спокойной.

Сроки сдвинулись на два дня. Причина одна: поставка. Ставим контрольную точку на
среду, проверяем остатки, и если подшипники придут, линию запускаем в четверг.

Отгрузка ${index} прошла по факту и без лишних слов. Мы её приняли, смена
отработала ровно, и ничего героического в этом не было. Так и должно быть.
`;

/**
 * @param options.samples сколько текстов лежит в корпусе. Двадцать — рабочий
 *   случай; ноль — пространство, где разбирать нечего.
 * @param options.measurement разбор, уже лежащий в базе и проштампованный на
 *   действующей версии. `null` — версия без разбора вовсе.
 */
function harness({ samples = 20, measurement = null, active = true } = {}) {
  const prisma = new InMemoryVoicePrisma();

  prisma.state.profiles.push({
    id: AVATAR,
    organizationId: ORG,
    name: 'Автор',
    isDefault: true,
    activeVersionId: active ? VERSION : null,
  });
  prisma.state.versions.push({
    id: VERSION,
    organizationId: ORG,
    profileId: AVATAR,
    versionNumber: 1,
    label: 'v1',
    content: CONTENT,
    contentDigest: 'digest-1',
    measurementId: measurement ? 'measurement-old' : null,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    publishedAt: new Date('2026-08-20T10:00:00.000Z'),
  });

  if (measurement) {
    prisma.state.brandVoiceMeasurement.push({
      id: 'measurement-old',
      organizationId: ORG,
      avatarId: AVATAR,
      language: 'ru',
      analyzerVersion: 'test/1.0.0',
      localePackVersion: 'ru/1.0.0',
      sampleCount: 20,
      charCount: 20_000,
      wordCount: 3000,
      sentenceCount: 300,
      corpusSplit: {},
      metrics: measurement,
      createdAt: new Date('2026-08-20T09:00:00.000Z'),
    });
  }

  for (let index = 0; index < samples; index += 1) {
    prisma.state.brandVoiceSample.push({
      id: `sample-${index}`,
      organizationId: ORG,
      avatarId: AVATAR,
      code: `smp-${String(index + 1).padStart(2, '0')}`,
      text: post(index + 1),
      language: 'ru',
      contentHash: `hash-${index}`,
      usagePurpose: 'OWN_VOICE',
      deletedAt: null,
      createdAt: new Date('2026-08-20T08:00:00.000Z'),
    });
  }

  const sampleRepository = new VoiceSampleRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
    { model: prisma.model }
  );

  /**
   * Слепок, который нельзя позвать.
   *
   * Не счётчик вызовов, а взрыв: счётчик пришлось бы не забыть проверить в
   * каждом новом тесте файла, а этот падает сам, откуда бы его ни тронули.
   */
  const assist = {
    propose: () => {
      throw new Error('модель не должна вызываться при пересчёте мерки');
    },
  };

  const service = new VoiceService(
    sampleRepository,
    profiles,
    assist,
    {},
    () => new Date('2026-08-28T12:00:00.000Z')
  );

  return { prisma, service, assist };
}

const admin = {
  organizationId: ORG,
  userId: 'user-admin',
  canManage: true,
  avatarId: AVATAR,
};

describe('мерку похожести можно снять бесплатно', () => {
  test('пересчёт доходит до разбора и не трогает модель', async () => {
    const { service, prisma } = harness();

    const outcome = await service.refreshMeasure(admin);

    expect(outcome.outcome).toBe('ready');
    // Разбор записан: числа человека сохраняются до всякой модели и без неё.
    expect(prisma.state.brandVoiceMeasurement).toHaveLength(1);
    // Предложения модели в нём нет — его никто не спрашивал.
    expect(prisma.state.brandVoiceMeasurement[0].metrics.proposal).toBeUndefined();
  });

  test('штамп переезжает на новый разбор, иначе вердикт молчал бы дальше', async () => {
    const { service, prisma } = harness({ measurement: { scales: {} } });

    const outcome = await service.refreshMeasure(admin);

    const version = prisma.state.versions.find((one) => one.id === VERSION);
    // `textCheck` читает разбор по этому полю, а не последний по времени.
    // Оставить здесь старый id значило бы сделать кнопку, которая рапортует
    // об успехе и не меняет ничего.
    expect(version.measurementId).toBe(outcome.measurementId);
    expect(version.measurementId).not.toBe('measurement-old');
  });

  test('слова голоса пересчёт не трогает', async () => {
    const { service, prisma } = harness();

    await service.refreshMeasure(admin);

    const version = prisma.state.versions.find((one) => one.id === VERSION);
    // Портрет, поля и примеры — то, что человек принял. Пересчёт обещает
    // только числа, и обещание это проверяется здесь.
    expect(version.content).toEqual(CONTENT);
    expect(version.contentDigest).toBe('digest-1');
    expect(prisma.state.versions).toHaveLength(1);
  });

  test('корпуса не хватило — это ответ, и штампа тогда нет', async () => {
    const { service, prisma } = harness({ samples: 3 });

    const outcome = await service.refreshMeasure(admin);

    expect(outcome.outcome).toBe('insufficient');
    // Измерения не случилось, штамповать нечем. Старое поле остаётся как было.
    const version = prisma.state.versions.find((one) => one.id === VERSION);
    expect(version.measurementId).toBeNull();
  });

  test('без действующего голоса пересчитывать нечего, и это сказано', async () => {
    const { service } = harness({ active: false });

    await expect(service.refreshMeasure(admin)).rejects.toMatchObject({
      code: 'VOICE_PROFILE_NOT_FOUND',
    });
  });

  test('тот, кто не вправе менять голос, не пересчитает и мерку', async () => {
    const { service, prisma } = harness();

    await expect(
      service.refreshMeasure({ ...admin, canManage: false })
    ).rejects.toBeTruthy();
    expect(prisma.state.brandVoiceMeasurement).toHaveLength(0);
  });
});
