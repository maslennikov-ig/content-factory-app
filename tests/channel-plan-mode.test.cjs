'use strict';

/**
 * Режим плана канала: «Без плана» / «Бронь» / «Автопилот»
 * (`content-factory-next-97dq.57`, решение владельца 23.09.2026), без единого
 * платного вызова и без календаря — только правила и стенд в памяти.
 *
 * Что здесь держится (инварианты технического премортема):
 *
 *  - I1 у заготовки в канале один держатель слота: новая версия забирает время
 *    прежней, черновики прежних версий из календаря, «Что публикуем» и поиска
 *    свободного времени уходят, строки не удаляются;
 *  - I2 режим по умолчанию — «Бронь», в том числе для `NULL` и мусора;
 *  - I3 автопилот ставит в очередь через ту же проверку площадки, что
 *    «Запланировать»; отказ оставляет бронь с причиной;
 *  - I4 очередь автопилота сменяется, только пока до выхода больше двух минут;
 *  - I5 версия в очереди автопилота помечена `plan = 'autopilot'`;
 *  - свободное время ищется по времени САМОГО канала.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const plan = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-plan.ts'
);

const { PieceService } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
  {
    '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
      AgentGraphService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      WEB_SEARCH_MAX_SOURCE_CHARS: 8_000,
      getChatModel: () => {
        throw new Error('no model call belongs in this suite');
      },
    },
    './piece.repository': { PieceRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  }
);

const { PieceRepository } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.repository.ts',
  {
    '../materials/content-material.repository': { ContentMaterialRepository: class {} },
    '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  }
);

const NOW = new Date('2026-09-22T12:00:00.000Z');
const MIN = 60_000;

/* -------------------------------------------------------------------------
 * Правила
 * ---------------------------------------------------------------------- */

describe('режим канала: умолчание «Бронь» (I2)', () => {
  test.each([null, undefined, '', 'queue', 42])('%p читается как reserve', (value) => {
    expect(plan.planModeOf(value)).toBe('reserve');
  });
  test.each(['draft', 'reserve', 'autopilot'])('%s остаётся собой', (value) => {
    expect(plan.planModeOf(value)).toBe(value);
  });
});

describe('окно смены очереди (I4)', () => {
  const at = (ms) => new Date(NOW.getTime() + ms);
  test('в очереди и дальше двух минут — можно', () => {
    expect(plan.canReplaceQueued({ state: 'QUEUE', publishDate: at(2 * MIN + 1) }, NOW)).toBe(true);
  });
  test.each([
    ['ровно две минуты', { state: 'QUEUE', publishDate: at(2 * MIN) }],
    ['через минуту', { state: 'QUEUE', publishDate: at(MIN) }],
    ['уже вышло', { state: 'PUBLISHED', publishDate: at(60 * MIN) }],
    ['черновик', { state: 'DRAFT', publishDate: at(60 * MIN) }],
    ['удалён', { state: 'QUEUE', publishDate: at(60 * MIN), deletedAt: NOW }],
  ])('%s — нельзя', (_name, post) => {
    expect(plan.canReplaceQueued(post, NOW)).toBe(false);
  });
});

describe('держатель слота (I1)', () => {
  const variant = (id, overrides = {}) => ({
    id,
    pieceId: 'piece-1',
    integrationId: 'int-tg',
    createdAt: new Date(`2026-09-2${id.slice(-1)}T09:00:00.000Z`),
    plannedAt: null,
    postId: `post-${id}`,
    postState: 'DRAFT',
    postDeleted: false,
    ...overrides,
  });

  test('самая свежая версия держит слот, черновики прежних вытеснены', () => {
    const rows = [variant('v1'), variant('v2'), variant('v3')];
    expect([...plan.holderIds(rows)]).toEqual(['v3']);
    expect(plan.supersededPostIdsOf(rows)).toEqual(['post-v1', 'post-v2']);
  });

  test('выбор человека (`plannedAt`) делает прежнюю версию держателем', () => {
    const rows = [
      variant('v1', { plannedAt: new Date('2026-09-25T00:00:00.000Z') }),
      variant('v2'),
    ];
    expect([...plan.holderIds(rows)]).toEqual(['v1']);
    expect(plan.supersededPostIdsOf(rows)).toEqual(['post-v2']);
  });

  test('опубликованная и запланированная прежняя версия не прячется — прячутся только черновики', () => {
    const rows = [
      variant('v1', { postState: 'PUBLISHED' }),
      variant('v2', { postState: 'QUEUE' }),
      variant('v3'),
    ];
    expect(plan.supersededPostIdsOf(rows)).toEqual([]);
  });

  test('«Без плана» не вытесняет черновики — как до волны (F10, 97dq.64)', () => {
    const rows = [
      variant('v1', { planMode: 'draft' }),
      variant('v2', { planMode: 'draft' }),
      variant('v3', { planMode: 'draft', pieceId: 'piece-2' }),
      variant('v4', { planMode: 'reserve', pieceId: 'piece-2' }),
    ];
    expect(plan.supersededPostIdsOf(rows)).toEqual([]);
    expect(plan.supersededPostIdsOf(rows.map((row) => ({ ...row, planMode: 'reserve' })))).toEqual([
      'post-v1',
      'post-v3',
    ]);
  });

  test('каналы и заготовки не смешиваются; удалённый пост ничего не держит', () => {
    const rows = [
      variant('v1'),
      variant('v2', { integrationId: 'int-vk' }),
      variant('v3', { pieceId: 'piece-2' }),
      variant('v4', { postDeleted: true }),
    ];
    expect([...plan.holderIds(rows)].sort()).toEqual(['v1', 'v2', 'v3']);
    expect(plan.supersededPostIdsOf(rows)).toEqual([]);
  });
});

describe('свободное время — по времени самого канала', () => {
  const day = Date.UTC(2026, 8, 22);
  test('первое свободное время канала после «сейчас» и запаса', () => {
    // 09:00 уже прошло, 12:01 ближе запаса, 18:00 занято — значит 20:00.
    const taken = new Set([day + 18 * 60 * MIN]);
    const free = plan.nextFreeSlot([9 * 60, 12 * 60 + 1, 18 * 60, 20 * 60], taken, NOW);
    expect(free.toISOString()).toBe('2026-09-22T20:00:00.000Z');
  });
  test('день занят целиком — следующий день', () => {
    const taken = new Set([day + 18 * 60 * MIN]);
    expect(plan.nextFreeSlot([18 * 60], taken, NOW).toISOString()).toBe(
      '2026-09-23T18:00:00.000Z'
    );
  });
  test('без своих времён канала ответа нет', () => {
    expect(plan.nextFreeSlot([], new Set(), NOW)).toBeNull();
    expect(plan.postingMinutesOf('not json')).toEqual([]);
    expect(plan.postingMinutesOf('[{"time":120},{"time":400}]')).toEqual([120, 400]);
  });
});

/* -------------------------------------------------------------------------
 * Хранилище: поиск занятого времени и выбор готовых
 * ---------------------------------------------------------------------- */

describe('репозиторий', () => {
  const derivationRows = [
    {
      id: 'v1', contentPieceId: 'piece-1', integrationId: 'int-tg', plannedAt: null,
      createdAt: new Date('2026-09-21T09:00:00.000Z'), postId: 'post-v1',
      post: { state: 'DRAFT', deletedAt: null, integrationId: 'int-tg' },
    },
    {
      id: 'v2', contentPieceId: 'piece-1', integrationId: 'int-tg', plannedAt: null,
      createdAt: new Date('2026-09-22T09:00:00.000Z'), postId: 'post-v2',
      post: { state: 'DRAFT', deletedAt: null, integrationId: 'int-tg' },
    },
  ];

  test('занятое время канала не считает черновик вытесненной версии и исключённый пост', async () => {
    const queries = [];
    const repository = new PieceRepository(
      {
        model: {
          contentDerivation: { findMany: async () => derivationRows },
          post: {
            findMany: async (input) => {
              queries.push(input);
              return [{ publishDate: new Date('2026-09-23T09:00:00.000Z') }];
            },
          },
        },
      },
      {},
      {}
    );
    const from = new Date('2026-09-22T12:00:00.000Z');
    const to = new Date('2026-10-22T12:00:00.000Z');
    await repository.busySlots('org-a', 'int-tg', from, to, ['post-x']);
    expect(queries[0].where).toEqual({
      organizationId: 'org-a',
      integrationId: 'int-tg',
      deletedAt: null,
      parentPostId: null,
      publishDate: { gte: from, lte: to },
      id: { notIn: ['post-v1', 'post-x'] },
    });
  });

  test('замок канала — транзакционная рекомендательная блокировка Postgres на (область, заготовка, канал) (F4, N2)', async () => {
    const sql = [];
    let options;
    const repository = new PieceRepository(
      {
        model: {
          $transaction: async (work, given) => {
            options = given;
            return work({
              $queryRaw: async (strings, ...values) => {
                sql.push([strings.join('?'), values]);
                return [{ locked: 1 }];
              },
              // Записи под замком идут через транзакцию замка, а не мимо неё.
              post: {
                updateMany: async (input) => {
                  sql.push(['tx post.updateMany', input]);
                  return { count: 1 };
                },
                findFirst: async () => ({ updatedAt: new Date(7) }),
              },
            });
          },
        },
      },
      {},
      {}
    );
    const result = await repository.withChannelLock('org-a', 'piece-1', 'int-tg', async (db) => {
      const saved = await db.setPostState('org-a', 'post-1', { state: 'QUEUE' });
      return saved.updatedAt.getTime();
    });
    expect(result).toBe(7);
    expect(sql).toEqual([
      [
        'SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(?))) AS held',
        ['cf-plan:org-a:piece-1:int-tg'],
      ],
      [
        'tx post.updateMany',
        { where: { organizationId: 'org-a', id: 'post-1', deletedAt: null }, data: { state: 'QUEUE' } },
      ],
    ]);
    // Короткое окно: под замком только база, Temporal — после фиксации (N2).
    expect(options).toEqual({ maxWait: 10_000, timeout: 10_000 });
  });

  test('«Что публикуем» не предлагает черновик вытесненной версии', async () => {
    let query;
    const scopes = [];
    const ready = (id, postId) => ({
      id,
      title: null,
      body: 'текст',
      updatedAt: new Date('2026-09-22T09:00:00.000Z'),
      plan: null,
      planNote: null,
      piece: { id: 'piece-1', title: 'Сроки' },
      post: { id: postId, integrationId: 'int-tg', content: 'текст', state: 'DRAFT', publishDate: null },
    });
    const repository = new PieceRepository(
      {
        model: {
          contentDerivation: {
            findMany: async (input) => {
              if (input.select && input.select.plannedAt) return derivationRows;
              if (input.select && !input.select.title) {
                scopes.push(input.where);
                return derivationRows;
              }
              query = input;
              return [ready('v2', 'post-v2'), ready('v1', 'post-v1')];
            },
          },
        },
      },
      {},
      {}
    );
    const rows = await repository.listReadyAdaptations('org-a', 10);
    expect(rows.map((row) => row.id)).toEqual(['v2']);
    // No org-wide NOT IN any more (97dq.65, F12): the page's own drafts are the candidates.
    expect(query.where.post.is.id).toBeUndefined();
    expect(scopes[0].post.is.AND).toEqual([{ id: { in: ['post-v2', 'post-v1'] } }]);
    expect(scopes[0].post.is.state).toBe('DRAFT');
    expect(query.where.post.is.state).toEqual({ in: ['DRAFT', 'QUEUE'] });
    expect(query.select.post.select).toMatchObject({ state: true, publishDate: true });
    expect(query.select).toMatchObject({ plan: true, planNote: true });
  });

  test('вытесненные ищутся только среди кандидатов своего окна и только у их заготовок (97dq.65, F12)', async () => {
    const calls = [];
    const client = {
      contentDerivation: {
        findMany: async (input) => {
          calls.push(input);
          // Candidate read: only v1 (a superseded draft) is in the window.
          if (!input.select.plannedAt) {
            return [{ contentPieceId: 'piece-1', postId: 'post-v1', post: { integrationId: 'int-tg' } }];
          }
          return [
            ...derivationRows,
            // Another piece's variants must never be read.
          ];
        },
      },
    };
    const window = { publishDate: { gte: new Date(0), lte: new Date(1) } };
    const ids = await plan.supersededDraftPostIds(client, 'org-a', 'int-tg', window);
    expect(ids).toEqual(['post-v1']);
    expect(calls[0].where.post.is).toMatchObject({ state: 'DRAFT', integrationId: 'int-tg', AND: [window] });
    expect(calls[1].where.contentPieceId).toEqual({ in: ['piece-1'] });
    expect(calls[1].where.post.is.integrationId).toEqual({ in: ['int-tg'] });

    // No candidate in scope — no sibling read at all.
    const quiet = { contentDerivation: { findMany: async (input) => { calls.push(input); return []; } } };
    calls.length = 0;
    expect(await plan.supersededDraftPostIds(quiet, 'org-a', null, window)).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * Стенд: заготовка, канал и календарь в памяти
 * ---------------------------------------------------------------------- */

const PROVIDERS = {
  telegram: { maxLength: () => 4_096, maxCaptionLength: () => 1_024, editor: 'html' },
};

const pieceRow = () => ({
  id: 'piece-1',
  title: 'Сроки',
  kind: 'CORE',
  body: 'Из шести сроков сдвинулись пять.',
  brief: {
    brief: {
      inputKind: 'thought',
      thesis: 'Срок держится, когда о нём знает другой',
      position: null,
      disagreement: null,
      audience: null,
      format: 'auto',
      facts: [],
      origins: {},
      ungrounded: [],
    },
    answers: [],
    slop: null,
    writtenBy: 'model',
    authorNumbers: false,
  },
  language: 'ru',
  tags: null,
  archivedAt: null,
  createdAt: new Date('2026-09-20T09:00:00.000Z'),
  brandProfileVersion: null,
});

/**
 * Календарь в памяти: посты и версии. Канал публикует в 09:00 и 18:00 UTC.
 * `other` — пост ДРУГОГО канала области в 18:00: своё время канала он не
 * занимает.
 */
const stand = (options = {}) => {
  let clock = NOW.getTime();
  const tick = () => new Date((clock += 1_000));
  const channel = {
    id: 'int-tg',
    name: 'Мой канал',
    providerIdentifier: 'telegram',
    contentLanguage: 'ru',
    additionalSettings: null,
    writingProfile: null,
    planMode: options.planMode ?? null,
    postingTimes: '[{"time":540},{"time":1080}]',
  };
  const posts = new Map([
    ['other', { id: 'other', state: 'QUEUE', publishDate: new Date('2026-09-22T18:00:00.000Z'), deletedAt: null, integrationId: 'int-vk' }],
    ...(options.posts || []).map((post) => [post.id, post]),
  ]);
  const derivations = [...(options.derivations || [])];
  const calls = { validate: [], changeDate: [], status: [], setPlan: [], temporalInLock: [] };
  let lockChain = Promise.resolve();
  let updates = 0;
  let postCounter = 0;

  const variantRows = () =>
    derivations.map((row) => ({
      ...row,
      post: row.postId && posts.get(row.postId) ? { ...posts.get(row.postId) } : null,
    }));

  // `ContentPiece.tags` заготовки: свои настройки постов (`97dq.70`).
  let tags = options.tags ?? null;
  const repository = {
    getPiece: async (org, pieceId) =>
      org === 'org-a'
        ? { ...pieceRow(), id: pieceId, tags, archivedAt: options.archived ? NOW : null }
        : null,
    pieceTags: async () => tags,
    // Строка заготовки под блокировкой: в стенде её держит тот же замок.
    lockPieceTags: async () => {
      if (options.onLockTags) options.onLockTags(channel);
      calls.tagLocks = (calls.tagLocks || 0) + (calls.inLock ? 1 : 0);
      return { tags };
    },
    writePieceTags: async (_org, _pieceId, next) => {
      if (!calls.inLock) throw new Error('tags written outside the lock');
      tags = next;
      return true;
    },
    channelPieceVariants: async (_org, integrationId) =>
      variantRows()
        .filter((row) => row.post && row.post.integrationId === integrationId && !row.post.deletedAt)
        .map((row) => ({ ...row, piece: { tags, archivedAt: null } })),
    listPieceIds: async () => [{ id: 'piece-1' }],
    listIntegrations: async () => [channel, ...(options.extraChannels || [])],
    findAvatar: async (_org, id) =>
      (options.avatars || []).includes(id) ? { id, activeVersionId: `${id}-v1` } : null,
    adaptationsByPiece: async () =>
      variantRows().map((row) => ({
        id: row.id,
        contentPieceId: row.contentPieceId,
        postId: row.postId,
        integrationId: row.integrationId,
        platform: 'telegram',
        format: 'post',
        kind: 'post',
        title: null,
        body: 'Текст.',
        mediaId: null,
        brandProfileVersionId: null,
        createdAt: row.createdAt,
        plan: row.plan ?? null,
        planNote: row.planNote ?? null,
        plannedAt: row.plannedAt ?? null,
        post: row.post
          ? {
              state: row.post.state,
              releaseURL: null,
              publishDate: row.post.publishDate,
              deletedAt: row.post.deletedAt,
              integration: { id: 'int-tg', name: 'Мой канал', providerIdentifier: 'telegram' },
            }
          : null,
      })),
    workspaceDraft: async (org, _piece, id) => {
      if ((options.draftThrows || []).includes(id)) throw new Error(`draft ${id} unreadable`);
      const row = variantRows().find((one) => one.id === id);
      if (org !== 'org-a' || !row) return null;
      return {
        id: row.id,
        body: 'Текст.',
        platform: 'telegram',
        mediaId: null,
        postId: row.postId,
        post: row.post
          ? {
              ...row.post,
              content: '<p>Текст.</p>',
              image: '[]',
              settings: JSON.stringify({ __type: 'telegram' }),
              integration: { ...channel },
            }
          : null,
      };
    },
    createDraft: async (_org, input) => {
      const id = `post-${++postCounter}`;
      posts.set(id, {
        id,
        state: 'DRAFT',
        publishDate: new Date(input.date),
        deletedAt: null,
        integrationId: input.channelId,
      });
      return id;
    },
    createAdaptation: async (_org, input) => {
      const row = {
        id: `ad-${derivations.length + 1}`,
        contentPieceId: input.pieceId,
        integrationId: input.integrationId,
        postId: input.postId,
        plan: null,
        planNote: null,
        plannedAt: null,
        createdAt: tick(),
      };
      derivations.push(row);
      return { id: row.id, createdAt: row.createdAt };
    },
    channelPlanMode: async () => channel.planMode,
    channelVariants: async (_org, pieceId, integrationId) =>
      variantRows().filter(
        (row) =>
          row.contentPieceId === pieceId &&
          (row.post?.integrationId ?? row.integrationId) === integrationId
      ),
    busySlots: async (_org, integrationId, from, to, exclude = []) => {
      const hidden = plan.supersededPostIdsOf(
        variantRows().map((row) => ({
          id: row.id,
          pieceId: row.contentPieceId,
          integrationId: row.post?.integrationId ?? row.integrationId,
          plannedAt: row.plannedAt,
          createdAt: row.createdAt,
          postId: row.postId,
          postState: row.post?.state,
          postDeleted: !row.post || !!row.post.deletedAt,
        }))
      );
      return [...posts.values()]
        .filter(
          (post) =>
            post.integrationId === integrationId &&
            !post.deletedAt &&
            post.publishDate >= from &&
            post.publishDate <= to &&
            !hidden.includes(post.id) &&
            !exclude.includes(post.id)
        )
        .map((post) => post.publishDate);
    },
    // Только база: состояние и время поста (N2). Temporal — `syncPostWorkflow`.
    setPostState: async (_org, id, data) => {
      const post = posts.get(id);
      if (!post || post.deletedAt) return null;
      if (options.revertFails && data.state === 'DRAFT' && options.revertFails.includes(id)) return null;
      if (data.state) post.state = data.state;
      if (data.publishDate) {
        post.publishDate = new Date(data.publishDate);
        calls.changeDate.push([id, post.publishDate.toISOString(), 'update']);
      }
      post.updatedAt = new Date(++updates);
      return { updatedAt: post.updatedAt };
    },
    // «Удалять при подтверждении» (`2q28.39`): мягкое удаление черновиков
    // канала и обратный ход для одной версии.
    ...(options.noDrop
      ? {}
      : {
          dropDraftPosts: async (_org, integrationId, ids) => {
            if (!calls.inLock) throw new Error('drafts dropped outside the lock');
            let count = 0;
            for (const id of ids) {
              const post = posts.get(id);
              if (!post || post.deletedAt || post.state !== 'DRAFT' || post.integrationId !== integrationId)
                continue;
              post.deletedAt = new Date(clock);
              count += 1;
            }
            (calls.dropped = calls.dropped || []).push(...ids);
            return count;
          },
          restoreDraftPost: async (_org, id) => {
            const post = posts.get(id);
            if (!post || !post.deletedAt || post.state !== 'DRAFT') return false;
            post.deletedAt = null;
            return true;
          },
        }),
    // Автосохранение: запись только в живой черновик, как у репозитория.
    editAdaptation: async (_org, _pieceId, adaptationId, postId, change) => {
      const post = posts.get(postId);
      if (!post || post.deletedAt)
        throw Object.assign(new Error('gone'), { reason: 'ADAPTATION_POST_GONE' });
      if (post.state !== 'DRAFT')
        throw Object.assign(new Error('closed'), { reason: 'ADAPTATION_NOT_DRAFT' });
      post.content = change.content ?? post.content;
      (calls.edits = calls.edits || []).push([adaptationId, postId, change.body]);
      return { saved: true };
    },
    setPlan: async (_org, id, data, onlyPlan) => {
      calls.setPlan.push([id, data, onlyPlan]);
      const row = derivations.find((one) => one.id === id);
      if (!row || (onlyPlan && row.plan !== onlyPlan)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  // Замок канала (review F4, N2): по одному постановщику за раз; под ним —
  // те же операции базы, что снаружи.
  repository.withChannelLock = (_org, _pieceId, _integrationId, work) => {
    calls.locks = (calls.locks || 0) + 1;
    const run = lockChain.then(async () => {
      calls.inLock = true;
      try {
        return await work(repository);
      } finally {
        calls.inLock = false;
      }
    });
    lockChain = run.catch(() => undefined);
    return run;
  };

  const port = {
    validatePosts: async (...args) => {
      if (options.onValidate) await options.onValidate();
      calls.validate.push(args);
      if (options.validateThrows) throw new Error('validator down');
      return [
        {
          valid: true,
          settingsError: '',
          errors: true,
          emptyContent: false,
          tooLong: false,
          maximumCharacters: 4096,
          ...(options.verdict || {}),
        },
      ];
    },
    changeDate: async (_org, id, date, action) => {
      calls.changeDate.push([id, date, action]);
      posts.get(id).publishDate = new Date(date);
    },
    // Temporal по состоянию поста в базе (N2): QUEUE — старт, иначе стоп.
    syncPostWorkflow: async (_org, id) => {
      // Temporal никогда не зовётся, пока держится замок (N2).
      if (calls.inLock) calls.temporalInLock.push(id);
      const post = posts.get(id);
      const queued = post && !post.deletedAt && post.state === 'QUEUE';
      calls.status.push([id, queued ? 'schedule' : 'draft']);
      const result = !queued
        ? 'stopped'
        : (options.startFails || []).includes(id)
        ? 'failed'
        : 'started';
      // Что успело случиться, пока Temporal отвечал (параллельная постановка).
      if (options.onSync) await options.onSync(id, posts);
      return result;
    },
    changePostStatus: async (_org, id, status) => {
      calls.status.push([id, status]);
      posts.get(id).state = status === 'draft' ? 'DRAFT' : 'QUEUE';
      // Temporal не запустил процесс публикации этого поста (review F7).
      const failed = status === 'schedule' && (options.startFails || []).includes(id);
      return {
        id,
        state: posts.get(id).state,
        workflow: status === 'draft' ? 'stopped' : failed ? 'failed' : 'started',
      };
    },
  };

  const service = new PieceService(
    repository,
    {
      start: async function* () {
        if (options.onGenerate) options.onGenerate(channel);
        yield { data: { output: { content: [{ content: 'Готовый текст.' }], date: '2026-09-22T13:37:00Z' } } };
      },
    },
    { getSocialIntegration: (identifier) => PROVIDERS[identifier] },
    () => new Date(clock),
    () => null,
    undefined,
    undefined,
    null,
    null,
    null,
    null,
    null,
    port
  );

  const generate = async () => {
    const prepared = await service.prepareAdapt(
      'org-a',
      'piece-1',
      { integrationId: 'int-tg', skipInterview: true },
      'ru'
    );
    let adaptation = null;
    for await (const event of service.adapt('org-a', prepared)) {
      if (event.name === 'adaptation') adaptation = event.adaptation;
    }
    return adaptation;
  };
  const queued = () => [...posts.values()].filter((post) => post.integrationId === 'int-tg' && post.state === 'QUEUE');
  const at = (ms) => {
    clock = NOW.getTime() + ms;
  };

  return {
    service,
    calls,
    setTags: (next) => {
      tags = next;
    },
    posts,
    derivations,
    generate,
    queued,
    at,
    channel,
    options,
    tags: () => tags,
  };
};

/* -------------------------------------------------------------------------
 * «Бронь»
 * ---------------------------------------------------------------------- */

describe('«Бронь» — умолчание: время своего канала, очередь не трогается', () => {
  test('новая версия встаёт на ближайшее время САМОГО канала и ничего не ставит в очередь', async () => {
    const { generate, calls, posts, queued } = stand();
    const adaptation = await generate();
    // 18:00 занято постом другого канала — это не время этого канала.
    expect(posts.get('post-1').publishDate.toISOString()).toBe('2026-09-22T18:00:00.000Z');
    expect(adaptation.state).toBe('draft');
    expect(adaptation.plan).toEqual({
      status: 'reserved',
      date: '2026-09-22T18:00:00.000Z',
      autopilot: false,
      current: true,
    });
    expect(calls.status).toEqual([]);
    expect(calls.validate).toEqual([]);
    expect(queued()).toEqual([]);
    expect(calls.setPlan).toEqual([['ad-1', { plan: 'reserve', planNote: null }, undefined]]);
  });

  test('вторая версия забирает время первой, первая вытеснена (I1)', async () => {
    const { generate, posts, derivations, service } = stand();
    await generate();
    await generate();
    expect(posts.get('post-2').publishDate.toISOString()).toBe('2026-09-22T18:00:00.000Z');
    const rows = derivations.map((row) => ({
      id: row.id,
      pieceId: row.contentPieceId,
      integrationId: 'int-tg',
      plannedAt: row.plannedAt,
      createdAt: row.createdAt,
      postId: row.postId,
      postState: posts.get(row.postId).state,
      postDeleted: false,
    }));
    expect(plan.supersededPostIdsOf(rows)).toEqual(['post-1']);
    // Страница: обе версии на месте («Вариант 1, 2»), в плане — только вторая.
    const detail = await service.detail('org-a', 'piece-1', 'ru');
    expect(detail.adaptations.map((one) => [one.id, one.plan.status, one.plan.current])).toEqual([
      ['ad-1', 'draft', false],
      ['ad-2', 'reserved', true],
    ]);
  });
});

/* -------------------------------------------------------------------------
 * «Автопилот»
 * ---------------------------------------------------------------------- */

describe('«Автопилот»: очередь, одна на заготовку в канале', () => {
  test('первая версия — проверка площадки и очередь один раз, с меткой автопилота (I3, I5)', async () => {
    const { generate, calls, queued, derivations } = stand({ planMode: 'autopilot' });
    const adaptation = await generate();
    expect(calls.validate).toHaveLength(1);
    expect(calls.changeDate).toEqual([['post-1', '2026-09-22T18:00:00.000Z', 'update']]);
    expect(calls.status).toEqual([['post-1', 'schedule']]);
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(derivations[0].plan).toBe('autopilot');
    expect(adaptation.state).toBe('queued');
    expect(adaptation.plan).toMatchObject({ status: 'queued', autopilot: true });
  });

  test('«Бронь» у поста при канале на автопилоте — явный reserve в настройках и снятие очереди (97dq.86)', async () => {
    const { service, generate, calls, queued, derivations, tags } = stand({ planMode: 'autopilot' });
    await generate();
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    const saved = await service.savePostSettings(
      'org-a', 'piece-1', 'int-tg', { planMode: 'reserve' }, 'ru'
    );
    // Stored as the post's own mode, not «как в канале» (null).
    expect(saved.settings.planMode).toBe('reserve');
    expect(tags().postSettings['int-tg'].planMode).toBe('reserve');
    // The same unschedule the queue gate makes: out of the queue, back to reserve.
    expect(queued()).toEqual([]);
    expect(calls.status.at(-1)).toEqual(['post-1', 'draft']);
    expect(derivations[0].plan).toBe('reserve');
  });

  test('вторая версия сменяет первую в очереди — второй очереди нет (I1)', async () => {
    const { generate, calls, queued, posts, derivations } = stand({ planMode: 'autopilot' });
    await generate();
    await generate();
    expect(calls.status).toEqual([
      ['post-1', 'schedule'],
      ['post-1', 'draft'],
      ['post-2', 'schedule'],
    ]);
    expect(queued().map((post) => post.id)).toEqual(['post-2']);
    expect(posts.get('post-2').publishDate.toISOString()).toBe('2026-09-22T18:00:00.000Z');
    // Метка автопилота снята с прежней версии вместе с очередью.
    expect(derivations.map((row) => row.plan)).toEqual(['reserve', 'autopilot']);
  });

  test('до выхода две минуты или меньше — новая версия остаётся в плане на другом времени (I4)', async () => {
    const { generate, calls, queued, posts, at, derivations } = stand({ planMode: 'autopilot' });
    await generate();
    // Первая версия стоит на 18:00; «сейчас» — 17:59.
    at(6 * 60 * MIN - MIN);
    const adaptation = await generate();
    expect(calls.status.filter(([id]) => id === 'post-1')).toEqual([['post-1', 'schedule']]);
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(posts.get('post-2').state).toBe('DRAFT');
    expect(posts.get('post-2').publishDate.toISOString()).toBe('2026-09-23T09:00:00.000Z');
    expect(derivations[1].plan).toBe('reserve');
    expect(adaptation.plan).toMatchObject({ status: 'reserved', date: '2026-09-23T09:00:00.000Z' });
    expect(adaptation.plan.note).toContain('уже выходит');
  });

  test('площадка не примет — версия остаётся бронью с причиной, очередь не тронута (I3)', async () => {
    const { generate, calls, queued, derivations } = stand({
      planMode: 'autopilot',
      verdict: { tooLong: true, maximumCharacters: 10 },
    });
    const adaptation = await generate();
    expect(calls.status).toEqual([]);
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(derivations[0].planNote).toContain('не больше 10 знаков');
    expect(adaptation.plan).toMatchObject({ status: 'reserved', autopilot: false });
    expect(adaptation.plan.note).toContain('Мой канал');
  });
});

/* -------------------------------------------------------------------------
 * «Без плана»
 * ---------------------------------------------------------------------- */

describe('«Без плана» — как до волны', () => {
  test('черновик на свободном времени области, без брони и без очереди', async () => {
    const { generate, calls, posts } = stand({ planMode: 'draft' });
    const adaptation = await generate();
    expect(posts.get('post-1').publishDate.toISOString()).toBe('2026-09-22T13:37:00.000Z');
    expect(adaptation.plan).toEqual({ status: 'draft', date: null, autopilot: false, current: true });
    expect(calls.status).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * «Что публикуем» и «Поставить на ЧЧ:ММ»
 * ---------------------------------------------------------------------- */

describe('«Что публикуем»', () => {
  test('бронь и очередь приходят со временем, черновик без времени — свободен', async () => {
    const service = new PieceService(
      {
        listPieceIds: async () => [{ id: 'piece-1' }],
        listReadyAdaptations: async () =>
          [
            ['a1', 'DRAFT', 'reserve'],
            ['a2', 'QUEUE', 'autopilot'],
            ['a3', 'DRAFT', 'draft'],
            ['a4', 'QUEUE', null],
          ].map(([id, state, planValue]) => ({
            id,
            title: null,
            body: 'Текст.',
            updatedAt: NOW,
            plan: planValue,
            planNote: null,
            piece: { id: 'piece-1', title: 'Сроки' },
            post: {
              id: `post-${id}`,
              integrationId: 'int-tg',
              content: '',
              state,
              publishDate: new Date('2026-09-25T06:20:00.000Z'),
            },
          })),
      },
      {},
      {}
    );
    const response = await service.readyAdaptations('org-a', 50);
    expect(response.items.map((item) => [item.adaptationId, item.slot])).toEqual([
      ['a1', { status: 'reserved', date: '2026-09-25T06:20:00.000Z', autopilot: false }],
      ['a2', { status: 'queued', date: '2026-09-25T06:20:00.000Z', autopilot: true }],
      ['a3', { status: 'free', date: null, autopilot: false }],
      ['a4', { status: 'queued', date: '2026-09-25T06:20:00.000Z', autopilot: false }],
    ]);
  });
});

describe('«Поставить на ЧЧ:ММ»', () => {
  const SLOT = '2026-09-24T09:00:00.000Z';

  test('«Бронь»: версия встаёт на выбранное время и держит слот, очереди нет', async () => {
    const { generate, service, calls, posts, derivations, at } = stand();
    await generate();
    await generate();
    at(MIN);
    const result = await service.placeAdaptation('org-a', 'piece-1', 'ad-1', { date: SLOT }, 'ru');
    expect(posts.get('post-1').publishDate.toISOString()).toBe(SLOT);
    expect(calls.status).toEqual([]);
    expect(derivations[0].plannedAt).toBeInstanceOf(Date);
    expect(result.placement).toEqual({
      mode: 'reserve',
      status: 'reserved',
      date: SLOT,
      autopilot: false,
      note: null,
    });
    // Выбранная прежняя версия снова держатель, новая вытеснена.
    expect(result.adaptation.plan).toMatchObject({ status: 'reserved', date: SLOT, current: true });
  });

  test('«Автопилот»: выбранная версия в очереди, прежняя очередь снята', async () => {
    const { generate, service, calls, queued, at } = stand({ planMode: 'autopilot' });
    await generate();
    await generate();
    at(MIN);
    const result = await service.placeAdaptation('org-a', 'piece-1', 'ad-1', { date: SLOT }, 'ru');
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(calls.status.slice(-2)).toEqual([
      ['post-2', 'draft'],
      ['post-1', 'schedule'],
    ]);
    expect(result.placement).toMatchObject({ mode: 'autopilot', status: 'queued', date: SLOT, autopilot: true });
  });

  test('без календаря — честный отказ', async () => {
    const service = new PieceService({ getPiece: async () => pieceRow() }, {}, {});
    await expect(
      // A date ahead of the real clock: this service has no stand clock, and a
      // fixed SLOT turns into «date in the past» once the calendar passes it.
      service.placeAdaptation('org-a', 'piece-1', 'ad-1', { date: new Date(Date.now() + 86_400_000).toISOString() }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_SCHEDULE_UNAVAILABLE' });
  });
});

/* -------------------------------------------------------------------------
 * Одна очередь на заготовку в канале (review F1, F3, F4, F5)
 * ---------------------------------------------------------------------- */

describe('queueGate — одно правило для всех записей в очередь', () => {
  const queued = (id, ms, planValue = null) => ({
    id,
    plan: planValue,
    post: { state: 'QUEUE', publishDate: new Date(NOW.getTime() + ms), deletedAt: null },
  });
  const autopilot = { releaseHuman: false, blockPublished: true };
  const person = { releaseHuman: true, blockPublished: false };

  test('автопилот снимает только свою очередь и только вне окна', () => {
    expect(plan.queueGate([queued('a', 60 * MIN, 'autopilot')], 'new', NOW, autopilot)).toEqual({
      block: null,
      release: ['a'],
    });
    expect(plan.queueGate([queued('a', 60 * MIN, 'reserve')], 'new', NOW, autopilot)).toEqual({
      block: 'keptQueued',
      release: [],
    });
    expect(plan.queueGate([queued('a', MIN, 'autopilot')], 'new', NOW, autopilot)).toEqual({
      block: 'tooLate',
      release: [],
    });
  });

  test('человек снимает и свою очередь, но не ту, что выходит через минуту', () => {
    expect(plan.queueGate([queued('a', 60 * MIN)], 'new', NOW, person)).toEqual({ block: null, release: ['a'] });
    expect(plan.queueGate([queued('a', MIN)], 'new', NOW, person).block).toBe('tooLate');
  });

  test('вышедшая заготовка останавливает автопилот, но не человека', () => {
    const out = [{ id: 'a', plan: null, post: { state: 'PUBLISHED', publishDate: NOW, deletedAt: null } }];
    expect(plan.queueGate(out, 'new', NOW, autopilot).block).toBe('published');
    expect(plan.queueGate(out, 'new', NOW, person).block).toBeNull();
  });

  test('при любом запрете ничего не снимается', () => {
    const gate = plan.queueGate(
      [queued('a', 60 * MIN, 'autopilot'), queued('b', MIN, 'autopilot')],
      'new',
      NOW,
      autopilot
    );
    expect(gate).toEqual({ block: 'tooLate', release: [] });
  });
});

describe('F1: автопилот не ставит вторую очередь рядом с чужой', () => {
  test('V1 поставлен человеком, V2 и V3 сгенерированы — в очереди только V1', async () => {
    const { service, generate, queued, derivations, channel } = stand();
    await generate();
    // Человек ставит V1 на завтра, потом канал переходит в «Автопилот».
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T18:00:00.000Z' }, 'ru');
    channel.planMode = 'autopilot';
    const second = await generate();
    const third = await generate();
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(second.plan).toMatchObject({ status: 'reserved' });
    expect(third.plan).toMatchObject({ status: 'reserved' });
    expect(third.plan.note).toContain('уже стоит в очереди');
    expect(derivations.map((row) => row.plan)).toEqual(['reserve', 'reserve', 'reserve']);
  });
});

describe('F3: вышедшую заготовку автопилот снова не публикует', () => {
  test('V1 опубликован — V2 остаётся в плане с причиной', async () => {
    const { generate, posts, queued, calls } = stand({ planMode: 'autopilot' });
    await generate();
    posts.get('post-1').state = 'PUBLISHED';
    const statusBefore = calls.status.length;
    const second = await generate();
    expect(calls.status.length).toBe(statusBefore);
    expect(queued()).toEqual([]);
    expect(second.plan).toMatchObject({ status: 'reserved', autopilot: false });
    expect(second.plan.note).toContain('уже вышла');
  });
});

describe('F4: два одновременных прогона — одна очередь', () => {
  test('под замком канала вторая версия сменяет первую, а не встаёт рядом', async () => {
    const { generate, queued, calls } = stand({ planMode: 'autopilot' });
    await Promise.all([generate(), generate()]);
    expect(calls.locks).toBe(2);
    expect(queued()).toHaveLength(1);
  });
});

describe('F5: «Запланировать» не ставит вторую очередь', () => {
  test('другая версия выходит через минуту — отказ словами, очередь не тронута', async () => {
    const { service, generate, queued, calls, at } = stand();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-22T12:01:00.000Z' }, 'ru');
    await generate();
    const before = calls.status.length;
    await expect(
      service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { now: true }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_QUEUE_BUSY', status: 409 });
    expect(calls.status.length).toBe(before);
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    at(0);
  });

  test('другая версия далеко — её снимают, и очередь снова одна', async () => {
    const { service, generate, queued } = stand();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T09:00:00.000Z' }, 'ru');
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: '2026-09-24T09:00:00.000Z' }, 'ru');
    expect(queued().map((post) => post.id)).toEqual(['post-2']);
  });

  test('«Поставить на …» в «Автопилоте» при версии в окне — бронь с причиной', async () => {
    const { service, generate, queued, at } = stand({ planMode: 'autopilot' });
    await generate();
    // V1 в очереди на 18:00; «сейчас» 17:59, V2 бронь на завтра.
    at(6 * 60 * MIN - MIN);
    await generate();
    at(6 * 60 * MIN - MIN + 1000);
    const result = await service.placeAdaptation('org-a', 'piece-1', 'ad-2', { date: '2026-09-24T09:00:00.000Z' }, 'ru');
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(result.placement).toMatchObject({ status: 'reserved', autopilot: false });
    expect(result.placement.note).toContain('уже выходит');
  });
});

/* -------------------------------------------------------------------------
 * Второй круг ревью: F7, F8, F11, F13
 * ---------------------------------------------------------------------- */

describe('F8: режим канала читается заново перед постановкой', () => {
  test('автопилот выключили, пока шла генерация, — версия встаёт бронью, очереди нет', async () => {
    const { generate, queued, calls } = stand({
      planMode: 'autopilot',
      onGenerate: (channel) => {
        channel.planMode = 'reserve';
      },
    });
    const adaptation = await generate();
    expect(queued()).toEqual([]);
    expect(calls.status).toEqual([]);
    expect(adaptation.plan).toMatchObject({ status: 'reserved', autopilot: false });
  });
});

describe('F11: время сравнивается с точностью до минуты', () => {
  test('пост на 18:00:30 занимает слот 18:00', () => {
    const taken = new Set([Date.UTC(2026, 8, 22, 18, 0, 30, 500)]);
    expect(plan.nextFreeSlot([18 * 60, 20 * 60], taken, NOW).toISOString()).toBe(
      '2026-09-22T20:00:00.000Z'
    );
  });

  test('на стенде: пост канала с секундами не даёт новой версии встать на ту же минуту', async () => {
    const { generate, posts } = stand({
      posts: [
        {
          id: 'mine',
          state: 'QUEUE',
          publishDate: new Date('2026-09-22T18:00:30.000Z'),
          deletedAt: null,
          integrationId: 'int-tg',
        },
      ],
    });
    await generate();
    expect(posts.get('post-1').publishDate.toISOString()).toBe('2026-09-23T09:00:00.000Z');
  });
});

describe('F7: Temporal не запустил публикацию — это не «в очереди»', () => {
  test('автопилот: версия остаётся бронью с причиной, пост снова черновик', async () => {
    const { generate, queued, derivations } = stand({ planMode: 'autopilot', startFails: ['post-1'] });
    const adaptation = await generate();
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(derivations[0].planNote).toContain('Календарь не принял');
    expect(adaptation.plan).toMatchObject({ status: 'reserved', autopilot: false });
  });

  test('«Запланировать»: честный отказ, пост снова черновик', async () => {
    const { service, generate, posts, options } = stand();
    await generate();
    options.startFails = ['post-1'];
    await expect(
      service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-24T09:00:00.000Z' }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_SCHEDULE_UNAVAILABLE' });
    expect(posts.get('post-1').state).toBe('DRAFT');
  });
});

describe('F13: сбой после записи версии оставляет согласованное состояние', () => {
  test('новая очередь не встала — прежняя очередь автопилота возвращается на место', async () => {
    const { generate, queued, derivations, options } = stand({ planMode: 'autopilot' });
    await generate();
    options.startFails = ['post-2'];
    const second = await generate();
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(derivations[0].plan).toBe('autopilot');
    expect(derivations[1].plan).toBe('reserve');
    expect(second.plan.note).toContain('Календарь не принял');
  });

  test('постановка бросила — версия сохранена и стоит бронью с причиной', async () => {
    const { generate, derivations, queued } = stand({ planMode: 'autopilot', validateThrows: true });
    const adaptation = await generate();
    expect(adaptation).not.toBeNull();
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(derivations[0].planNote).toContain('Версия сохранена');
    expect(adaptation.plan).toMatchObject({ status: 'reserved', autopilot: false });
  });
});

/* -------------------------------------------------------------------------
 * Перепроверка: N1–N4
 * ---------------------------------------------------------------------- */

describe('N2: под замком — только база, Temporal — после фиксации', () => {
  test('смена очереди автопилота: снятие и старт идут после замка', async () => {
    const { generate, calls, queued } = stand({ planMode: 'autopilot' });
    await generate();
    await generate();
    expect(calls.temporalInLock).toEqual([]);
    expect(calls.status).toEqual([
      ['post-1', 'schedule'],
      ['post-1', 'draft'],
      ['post-2', 'schedule'],
    ]);
    expect(queued().map((post) => post.id)).toEqual(['post-2']);
  });

  test('старт не удался после фиксации — пост снова черновик с причиной, без Temporal под замком', async () => {
    const { generate, calls, posts, derivations } = stand({ planMode: 'autopilot', startFails: ['post-1'] });
    await generate();
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(derivations[0].planNote).toContain('Календарь не принял');
    expect(calls.temporalInLock).toEqual([]);
  });
});

describe('N1: возврат очереди не спорит с человеком', () => {
  test('«Снять с расписания» идёт под тем же замком канала', async () => {
    const { service, generate, calls, posts } = stand({ planMode: 'autopilot' });
    await generate();
    const locks = calls.locks;
    await service.unscheduleAdaptation('org-a', 'piece-1', 'ad-1', 'ru');
    expect(calls.locks).toBe(locks + 1);
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(calls.status.slice(-1)).toEqual([['post-1', 'draft']]);
    expect(calls.temporalInLock).toEqual([]);
  });

  test('снятую версию тронули, пока новая не встала, — её не возвращают', async () => {
    const { generate, queued, posts } = stand({
      planMode: 'autopilot',
      startFails: ['post-2'],
      onSync: (id, all) => {
        // Человек правит прежнюю версию, пока новая пытается встать.
        if (id === 'post-2') all.get('post-1').updatedAt = new Date(999_999);
      },
    });
    await generate();
    await generate();
    expect(queued()).toEqual([]);
    expect(posts.get('post-1').state).toBe('DRAFT');
  });
});

describe('F10: снятие с расписания и «Без плана» не прячут версию (97dq.64)', () => {
  // Ревью F6 четырнадцатого захода: снятие не-держателя не прячет черновик
  // держателя — версию, которую человек выбрал или написал последней. Снятая
  // возвращается в черновики страницы заготовки.
  test('снятая не-держатель не отнимает слот у черновика держателя', async () => {
    const { service, generate, derivations, posts, channel, at } = stand();
    await generate();
    // Человек ставит V1 в очередь, потом пишется V2 — держатель теперь V2.
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T18:00:00.000Z' }, 'ru');
    await generate();
    const rows = () =>
      derivations.map((row) => ({
        id: row.id,
        pieceId: row.contentPieceId,
        integrationId: channel.id,
        plannedAt: row.plannedAt,
        createdAt: row.createdAt,
        postId: row.postId,
        postState: posts.get(row.postId).state,
      }));
    expect([...plan.holderIds(rows())]).toEqual(['ad-2']);
    at(60_000);
    await service.unscheduleAdaptation('org-a', 'piece-1', 'ad-1', 'ru');
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(plan.supersededPostIdsOf(rows())).not.toContain('post-2');
    expect([...plan.holderIds(rows())]).toEqual(['ad-2']);
  });

  test('снятая не-держатель берёт слот, когда у держателя нет черновика в календаре', async () => {
    const { service, generate, derivations, posts, channel, at } = stand();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T18:00:00.000Z' }, 'ru');
    await generate();
    // Пост держателя V2 упал при публикации: в календаре его черновика нет.
    posts.get('post-2').state = 'ERROR';
    const rows = () =>
      derivations.map((row) => ({
        id: row.id,
        pieceId: row.contentPieceId,
        integrationId: channel.id,
        plannedAt: row.plannedAt,
        createdAt: row.createdAt,
        postId: row.postId,
        postState: posts.get(row.postId).state,
      }));
    at(60_000);
    await service.unscheduleAdaptation('org-a', 'piece-1', 'ad-1', 'ru');
    expect(plan.supersededPostIdsOf(rows())).not.toContain('post-1');
    expect([...plan.holderIds(rows())]).toEqual(['ad-1']);
  });

  test('страница заготовки: под «Без плана» каждая версия текущая, как в календаре (ревью F6)', async () => {
    const channelDraft = stand({ planMode: 'draft' });
    await channelDraft.generate();
    await channelDraft.generate();
    const detail = await channelDraft.service.detail('org-a', 'piece-1', 'ru');
    expect(detail.adaptations.map((one) => [one.id, one.plan.current])).toEqual([
      ['ad-1', true],
      ['ad-2', true],
    ]);

    const ownDraft = stand({ tags: { postSettings: { 'int-tg': { planMode: 'draft' } } } });
    await ownDraft.generate();
    await ownDraft.generate();
    const own = await ownDraft.service.detail('org-a', 'piece-1', 'ru');
    expect(own.adaptations.every((one) => one.plan.current)).toBe(true);
  });

  test('держатель при снятии plannedAt не получает', async () => {
    const { service, generate, calls } = stand({ planMode: 'autopilot' });
    await generate();
    await service.unscheduleAdaptation('org-a', 'piece-1', 'ad-1', 'ru');
    expect(calls.setPlan.filter(([, data]) => data.plannedAt)).toEqual([]);
  });

  test('календарь: канал «Без плана» или свой режим поста «Без плана» — черновики версий видны', async () => {
    const row = (id, created, planMode, tags = null) => ({
      id, contentPieceId: 'piece-1', integrationId: 'int-tg', plannedAt: null,
      createdAt: new Date(created), postId: `post-${id}`,
      post: { state: 'DRAFT', deletedAt: null, integrationId: 'int-tg', integration: { planMode } },
      piece: { tags },
    });
    const client = (rows) => ({
      contentDerivation: {
        findMany: async (input) =>
          input.select.plannedAt
            ? rows
            : rows.map((one) => ({ contentPieceId: one.contentPieceId, postId: one.postId, post: { integrationId: 'int-tg' } })),
      },
    });
    expect(
      await plan.supersededDraftPostIds(client([row('v1', '2026-09-21', 'draft'), row('v2', '2026-09-22', 'draft')]), 'org-a')
    ).toEqual([]);
    const own = { postSettings: { 'int-tg': { planMode: 'draft' } } };
    expect(
      await plan.supersededDraftPostIds(
        client([row('v1', '2026-09-21', 'reserve', own), row('v2', '2026-09-22', 'reserve', own)]),
        'org-a'
      )
    ).toEqual([]);
    expect(
      await plan.supersededDraftPostIds(client([row('v1', '2026-09-21', null), row('v2', '2026-09-22', null)]), 'org-a')
    ).toEqual(['post-v1']);
  });
});

describe('N3: возврат и перенос тоже проверяют старт процесса', () => {
  test('возвращённая очередь не запустилась — черновик с причиной', async () => {
    const { generate, queued, derivations, options } = stand({ planMode: 'autopilot' });
    await generate();
    options.startFails = ['post-2', 'post-1'];
    // Прежняя версия возвращается в очередь, её старт тоже падает.
    await generate();
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(derivations[0].planNote).toContain('Календарь не принял');
  });

  test('перенос запланированного поста: процесс не запустился — черновик с причиной', async () => {
    const { service, generate, posts, derivations, options } = stand();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T09:00:00.000Z' }, 'ru');
    options.startFails = ['post-1'];
    const result = await service.placeAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-24T09:00:00.000Z' }, 'ru');
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(derivations[0].planNote).toContain('Календарь не принял');
    expect(result.placement).toMatchObject({ status: 'reserved', autopilot: false });
  });
});

describe('N4: пост не вернулся в черновик — прежняя очередь не возвращается', () => {
  test('громкая строка в журнале, одна очередь в базе, а не две', async () => {
    const errors = [];
    const { generate, posts, options, service } = stand({ planMode: 'autopilot' });
    service.logger.error = (message) => errors.push(String(message));
    await generate();
    options.startFails = ['post-2'];
    options.revertFails = ['post-2'];
    await generate();
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(errors.join('\n')).toContain('ALERT 97dq.57: post post-2');
    expect(errors.join('\n')).toContain('previous queue was NOT restored');
  });
});

describe('возврат очереди при параллельной постановке (re-check P1)', () => {
  test('A снял V1 и ставит V3, B тем временем ставит V2; старт V3 падает — V1 не возвращается, очередь одна', async () => {
    let service;
    let placedByB = false;
    const box = stand({
      onSync: async (id) => {
        // Между фиксацией A и его неудачным стартом B ставит V2.
        if (id !== 'post-3' || placedByB) return;
        placedByB = true;
        await service.placeAdaptation('org-a', 'piece-1', 'ad-2', { date: '2026-09-24T09:00:00.000Z' }, 'ru');
      },
    });
    service = box.service;
    const { generate, queued, channel, options, derivations } = box;
    channel.planMode = 'autopilot';
    await generate(); // V1 — в очереди автопилота
    channel.planMode = 'reserve';
    await generate(); // V2 — бронь
    channel.planMode = 'autopilot';
    options.startFails = ['post-3'];
    const third = await generate(); // A: снимает V1, ставит V3, старт падает
    expect(placedByB).toBe(true);
    expect(queued().map((post) => post.id)).toEqual(['post-2']);
    expect(derivations[0].plan).toBe('reserve');
    expect(third.plan).toMatchObject({ status: 'reserved', autopilot: false });
  });
});

/* -------------------------------------------------------------------------
 * Настройки поста (`97dq.70`): свой режим поста — сразу, режим канала — по
 * ответу «Только к новым / Ко всем N»
 * ---------------------------------------------------------------------- */

describe('свой режим поста применяется к написанному посту сразу (97dq.70)', () => {
  const save = (service, body) =>
    service.savePostSettings('org-a', 'piece-1', 'int-tg', body, 'ru');

  test('«Бронь» → «Автопилот»: пост встаёт в очередь на своё время, через проверку площадки и одну очередь', async () => {
    const { service, generate, calls, queued, derivations, tags } = stand();
    await generate();
    expect(queued()).toEqual([]);
    const result = await save(service, { planMode: 'autopilot' });
    expect(calls.validate).toHaveLength(1);
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    // Время брони остаётся за постом — 18:00 канала.
    expect(queued()[0].publishDate.toISOString()).toBe('2026-09-22T18:00:00.000Z');
    expect(derivations[0].plan).toBe('autopilot');
    expect(calls.status).toEqual([['post-1', 'schedule']]);
    expect(calls.temporalInLock).toEqual([]);
    expect(result.adaptation.plan).toMatchObject({ status: 'queued', autopilot: true });
    expect(result.settings.planMode).toBe('autopilot');
    expect(tags().postSettings['int-tg'].planMode).toBe('autopilot');
  });

  test('«Автопилот» → «Бронь»: очередь автопилота снимается обратно в бронь', async () => {
    const { service, generate, calls, queued, derivations } = stand({ planMode: 'autopilot' });
    await generate();
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    const result = await save(service, { planMode: 'reserve' });
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(calls.status).toEqual([
      ['post-1', 'schedule'],
      ['post-1', 'draft'],
    ]);
    expect(result.adaptation.plan).toMatchObject({ status: 'reserved', autopilot: false });
  });

  test('→ «Без плана»: бронь снята, остаётся черновик', async () => {
    const { service, generate, queued, derivations } = stand();
    await generate();
    const result = await save(service, { planMode: 'draft' });
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('draft');
    expect(result.adaptation.plan).toMatchObject({ status: 'draft', date: null });
  });

  test('очередь, подтверждённую человеком, режим поста не трогает', async () => {
    const { service, generate, queued } = stand();
    await generate();
    await service.scheduleAdaptation(
      'org-a',
      'piece-1',
      'ad-1',
      { date: '2026-09-23T09:00:00.000Z' },
      'ru'
    );
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    await save(service, { planMode: 'draft' });
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
  });

  test('площадка не примет — пост остаётся бронью с причиной, очереди нет (I3)', async () => {
    const { service, generate, queued, derivations } = stand({ verdict: { emptyContent: true } });
    await generate();
    await save(service, { planMode: 'autopilot' });
    expect(queued()).toEqual([]);
    expect(derivations[0].plan).toBe('reserve');
    expect(derivations[0].planNote).toBeTruthy();
  });

  test('свой режим поста решает и за новую версию: канал «Бронь», пост «Автопилот»', async () => {
    const { generate, queued } = stand({
      tags: { archive: { origin: 'MADE_HERE' }, postSettings: { 'int-tg': { planMode: 'autopilot', options: {} } } },
    });
    const adaptation = await generate();
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(adaptation.plan).toMatchObject({ status: 'queued', autopilot: true });
  });

  test('поля текста сохраняются без режима: план не трогается, чужие ключи тегов на месте', async () => {
    const { service, generate, calls, tags } = stand({ tags: { archive: { origin: 'MADE_HERE' } } });
    await generate();
    const before = calls.setPlan.length;
    const result = await save(service, { options: { length: 'short', wish: 'начни с вопроса' } });
    expect(result.adaptation).toBeNull();
    expect(calls.setPlan).toHaveLength(before);
    expect(result.settings.options).toMatchObject({ length: 'short', wish: 'начни с вопроса', emoji: 'channel' });
    expect(result.settings.textChangedAt).toBe(result.settings.savedAt);
    expect(tags().archive).toEqual({ origin: 'MADE_HERE' });
    expect(tags().postSettings['int-tg'].options.length).toBe('short');
    // «Как в канале» во всём и без режима — запись уходит, а не копится.
    await save(service, { options: { length: 'channel', wish: '' } });
    expect(tags().postSettings).toBeUndefined();
    expect(tags().archive).toEqual({ origin: 'MADE_HERE' });
  });

  test('страница заготовки отдаёт режим канала и настройки поста во вкладке', async () => {
    const { service, generate } = stand({ planMode: 'autopilot' });
    await generate();
    await save(service, { planMode: 'reserve' });
    const detail = await service.detail('org-a', 'piece-1', 'ru');
    expect(detail.channels[0]).toMatchObject({
      integrationId: 'int-tg',
      planMode: 'autopilot',
      settings: { planMode: 'reserve' },
    });
  });
});

describe('режим канала: «Только к новым» или «Ко всем N» (97dq.70)', () => {
  test('«Только к новым» — написанный пост остаётся как был; «Ко всем N» ставит его в очередь', async () => {
    const { service, generate, channel, queued, calls } = stand();
    await generate();
    channel.planMode = 'autopilot';
    const impact = await service.channelPlanImpact('org-a', 'int-tg', 'ru');
    expect(impact).toEqual({ integrationId: 'int-tg', planMode: 'autopilot', count: 1 });
    // Ответ «Только к новым» — ничего не зовётся, пост остаётся бронью.
    expect(queued()).toEqual([]);
    const applied = await service.applyChannelPlanMode('org-a', 'int-tg', 'autopilot', 'ru');
    expect(applied).toMatchObject({ count: 1, applied: 1, planMode: 'autopilot' });
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
    expect(calls.validate).toHaveLength(1);
  });

  test('пост со своим режимом не трогается ни при каком ответе', async () => {
    const { service, generate, channel, queued } = stand();
    await generate();
    await service.savePostSettings('org-a', 'piece-1', 'int-tg', { planMode: 'reserve' }, 'ru');
    channel.planMode = 'autopilot';
    expect((await service.channelPlanImpact('org-a', 'int-tg', 'ru')).count).toBe(0);
    const applied = await service.applyChannelPlanMode('org-a', 'int-tg', 'autopilot', 'ru');
    expect(applied).toMatchObject({ count: 0, applied: 0 });
    expect(queued()).toEqual([]);
  });

  test('вышедшая в канале заготовка не считается и не трогается', async () => {
    const { service, generate, channel, posts, queued } = stand();
    await generate();
    posts.get('post-1').state = 'PUBLISHED';
    channel.planMode = 'autopilot';
    expect((await service.channelPlanImpact('org-a', 'int-tg', 'ru')).count).toBe(0);
    await service.applyChannelPlanMode('org-a', 'int-tg', 'autopilot', 'ru');
    expect(queued()).toEqual([]);
  });

  test('чужой канал — отказ словами', async () => {
    const { service } = stand();
    await expect(service.channelPlanImpact('org-a', 'int-nope', 'ru')).rejects.toMatchObject({
      code: 'PIECE_CHANNEL_UNKNOWN',
    });
  });
});

/* -------------------------------------------------------------------------
 * Ревью 97dq.70: один замок, атомарные теги, ход «Ко всем N»
 * ---------------------------------------------------------------------- */

describe('ревью 97dq.70: режим поста пишется и применяется под одним замком', () => {
  const save = (service, body, integrationId = 'int-tg') =>
    service.savePostSettings('org-a', 'piece-1', integrationId, body, 'ru');
  const own = (tags, id = 'int-tg') => tags()?.postSettings?.[id]?.planMode ?? null;

  test('гонка «Автопилот» → «Бронь»: медленная проверка площадки не оставляет очередь при «Бронь» в тегах', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const box = { hold: true };
    const env = stand({
      onValidate: async () => {
        if (box.hold) await gate;
      },
    });
    await env.generate();
    // A: «Автопилот», проверка площадки висит до замка.
    const first = save(env.service, { planMode: 'autopilot' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // B: «Бронь» проходит целиком, пока A ждёт.
    box.hold = false;
    await save(env.service, { planMode: 'reserve' });
    expect(own(env.tags)).toBe('reserve');
    expect(env.queued()).toEqual([]);
    release();
    await first;
    // Кто записал последним, тот и решил: теги и пост согласованы.
    const mode = own(env.tags);
    const queuedIds = env.queued().map((post) => post.id);
    expect(mode === 'autopilot' ? queuedIds : []).toEqual(queuedIds);
    expect(mode).toBe('autopilot');
    expect(queuedIds).toEqual(['post-1']);
    expect(env.derivations[0].plan).toBe('autopilot');
  });

  test('режим решается по состоянию под замком: без проверки площадки в очередь не встаёт', async () => {
    let flip = false;
    const env = stand({
      // Прогноз до замка — «Бронь», проверки площадки нет; под замком канал
      // уже на «Автопилоте».
      onLockTags: (channel) => {
        if (flip) channel.planMode = 'autopilot';
      },
    });
    await env.generate();
    flip = true;
    const result = await save(env.service, { planMode: null });
    expect(env.calls.validate).toHaveLength(0);
    expect(env.queued()).toEqual([]);
    expect(env.derivations[0].plan).toBe('reserve');
    expect(env.derivations[0].planNote).toBeTruthy();
    expect(result.adaptation.plan.status).toBe('reserved');
  });

  test('теги пишутся только под замком и только присланными полями: параметры и режим не теряют друг друга', async () => {
    const env = stand({ tags: { archive: { origin: 'MADE_HERE' } }, extraChannels: [{ id: 'int-vk', name: 'VK', providerIdentifier: 'vk', planMode: null, postingTimes: '[]' }] });
    await env.generate();
    await Promise.all([
      save(env.service, { options: { length: 'short' } }),
      save(env.service, { planMode: 'draft' }),
      save(env.service, { options: { cta: 'none' } }, 'int-vk'),
      // Устаревший автосейв параметров после режима не возвращает режим назад.
      save(env.service, { options: { length: 'short', wish: 'коротко' } }),
    ]);
    const tags = env.tags();
    expect(tags.archive).toEqual({ origin: 'MADE_HERE' });
    expect(tags.postSettings['int-tg'].planMode).toBe('draft');
    expect(tags.postSettings['int-tg'].options).toMatchObject({ length: 'short', wish: 'коротко' });
    expect(tags.postSettings['int-vk'].options.cta).toBe('none');
    expect(tags.postSettings['int-vk'].planMode).toBeNull();
    expect(env.calls.tagLocks).toBe(4);
  });

  test('заготовка в архиве — отказ до записи', async () => {
    const env = stand({ archived: true });
    await expect(save(env.service, { planMode: 'autopilot' })).rejects.toMatchObject({
      code: 'PIECE_ARCHIVED',
    });
    expect(env.tags()).toBeNull();
  });

  test('чужой аватар — отказ, свой — сохраняется', async () => {
    const env = stand({ avatars: ['av-1'] });
    await expect(
      save(env.service, { options: { brandProfileId: 'av-other' } })
    ).rejects.toMatchObject({ code: 'PIECE_AVATAR_UNKNOWN' });
    const saved = await save(env.service, { options: { brandProfileId: 'av-1' } });
    expect(saved.settings.options.brandProfileId).toBe('av-1');
  });
});

describe('ревью 97dq.70: «Ко всем N»', () => {
  const seeded = ({ posts = [], derivations = [], ...options } = {}) => {
    const later = (hours) => new Date(NOW.getTime() + hours * 3_600_000);
    return stand({
      planMode: 'autopilot',
      posts: [
        { id: 'p1', state: 'DRAFT', publishDate: later(6), deletedAt: null, integrationId: 'int-tg' },
        { id: 'p2', state: 'DRAFT', publishDate: later(30), deletedAt: null, integrationId: 'int-tg' },
        ...posts,
      ],
      derivations: [
        { id: 'd1', contentPieceId: 'piece-1', integrationId: 'int-tg', postId: 'p1', plan: 'reserve', planNote: null, plannedAt: null, createdAt: new Date('2026-09-21T09:00:00.000Z') },
        { id: 'd2', contentPieceId: 'piece-2', integrationId: 'int-tg', postId: 'p2', plan: 'reserve', planNote: null, plannedAt: null, createdAt: new Date('2026-09-21T10:00:00.000Z') },
        ...derivations,
      ],
      ...options,
    });
  };

  test('ответ на устаревший режим — 409, ничего не тронуто', async () => {
    const env = seeded();
    const error = await env.service
      .applyChannelPlanMode('org-a', 'int-tg', 'draft', 'ru')
      .catch((caught) => caught);
    expect(error).toMatchObject({ code: 'CHANNEL_PLAN_MODE_CHANGED', status: 409 });
    expect(env.queued()).toEqual([]);
    expect(env.calls.setPlan).toEqual([]);
  });

  test('свой режим поста, поставленный посреди хода, не перезаписывается', async () => {
    let once = true;
    const env = seeded({
      onValidate: async () => {
        if (!once) return;
        once = false;
        // Человек выбрал «Бронь» у поста, пока ход проверял площадку.
        env.setTags({ postSettings: { 'int-tg': { planMode: 'reserve', options: {} } } });
      },
    });
    const result = await env.service.applyChannelPlanMode('org-a', 'int-tg', 'autopilot', 'ru');
    expect(result.count).toBe(2);
    // Теги в стенде общие для обеих заготовок: после своей правки обе — «свои».
    expect(result.applied).toBe(0);
    expect(env.queued()).toEqual([]);
  });

  test('отказ одного поста не останавливает остальные', async () => {
    const env = seeded({ draftThrows: ['d1'] });
    const result = await env.service.applyChannelPlanMode('org-a', 'int-tg', 'autopilot', 'ru');
    expect(result).toMatchObject({ count: 2, applied: 1 });
    expect(env.queued().map((post) => post.id)).toEqual(['p2']);
    expect(env.posts.get('p1').state).toBe('DRAFT');
  });

  test('счёт и ход — одно правило: очередь человека и пост уже в режиме не считаются', async () => {
    const later = (hours) => new Date(NOW.getTime() + hours * 3_600_000);
    const env = seeded({
      posts: [
        { id: 'p3', state: 'QUEUE', publishDate: later(50), deletedAt: null, integrationId: 'int-tg' },
      ],
      derivations: [
        { id: 'd3', contentPieceId: 'piece-3', integrationId: 'int-tg', postId: 'p3', plan: 'reserve', planNote: null, plannedAt: null, createdAt: new Date('2026-09-21T11:00:00.000Z') },
      ],
    });
    env.channel.planMode = 'reserve';
    // d1, d2 уже в брони, d3 поставлен человеком — менять нечего.
    expect((await env.service.channelPlanImpact('org-a', 'int-tg', 'ru')).count).toBe(0);
    env.channel.planMode = 'draft';
    expect((await env.service.channelPlanImpact('org-a', 'int-tg', 'ru')).count).toBe(2);
    const result = await env.service.applyChannelPlanMode('org-a', 'int-tg', 'draft', 'ru');
    expect(result).toMatchObject({ count: 2, applied: 2 });
    expect(env.posts.get('p3').state).toBe('QUEUE');
  });
});

describe('ревью 97dq.70: строка заготовки блокируется в транзакции замка', () => {
  test('`tags` читаются `FOR UPDATE` и пишутся тем же `tx`', async () => {
    const sql = [];
    const repository = new PieceRepository(
      {
        model: {
          $transaction: async (work) =>
            work({
              $queryRaw: async (strings, ...values) => {
                sql.push([strings.join('?'), values]);
                return strings.join('').includes('FOR UPDATE') ? [{ tags: { a: 1 } }] : [{ locked: 1 }];
              },
              contentPiece: {
                updateMany: async (input) => {
                  sql.push(['tx contentPiece.updateMany', input]);
                  return { count: 1 };
                },
              },
            }),
        },
      },
      {},
      {}
    );
    await repository.withChannelLock('org-a', 'piece-1', 'int-tg', async (db) => {
      const locked = await db.lockPieceTags('org-a', 'piece-1');
      expect(locked).toEqual({ tags: { a: 1 } });
      await db.writePieceTags('org-a', 'piece-1', { a: 1, b: 2 });
    });
    expect(sql[1][0]).toBe(
      'SELECT "tags" FROM "ContentPiece" WHERE "organizationId" = ? AND "id" = ? FOR UPDATE'
    );
    expect(sql[1][1]).toEqual(['org-a', 'piece-1']);
    expect(sql[2]).toEqual([
      'tx contentPiece.updateMany',
      { where: { organizationId: 'org-a', id: 'piece-1' }, data: { tags: { a: 1, b: 2 } } },
    ]);
  });
});

/* -------------------------------------------------------------------------
 * Ревью W1 пятнадцатого захода, F10: «как в канале» решается под замком по
 * режиму канала, который видел человек.
 * ---------------------------------------------------------------------- */

describe('«Бронь» → как в канале: сервер сверяет режим, который видел человек (97dq.86, F10)', () => {
  const save = (service, body) =>
    service.savePostSettings('org-a', 'piece-1', 'int-tg', body, 'ru');

  test('канал всё ещё тот, что на странице — пост «как в канале» (null)', async () => {
    const { service, generate, tags, queued } = stand({ planMode: 'reserve' });
    await generate();
    const saved = await save(service, { planMode: null, expectedChannelMode: 'reserve' });
    expect(saved.settings?.planMode ?? null).toBeNull();
    expect(tags().postSettings?.['int-tg']?.planMode ?? null).toBeNull();
    expect(queued()).toEqual([]);
  });

  test('канал переключили на автопилот после показа — пост держит явную «Бронь» и в очередь не встаёт', async () => {
    const { service, generate, channel, tags, queued, calls } = stand({ planMode: 'reserve' });
    await generate();
    // Другая вкладка переключила канал между показом и сохранением.
    channel.planMode = 'autopilot';
    const saved = await save(service, { planMode: null, expectedChannelMode: 'reserve' });
    expect(saved.settings.planMode).toBe('reserve');
    expect(tags().postSettings['int-tg'].planMode).toBe('reserve');
    expect(queued()).toEqual([]);
    expect(calls.validate).toHaveLength(0);
  });

  test('без увиденного режима «как в канале» остаётся прежним ходом', async () => {
    const { service, generate, channel, tags } = stand({ planMode: 'reserve' });
    await generate();
    channel.planMode = 'autopilot';
    await save(service, { planMode: null });
    expect(tags().postSettings?.['int-tg']?.planMode ?? null).toBeNull();
  });

  test('страница шлёт увиденный режим и берёт сохранённый, без своей проверки перед записью', () => {
    const adapter = loadTypeScriptModule(
      'apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts'
    );
    expect(
      adapter.buildPostSettingsPayload({ planMode: null, expectedChannelMode: 'reserve' })
    ).toEqual({ planMode: null, expectedChannelMode: 'reserve' });
    // An explicit mode needs no expectation.
    expect(
      adapter.buildPostSettingsPayload({ planMode: 'autopilot', expectedChannelMode: 'reserve' })
    ).toEqual({ planMode: 'autopilot' });
    const container = require('node:fs').readFileSync(
      require('node:path').join(
        __dirname,
        '..',
        'apps/frontend/src/components/content-intelligence/pieces/piece.container.tsx'
      ),
      'utf8'
    );
    expect(container).not.toContain('ownUnlessChannel');
    expect(container).toMatch(/expectedChannelMode: shownChannel/);
    expect(container).toMatch(/\[integrationId\]: saved\.settings!\.planMode/);
    const dto = require('node:fs').readFileSync(
      require('node:path').join(
        __dirname,
        '..',
        'libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts'
      ),
      'utf8'
    );
    expect(dto).toMatch(/@IsIn\(\['draft', 'reserve', 'autopilot'\]\)\s*expectedChannelMode\?/);
  });
});

/* -------------------------------------------------------------------------
 * «Удалять при подтверждении» (`2q28.39`, решение владельца 26.09.2026)
 * ---------------------------------------------------------------------- */

describe('«Удалять при подтверждении»: черновики других версий уходят из календаря (2q28.39)', () => {
  const SLOT = '2026-09-22T18:00:00.000Z';
  const variantRow = (id, postId, overrides = {}) => ({
    id,
    contentPieceId: 'piece-1',
    integrationId: 'int-tg',
    postId,
    plan: null,
    planNote: null,
    plannedAt: null,
    createdAt: new Date('2026-09-20T09:00:00.000Z'),
    ...overrides,
  });
  const postRow = (id, state, overrides = {}) => ({
    id,
    state,
    publishDate: new Date('2026-09-21T09:00:00.000Z'),
    deletedAt: null,
    integrationId: 'int-tg',
    ...overrides,
  });

  test('«Подтвердить» второй версии удаляет черновик первой мягко; текст «Варианта 1» остаётся', async () => {
    const { service, generate, posts, derivations, queued } = stand();
    await generate();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    expect(queued().map((post) => post.id)).toEqual(['post-2']);
    expect(posts.get('post-1').state).toBe('DRAFT');
    expect(posts.get('post-1').deletedAt).toBeInstanceOf(Date);
    // Строка версии не удаляется: «Вариант 1» по-прежнему на заготовке.
    expect(derivations.map((row) => [row.id, row.postId])).toEqual([
      ['ad-1', 'post-1'],
      ['ad-2', 'post-2'],
    ]);
    const detail = await service.detail('org-a', 'piece-1', 'ru');
    expect(detail.adaptations.map((one) => [one.id, one.body])).toEqual([
      ['ad-1', 'Текст.'],
      ['ad-2', 'Текст.'],
    ]);
    // Пост другого канала не тронут.
    expect(posts.get('other').deletedAt).toBeNull();
  });

  test('потом «Запланировать» первой версии: тот же пост возвращается и встаёт в очередь, вторая уходит', async () => {
    const { service, generate, posts, queued } = stand();
    await generate();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    const result = await service.scheduleAdaptation(
      'org-a',
      'piece-1',
      'ad-1',
      { date: '2026-09-23T09:00:00.000Z' },
      'ru'
    );
    expect(result.adaptation.state).toBe('queued');
    expect(posts.get('post-1')).toMatchObject({ state: 'QUEUE', deletedAt: null });
    expect(posts.get('post-1').publishDate.toISOString()).toBe('2026-09-23T09:00:00.000Z');
    // Вторая снята с очереди человеком и, став черновиком, тоже ушла.
    expect(posts.get('post-2').state).toBe('DRAFT');
    expect(posts.get('post-2').deletedAt).toBeInstanceOf(Date);
    expect(queued().map((post) => post.id)).toEqual(['post-1']);
  });

  test('вышедшее, ошибка, чужая заготовка и чужой канал не трогаются — только живые черновики', async () => {
    const { service, generate, posts } = stand({
      posts: [
        postRow('post-pub', 'PUBLISHED'),
        postRow('post-err', 'ERROR'),
        postRow('post-other-piece', 'DRAFT'),
        postRow('post-vk', 'DRAFT', { integrationId: 'int-vk' }),
      ],
      derivations: [
        variantRow('ad-pub', 'post-pub'),
        variantRow('ad-err', 'post-err'),
        variantRow('ad-other-piece', 'post-other-piece', { contentPieceId: 'piece-2' }),
        variantRow('ad-vk', 'post-vk', { integrationId: 'int-vk' }),
      ],
    });
    await generate(); // ad-5 / post-1
    await generate(); // ad-6 / post-2
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-6', { date: SLOT }, 'ru');
    expect(posts.get('post-1').deletedAt).toBeInstanceOf(Date);
    for (const id of ['post-pub', 'post-err', 'post-other-piece', 'post-vk', 'post-2', 'other'])
      expect([id, posts.get(id).deletedAt]).toEqual([id, null]);
    expect(posts.get('post-pub').state).toBe('PUBLISHED');
    expect(posts.get('post-err').state).toBe('ERROR');
  });

  test('«Без плана»: слота нет, черновики видны — ничего не удаляется', async () => {
    const { service, generate, posts, calls } = stand({ planMode: 'draft' });
    await generate();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    expect(posts.get('post-2').state).toBe('QUEUE');
    expect(posts.get('post-1').deletedAt).toBeNull();
    expect(calls.dropped).toBeUndefined();
  });

  test('процесс публикации не запустился — подтверждения нет, и ничего не удалено', async () => {
    const { service, generate, posts, options } = stand();
    await generate();
    await generate();
    options.startFails = ['post-2'];
    await expect(
      service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_SCHEDULE_UNAVAILABLE' });
    expect(posts.get('post-1').deletedAt).toBeNull();
    expect(posts.get('post-2').state).toBe('DRAFT');
  });

  test('площадка не приняла удалённую версию — пост не оживает', async () => {
    const { service, generate, posts, options } = stand();
    await generate();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    options.verdict = { valid: false, emptyContent: true };
    await expect(
      service.scheduleAdaptation('org-a', 'piece-1', 'ad-1', { date: '2026-09-23T09:00:00.000Z' }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_SCHEDULE_INVALID' });
    expect(posts.get('post-1').deletedAt).toBeInstanceOf(Date);
    expect(posts.get('post-2').state).toBe('QUEUE');
  });

  test('хранилище без удаления — подтверждение работает как раньше', async () => {
    const { service, generate, posts } = stand({ noDrop: true });
    await generate();
    await generate();
    await service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    expect(posts.get('post-2').state).toBe('QUEUE');
    expect(posts.get('post-1').deletedAt).toBeNull();
  });

  test('репозиторий: удаление группой, как `deletePost`, но только живые черновики этого канала этой области; возврат — ровно того же удара', async () => {
    const calls = [];
    const deletedAt = new Date('2026-09-26T10:00:00.000Z');
    const repository = new PieceRepository(
      {
        model: {
          $transaction: async (work) =>
            work({
              $queryRaw: async () => [{ locked: 1 }],
              post: {
                findMany: async (input) => {
                  calls.push(['findMany', input]);
                  return [{ group: 'g-1' }, { group: 'g-1' }];
                },
                findFirst: async (input) => {
                  calls.push(['findFirst', input]);
                  return { group: 'g-1', integrationId: 'int-tg', deletedAt };
                },
                updateMany: async (input) => {
                  calls.push(['updateMany', input]);
                  return { count: 2 };
                },
              },
            }),
        },
      },
      {},
      {}
    );
    await repository.withChannelLock('org-a', 'piece-1', 'int-tg', async (db) => {
      expect(await db.dropDraftPosts('org-a', 'int-tg', [])).toBe(0);
      expect(await db.dropDraftPosts('org-a', 'int-tg', ['post-1', 'post-1'])).toBe(2);
      expect(await db.restoreDraftPost('org-a', 'post-1')).toBe(true);
    });
    expect(calls[0]).toEqual([
      'findMany',
      {
        where: { organizationId: 'org-a', integrationId: 'int-tg', id: { in: ['post-1'] }, deletedAt: null, state: 'DRAFT' },
        select: { group: true },
      },
    ]);
    expect(calls[1][0]).toBe('updateMany');
    expect(calls[1][1].where).toEqual({
      organizationId: 'org-a',
      integrationId: 'int-tg',
      group: { in: ['g-1'] },
      deletedAt: null,
      state: 'DRAFT',
    });
    expect(calls[1][1].data.deletedAt).toBeInstanceOf(Date);
    expect(calls[2]).toEqual([
      'findFirst',
      {
        where: { organizationId: 'org-a', id: 'post-1', state: 'DRAFT', deletedAt: { not: null } },
        select: { group: true, integrationId: true, deletedAt: true },
      },
    ]);
    expect(calls[3]).toEqual([
      'updateMany',
      {
        where: { organizationId: 'org-a', integrationId: 'int-tg', group: 'g-1', state: 'DRAFT', deletedAt },
        data: { deletedAt: null },
      },
    ]);
  });
});

describe('действия над «Вариантом 1» после уборки возвращают его черновик (2q28.39)', () => {
  const SLOT = '2026-09-22T18:00:00.000Z';
  const confirmSecond = async (setup = {}) => {
    const one = stand(setup);
    await one.generate();
    await one.generate();
    await one.service.scheduleAdaptation('org-a', 'piece-1', 'ad-2', { date: SLOT }, 'ru');
    expect(one.posts.get('post-1').deletedAt).toBeInstanceOf(Date);
    return one;
  };

  test('правка текста удалённой уборкой версии: пост снова черновик, правка сохранена, очередь не тронута', async () => {
    const { service, posts, calls } = await confirmSecond();
    const queuedBefore = { ...posts.get('post-2') };
    const result = await service.editAdaptation(
      'org-a',
      'piece-1',
      'ad-1',
      { body: 'Новый текст первой версии.' },
      'ru'
    );
    expect(posts.get('post-1')).toMatchObject({ state: 'DRAFT', deletedAt: null });
    expect(calls.edits).toEqual([['ad-1', 'post-1', 'Новый текст первой версии.']]);
    expect(result).toBeTruthy();
    expect(posts.get('post-2')).toEqual(queuedBefore);
    expect(posts.get('post-2').state).toBe('QUEUE');
  });

  test('черновик, удалённый не уборкой (подтверждённой соседней версии нет), не возвращается', async () => {
    const { service, posts, generate } = stand();
    await generate();
    posts.get('post-1').deletedAt = new Date(NOW);
    await expect(
      service.editAdaptation('org-a', 'piece-1', 'ad-1', { body: 'Текст.' }, 'ru')
    ).rejects.toMatchObject({ code: 'ADAPTATION_POST_GONE' });
    expect(posts.get('post-1').deletedAt).toBeInstanceOf(Date);
  });

  test('«Поставить на …» удалённой уборкой версии идёт от вернувшегося черновика', async () => {
    const { service, posts } = await confirmSecond();
    await service.placeAdaptation(
      'org-a',
      'piece-1',
      'ad-1',
      { date: '2026-09-24T09:00:00.000Z' },
      'ru'
    );
    expect(posts.get('post-1')).toMatchObject({ state: 'DRAFT', deletedAt: null });
    expect(posts.get('post-1').publishDate.toISOString()).toBe('2026-09-24T09:00:00.000Z');
    expect(posts.get('post-2').state).toBe('QUEUE');
  });

  test('каждое чтение поста версии для действия идёт через один помощник', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(
        __dirname,
        '../libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts'
      ),
      'utf8'
    );
    // «Убрать следы», «Проверить факты», «Переписать» и их «Принять».
    const reviewReads = source.match(/this\.pieces\.reviewDraft\(/g) || [];
    const routedReviews = source.match(/liveVariantRead\([^)]*\) =>\s*this\.pieces\.reviewDraft\(/g) || [];
    expect(reviewReads.length).toBe(2);
    expect(routedReviews.length).toBe(reviewReads.length);
    // Правка и «Поставить на …».
    const routedDrafts = source.match(/liveVariantRead\([^)]*\) =>\s*this\.pieces\.workspaceDraft\(/g) || [];
    expect(routedDrafts.length).toBe(2);
  });
});
