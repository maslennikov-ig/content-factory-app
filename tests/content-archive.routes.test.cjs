'use strict';

/**
 * «Что уже написали» — the archive (`content-factory-next-odb8.4`).
 *
 * The guard this file exists to hold: three layers live in one `ContentPiece`
 * table, told apart only by `tags.archive.origin`, and a filter on the archive
 * list actually narrows what comes back rather than decorating rows nobody
 * removed. Both are the one thing the map document names as missing today —
 * "поиска нет нигде... в репозиториях только списки" — and this suite is what
 * would turn red if either regressed: strip `layer` out of the `where`
 * narrowing in `listArchive` and the "a layer filter actually excludes the
 * other two layers" test below fails, because all three rows would still come
 * back.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');

const BRAND_VOICE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const MATERIALS =
  'libraries/nestjs-libraries/src/content-intelligence/materials';

const FILES = {
  errors: `${MATERIALS}/errors.ts`,
  presentation: `${MATERIALS}/material-presentation.ts`,
  archivePresentation: `${MATERIALS}/archive-presentation.ts`,
  repository: `${MATERIALS}/content-material.repository.ts`,
  service: `${MATERIALS}/content-material.service.ts`,
  dto: 'libraries/nestjs-libraries/src/dtos/content-intelligence/content-material.dto.ts',
  searchTerms:
    'libraries/nestjs-libraries/src/content-intelligence/search-terms.ts',
  archiveController: 'apps/backend/src/api/routes/content-archive.controller.ts',
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const sources = {
  './errors': FILES.errors,
  './material-presentation': FILES.presentation,
  './archive-presentation': FILES.archivePresentation,
  './content-material.repository': FILES.repository,
  '../search-terms': FILES.searchTerms,
  './segment': `${BRAND_VOICE}/segment.ts`,
  './locale-pack.ru': `${BRAND_VOICE}/locale-pack.ru.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut': `${BRAND_VOICE}/recut.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${BRAND_VOICE}/voice-wiring.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation': FILES.archivePresentation,
};

function forbidPlatformAndNetworkImports(request) {
  if (
    /(openai|undici|axios|node-fetch|integrations\/|posts\.service|\.provider)/i.test(
      request
    )
  ) {
    throw new Error(
      `the material path imported a forbidden dependency: ${request}`
    );
  }
  return undefined;
}

const load = (relativePath) =>
  loadTypeScriptModule(relativePath, prismaMocks, {
    sources,
    resolve: forbidPlatformAndNetworkImports,
  });

const { ContentMaterialRepository } = load(FILES.repository);
const { ContentMaterialService } = load(FILES.service);
const archivePresentation = load(FILES.archivePresentation);

const at = (iso) => new Date(iso);

/*
  Поддельная Prisma умеет ровно столько, сколько спрашивает код. Поиск по
  словам (`content-factory-next-odb8.4`) добавил три формы: `AND` и `OR` как
  списки под-условий и `contains` с `mode: 'insensitive'`. Без них проверка
  «слова действительно отбирают» проверяла бы поддельный движок, а не запрос.
*/
const matches = (row, where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') return condition.every((part) => matches(row, part));
    if (key === 'OR') return condition.some((part) => matches(row, part));
    if (condition === null) return row[key] === null || row[key] === undefined;
    if (condition && typeof condition === 'object') {
      if ('in' in condition) return condition.in.includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
      if ('contains' in condition) {
        const value = String(row[key] ?? '');
        return condition.mode === 'insensitive'
          ? value.toLocaleLowerCase().includes(
              String(condition.contains).toLocaleLowerCase()
            )
          : value.includes(String(condition.contains));
      }
    }
    return row[key] === condition;
  });

const byOrder = (orderBy) => (left, right) => {
  if (!orderBy) return 0;
  const [key, direction] = Object.entries(orderBy)[0];
  const delta = left[key] > right[key] ? 1 : left[key] < right[key] ? -1 : 0;
  return direction === 'desc' ? -delta : delta;
};

/**
 * Three layers, told apart only by `tags`. `piece-here-*` carry no `archive`
 * tag at all — the same shape every brief-authored `ContentPiece` has today —
 * and read as `MADE_HERE` for exactly that reason.
 */
function fixture() {
  return {
    pieces: [
      {
        id: 'piece-here-1',
        organizationId: 'org-a',
        title: 'Сделано здесь: разбор поставки',
        body: 'Текст, написанный фабрикой.',
        language: 'ru',
        tags: null,
        brandProfileVersionId: null,
        contentContextSnapshotId: 'ctx-snapshot-1',
        archivedAt: null,
        createdByUserId: 'user-a',
        createdAt: at('2026-08-01T09:00:00.000Z'),
        brandProfileVersion: null,
      },
      {
        id: 'piece-pre-1',
        organizationId: 'org-a',
        title: 'До продукта: старая статья',
        body: 'Текст, написанный до фабрики.',
        language: 'ru',
        tags: {
          archive: {
            origin: 'IMPORTED_PRE_PRODUCT',
            platform: 'site',
            url: 'https://example.invalid/old-article',
            publishedAt: '2019-06-14',
            note: null,
          },
        },
        brandProfileVersionId: null,
        contentContextSnapshotId: null,
        archivedAt: null,
        createdByUserId: 'user-a',
        createdAt: at('2026-08-10T09:00:00.000Z'),
        brandProfileVersion: null,
      },
      {
        id: 'piece-elsewhere-1',
        organizationId: 'org-a',
        title: 'Мимо продукта: колонка в другом издании',
        body: 'Текст, опубликованный не здесь.',
        language: 'ru',
        tags: {
          archive: {
            origin: 'PUBLISHED_ELSEWHERE',
            platform: 'newsletter',
            url: 'https://example.invalid/column',
            publishedAt: '2026-07-01',
            note: 'Колонка для партнёрской рассылки',
          },
        },
        brandProfileVersionId: null,
        contentContextSnapshotId: null,
        archivedAt: null,
        createdByUserId: 'user-a',
        createdAt: at('2026-08-15T09:00:00.000Z'),
        brandProfileVersion: null,
      },
    ],
    derivations: [
      {
        id: 'der-1',
        organizationId: 'org-a',
        contentPieceId: 'piece-here-1',
        postId: 'post-1',
        integrationId: 'integration-telegram',
        platform: 'telegram',
        format: 'короткий',
        brandProfileVersionId: null,
        state: 'PUBLISHED',
        createdAt: at('2026-08-02T09:00:00.000Z'),
      },
    ],
  };
}

function database(seed = fixture()) {
  const calls = [];
  const record = (name, args) => calls.push({ name, args });
  let created = 0;

  const model = {
    contentPiece: {
      findMany: async (args = {}) => {
        record('contentPiece.findMany', args);
        return seed.pieces
          .filter((piece) => matches(piece, args.where))
          .sort(byOrder(args.orderBy));
      },
      findFirst: async (args = {}) => {
        record('contentPiece.findFirst', args);
        return seed.pieces.find((piece) => matches(piece, args.where)) || null;
      },
      create: async (args = {}) => {
        record('contentPiece.create', args);
        created += 1;
        const row = {
          id: `piece-new-${created}`,
          createdAt: at('2026-08-22T10:00:00.000Z'),
          ...args.data,
        };
        seed.pieces.push(row);
        return row;
      },
    },
    contentDerivation: {
      groupBy: async (args = {}) => {
        record('contentDerivation.groupBy', args);
        const grouped = new Map();
        for (const derivation of seed.derivations) {
          if (!matches(derivation, args.where)) continue;
          const key = args.by.map((field) => derivation[field]).join('|');
          const entry = grouped.get(key) || {
            ...Object.fromEntries(
              args.by.map((field) => [field, derivation[field]])
            ),
            _count: { _all: 0 },
          };
          entry._count._all += 1;
          grouped.set(key, entry);
        }
        return [...grouped.values()];
      },
      findMany: async (args = {}) => {
        record('contentDerivation.findMany', args);
        const rows = seed.derivations.filter((derivation) =>
          matches(derivation, args.where)
        );
        if (!args.distinct) return rows;
        const seen = new Set();
        return rows.filter((row) => {
          const key = args.distinct.map((field) => row[field]).join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      },
    },
    $transaction: async (run) => run(model),
  };

  return { model, calls, seed };
}

function service(seed = fixture()) {
  const store = database(seed);
  const repository = new ContentMaterialRepository(
    { model: store.model },
    { model: store.model }
  );
  return { store, service: new ContentMaterialService(repository) };
}

const failure = async (run) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('the call was expected to refuse and did not');
};

/* -------------------------------------------------------------------------
 * Reading a layer back from `tags`
 * ---------------------------------------------------------------------- */

describe('a piece reads its own archive layer from tags, not from a column', () => {
  test('no archive tag reads as MADE_HERE', () => {
    expect(archivePresentation.archiveLayerOf(null)).toBe('MADE_HERE');
    expect(archivePresentation.archiveLayerOf(undefined)).toBe('MADE_HERE');
    expect(archivePresentation.archiveLayerOf({})).toBe('MADE_HERE');
  });

  test('a recognised origin reads back exactly', () => {
    expect(
      archivePresentation.archiveLayerOf({
        archive: { origin: 'IMPORTED_PRE_PRODUCT' },
      })
    ).toBe('IMPORTED_PRE_PRODUCT');
    expect(
      archivePresentation.archiveLayerOf({
        archive: { origin: 'PUBLISHED_ELSEWHERE' },
      })
    ).toBe('PUBLISHED_ELSEWHERE');
  });

  test('an unrecognised origin falls back to MADE_HERE rather than throwing', () => {
    expect(
      archivePresentation.archiveLayerOf({ archive: { origin: 'MADE_HERE' } })
    ).toBe('MADE_HERE');
    expect(
      archivePresentation.archiveLayerOf({ archive: { origin: 'SOMETHING_ELSE' } })
    ).toBe('MADE_HERE');
  });

  test('MADE_HERE never carries an origin', () => {
    expect(archivePresentation.archiveOriginOf(null)).toBeNull();
    expect(
      archivePresentation.archiveOriginOf({ archive: { origin: 'MADE_HERE' } })
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * The archive list: three layers, one flat feed
 * ---------------------------------------------------------------------- */

describe('the archive lists all three layers together and names each row', () => {
  test('every layer is present and correctly named', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-a', {});

    expect(response.state).toBe('default');
    expect(response.total).toBe(3);
    const byId = Object.fromEntries(
      response.materials.map((row) => [row.id, row])
    );
    expect(byId['piece-here-1'].layer).toBe('MADE_HERE');
    expect(byId['piece-pre-1'].layer).toBe('IMPORTED_PRE_PRODUCT');
    expect(byId['piece-elsewhere-1'].layer).toBe('PUBLISHED_ELSEWHERE');
    expect(response.counts).toEqual({
      MADE_HERE: 1,
      IMPORTED_PRE_PRODUCT: 1,
      PUBLISHED_ELSEWHERE: 1,
    });
  });

  test('newest first', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-a', {});
    expect(response.materials.map((row) => row.id)).toEqual([
      'piece-elsewhere-1',
      'piece-pre-1',
      'piece-here-1',
    ]);
  });

  test('a brought-in row carries its origin; a made-here row carries none', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-a', {});
    const byId = Object.fromEntries(
      response.materials.map((row) => [row.id, row])
    );
    expect(byId['piece-pre-1'].origin).toMatchObject({
      platform: 'site',
      url: 'https://example.invalid/old-article',
      publishedAt: '2019-06-14',
    });
    expect(byId['piece-here-1'].origin).toBeNull();
    // «Разбор из текста»: the row itself carries what a text stood on.
    expect(byId['piece-here-1'].contentContextSnapshotId).toBe('ctx-snapshot-1');
    expect(byId['piece-pre-1'].contentContextSnapshotId).toBeNull();
  });

  /**
   * The guard. Comment out `if (filters.layer && item.layer !== filters.layer)
   * return false;` in `ContentMaterialService.listArchive` and this fails: all
   * three rows come back for every layer filter, `total` stays 3, and the two
   * excluded layers stay in the list.
   */
  test('a layer filter actually excludes the other two layers', async () => {
    const { service: materials } = service();

    const madeHere = await materials.listArchive('org-a', { layer: 'MADE_HERE' });
    expect(madeHere.total).toBe(1);
    expect(madeHere.materials.map((row) => row.id)).toEqual(['piece-here-1']);

    const pre = await materials.listArchive('org-a', {
      layer: 'IMPORTED_PRE_PRODUCT',
    });
    expect(pre.total).toBe(1);
    expect(pre.materials.map((row) => row.id)).toEqual(['piece-pre-1']);

    const elsewhere = await materials.listArchive('org-a', {
      layer: 'PUBLISHED_ELSEWHERE',
    });
    expect(elsewhere.total).toBe(1);
    expect(elsewhere.materials.map((row) => row.id)).toEqual([
      'piece-elsewhere-1',
    ]);
  });

  test('a platform filter matches a made-here derivation and a declared origin alike', async () => {
    const { service: materials } = service();

    const telegram = await materials.listArchive('org-a', { platform: 'telegram' });
    expect(telegram.materials.map((row) => row.id)).toEqual(['piece-here-1']);

    const newsletter = await materials.listArchive('org-a', {
      platform: 'newsletter',
    });
    expect(newsletter.materials.map((row) => row.id)).toEqual([
      'piece-elsewhere-1',
    ]);
  });

  test('a date range excludes what falls outside it', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-a', {
      from: '2026-08-09T00:00:00.000Z',
      to: '2026-08-12T00:00:00.000Z',
    });
    expect(response.materials.map((row) => row.id)).toEqual(['piece-pre-1']);
  });

  test('pagination narrows the page without changing the total', async () => {
    const { service: materials } = service();
    const first = await materials.listArchive('org-a', { limit: 2, page: 0 });
    expect(first.materials.length).toBe(2);
    expect(first.total).toBe(3);

    const second = await materials.listArchive('org-a', { limit: 2, page: 1 });
    expect(second.materials.length).toBe(1);
    expect(second.total).toBe(3);
    expect(
      new Set([...first.materials, ...second.materials].map((row) => row.id))
        .size
    ).toBe(3);
  });

  test('an unfiltered call on an empty workspace reports empty, not filtered-empty', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-empty', {});
    expect(response.state).toBe('empty');
  });

  test('filters that match nothing report filtered-empty, not empty', async () => {
    const { service: materials } = service();
    const response = await materials.listArchive('org-a', { platform: 'vk' });
    expect(response.state).toBe('filtered-empty');
    expect(response.total).toBe(0);
  });

  test('another workspace is never read', async () => {
    const { service: materials, store } = service();
    await materials.listArchive('org-a', {});
    for (const call of store.calls) {
      if ('organizationId' in (call.args.where || {})) {
        expect(call.args.where.organizationId).toBe('org-a');
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * Поиск по словам (`content-factory-next-odb8.4`, решение владельца 05.09.2026)
 * ---------------------------------------------------------------------- */

describe('поиск по архиву — по словам, и слова доезжают до запроса', () => {
  const searchCall = (store) =>
    store.calls.find(
      (call) => call.name === 'contentPiece.findMany' && call.args.select?.id
    );

  test('запрос строится с organizationId, а слова лежат внутри него', async () => {
    const { service: materials, store } = service();
    await materials.listArchive('org-a', { q: 'старая статья' });

    const where = searchCall(store).args.where;
    // Граница пространства стоит рядом со словами, а не вместо них: набором
    // слов чужой архив недостижим.
    expect(where.organizationId).toBe('org-a');
    expect(where.archivedAt).toBe(null);
    // И по слову, и по полю: каждое слово обязано встретиться, встретиться
    // может в заголовке или в тексте.
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toEqual([
      { title: { contains: 'старая', mode: 'insensitive' } },
      { body: { contains: 'старая', mode: 'insensitive' } },
    ]);
    expect(where.AND[1].OR[0]).toEqual({
      title: { contains: 'статья', mode: 'insensitive' },
    });
  });

  test('пустой поиск вообще не спрашивает базу — список тот же, что был', async () => {
    const { service: materials, store } = service();
    const answer = await materials.listArchive('org-a', { q: '   ' });

    expect(searchCall(store)).toBeUndefined();
    expect(answer.materials).toHaveLength(3);
  });

  test('слово из заголовка находит свою строку и только её', async () => {
    const { service: materials } = service();
    const answer = await materials.listArchive('org-a', { q: 'колонка' });

    expect(answer.materials.map((row) => row.id)).toEqual(['piece-elsewhere-1']);
    expect(answer.state).toBe('default');
  });

  test('регистр не имеет значения', async () => {
    const { service: materials } = service();
    const answer = await materials.listArchive('org-a', { q: 'КОЛОНКА' });

    expect(answer.materials.map((row) => row.id)).toEqual(['piece-elsewhere-1']);
  });

  test('слово находится и в тексте, не только в заголовке', async () => {
    const { service: materials } = service();
    const answer = await materials.listArchive('org-a', { q: 'фабрикой' });

    expect(answer.materials.map((row) => row.id)).toEqual(['piece-here-1']);
  });

  test('все слова обязаны встретиться, пусть и в разных полях', async () => {
    const { service: materials } = service();

    // «продукта» — в заголовке одной строки, «опубликованный» — в теле той же.
    const both = await materials.listArchive('org-a', {
      q: 'продукта опубликованный',
    });
    expect(both.materials.map((row) => row.id)).toEqual(['piece-elsewhere-1']);

    // Второе слово нет ни у кого — значит, не найдено ничего, а не «нашлось
    // по первому».
    const neither = await materials.listArchive('org-a', {
      q: 'продукта подшипники',
    });
    expect(neither.materials).toHaveLength(0);
  });

  test('ничего не найдено — это filtered-empty, а не пустой архив', async () => {
    const { service: materials } = service();
    const answer = await materials.listArchive('org-a', { q: 'подшипники' });

    expect(answer.materials).toHaveLength(0);
    expect(answer.state).toBe('filtered-empty');
  });

  test('поиск не переставляет коды материалов', async () => {
    // Код — это место текста в общем списке от старых к новым. Если бы поиск
    // сужал сам список, `cnt-03` при запросе стал бы `cnt-01`, то есть код
    // перестал бы быть кодом.
    const { service: materials } = service();
    const all = await materials.listArchive('org-a', {});
    const found = await materials.listArchive('org-a', { q: 'колонка' });

    const codeOf = (answer, id) =>
      answer.materials.find((row) => row.id === id).code;
    expect(codeOf(found, 'piece-elsewhere-1')).toBe(
      codeOf(all, 'piece-elsewhere-1')
    );
    expect(codeOf(found, 'piece-elsewhere-1')).toBe('cnt-03');
  });

  test('поиск складывается с отбором по слою, а не заменяет его', async () => {
    const { service: materials } = service();
    const answer = await materials.listArchive('org-a', {
      q: 'колонка',
      layer: 'IMPORTED_PRE_PRODUCT',
    });

    expect(answer.materials).toHaveLength(0);
  });

  test('длинный запрос режется по словам, а не отказывает', async () => {
    const { service: materials, store } = service();
    await materials.listArchive('org-a', {
      q: 'один два три четыре пять шесть семь восемь девять десять',
    });

    // Предел один и тот же и в DTO, и в поиске; слова сверх него молча
    // отбрасываются — отказ на длинной фразе человек прочитал бы как поломку.
    expect(searchCall(store).args.where.AND).toHaveLength(8);
  });

  test('поиск идёт моделями Prisma, без сырого SQL и расширений Postgres', () => {
    const code = fs.readFileSync(path.join(root, FILES.repository), 'utf8');

    expect(code).not.toMatch(/\$queryRaw|\$executeRaw/);
    expect(code).not.toMatch(/to_tsvector|pg_trgm|websearch_to_tsquery/i);
    expect(code).toMatch(/searchPieceIds/);
  });
});

/* -------------------------------------------------------------------------
 * «Занесение своего прежнего»
 * ---------------------------------------------------------------------- */

describe('bringing in a text writes the same ContentPiece row, tagged', () => {
  test('the created piece carries the chosen layer in tags.archive', async () => {
    const { service: materials, store } = service();
    const result = await materials.importArchiveMaterial('org-a', 'user-a', {
      origin: 'IMPORTED_PRE_PRODUCT',
      title: 'Старая статья',
      body: 'Текст статьи.',
      language: 'ru',
      platform: 'site',
      url: 'https://example.invalid/piece',
      publishedAt: '2018',
      note: 'Найдено в старом блоге',
    });

    expect(result.layer).toBe('IMPORTED_PRE_PRODUCT');

    const created = store.calls.find((call) => call.name === 'contentPiece.create');
    expect(created.args.data.organizationId).toBe('org-a');
    expect(created.args.data.createdByUserId).toBe('user-a');
    expect(created.args.data.brandProfileVersionId).toBeUndefined();
    expect(created.args.data.contentContextSnapshotId).toBeUndefined();
    expect(created.args.data.tags).toEqual({
      archive: {
        origin: 'IMPORTED_PRE_PRODUCT',
        platform: 'site',
        url: 'https://example.invalid/piece',
        publishedAt: '2018',
        note: 'Найдено в старом блоге',
      },
    });

    // The piece written this way is immediately readable back through the
    // same archive list, under the layer it was given.
    const listed = await materials.listArchive('org-a', {
      layer: 'IMPORTED_PRE_PRODUCT',
    });
    expect(listed.materials.map((row) => row.id)).toContain(result.id);
  });

  test('a blank title or body is refused rather than written', async () => {
    const { service: materials, store } = service();
    const error = await failure(() =>
      materials.importArchiveMaterial('org-a', 'user-a', {
        origin: 'PUBLISHED_ELSEWHERE',
        title: '   ',
        body: 'текст',
        language: 'ru',
      })
    );
    expect(error.code).toBe('ARCHIVE_IMPORT_INVALID');
    expect(error.status).toBe(422);
    expect(store.calls.some((call) => call.name === 'contentPiece.create')).toBe(
      false
    );
  });
});

/* -------------------------------------------------------------------------
 * The import route sits on its own controller
 * ---------------------------------------------------------------------- */

describe('the archive import route is mounted on its own controller', () => {
  const controllerModule = loadTypeScriptModule(
    FILES.archiveController,
    {
      '@prisma/client': {},
      '@contentfactory/nestjs-libraries/user/org.from.request': {
        GetOrgFromRequest: () => () => undefined,
      },
      '@contentfactory/nestjs-libraries/user/user.from.request': {
        GetUserFromRequest: () => () => undefined,
      },
      '@contentfactory/backend/services/auth/permissions/permissions.ability': {
        CheckPolicies: () => () => undefined,
      },
      '@contentfactory/backend/services/auth/permissions/permission.exception.class':
        {
          AuthorizationActions: { Create: 'create', Read: 'read' },
          Sections: { POSTS_PER_MONTH: 'posts_per_month' },
        },
      '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-material.dto':
        { ImportArchiveMaterialDto: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service':
        { ContentMaterialService: class {} },
    },
    { resolve: forbidPlatformAndNetworkImports }
  );
  const { ContentArchiveController } = controllerModule;
  const nest = require('@nestjs/common');

  test('POST /content-intelligence/materials/archive/import is mounted', () => {
    const base = Reflect.getMetadata('path', ContentArchiveController);
    const method = Reflect.getMetadata(
      'method',
      ContentArchiveController.prototype.import
    );
    const suffix = Reflect.getMetadata(
      'path',
      ContentArchiveController.prototype.import
    );
    expect(base).toBe('/content-intelligence/materials/archive');
    expect(nest.RequestMethod[method]).toBe('POST');
    expect(suffix).toBe('/import');
  });

  test('the organisation and the actor both reach the service', async () => {
    const calls = [];
    const controller = new ContentArchiveController({
      importArchiveMaterial: async (organizationId, actorUserId, body) => {
        calls.push({ organizationId, actorUserId, body });
        return { id: 'piece-new', layer: body.origin };
      },
    });

    await controller.import(
      { id: 'org-a' },
      { id: 'user-a' },
      { origin: 'IMPORTED_PRE_PRODUCT', title: 't', body: 'b', language: 'ru' }
    );

    expect(calls).toEqual([
      {
        organizationId: 'org-a',
        actorUserId: 'user-a',
        body: { origin: 'IMPORTED_PRE_PRODUCT', title: 't', body: 'b', language: 'ru' },
      },
    ]);
  });

  test('a refusal reaches the caller as its code and status', async () => {
    const controller = new ContentArchiveController({
      importArchiveMaterial: async () => {
        const error = new Error('Нужны заголовок и текст');
        error.code = 'ARCHIVE_IMPORT_INVALID';
        error.status = 422;
        throw error;
      },
    });

    const error = await failure(() =>
      controller.import({ id: 'org-a' }, { id: 'user-a' }, {})
    );
    expect(error).toBeInstanceOf(nest.HttpException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({ code: 'ARCHIVE_IMPORT_INVALID' });
  });
});
