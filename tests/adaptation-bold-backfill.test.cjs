'use strict';

/**
 * Разовая перерисовка черновиков, написанных до волны выделения.
 *
 * `content-factory-next-97dq.2`, разбор корректности P1-5: тело адаптации
 * всегда хранило `**жирный**`, но в пост его переводят только с этой волны.
 * После выкладки страница показывает такой черновик жирным, а очередь канала
 * всё ещё несёт звёздочки — человек теряет единственное место, где поломка
 * была видна.
 *
 * Здесь судится ровно то, чем разовая команда отличается от «обнови всё»:
 * ничего не пишется без `--apply`, правленый руками пост не трогается,
 * вышедший не читается вовсе, область называется в каждом запросе, а второй
 * прогон не находит работы.
 */

require('reflect-metadata');

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const { RerenderAdaptationBold, preBoldEditorHtml } = loadWithMocks(
  'apps/commands/src/tasks/rerender.adaptation.bold.ts',
  {
    'nestjs-command': {
      Command: () => () => undefined,
      Option: () => () => undefined,
    },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
  }
);

const { editorHtml } = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brief/editor-html.ts'
);

const BODY = 'Срок держится, когда **о нём знает клиент**.';
const EDITORS = { telegram: 'html', discord: 'markdown', x: 'normal' };

/**
 * Поддельная база: две области, свои строки у каждой, и учёт того, о чём
 * спрашивали. Пост обновляется только по `updateMany` с названной областью —
 * так набор видит границу так же, как её видит Prisma.
 */
const stand = (rows, extra = {}) => {
  const posts = new Map(
    rows.map((row) => [row.post.id, { ...row.post, state: row.state ?? 'DRAFT' }])
  );
  const queries = [];
  const updates = [];
  const client = {
    organization: {
      findMany: async () =>
        extra.organizations ?? [{ id: 'org-a' }, { id: 'org-b' }],
    },
    contentDerivation: {
      findMany: async (args) => {
        queries.push(args);
        return rows
          .filter(
            (row) =>
              row.organizationId === args.where.organizationId &&
              (posts.get(row.post.id).state ?? 'DRAFT') === 'DRAFT' &&
              !posts.get(row.post.id).deletedAt
          )
          .map((row) => ({
            id: row.id,
            body: row.body,
            updatedAt: row.updatedAt,
            post: {
              id: row.post.id,
              content: posts.get(row.post.id).content,
              integration: { providerIdentifier: row.post.provider },
            },
          }));
      },
    },
    post: {
      updateMany: async (args) => {
        updates.push(args);
        await extra.beforeUpdate?.(posts, rows);
        const post = posts.get(args.where.id);
        const row = rowOf(rows, args.where.id);
        if (
          !post ||
          args.where.organizationId !== row.organizationId ||
          post.state !== args.where.state ||
          (post.deletedAt ?? null) !== args.where.deletedAt ||
          (Object.hasOwn(args.where, 'content') && post.content !== args.where.content)
        )
          return { count: 0 };
        const derivation = args.where.contentDerivations?.some;
        if (derivation && (
          row.id !== derivation.id ||
          row.organizationId !== derivation.organizationId ||
          row.body !== derivation.body ||
          row.updatedAt.getTime() !== derivation.updatedAt.getTime()
        )) return { count: 0 };
        post.content = args.data.content;
        return { count: 1 };
      },
    },
  };
  const task = new RerenderAdaptationBold(
    { model: client },
    { getSocialIntegration: (identifier) => ({ editor: EDITORS[identifier] }) }
  );
  task._logger = { log: () => undefined };
  return { task, posts, queries, updates };
};

const rowOf = (rows, postId) => rows.find((row) => row.post.id === postId);

const draft = (overrides = {}) => ({
  id: 'adaptation-1',
  organizationId: 'org-a',
  body: BODY,
  updatedAt: new Date('2000-01-01T00:00:00Z'),
  post: {
    id: 'post-1',
    provider: 'telegram',
    content: preBoldEditorHtml(BODY, 'html'),
    ...(overrides.post || {}),
  },
  ...overrides,
});

describe('перерисовка идёт только по машинным черновикам', () => {
  test('без --apply не пишется ничего, а счёт называется', async () => {
    const rows = [draft()];
    const { task, posts, updates } = stand(rows);

    const result = await task.rerender(false, false);

    expect(result).toEqual({
      seen: 1,
      planned: 1,
      rewritten: 0,
      skipped: 0,
    });
    expect(updates).toEqual([]);
    expect(posts.get('post-1').content).toBe(preBoldEditorHtml(BODY, 'html'));
  });

  test('с --apply пост становится разметкой канала', async () => {
    const rows = [draft()];
    const { task, posts } = stand(rows);

    const result = await task.rerender(true, false);

    expect(result.rewritten).toBe(1);
    expect(posts.get('post-1').content).toBe(editorHtml(BODY, 'html'));
    expect(posts.get('post-1').content).toContain('<strong>');
  });

  test('второй прогон работы не находит', async () => {
    const rows = [draft()];
    const { task } = stand(rows);

    await task.rerender(true, false);
    const second = await task.rerender(true, false);

    expect(second).toEqual({ seen: 1, planned: 0, rewritten: 0, skipped: 1 });
  });

  test('правленый руками пост остаётся как есть', async () => {
    const rows = [
      draft({
        post: {
          id: 'post-1',
          provider: 'telegram',
          content: '<p>Свой текст, набранный руками</p>',
        },
      }),
    ];
    const { task, posts, updates } = stand(rows);

    const result = await task.rerender(true, false);

    expect(result).toEqual({ seen: 1, planned: 0, rewritten: 0, skipped: 1 });
    expect(updates).toEqual([]);
    expect(posts.get('post-1').content).toBe(
      '<p>Свой текст, набранный руками</p>'
    );
  });

  test.each([
    ['текст поста', (posts) => {
      posts.get('post-1').content = '<p>Новая ручная правка</p>';
    }],
    ['тело адаптации', (_posts, rows) => {
      rows[0].body = 'Новая **ручная** адаптация.';
    }],
    ['версия адаптации', (_posts, rows) => {
      rows[0].updatedAt = new Date('2000-01-02T00:00:00Z');
    }],
    ['исходные пробелы тела', (_posts, rows) => {
      rows[0].body = ` ${BODY} `;
    }],
    ['переход из черновика', (posts) => {
      posts.get('post-1').state = 'QUEUE';
    }],
    ['удаление поста', (posts) => {
      posts.get('post-1').deletedAt = new Date('2000-01-02T00:00:00Z');
    }],
  ])('%s, изменённый после чтения, сохраняется и считается пропущенным', async (_name, edit) => {
    const rows = [draft()];
    let edited;
    const { task, posts } = stand(rows, { beforeUpdate: (currentPosts, currentRows) => {
      edit(currentPosts, currentRows);
      edited = { post: { ...currentPosts.get('post-1') }, row: { ...currentRows[0] } };
    } });

    expect(await task.rerender(true, false)).toEqual({
      seen: 1, planned: 1, rewritten: 0, skipped: 1,
    });
    expect(posts.get('post-1')).toEqual(edited.post);
    expect(rows[0]).toEqual(edited.row);
  });

  test('неизменённое тело с исходными пробелами обновляется один раз', async () => {
    const rows = [draft({ body: ` ${BODY} ` })];
    const { task, posts } = stand(rows);

    expect(await task.rerender(true, false)).toEqual({
      seen: 1, planned: 1, rewritten: 1, skipped: 0,
    });
    expect(posts.get('post-1').content).toBe(editorHtml(BODY, 'html'));
    expect((await task.rerender(true, false)).rewritten).toBe(0);
  });

  test('не черновик не читается вовсе', async () => {
    const rows = [draft({ state: 'QUEUED' })];
    const { task, updates } = stand(rows);

    const result = await task.rerender(true, false);

    expect(result).toEqual({ seen: 0, planned: 0, rewritten: 0, skipped: 0 });
    expect(updates).toEqual([]);
  });

  test('тело без закрытой пары перерисовывать нечем', async () => {
    const body = 'Осталась **одна звёздочка в тексте.';
    const rows = [
      draft({
        body,
        post: {
          id: 'post-1',
          provider: 'telegram',
          content: preBoldEditorHtml(body, 'html'),
        },
      }),
    ];
    const { task, updates } = stand(rows);

    expect(await task.rerender(true, false)).toEqual({
      seen: 0,
      planned: 0,
      rewritten: 0,
      skipped: 0,
    });
    expect(updates).toEqual([]);
  });

  test('--dry-run сильнее --apply', async () => {
    const rows = [draft()];
    const { task, updates } = stand(rows);

    const result = await task.rerender(true, true);

    expect(result.rewritten).toBe(0);
    expect(result.planned).toBe(1);
    expect(updates).toEqual([]);
  });
});

describe('область называется в каждом запросе', () => {
  test('обход идёт по областям, и чужие строки не читаются', async () => {
    const rows = [
      draft(),
      draft({
        id: 'adaptation-2',
        organizationId: 'org-b',
        post: {
          id: 'post-2',
          provider: 'discord',
          content: preBoldEditorHtml(BODY, 'markdown'),
        },
      }),
    ];
    const { task, queries, updates, posts } = stand(rows);

    await task.rerender(true, false);

    expect(queries.map((query) => query.where.organizationId)).toEqual([
      'org-a',
      'org-b',
    ]);
    // Область названа и во вложенном условии поста, и в самом обновлении.
    for (const query of queries) {
      expect(query.where.post.is.organizationId).toBe(
        query.where.organizationId
      );
      expect(query.where.post.is.state).toBe('DRAFT');
    }
    for (const update of updates) {
      expect(update.where.organizationId).toBeDefined();
      expect(update.where.state).toBe('DRAFT');
    }
    // У markdown-канала пара остаётся собой, поэтому переписывать нечего.
    expect(posts.get('post-2').content).toBe(
      preBoldEditorHtml(BODY, 'markdown')
    );
  });

  test('канал без известного провайдера пропускается, а не гадается', async () => {
    const rows = [
      draft({
        post: { id: 'post-1', provider: 'unknown', content: '<p>Что-то</p>' },
      }),
    ];
    const { task, updates } = stand(rows);

    expect((await task.rerender(true, false)).skipped).toBe(1);
    expect(updates).toEqual([]);
  });
});
