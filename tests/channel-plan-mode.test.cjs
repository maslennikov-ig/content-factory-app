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
    const repository = new PieceRepository(
      {
        model: {
          contentDerivation: {
            findMany: async (input) => {
              if (input.select && input.select.plannedAt) return derivationRows;
              query = input;
              return [];
            },
          },
        },
      },
      {},
      {}
    );
    await repository.listReadyAdaptations('org-a', 10);
    expect(query.where.post.is.id).toEqual({ notIn: ['post-v1'] });
    expect(query.where.post.is.state).toEqual({ in: ['DRAFT', 'QUEUE'] });
    expect(query.select.post.select).toMatchObject({ state: true, publishDate: true });
    expect(query.select).toMatchObject({ plan: true, planNote: true });
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

  const repository = {
    getPiece: async (org) => (org === 'org-a' ? pieceRow() : null),
    listPieceIds: async () => [{ id: 'piece-1' }],
    listIntegrations: async () => [channel],
    findAvatar: async () => null,
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

  return { service, calls, posts, derivations, generate, queued, at, channel, options };
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
      service.placeAdaptation('org-a', 'piece-1', 'ad-1', { date: SLOT }, 'ru')
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
