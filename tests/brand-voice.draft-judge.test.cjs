'use strict';

require('reflect-metadata');

/**
 * Мерка, которой отбор судит черновик, — та же, которой судит экран.
 *
 * Порт `draftJudge` существует затем, чтобы у графа генерации не завелось
 * второй сборки мерки. Голос — число относительно шеренги, и порог, снятый
 * против одной шеренги и применённый к голосу против другой, сравнивал бы две
 * разные величины; обе лежат в нуле-единице и обе выглядят как доля голосов,
 * так что ошибка была бы бесшумной. Стенд однажды мерил так месяц.
 *
 * Четыре обещания проверяются здесь.
 *
 * 1. **Точка приходит из калибровки этого автора**, а не из константы.
 * 2. **Черновик обрезается там же, где снята точка.** Судить по ней
 *    необрезанный текст значит читать голос одной длины по границам другой.
 * 3. **Нет разбора, отпечатка или границ — судить нечем**, и ответ `null`, а
 *    не «не похоже».
 * 4. **Порт действительно подключён** к тому, что его реализует.
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
const { buildVoicePrint } = loadTypeScriptModule(
  `${voiceBase}/voiceprint.ts`,
  prismaMocks,
  { sources }
);
const { RU_LOCALE_PACK } = loadTypeScriptModule(
  `${voiceBase}/locale-pack.ru.ts`,
  prismaMocks,
  { sources }
);
const { InMemoryVoicePrisma } = require('./helpers/voice-memory-prisma.cjs');

const ORG = 'org-1';
const AVATAR = 'avatar-1';
const VERSION = 'version-1';

const CONTENT = {
  version: 'v1',
  project: { name: 'Мастерская', audiences: [] },
  voice: { traits: [], sentenceStyle: 'Короткие фразы' },
  guardrails: {},
};

/** Манера автора: короткие рубленые фразы, цифры, разговорный ход. */
const own = (index) => `
Поставщика поменяли. Старый срывал сроки третий месяц, и это видно по журналу
смены, а не по разговорам. Новый везёт из Челябинска — на два дня дольше. Зато
по графику, и график держится с апреля.

План догнали. Ценой субботней смены, и это ${index}-й раз за квартал. Мастер
предупредил за неделю, а не в пятницу вечером. Только поэтому смена вышла
спокойной, и только поэтому её никто не запомнит.

Сроки сдвинулись на два дня. Причина одна — поставка. Ставим точку на среду,
смотрим остатки. Придут подшипники — линию запускаем в четверг. Не придут —
скажу прямо, без бодрых слов.
`;

/** Чужая манера: длинные периоды, канцелярит, ни одной цифры. */
const foreign = `
Настоящий документ определяет порядок осуществления взаимодействия между
подразделениями организации в части, касающейся обеспечения сохранности
имущества, а также устанавливает требования к оформлению соответствующей
документации, которая подлежит согласованию в установленном порядке с
уполномоченными лицами, назначаемыми приказом руководителя организации, и
хранению в течение срока, предусмотренного номенклатурой дел, утверждаемой
ежегодно. Ответственность за исполнение возлагается на руководителей структурных
подразделений, которые обеспечивают доведение положений до сведения работников.
`.repeat(4);

const printOf = () =>
  buildVoicePrint(
    Array.from({ length: 24 }, (unused, index) => ({ text: own(index + 1) })),
    RU_LOCALE_PACK
  );

/**
 * @param options.metrics содержимое колонки `metrics` у проштампованного
 *   разбора. `null` — версия без разбора вовсе.
 */
function harness({ metrics = undefined, stamped = true } = {}) {
  const prisma = new InMemoryVoicePrisma();

  prisma.state.profiles.push({
    id: AVATAR,
    organizationId: ORG,
    name: 'Автор',
    isDefault: true,
    activeVersionId: VERSION,
  });
  prisma.state.versions.push({
    id: VERSION,
    organizationId: ORG,
    profileId: AVATAR,
    versionNumber: 1,
    label: 'v1',
    content: CONTENT,
    contentDigest: 'digest-1',
    measurementId: metrics && stamped ? 'measurement-1' : null,
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    publishedAt: new Date('2026-08-20T10:00:00.000Z'),
  });
  if (metrics) {
    prisma.state.brandVoiceMeasurement.push({
      id: 'measurement-1',
      organizationId: ORG,
      avatarId: AVATAR,
      language: 'ru',
      analyzerVersion: 'test/1.0.0',
      localePackVersion: 'ru/1.0.0',
      sampleCount: 24,
      charCount: 24_000,
      wordCount: 3600,
      sentenceCount: 360,
      corpusSplit: {},
      metrics,
      createdAt: new Date('2026-08-20T09:00:00.000Z'),
    });
  }

  const service = new VoiceService(
    new VoiceSampleRepository({ model: prisma.model }, prisma.transaction),
    new VoiceProfileRepository(
      new BrandProfileRepository({ model: prisma.model }, prisma.transaction),
      { model: prisma.model }
    ),
    {},
    {},
    () => new Date('2026-08-28T12:00:00.000Z')
  );
  return { prisma, service };
}

const CALIBRATION = {
  version: 'voice-calibration/1.0.0',
  low: 0,
  high: 0.25,
  falseAccept: { of: 30, wrong: 1 },
  falseReject: { of: 38, wrong: 3 },
  negatives: 'foreign_avatars',
};

describe('порт мерки для отбора черновиков', () => {
  test('точка «похоже» — та, что снята на этом авторе', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf(), calibration: CALIBRATION },
    });

    const judge = await service.draftJudge(ORG, VERSION);

    expect(judge.accepts).toBe(CALIBRATION.high);
  });

  test('голос считается против отпечатка: свой текст набирает больше чужого', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf(), calibration: CALIBRATION },
    });

    const judge = await service.draftJudge(ORG, VERSION);

    expect(judge.score(own(99))).toBeGreaterThan(judge.score(foreign));
  });

  test('черновик обрезается там же, где снята точка', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf(), calibration: CALIBRATION },
    });
    const judge = await service.draftJudge(ORG, VERSION);

    // Восемьсот знаков чужой манеры, а дальше — своя. Читать текст целиком
    // значит вынести приговор по хвосту, которого точка никогда не видела.
    const head = foreign.slice(0, 800);
    const mixed = `${head}${own(5).repeat(3)}`;

    expect(judge.score(mixed)).toBe(judge.score(head));
    // И это не совпадение чисел: без обрезки ответ был бы другим — 1 против
    // 0,4 на тех же текстах. Проверка красная ровно на снятой обрезке.
    expect(judge.score(mixed)).toBeLessThan(judge.score(own(99)));
  });

  test('без границ судить нечем: ответ «нечем», а не «не похоже»', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf() },
    });

    expect(await service.draftJudge(ORG, VERSION)).toBeNull();
  });

  test('без отпечатка судить нечем', async () => {
    const { service } = harness({
      metrics: { scales: {}, calibration: CALIBRATION },
    });

    expect(await service.draftJudge(ORG, VERSION)).toBeNull();
  });

  test('без разбора под эту версию судить нечем', async () => {
    const { service } = harness();

    expect(await service.draftJudge(ORG, VERSION)).toBeNull();
  });

  test('чужая версия ничего не судит', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf(), calibration: CALIBRATION },
    });

    expect(await service.draftJudge('org-2', VERSION)).toBeNull();
    expect(await service.draftJudge(ORG, 'version-нет')).toBeNull();
  });
});

describe('порт подключён к тому, что его реализует', () => {
  const read = (relative) =>
    fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

  test('токен графа зарегистрирован на голосовой сервис', () => {
    const wiring = read(
      'libraries/nestjs-libraries/src/database/prisma/database.module.ts'
    );
    expect(wiring).toContain(
      '{ provide: DRAFT_VOICE_JUDGE, useExisting: VoiceService }'
    );
    expect(wiring).toContain(
      "import { DRAFT_VOICE_JUDGE } from '@contentfactory/nestjs-libraries/agent/draft-pick'"
    );
  });

  test('сервис отвечает тем именем, которым граф спрашивает', async () => {
    const { service } = harness({
      metrics: { scales: {}, voicePrint: printOf(), calibration: CALIBRATION },
    });
    const judge = await service.draftJudge(ORG, VERSION);

    // Форма порта: функция и число. Совпадения по типам здесь нет — токен
    // строковый, и `useExisting` не проверяет ничего.
    expect(typeof judge.score).toBe('function');
    expect(typeof judge.accepts).toBe('number');
  });
});
