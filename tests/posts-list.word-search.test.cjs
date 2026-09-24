'use strict';

/**
 * Поиск по словам в списке постов (`content-factory-next-odb8.4.1`).
 *
 * Та же форма, что у архива (`content-archive.routes.test.cjs`): разбор
 * запроса — один на весь раздел (`content-intelligence/search-terms.ts`),
 * слова ложатся в `where` рядом с `organizationId`, а не вместо него, и тот
 * же `where` видит счёт страниц. Базы нет: Prisma подменён, проверяется форма
 * `where`, которую получают `findMany` и `count`.
 *
 * С ревью пятнадцатого захода (F3) слова сравниваются с видимым текстом, а не
 * с HTML редактора: запрос `$queryRaw` снимает теги и сущности. Подменённый
 * `$queryRaw` делает то же, что база, теми же выражениями
 * (`POST_VISIBLE_TEXT`) — так проверяется, что именно находят слова.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const REPOSITORY = 'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts';

const { PostsRepository, POST_VISIBLE_TEXT } = loadTypeScriptModule(REPOSITORY, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
    PrismaTransaction: class {},
  },
  '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': { Post: class {} },
  '@prisma/client': {
    APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
    CreationMethod: { WEB: 'WEB' },
    State: { QUEUE: 'QUEUE', DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ERROR: 'ERROR' },
  },
  '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': { GetPostsDto: class {} },
  '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': { GetPostsListDto: class {} },
  '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': { CreateTagDto: class {} },
  '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload': {
    safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }),
  },
});

const { GetPostsListDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/posts/get.posts.list.dto.ts'
);
const { MAX_SEARCH_QUERY_LENGTH, MAX_SEARCH_WORDS } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/search-terms.ts'
);

/** Что делает база: те же три замены и `ILIKE` по каждому слову. */
const visibleText = (html) =>
  html
    .replace(new RegExp(POST_VISIBLE_TEXT.blockTag, 'gi'), ' ')
    .replace(new RegExp(POST_VISIBLE_TEXT.anyTag, 'g'), '')
    .replace(new RegExp(POST_VISIBLE_TEXT.entity, 'g'), ' ');

const STORED = [
  { id: 'kanban', organizationId: 'org-a', content: '<p>Наша <strong>канбан</strong>-доска&nbsp;растёт</p>' },
  { id: 'split', organizationId: 'org-a', content: '<p>Про кан<strong>бан</strong> и сроки</p>' },
  { id: 'plain', organizationId: 'org-a', content: '<p>Strong coffee, p.s. без разметки</p>' },
  { id: 'two-paragraphs', organizationId: 'org-a', content: '<p>один</p><p>два</p>' },
  { id: 'foreign', organizationId: 'org-b', content: '<p>канбан</p>' },
  { id: 'deleted', organizationId: 'org-a', deletedAt: new Date(), content: '<p>канбан</p>' },
];

function repositoryWithSpy() {
  const calls = { findMany: [], count: [], raw: [] };
  const post = {
    findMany: async (args) => (calls.findMany.push(args), []),
    count: async (args) => (calls.count.push(args), 0),
  };
  const $queryRaw = async (strings, ...values) => {
    calls.raw.push({ sql: strings.join('?'), values });
    const [blockTag, anyTag, entity, orgId, words] = values;
    expect([blockTag, anyTag, entity]).toEqual([
      POST_VISIBLE_TEXT.blockTag,
      POST_VISIBLE_TEXT.anyTag,
      POST_VISIBLE_TEXT.entity,
    ]);
    return STORED.filter((row) => row.organizationId === orgId && !row.deletedAt)
      .filter((row) => {
        const text = visibleText(row.content).toLowerCase();
        return words.every((word) => text.includes(word.toLowerCase()));
      })
      .map((row) => ({ id: row.id }));
  };
  const repository = new PostsRepository(
    { model: { post, $queryRaw, contentPiece: { findMany: async () => [] } } },
    {},
    {},
    { model: {} },
    { model: {} },
    {},
    undefined
  );
  return { repository, calls };
}

const list = async (query) => {
  const spy = repositoryWithSpy();
  await spy.repository.getPostsList('org-a', { page: 0, limit: 20, state: 'all', ...query });
  return spy.calls;
};

describe('поиск по словам в списке постов', () => {
  const found = async (q) => {
    const calls = await list({ q });
    return calls.findMany[0].where.AND[1].id.in;
  };

  test('слова лежат внутри AND рядом с organizationId, отбором по id', async () => {
    const calls = await list({ q: 'Канбан, доска' });
    const where = calls.findMany[0].where;
    expect(where.AND[0]).toEqual({ OR: [{ organizationId: 'org-a' }] });
    expect(where.AND.slice(1)).toEqual([{ id: { in: ['kanban'] } }]);
    // Слова ушли параметром, разобранные тем же `searchWords`.
    expect(calls.raw[0].values[4]).toEqual(['Канбан', 'доска']);
    // Граница пространства и у канала: словами чужой пост не достать.
    expect(where.integration.organizationId).toBe('org-a');
    // Счёт страниц видит тот же отбор, иначе число страниц разойдётся со списком.
    expect(calls.count[0].where).toBe(where);
  });

  test('пустой или пробельный запрос ничего не сужает и до базы не доходит', async () => {
    for (const q of [undefined, '', '   ', ',.;']) {
      const calls = await list(q === undefined ? {} : { q });
      expect(calls.findMany[0].where.AND).toEqual([{ OR: [{ organizationId: 'org-a' }] }]);
      expect(calls.raw).toEqual([]);
    }
  });

  test('ищется видимый текст: имена тегов и сущностей не находят ничего (ревью F3)', async () => {
    for (const markup of ['p', 'strong', 'nbsp', 'amp'])
      expect(await found(markup)).not.toContain('kanban');
    // «p» и «strong» есть в видимом тексте одного поста — только он и найден.
    expect(await found('strong')).toEqual(['plain']);
    expect(await found('nbsp')).toEqual([]);
  });

  test('слово, разрезанное тегом, находится; абзацы не слипаются', async () => {
    expect(await found('канбан')).toEqual(['kanban', 'split']);
    expect(await found('доска растёт')).toEqual(['kanban']);
    expect(await found('одиндва')).toEqual([]);
    expect(await found('один два')).toEqual(['two-paragraphs']);
  });

  test('запрос держит границу пространства и удалённые посты у себя, а не только в where', async () => {
    const calls = await list({ q: 'канбан' });
    const { sql, values } = calls.raw[0];
    expect(sql).toMatch(/FROM "Post"\s+WHERE "organizationId" = \?\s+AND "deletedAt" IS NULL/);
    expect(values[3]).toBe('org-a');
    expect(calls.findMany[0].where.AND[1].id.in).not.toContain('foreign');
    expect(calls.findMany[0].where.AND[1].id.in).not.toContain('deleted');
  });

  test('поиск складывается с отбором по состоянию, каналу и этапу', async () => {
    const calls = await list({
      q: 'канбан',
      state: 'draft',
      integrationId: 'tg',
      editorialStage: 'PLAN',
    });
    const where = calls.findMany[0].where;
    expect(where.state).toBe('DRAFT');
    expect(where.integration.id).toBe('tg');
    expect(where.editorialStage).toBe('PLAN');
    expect(where.AND).toHaveLength(2);
  });

  test('длинный запрос режется по словам, а не отказывает', async () => {
    const calls = await list({ q: 'один два три четыре пять шесть семь восемь девять десять' });
    expect(calls.raw[0].values[4]).toHaveLength(MAX_SEARCH_WORDS);
  });

  test('DTO принимает q до предела и отказывает длиннее', () => {
    const ok = plainToInstance(GetPostsListDto, { q: 'канбан доска' });
    expect(validateSync(ok)).toEqual([]);
    const long = plainToInstance(GetPostsListDto, { q: 'а'.repeat(MAX_SEARCH_QUERY_LENGTH + 1) });
    expect(validateSync(long).map((error) => error.property)).toEqual(['q']);
  });

  test('общий разбор слов; сырой SQL только шаблоном с параметрами, без расширений', () => {
    const code = fs.readFileSync(path.join(root, REPOSITORY), 'utf8');
    expect(code).toMatch(/content-intelligence\/search-terms/);
    expect(code).toMatch(/const words = searchWords\(query\.q\);/);
    expect(code).not.toMatch(/\$queryRawUnsafe|\$executeRawUnsafe|Prisma\.raw\(/);
    expect(code).not.toMatch(/to_tsvector|pg_trgm|websearch_to_tsquery/i);
  });
});

describe('поле поиска на экране списка', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const { calendarPlanningCopy } = loadTypeScriptModule(
    'apps/frontend/src/components/launches/calendar-planning.copy.ts'
  );

  test('слова поиска есть в обоих языках, у поля есть «?»', () => {
    for (const locale of ['ru', 'en']) {
      const t = calendarPlanningCopy[locale];
      for (const key of ['listSearch', 'listSearchPlaceholder', 'listSearchHintLabel', 'listSearchHint'])
        expect(typeof t[key]).toBe('string');
      expect(t.listSearchEmpty('канбан')).toContain('канбан');
    }
    expect(calendarPlanningCopy.ru.listSearch).not.toBe(calendarPlanningCopy.en.listSearch);
    const filters = read('apps/frontend/src/components/launches/filters.tsx');
    expect(filters).toMatch(/aria-label=\{copy\.listSearch\}/);
    expect(filters).toMatch(/<Hint label=\{copy\.listSearchHintLabel\}>\{copy\.listSearchHint\}<\/Hint>/);
  });

  test('запрос уходит в q после паузы и начинает с первой страницы; пустой не уходит', () => {
    const context = read('apps/frontend/src/components/launches/calendar.context.tsx');
    expect(context).toMatch(/\.\.\.\(listSearched \? \{ q: listSearched \} : \{\}\)/);
    expect(context).toMatch(/setListSearched\(next\);\s*setListPage\(0\);/);
  });
});
