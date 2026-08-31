'use strict';

require('reflect-metadata');

/**
 * Что предложил продукт и что человек отправил вместо этого.
 *
 * Проверяется не то, что строку можно записать, а четыре обещания вокруг неё.
 *
 * 1. Правка сохраняется при отправке поста и привязана к тому аватару, чьим
 *    голосом написан черновик, — а не к тому, что открыт в форме.
 * 2. Одно сохранение — одно наблюдение: пересохранение того же текста вес
 *    одной правки не удваивает.
 * 3. Удаление аватара уносит правки с собой. Наследнику они не переходят.
 * 4. **На генерацию не влияет ничего из этого.** Это главная проверка файла и
 *    она обязана краснеть в тот день, когда правки начнут подмешиваться без
 *    замера: «система учится на ваших правках» без числа — обещание, а не
 *    свойство продукта.
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

const { VoiceEditRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-edit.repository.ts`,
  prismaMocks,
  { sources }
);
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

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/** Исходник с выключенными комментариями: файл вправе объясняться свободно. */
const code = (relativePath) =>
  read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const ORG = 'org-1';
const AVATAR = 'avatar-1';
const VERSION = 'version-1';

function harness() {
  const prisma = new InMemoryVoicePrisma();
  const edits = new VoiceEditRepository({ model: prisma.model });

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
  });

  /** Черновик, написанный продуктом, и пост, выросший из него. */
  const draft = (postId, body) => {
    const piece = prisma.model.contentPiece.create({
      data: {
        organizationId: ORG,
        title: 'Черновик',
        body,
        language: 'ru',
        createdByUserId: 'user-1',
        brandProfileVersionId: VERSION,
      },
    });
    prisma.model.contentDerivation.create({
      data: {
        organizationId: ORG,
        contentPieceId: piece.id,
        postId,
        platform: 'telegram',
        format: 'post',
        brandProfileVersionId: VERSION,
        state: 'DRAFT',
      },
    });
    return piece;
  };

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
    null,
    {},
    () => new Date('2026-08-27T12:00:00.000Z'),
    edits
  );

  return { prisma, edits, draft, service };
}

const admin = { organizationId: ORG, userId: 'user-admin', canManage: true };

const PROPOSED =
  'Поставщика поменяли. Новый возит по графику, и это видно по журналу смены.';
const SENT =
  'Поменяли поставщика — старый срывал сроки. Новый везёт по графику. Видно по журналу.';

describe('продукт запоминает, что автор исправил', () => {
  test('пара пишется при отправке и привязана к аватару черновика', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);

    const id = await edits.recordFromPost(ORG, 'post-1', SENT);

    expect(id).toBeTruthy();
    const [row] = prisma.state.brandVoiceEdit;
    // Аватар берётся из версии голоса, которой написан черновик. Спросить об
    // этом клиента значило бы поверить форме в том, чей это голос.
    expect(row.avatarId).toBe(AVATAR);
    expect(row.profileVersionId).toBe(VERSION);
    expect(row.postId).toBe('post-1');
    expect(row.proposedText).toBe(PROPOSED);
    expect(row.sentText).toBe(SENT);
    expect(row.changed).toBe(true);
  });

  test('отправленный без правки черновик — тоже наблюдение', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);

    await edits.recordFromPost(ORG, 'post-1', PROPOSED);

    // И притом ценное: человек признал своим текст, которого не писал, а
    // мерка обязана уметь сказать про него то же самое.
    expect(prisma.state.brandVoiceEdit).toHaveLength(1);
    expect(prisma.state.brandVoiceEdit[0].changed).toBe(false);
  });

  test('разметка не правка', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);

    await edits.recordFromPost(ORG, 'post-1', `<p>${PROPOSED}</p>`);

    // Форма держит пост как HTML. Смена `<p>` на `<div>` не то, чему стоит
    // учить порог.
    expect(prisma.state.brandVoiceEdit[0].changed).toBe(false);
  });

  test('пересохранение того же текста не удваивает наблюдение', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);

    const first = await edits.recordFromPost(ORG, 'post-1', SENT);
    const second = await edits.recordFromPost(ORG, 'post-1', SENT);

    expect(first).toBeTruthy();
    // Повтор это ответ, а не поломка: иначе автосохранение умножило бы одно
    // наблюдение на число нажатий «сохранить».
    expect(second).toBeNull();
    expect(prisma.state.brandVoiceEdit).toHaveLength(1);
  });

  test('пост, написанный человеком с нуля, наблюдением не становится', async () => {
    const { prisma, edits } = harness();

    const id = await edits.recordFromPost(ORG, 'post-без-черновика', SENT);

    expect(id).toBeNull();
    // Пара, где одна половина пуста, учила бы порог отличать текст от пустоты.
    expect(prisma.state.brandVoiceEdit).toHaveLength(0);
  });

  test('материалом считается то, что человек тронул', async () => {
    const { edits, draft } = harness();
    draft('post-1', PROPOSED);
    draft('post-2', `${PROPOSED} Отгрузку приняли.`);
    await edits.recordFromPost(ORG, 'post-1', SENT);
    await edits.recordFromPost(ORG, 'post-2', `${PROPOSED} Отгрузку приняли.`);

    const counts = await edits.counts(ORG, AVATAR);

    // Два наблюдения, из них одно с правкой: отрицательным примером является
    // только переписанное.
    expect(counts).toEqual({ total: 2, changed: 1 });
  });

  test('правки удалённого аватара стираются', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);
    await edits.recordFromPost(ORG, 'post-1', SENT);

    const removed = await edits.eraseForAvatar(ORG, AVATAR);

    expect(removed).toBe(1);
    // Совсем, а не пометкой: тексты человека держатся ровно столько, сколько
    // держится автор, для которого они собраны.
    expect(prisma.state.brandVoiceEdit).toHaveLength(0);
  });

  test('удаление аватара через продукт уносит правки с собой', async () => {
    const { prisma, edits, draft, service } = harness();
    draft('post-1', PROPOSED);
    await edits.recordFromPost(ORG, 'post-1', SENT);
    expect(prisma.state.brandVoiceEdit).toHaveLength(1);

    await service.deleteAvatar(admin, { avatarId: AVATAR });

    /**
     * Не через репозиторий напрямую, а тем же путём, которым это делает
     * человек.
     *
     * Обещание «удаляется вместе с аватаром» даётся в документах о данных, и
     * проверять его на методе, который никто не вызывает, значило бы проверить
     * намерение. Корпус при этом переживает аватар и уходит наследнику —
     * правка не уходит: у наследника она означала бы, что кто-то другой
     * поправил его черновик.
     */
    expect(prisma.state.brandVoiceEdit).toHaveLength(0);
  });
});

/**
 * Отрицательные примеры для рабочей точки — `content-factory-next-pl1.5`.
 *
 * Порог до 28.08.2026 снимался на текстах чужих людей, и на самом маленьком из
 * трёх корпусов пускал треть собственных генераций продукта. Настоящий
 * противник — то, что продукт написал этому автору и что автор переписал.
 * Проверяется не арифметика порога (она в `brand-voice.calibration.test.cjs`),
 * а какой материал ей достаётся.
 */
describe('переписанные черновики как отрицательные примеры', () => {
  const OTHER = 'Совсем другой черновик про сроки и поставщиков.';

  test('берутся только те, которые человек действительно переписал', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);
    draft('post-2', OTHER);
    await edits.recordFromPost(ORG, 'post-1', SENT);
    await edits.recordFromPost(ORG, 'post-2', OTHER);
    expect(prisma.state.brandVoiceEdit).toHaveLength(2);

    const drafts = await edits.rewrittenDrafts(ORG, AVATAR, 'ru');

    /**
     * Черновик, отправленный без единой правки, автор признал своим. Считать
     * его чужим значило бы двигать порог вниз ровно тем материалом, ради
     * которого его двигают вверх.
     */
    expect(drafts).toEqual([PROPOSED]);
  });

  test('берутся только на языке разбора', async () => {
    const { prisma, edits, draft } = harness();
    draft('post-1', PROPOSED);
    await edits.recordFromPost(ORG, 'post-1', SENT);
    prisma.state.brandVoiceEdit[0].language = 'en';

    expect(await edits.rewrittenDrafts(ORG, AVATAR, 'ru')).toEqual([]);
    expect(await edits.rewrittenDrafts(ORG, AVATAR, 'en')).toEqual([PROPOSED]);
  });

  test('чужого аватара не берут', async () => {
    const { edits, draft } = harness();
    draft('post-1', PROPOSED);
    await edits.recordFromPost(ORG, 'post-1', SENT);

    expect(await edits.rewrittenDrafts(ORG, 'avatar-2', 'ru')).toEqual([]);
  });
});

describe('правки ни во что не подмешиваются', () => {
  /** Всё, через что голос попадает в модель. */
  const generationPath = [
    `${voiceBase}/voice-retention.ts`,
    `${voiceBase}/voice-examples.ts`,
    `${voiceBase}/assist.pipeline.ts`,
    `${voiceBase}/voice-assist.service.ts`,
    `${voiceBase}/voice-calibration.ts`,
    `${voiceBase}/lineup.ts`,
    `${voiceBase}/voiceprint.ts`,
  ];

  test.each(generationPath)('%s не читает правки', (file) => {
    const source = code(file);

    /**
     * Красная проверка на порядок работ, а не на стиль.
     *
     * Половина этого запрета снята 28.08.2026, и снята числом. Замер на трёх
     * корпусах ответил, чего правки стоят **как отрицательные примеры для
     * порога**: точка, снятая в том числе на них, пускает 8,0% собственных
     * генераций там, где точка по одним чужим людям пускала 33,0%. Поэтому
     * порог их читает — через репозиторий и в одном месте, и это проверяется
     * ниже поимённо.
     *
     * Вторая половина не снята и не проверялась: **в промпт правки не идут**.
     * «Система учится на ваших правках» без числа — обещание, а не свойство
     * продукта, и файлы ниже — всё, через что голос попадает в модель.
     */
    expect(source).not.toMatch(/brandVoiceEdit|VoiceEditRepository/);
    expect(source).not.toMatch(/\bsentText\b|\bproposedText\b/);
  });

  test('репозиторий правок не знает ни промпта, ни порога', () => {
    const source = code(`${voiceBase}/voice-edit.repository.ts`);

    /**
     * Он отдаёт тексты и не выбирает по ним рабочую точку: арифметика порога
     * живёт в `voice-calibration.ts` в одном экземпляре, и вторая копия здесь
     * разошлась бы с ней молча — оба числа лежат в нуле-единице.
     */
    expect(source).not.toMatch(/calibrate\(|renderVoiceInjection|examples/i);
  });

  test('сервис голоса трогает правки в двух местах, и оба названы', () => {
    const source = code(`${voiceBase}/voice.service.ts`);

    const uses = source.match(/_edits[?.]/g) || [];
    expect(uses).toHaveLength(2);
    // Первое: удаление аватара уносит его правки.
    expect(source).toMatch(/_edits\?\.eraseForAvatar/);
    // Второе: отрицательные примеры для рабочей точки — и ничего больше.
    expect(source).toMatch(/_edits\.rewrittenDrafts/);
    expect(source).not.toMatch(/_edits\??\.list\(/);
  });

  test('прочитанные черновики уходят в порог и никуда больше', () => {
    const source = code(`${voiceBase}/voice.service.ts`);

    /**
     * Читатель у `rewrittenDrafts` ровно один — вызов `calibrate`. Если
     * завтра его результат попадёт в содержимое профиля или в примеры автора,
     * второй вызов появится здесь, и эта строка покраснеет раньше, чем чужой
     * черновик доедет до промпта.
     */
    const readers = source.match(/this\.rewrittenDrafts\(/g) || [];
    expect(readers).toHaveLength(1);
    expect(source).toMatch(
      /calibrate\(\s*own,\s*votesOf\(parts\.negatives\),\s*votesOf\(\s*await this\.rewrittenDrafts\(/
    );
  });

  test('сохранение поста берёт правки по имени, а не по классу', () => {
    const { VOICE_EDIT_PORT } = loadTypeScriptModule(
      `${voiceBase}/voice-edit.repository.ts`,
      prismaMocks,
      { sources }
    );
    const posts = code(
      'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
    );
    const module = code(
      'libraries/nestjs-libraries/src/database/prisma/database.module.ts'
    );

    /**
     * Сервис постов поднимается и там, где голосового модуля нет.
     *
     * Обычный импорт класса притащил бы туда весь раздел «Контент»: набор
     * `telegram.post.statistics` грузит этот файл в одиночку и на таком
     * импорте перестал собираться. Значение приходит по имени, тип — стирается
     * компиляцией, и обе стороны обязаны звать имя одинаково.
     */
    expect(VOICE_EDIT_PORT).toBe('VOICE_EDIT_REPOSITORY');
    expect(posts).toContain(`@Inject('${VOICE_EDIT_PORT}')`);
    expect(posts).toMatch(/import type \{ VoiceEditRepository \}/);
    expect(module).toContain('VOICE_EDIT_PORT');
  });

  test('сохранение поста записывает правку и не ждёт её', () => {
    const source = code(
      'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts'
    );

    // Пост, который не удалось записать в эту таблицу, обязан быть отправлен
    // как ни в чём не бывало: правка это материал для будущего замера, а не
    // часть отправки.
    expect(source).toMatch(/recordVoiceEdit\([^)]*\)\.catch\(/);
    expect(source).toMatch(/recordFromPost/);
  });
});
