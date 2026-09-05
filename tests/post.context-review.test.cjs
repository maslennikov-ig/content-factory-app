'use strict';

/**
 * `content-factory-next-fn33.28.1`: черновик с подтверждениями открывается
 * явным решением человека.
 *
 * До 04.09.2026 пост, собранный из проверенного контекста, отвечал
 * `CONTENT_CONTEXT_DRAFT_ONLY` на планирование и публикацию навсегда
 * (`content-factory-next-fn33.27`). Граница осталась, но у неё появилась
 * дверь: `POST /posts/:id/context-review` ставит на пост отметку «человек
 * проверил подтверждения», и после неё план и публикация разрешены.
 *
 * Здесь проверяется ровно это правило и сама дверь. Настоящая проверка
 * контекста (цитаты, профиль, свежесть) живёт в `post.content-context.test.cjs`
 * и работает против настоящей базы; тут она подменена, потому что предмет
 * этого набора — решение «черновик или можно в план», а не валидация.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const CONTEXT_ID = 'context-1';

const loadRepository = () =>
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    {
      '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
        PrismaRepository: class {},
        PrismaTransaction: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': {
        Post: class {},
      },
      '@prisma/client': {
        APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
        CreationMethod: { WEB: 'WEB' },
        State: {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
        GetPostsDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
        GetPostsListDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
        CreateTagDto: class {},
      },
      '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload':
        { safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }) },
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize':
        {
          // Отвечает тем снимком, который прислали: правило «отметка привязана
          // к снимку» иначе не проверить.
          validateContentContextForDraft: async (_client, input) => ({
            contentContextSnapshotId: input.contentContextSnapshotId,
            brandProfileVersionId: null,
            usedCitationIds: [],
          }),
          writeContentContextDraftProvenance: async () => undefined,
        },
    }
  ).PostsRepository;

const PostsRepository = loadRepository();

/** Хранилище на нескольких постах: столько, сколько читает проверяемое правило. */
const makeStore = (rows) => {
  const calls = { upsert: [], updateMany: [] };
  const matches = (row, where) => {
    if (typeof where.id === 'string' && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.organizationId && row.organizationId !== where.organizationId)
      return false;
    if (where.group && row.group !== where.group) return false;
    if (where.deletedAt === null && row.deletedAt) return false;
    if (where.parentPostId === null && row.parentPostId) return false;
    // `content-factory-next-fn33.28.6`: обе новые ветки спрашивают базу об
    // отметке прямо в `where` — идемпотентность двери и подтверждение,
    // найденное по связке. Без этих двух условий подмена базы отвечала бы
    // «подходит» на любую строку и правило осталось бы непроверенным.
    if (where.contentContextReviewedAt === null && row.contentContextReviewedAt)
      return false;
    if (
      where.contentContextReviewedAt?.not === null &&
      !row.contentContextReviewedAt
    )
      return false;
    if (
      typeof where.contentContextSnapshotId === 'string' &&
      row.contentContextSnapshotId !== where.contentContextSnapshotId
    )
      return false;
    return true;
  };
  const post = {
    findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
    findFirst: async ({ where }) =>
      rows.find((row) => matches(row, where)) || null,
    upsert: async (args) => {
      calls.upsert.push(args);
      const id = args.where.organizationId_id.id;
      const found = rows.find((row) => row.id === id);
      if (found) return { ...found, id };
      const created = {
        id,
        organizationId: args.where.organizationId_id.organizationId,
        deletedAt: null,
      };
      rows.push(created);
      return created;
    },
    updateMany: async (args) => {
      calls.updateMany.push(args);
      let count = 0;
      for (const row of rows) {
        if (!matches(row, args.where)) continue;
        Object.assign(row, args.data);
        count += 1;
      }
      return { count };
    },
    update: async () => ({}),
  };
  const client = {
    post,
    tags: { findMany: async () => [] },
    tagsPosts: { deleteMany: async () => ({ count: 0 }) },
    contentOutputContext: { deleteMany: async () => ({ count: 0 }) },
    draftEvidence: { deleteMany: async () => ({ count: 0 }) },
  };
  const repository = new PostsRepository(
    { model: { post } },
    { model: {} },
    { model: {} },
    { model: { tags: client.tags } },
    { model: { tagsPosts: client.tagsPosts } },
    { model: {} },
    { model: { $transaction: async (callback) => callback(client) } }
  );
  return { repository, rows, calls };
};

const draftRow = (over = {}) => ({
  id: 'post-1',
  organizationId: 'org-a',
  group: 'group-1',
  deletedAt: null,
  parentPostId: null,
  state: 'DRAFT',
  contentContextSnapshotId: CONTEXT_ID,
  contentContextReviewedAt: null,
  contentContextReviewedById: null,
  ...over,
});

const body = (over = {}) => ({
  integration: { id: 'channel-a' },
  settings: {},
  contentContextSnapshotId: CONTEXT_ID,
  value: [{ id: 'post-1', content: 'Черновик', delay: 0, image: [] }],
  ...over,
});

const save = (repository, state, postBody) =>
  repository.createOrUpdatePost(
    state,
    'org-a',
    '2026-09-10T10:00:00.000Z',
    postBody,
    [],
    'WEB'
  );

const refusal = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return { code: error.code, status: error.status, message: error.message };
  }
  throw new Error('the call was expected to be refused');
};

describe('a post with checked context waits for a human decision', () => {
  test('scheduling an unconfirmed post is refused with 409 and its code', async () => {
    const { repository } = makeStore([draftRow()]);

    expect(await refusal(save(repository, 'schedule', body()))).toEqual({
      code: 'CONTENT_CONTEXT_DRAFT_ONLY',
      status: 409,
      message: expect.stringContaining('draft'),
    });
  });

  test('the refusal text names no error code', async () => {
    const { repository } = makeStore([draftRow()]);
    const { message } = await refusal(save(repository, 'schedule', body()));

    expect(message).not.toMatch(/CONTENT_CONTEXT|_ONLY|409/);
  });

  test('a draft is still saved as a draft without any confirmation', async () => {
    const { repository, calls } = makeStore([draftRow()]);
    await save(repository, 'draft', body());

    expect(calls.upsert[0].update.state).toBe('DRAFT');
  });

  test('once confirmed, the same post may be scheduled', async () => {
    const { repository, calls } = makeStore([
      draftRow({ contentContextReviewedAt: new Date('2026-09-04T18:00:00Z') }),
    ]);
    await save(repository, 'schedule', body());

    expect(calls.upsert[0].update.state).toBe('QUEUE');
  });

  test('a confirmed post can still be edited after it left the draft state', async () => {
    const { repository, calls } = makeStore([
      draftRow({
        state: 'QUEUE',
        contentContextReviewedAt: new Date('2026-09-04T18:00:00Z'),
      }),
    ]);
    await save(repository, 'update', body());

    expect(calls.upsert).toHaveLength(1);
  });

  test('editing the text after the confirmation does not clear it', async () => {
    const reviewedAt = new Date('2026-09-04T18:00:00Z');
    const { repository, rows } = makeStore([
      draftRow({ contentContextReviewedAt: reviewedAt }),
    ]);
    await save(
      repository,
      'update',
      body({
        value: [{ id: 'post-1', content: 'Другой текст', delay: 0, image: [] }],
      })
    );

    expect(rows[0].contentContextReviewedAt).toBe(reviewedAt);
  });

  test('a confirmation is tied to its snapshot: a swapped snapshot is refused to schedule', async () => {
    const { repository, calls } = makeStore([
      draftRow({ contentContextReviewedAt: new Date('2026-09-04T18:00:00Z') }),
    ]);
    const refused = await refusal(
      save(
        repository,
        'schedule',
        body({ contentContextSnapshotId: 'context-other' })
      )
    );

    expect(refused.status).toBe(409);
    expect(refused.code).toBe('CONTENT_CONTEXT_DRAFT_ONLY');
    expect(calls.upsert).toHaveLength(0);
  });

  test('saving a draft with a swapped snapshot clears the old confirmation', async () => {
    const { repository, rows } = makeStore([
      draftRow({
        contentContextReviewedAt: new Date('2026-09-04T18:00:00Z'),
        contentContextReviewedById: 'user-1',
      }),
    ]);
    await save(
      repository,
      'update',
      body({ contentContextSnapshotId: 'context-other' })
    );

    expect(rows[0].contentContextReviewedAt).toBeNull();
    expect(rows[0].contentContextReviewedById).toBeNull();
  });

  test('a brand new post with context cannot be scheduled at once', async () => {
    const { repository } = makeStore([]);

    expect(
      await refusal(
        save(
          repository,
          'now',
          body({ value: [{ content: 'Новый', delay: 0, image: [] }] })
        )
      )
    ).toMatchObject({ code: 'CONTENT_CONTEXT_DRAFT_ONLY', status: 409 });
  });

  test('an id nobody confirmed yet is refused even when the client mints it', async () => {
    const { repository } = makeStore([]);

    expect(await refusal(save(repository, 'schedule', body()))).toMatchObject({
      code: 'CONTENT_CONTEXT_DRAFT_ONLY',
      status: 409,
    });
  });

  test("another workspace's post answers 404, confirmed or not", async () => {
    const { repository } = makeStore([
      draftRow({
        organizationId: 'org-b',
        contentContextReviewedAt: new Date('2026-09-04T18:00:00Z'),
      }),
    ]);

    expect(await refusal(save(repository, 'schedule', body()))).toMatchObject({
      code: 'POST_NOT_FOUND',
      status: 404,
    });
  });
});

describe('the confirmation itself', () => {
  test('it stamps the whole thread of the post and answers with the date', async () => {
    const { repository, rows } = makeStore([
      draftRow(),
      draftRow({ id: 'post-2', parentPostId: 'post-1' }),
    ]);
    const answer = await repository.markContentContextReviewed(
      'org-a',
      'post-1',
      'user-1'
    );

    expect(answer.contentContextReviewedById).toBe('user-1');
    expect(rows[1].contentContextReviewedAt).toBe(
      answer.contentContextReviewedAt
    );
  });

  test('a second call changes nothing and answers the first date', async () => {
    const { repository, calls } = makeStore([draftRow()]);
    const first = await repository.markContentContextReviewed(
      'org-a',
      'post-1',
      'user-1'
    );
    const second = await repository.markContentContextReviewed(
      'org-a',
      'post-1',
      'user-2'
    );

    expect(second).toEqual(first);
    expect(calls.updateMany).toHaveLength(1);
  });

  test("another workspace's post answers 404 and is not stamped", async () => {
    const { repository, rows } = makeStore([
      draftRow({ organizationId: 'org-b' }),
    ]);

    expect(
      await refusal(
        repository.markContentContextReviewed('org-a', 'post-1', 'user-1')
      )
    ).toMatchObject({ code: 'POST_NOT_FOUND', status: 404 });
    expect(rows[0].contentContextReviewedAt).toBeNull();
  });

  test('a post without checked context has nothing to confirm', async () => {
    const { repository } = makeStore([
      draftRow({ contentContextSnapshotId: null }),
    ]);

    expect(
      await refusal(
        repository.markContentContextReviewed('org-a', 'post-1', 'user-1')
      )
    ).toMatchObject({ status: 409 });
  });
});

/**
 * Сама дверь: путь, по которому её зовёт окно поста, и отказ, который доходит
 * до человека своим кодом, а не «Internal server error».
 */
describe('the door the window presses', () => {
  const ts = require('typescript');
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'apps/backend/src/api/routes/posts.controller.ts'),
    'utf8'
  );

  test('it is a POST on /:id/context-review', () => {
    const file = ts.createSourceFile(
      'posts.controller.ts',
      source,
      ts.ScriptTarget.Latest,
      true
    );
    const routes = [];
    file.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        for (const decorator of ts.getDecorators(member) || []) {
          const call = decorator.expression;
          if (!ts.isCallExpression(call)) continue;
          const name = call.expression.getText();
          if (!['Get', 'Post', 'Put', 'Delete'].includes(name)) continue;
          const argument = call.arguments[0];
          routes.push(
            `${name.toUpperCase()} ${
              argument && ts.isStringLiteralLike(argument) ? argument.text : ''
            }`
          );
        }
      }
    });

    expect(routes).toContain('POST /:id/context-review');
  });

  test('the refusal reaches the client with its own status', async () => {
    const controllerModule = loadTypeScriptModule(
      'apps/backend/src/api/routes/posts.controller.ts',
      {
        '@prisma/client': {},
        express: {},
        '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
          PostsService: class {},
        },
        '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
          AgentGraphService: class {},
        },
        '@contentfactory/nestjs-libraries/short-linking/short.link.service': {
          ShortLinkService: class {},
        },
        '@contentfactory/nestjs-libraries/user/org.from.request': {
          GetOrgFromRequest: () => () => undefined,
        },
        '@contentfactory/nestjs-libraries/user/user.from.request': {
          GetUserFromRequest: () => () => undefined,
        },
        '@contentfactory/backend/services/auth/permissions/permissions.ability':
          { CheckPolicies: () => () => undefined },
        '@contentfactory/backend/services/auth/permissions/permission.exception.class':
          {
            AuthorizationActions: { Create: 'create', Read: 'read' },
            Sections: { POSTS_PER_MONTH: 'posts_per_month' },
          },
        '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
          GetPostsDto: class {},
        },
        '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
          GetPostsListDto: class {},
        },
        '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
          CreateTagDto: class {},
        },
        '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
          GeneratorDto: class {},
        },
        '@contentfactory/nestjs-libraries/dtos/generator/create.generated.posts.dto':
          { CreateGeneratedPostsDto: class {} },
        '@contentfactory/backend/api/routes/posts.validation.exception': {
          PostValidationException: class extends Error {},
        },
      }
    );
    const controller = new controllerModule.PostsController(
      {
        markContentContextReviewed: async () => {
          throw Object.assign(new Error('Post was not found'), {
            code: 'POST_NOT_FOUND',
            status: 404,
          });
        },
      },
      {},
      {}
    );

    const thrown = await controller
      .markContentContextReviewed({ id: 'org-a' }, { id: 'user-1' }, 'post-1')
      .then(() => null)
      .catch((error) => error);

    expect(thrown.getStatus()).toBe(404);
    expect(thrown.getResponse()).toEqual({
      code: 'POST_NOT_FOUND',
      message: 'Post was not found',
    });
  });
});

/**
 * Контракт с окном поста: состояние проверки видно там, где окно берёт пост,
 * а ответ двери — строка ISO, а не объект даты.
 */
describe('the post the window opens carries the confirmation state', () => {
  const decorator = () => () => undefined;
  /**
   * `posts.service.ts` тянет за собой половину бэкенда — хранилище, Temporal,
   * менеджер интеграций. Ни к одному из них у проверяемых двух методов дела
   * нет, поэтому всё, кроме `dayjs` и `lodash`, подменено одной заглушкой,
   * которая отвечает собой на любое обращение и любой вызов.
   */
  const passthrough = new Proxy(function stub() {}, {
    get: (_target, name) => (name === '__esModule' ? false : passthrough),
    apply: () => passthrough,
    construct: () => ({}),
  });

  const loadService = () =>
    loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/posts/posts.service.ts',
      {
        '@nestjs/common': {
          Injectable: decorator,
          Inject: decorator,
          Optional: decorator,
          BadRequestException: class extends Error {},
          ValidationPipe: class {
            transform = async (value) => value;
          },
        },
      },
      {
        /**
         * `resolve` смотрит запрос раньше подстановок, поэтому `@nestjs/common`
         * он пропускает: класс с декоратором, который вернул заглушку, сам
         * становится заглушкой, и проверять было бы нечего.
         */
        resolve: (request) =>
          [
            'dayjs',
            'dayjs/plugin/utc',
            'lodash',
            '@nestjs/common',
          ].includes(request)
            ? undefined
            : passthrough,
      }
    ).PostsService;

  test('getPost answers with the confirmation date and who decided', async () => {
    const PostsService = loadService();
    const service = new PostsService();
    const reviewedAt = new Date('2026-09-04T18:00:00Z');
    service._postRepository = {
      getPost: async () => ({
        id: 'post-1',
        group: 'group-1',
        integrationId: 'channel-a',
        settings: '{}',
        image: '[]',
        childrenPost: [],
        contentContextReviewedAt: reviewedAt,
        contentContextReviewedById: 'user-1',
      }),
    };
    service.updateMedia = async () => [];

    const answer = await service.getPost('org-a', 'post-1');

    expect({
      at: answer.contentContextReviewedAt,
      by: answer.contentContextReviewedById,
      inRow: answer.posts[0].contentContextReviewedAt,
    }).toEqual({ at: reviewedAt, by: 'user-1', inRow: reviewedAt });
  });

  test('the door answers with an ISO string, as the window expects', async () => {
    const PostsService = loadService();
    const service = new PostsService();
    service._postRepository = {
      markContentContextReviewed: async () => ({
        contentContextReviewedAt: new Date('2026-09-04T18:00:00Z'),
        contentContextReviewedById: 'user-1',
      }),
    };

    expect(
      await service.markContentContextReviewed('org-a', 'post-1', 'user-1')
    ).toEqual({
      contentContextReviewedAt: '2026-09-04T18:00:00.000Z',
      contentContextReviewedById: 'user-1',
    });
  });
});

/**
 * Находки рецензии волны 04.09 (`content-factory-next-fn33.28.6`).
 *
 * Обе — про одно и то же место: ответ, который зависит от данных, раньше
 * считался по чтению до записи или по форме тела запроса. Здесь проверяется,
 * что его считает база.
 */
describe('the confirmation is decided by the rows, not by a read before the write', () => {
  test('two simultaneous confirmations answer with one and the same date', async () => {
    const { repository, rows, calls } = makeStore([draftRow()]);

    // Оба вызова стартуют до того, как любой из них успел записать: ровно тот
    // случай, в котором прежняя пара «findFirst, затем updateMany» отвечала
    // двумя разными датами и двигала след первого решения.
    const [first, second] = await Promise.all([
      repository.markContentContextReviewed('org-a', 'post-1', 'user-1'),
      repository.markContentContextReviewed('org-a', 'post-1', 'user-2'),
    ]);

    expect(second.contentContextReviewedAt).toEqual(
      first.contentContextReviewedAt
    );
    expect(second.contentContextReviewedById).toBe(
      first.contentContextReviewedById
    );
    // И в строке стоит то же самое, что услышали оба.
    expect(rows[0].contentContextReviewedById).toBe(
      first.contentContextReviewedById
    );
    // Каждая запись отметки несёт условие «отметки ещё нет»: решает его база,
    // а не чтение до записи.
    const stamping = calls.updateMany.filter(
      (call) => call.data && call.data.contentContextReviewedAt
    );
    expect(stamping.length).toBeGreaterThan(0);
    expect(
      stamping.every((call) => call.where.contentContextReviewedAt === null)
    ).toBe(true);
  });

  test('the caller who lost the race is told the winner date, not its own', async () => {
    // Проверка выше ловит согласие двух ответов, но в подменённой базе оба
    // вызова успевают разойтись по времени. Здесь гонка воспроизведена точно:
    // строку помечает кто-то третий ровно между чтением и записью, то есть в
    // тот единственный зазор, из-за которого правило и переписано.
    const { repository, rows, calls } = makeStore([draftRow()]);
    const winnerAt = new Date('2026-09-04T18:00:00.000Z');
    const readOnce = repository._post.model.post.findFirst;
    let raced = false;
    repository._post.model.post.findFirst = async (args) => {
      const answer = await readOnce(args);
      // Копия, а не живая строка: чтение вернуло состояние «отметки нет», и
      // именно с этим состоянием на руках вызывающий идёт писать. Настоящая
      // база тоже отдаёт снимок, а не ссылку на строку.
      const seen = answer && { ...answer };
      if (!raced) {
        raced = true;
        rows[0].contentContextReviewedAt = winnerAt;
        rows[0].contentContextReviewedById = 'user-first';
      }
      return seen;
    };

    const answer = await repository.markContentContextReviewed(
      'org-a',
      'post-1',
      'user-second'
    );

    expect(answer.contentContextReviewedAt).toEqual(winnerAt);
    expect(answer.contentContextReviewedById).toBe('user-first');
    // И строка осталась за первым: опоздавшая запись не задела её.
    expect(rows[0].contentContextReviewedById).toBe('user-first');
    expect(
      calls.updateMany
        .filter((call) => call.data && call.data.contentContextReviewedAt)
        .every((call) => call.where.contentContextReviewedAt === null)
    ).toBe(true);
  });

  test('a post whose saved boxes were all deleted keeps its confirmation', async () => {
    // Человек подтвердил подтверждения, затем удалил все сохранённые коробки и
    // написал текст заново: у тела не осталось ни одного `item.id`, но связка
    // поста прежняя и отметка стоит на ней.
    const { repository, calls } = makeStore([
      draftRow({ contentContextReviewedAt: new Date('2026-09-04T18:00:00Z') }),
    ]);

    await save(
      repository,
      'schedule',
      body({
        group: 'group-1',
        value: [{ content: 'Написано заново', delay: 0, image: [] }],
      })
    );

    expect(calls.upsert[0].update.state).toBe('QUEUE');
  });

  test('a brand new post with a group of its own is still refused', async () => {
    // Окно чеканит связку и новому посту тоже, поэтому наличие `group` само по
    // себе ничего не разрешает: подтверждения в этой связке нет.
    const { repository } = makeStore([]);

    expect(
      await refusal(
        save(
          repository,
          'schedule',
          body({
            group: 'group-new',
            value: [{ content: 'Совсем новый', delay: 0, image: [] }],
          })
        )
      )
    ).toMatchObject({ code: 'CONTENT_CONTEXT_DRAFT_ONLY', status: 409 });
  });

  test('a confirmation given under another snapshot does not travel by group', async () => {
    const { repository } = makeStore([
      draftRow({
        contentContextReviewedAt: new Date('2026-09-04T18:00:00Z'),
        contentContextSnapshotId: 'context-other',
      }),
    ]);

    expect(
      await refusal(
        save(
          repository,
          'schedule',
          body({
            group: 'group-1',
            value: [{ content: 'Подменённый контекст', delay: 0, image: [] }],
          })
        )
      )
    ).toMatchObject({ code: 'CONTENT_CONTEXT_DRAFT_ONLY', status: 409 });
  });
});
