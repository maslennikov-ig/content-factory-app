'use strict';

require('reflect-metadata');

/**
 * Whose texts an avatar is measured from.
 *
 * `ProjectBrandProfile` has said since 2026-08-25 that each avatar «needs its
 * own corpus, its own print and its own portrait, because a print averaged
 * over two people describes neither». The corpus did not follow:
 * `BrandVoiceSample` carried `organizationId` and nothing else, and every read
 * of it was `listActive(organizationId)`. A space holding three authors
 * measured all three of them over everybody's posts and produced one averaged
 * author three times — the avatars came out identical, and nothing said so.
 *
 * Found 2026-08-26, before three real corpora went into one space.
 *
 * What is held here:
 *
 *   * a text belongs to the avatar that was current when it arrived;
 *   * an avatar reads its own texts and nobody else's;
 *   * texts that predate avatars belong to the default one, so every corpus
 *     loaded before this change reads exactly as it did;
 *   * dedup is per avatar, because a person and their brand are measured from
 *     overlapping writing and the second intake used to be refused as a repeat;
 *   * deleting an avatar hands its corpus to the successor the same request
 *     names, rather than leaving rows nobody can read.
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

const { VoiceSampleRepository } = loadTypeScriptModule(
  `${voiceBase}/voice-sample.repository.ts`,
  prismaMocks,
  { sources }
);

const ORG = 'org-a';

const harness = () => {
  const prisma = new InMemoryVoicePrisma();
  return {
    prisma,
    samples: new VoiceSampleRepository(
      { model: prisma.model },
      prisma.transaction,
      () => new Date('2026-08-26T00:00:00.000Z')
    ),
  };
};

/** One prepared post, distinct from every other by index. */
const post = (index) => ({
  origin: 'TELEGRAM_EXPORT',
  usagePurpose: 'OWN_VOICE',
  title: `пост ${index}`,
  text: `Сел считать руками, потому что глазами такое не ловится — ${index}.`,
  contentHash: `hash-${index}`,
  charCount: 60,
  wordCount: 10,
  language: 'ru',
  rightsState: 'OWN_CONTENT',
  externalRef: String(1000 + index),
  redactions: [],
});

const codesOf = (rows) => rows.map((one) => one.code);
const titlesOf = (rows) => rows.map((one) => one.title);

describe('корпус принадлежит аватару', () => {
  const loaded = async () => {
    const { prisma, samples } = harness();
    // Три автора в одном пространстве — то, ради чего аватаров несколько.
    await samples.addSamples(ORG, [post(1), post(2)], { avatarId: 'av-igor' });
    await samples.addSamples(ORG, [post(3)], { avatarId: 'av-grigory' });
    await samples.addSamples(ORG, [post(4)], { avatarId: 'av-anton' });
    return { prisma, samples };
  };

  it('аватар видит свои тексты и ничьи больше', async () => {
    const { samples } = await loaded();

    const igor = await samples.listActive(ORG, { avatarId: 'av-igor' });
    const grigory = await samples.listActive(ORG, { avatarId: 'av-grigory' });

    expect(titlesOf(igor)).toEqual(['пост 1', 'пост 2']);
    expect(titlesOf(grigory)).toEqual(['пост 3']);
  });

  it('без имени аватара корпус — всё пространство, как и прежде', async () => {
    const { samples } = await loaded();

    expect(await samples.listActive(ORG)).toHaveLength(4);
  });

  /**
   * Коды назначаются по всему пространству, а не внутри аватара, и это не
   * недосмотр: код — то, как анализ называет посчитанный текст, и нумерация
   * внутри аватара сделала бы `smp-04` вчерашнего разбиения указателем на
   * чужой пост.
   */
  it('коды остаются сквозными по пространству', async () => {
    const { samples } = await loaded();

    const all = await samples.listActive(ORG);
    const anton = await samples.listActive(ORG, { avatarId: 'av-anton' });

    expect(codesOf(all)).toEqual(['smp-01', 'smp-02', 'smp-03', 'smp-04']);
    expect(codesOf(anton)).toEqual(['smp-04']);
  });

  it('удалённый текст не возвращается ни одному аватару', async () => {
    const { samples } = await loaded();
    const [first] = await samples.listActive(ORG, { avatarId: 'av-igor' });

    await samples.softDelete(ORG, [first.id]);

    expect(await samples.listActive(ORG, { avatarId: 'av-igor' })).toHaveLength(
      1
    );
  });
});

/**
 * Тексты, загруженные до появления аватаров, — не ничьи.
 *
 * Экраны приёма работают раньше, чем появляется профиль, поэтому `avatarId`
 * там пуст. Их читает аватар по умолчанию: так корпус, загруженный до
 * 26.08.2026, читается ровно как читался, а не приблизительно так.
 */
describe('унаследованный корпус достаётся аватару по умолчанию', () => {
  const loaded = async () => {
    const { samples } = harness();
    await samples.addSamples(ORG, [post(1), post(2)]);
    await samples.addSamples(ORG, [post(3)], { avatarId: 'av-second' });
    return samples;
  };

  it('аватар по умолчанию читает и унаследованное, и своё', async () => {
    const samples = await loaded();

    const rows = await samples.listActive(ORG, {
      avatarId: 'av-default',
      inherited: true,
    });

    expect(titlesOf(rows)).toEqual(['пост 1', 'пост 2']);
  });

  it('второй аватар унаследованного не видит', async () => {
    const samples = await loaded();

    const rows = await samples.listActive(ORG, {
      avatarId: 'av-second',
      inherited: false,
    });

    expect(titlesOf(rows)).toEqual(['пост 3']);
  });
});

/**
 * Повтор считается внутри аватара.
 *
 * До 26.08.2026 ограничение стояло на `[organizationId, contentHash]`, и пара
 * «человек и его бренд», которую описывает сама схема, была невыразима:
 * второй аватар меряется по пересекающимся текстам, и его загрузку отвергали
 * как повтор первого.
 */
describe('дедупликация — по аватару, а не по пространству', () => {
  it('тот же текст у другого аватара — новый текст', async () => {
    const { samples } = harness();

    await samples.addSamples(ORG, [post(1)], { avatarId: 'av-person' });
    const second = await samples.addSamples(ORG, [post(1)], {
      avatarId: 'av-brand',
    });

    expect(second.created).toHaveLength(1);
    expect(second.duplicates).toHaveLength(0);
  });

  it('тот же текст у того же аватара — по-прежнему повтор', async () => {
    const { samples } = harness();

    await samples.addSamples(ORG, [post(1)], { avatarId: 'av-person' });
    const again = await samples.addSamples(ORG, [post(1)], {
      avatarId: 'av-person',
    });

    expect(again.created).toHaveLength(0);
    expect(again.duplicates).toHaveLength(1);
  });

  /**
   * Спрашивать про nullable-колонку можно только через `OR`.
   *
   * `{ avatarId: { in: [id, null] } }` читается верно и отвергается на
   * исполнении: `in` принимает список значений, а `null` значением не считается.
   * Ни один тип этого не ловит — клиент репозитория типизирован как
   * `Record<string, any>`, — и это стоило 500 на первой же настоящей загрузке
   * после разделения. Фейковая база теперь бросает на такой форме, поэтому
   * случай ниже красный, если её вернуть.
   */
  it('аватар по умолчанию спрашивает про унаследованное и не падает', async () => {
    const { samples } = harness();
    await samples.addSamples(ORG, [post(1)]);

    expect(
      await samples.knownHashes(ORG, {
        avatarId: 'av-default',
        inherited: true,
      })
    ).toEqual(['hash-1']);
  });

  it('проверка повторов на входе спрашивает ровно то же, что и индекс', async () => {
    const { samples } = harness();
    await samples.addSamples(ORG, [post(1)], { avatarId: 'av-person' });

    expect(
      await samples.knownHashes(ORG, { avatarId: 'av-brand' })
    ).toEqual([]);
    expect(
      await samples.knownHashes(ORG, { avatarId: 'av-person' })
    ).toEqual(['hash-1']);
  });
});

/**
 * Разбор — это тоже чей-то разбор.
 *
 * `latestMeasurement` спрашивал «что разбирали в этом пространстве последним»,
 * и второй аватар, запустивший разбор, забирал себе паспорт, коридоры и шкалы
 * первого. Это те самые числа, которые человек читает про себя, посчитанные по
 * чужим текстам.
 */
describe('разбор принадлежит аватару', () => {
  const measured = async (samples, avatarId, sampleCount) =>
    samples.saveMeasurement(ORG, {
      avatarId,
      result: {
        analyzerVersion: 'test',
        localePackVersion: 'test',
        language: 'ru',
        sampleCount,
        charCount: sampleCount * 60,
        wordCount: sampleCount * 10,
        sentenceCount: sampleCount * 2,
        scales: {},
        lexicon: [],
      },
    });

  it('каждый аватар читает свой последний разбор', async () => {
    const { samples } = harness();
    await measured(samples, 'av-igor', 153);
    await measured(samples, 'av-grigory', 1290);

    const igor = await samples.latestMeasurement(ORG, { avatarId: 'av-igor' });
    const grigory = await samples.latestMeasurement(ORG, {
      avatarId: 'av-grigory',
    });

    expect(igor.sampleCount).toBe(153);
    expect(grigory.sampleCount).toBe(1290);
  });

  it('чужой разбор не становится своим оттого, что он свежее', async () => {
    const { samples } = harness();
    await measured(samples, 'av-igor', 153);
    await measured(samples, 'av-anton', 133);

    expect(
      (await samples.latestMeasurement(ORG, { avatarId: 'av-igor' })).sampleCount
    ).toBe(153);
  });

  it('разбор, сделанный до аватаров, достаётся аватару по умолчанию', async () => {
    const { samples } = harness();
    await measured(samples, null, 153);

    expect(
      await samples.latestMeasurement(ORG, {
        avatarId: 'av-default',
        inherited: true,
      })
    ).not.toBeNull();
    expect(
      await samples.latestMeasurement(ORG, {
        avatarId: 'av-second',
        inherited: false,
      })
    ).toBeNull();
  });
});

describe('удалённый аватар отдаёт корпус преемнику', () => {
  it('тексты переходят целиком и читаются как свои', async () => {
    const { samples } = harness();
    await samples.addSamples(ORG, [post(1), post(2)], { avatarId: 'av-gone' });
    await samples.addSamples(ORG, [post(3)], { avatarId: 'av-heir' });

    const moved = await samples.reassignAvatar(ORG, 'av-gone', 'av-heir');

    expect(moved).toBe(2);
    expect(
      titlesOf(await samples.listActive(ORG, { avatarId: 'av-heir' }))
    ).toEqual(['пост 1', 'пост 2', 'пост 3']);
    expect(await samples.listActive(ORG, { avatarId: 'av-gone' })).toEqual([]);
  });
});

/**
 * Каждый маршрут раздела получает аватар, о котором его спрашивают.
 *
 * Пропущенный `@Query('avatar')` — самый тихий способ вернуть дефект: сервис
 * сузит корпус по аватару, которого ему не передали, возьмёт аватар по
 * умолчанию и покажет второму автору тексты первого. Ровно это и случилось с
 * `GET /samples` на первом же настоящем прогоне: три аватара, один корпус на
 * экране, и ни одной ошибки в логах.
 *
 * Проверяется по исходнику, а не по поведению: поднимать Nest ради формы
 * подписи дороже, чем прочитать её, а забывают именно подпись.
 */
describe('маршруты раздела принимают аватар', () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'apps/backend/src/api/routes/brand-voice.controller.ts'),
    'utf8'
  );

  /**
   * Аватар едет в запросе везде, кроме двух мест, и оба — намеренно.
   *
   * `/paths` отвечает, какие пути входа доступны пространству, и от аватара не
   * зависит. `/avatars*` — это управление самим списком: субъект там в теле,
   * потому что «удалить» несёт преемника в том же запросе.
   */
  const EXEMPT = [/^'\/paths'/u, /^'\/avatars/u];

  const routes = () => {
    const parts = source.split(/\n  @(Get|Post|Delete|Patch)\(/u);
    const found = [];
    for (let index = 1; index < parts.length; index += 2) {
      const method = parts[index];
      const body = parts[index + 1];
      const route = body.slice(0, body.indexOf(')'));
      // Подпись метода: от первой открывающей скобки аргументов до её закрытия.
      const signature = body.slice(0, body.indexOf('\n  ) {') + 1);
      found.push({ method, route, signature });
    }
    return found;
  };

  it('ни один маршрут корпуса и голоса не потерял аватар', () => {
    const missing = routes()
      .filter((one) => !EXEMPT.some((pattern) => pattern.test(one.route)))
      .filter((one) => !one.signature.includes("@Query('avatar')"))
      .map((one) => `${one.method} ${one.route}`);

    expect(missing).toEqual([]);
  });

  it('исключения перечислены поимённо, а не по совпадению', () => {
    const exempt = routes()
      .filter((one) => EXEMPT.some((pattern) => pattern.test(one.route)))
      .map((one) => one.route);

    expect(exempt).toEqual([
      "'/paths'",
      "'/avatars'",
      "'/avatars'",
      "'/avatars/update'",
      "'/avatars/default'",
      "'/avatars'",
    ]);
  });
});
