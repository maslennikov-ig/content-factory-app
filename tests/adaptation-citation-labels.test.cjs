'use strict';

/**
 * Метки источников не доходят до текста (`content-factory-next-97dq.40`).
 *
 * Десятый заход 22.09.2026: черновик адаптации Telegram (ContentDerivation
 * `2a6dccce…`, заготовка `bacaa33d…`) закончил два абзаца «[E2]» и «[E5]».
 * Метки — адреса строк блока материала `renderContext` генератора; правило
 * блока велело каждому числу «carry its id», и модель дописала адрес в текст.
 *
 * Здесь судится обе стороны:
 *
 *  - промпт генератора больше не просит нести метку и прямо запрещает её в
 *    тексте, а адреса называет полем `usedCitationIds`;
 *  - снятие детерминированное и узкое: метки нашей грамматики уходят из тела
 *    сути, адаптации, находок ресерча и строк брифа, а скобки человека
 *    остаются байт в байт;
 *  - разовая команда для уже записанных черновиков ничего не пишет без
 *    `--apply`, не трогает правленное руками и второй раз работы не находит.
 *
 * Модели здесь нет ни одной, сети и базы — тоже.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');

const QUALITY =
  'libraries/nestjs-libraries/src/content-intelligence/text-quality/citation-labels.ts';
const { stripCitationLabels, hasCitationLabels } =
  loadTypeScriptModule(QUALITY);

/** Тело черновика с боевой базы, строка `2a6dccce…`, дословно. */
const PRODUCTION_BODY =
  'После очередного изменения условий у продавца есть 45 дней, чтобы пересчитать SKU, цены, рекламные бюджеты и остатки — Wildberries увеличил срок уведомления о существенных изменениях оферты с 7 до 45 дней. [E2]\n\nНо пересчёт — это реакция, а не стратегия. **Маркетплейс не должен быть единственным каналом продаж.**\n\nТекущий трафик можно использовать как подъём для своего бренда: развивать интернет-магазин, розницу и опт, выходить на большее количество стран и платформ. Баллы и купоны можно направлять на покупки уже на основном сайте — разумеется, с учётом правил площадок.\n\nOzon и Wildberries объясняют рост комиссий логистикой и скидками покупателям, но для бизнеса результат один: часть маржи снова забирают условия платформ. По данным CNews, комиссии Ozon за год выросли в среднем с 18,6% до 47,8% базовой стоимости товара, а Wildberries — с 31,9% до 42,7%. [E5]\n\nПоэтому я бы не тратил каждый квартал силы на спор с маркетплейсом: сначала пересчитал бы юнит-экономику, затем использовал площадку как рекламу собственного бренда.\n\nКакой собственный канал вы развиваете уже сейчас?';

const CLEAN_BODY = PRODUCTION_BODY.replace(' [E2]', '').replace(' [E5]', '');

describe('снятие меток: грамматика наших промптов и ничего больше', () => {
  test('боевое тело теряет обе метки, а всё остальное остаётся байт в байт', () => {
    expect(hasCitationLabels(PRODUCTION_BODY)).toBe(true);
    const clean = stripCitationLabels(PRODUCTION_BODY);
    expect(clean).toBe(CLEAN_BODY);
    expect(clean).not.toMatch(/\[E\d\]/);
    expect(clean.split('\n\n')).toHaveLength(6);
    expect(clean).toContain('с 7 до 45 дней.\n\nНо пересчёт');
    expect(clean).toContain('с 31,9% до 42,7%.\n\nПоэтому');
    expect(clean).toContain('**Маркетплейс не должен быть единственным каналом продаж.**');
  });

  test.each([
    ['с 7 [E2] до 45', 'с 7 до 45'],
    ['до 45 дней [E2].', 'до 45 дней.'],
    ['до 45 дней[E2].', 'до 45 дней.'],
    ['**важно [E2]**', '**важно**'],
    ['[F1] Начало абзаца', 'Начало абзаца'],
    ['рост [E2][E5], и всё', 'рост, и всё'],
    ['рост [E2] [E5] — и всё', 'рост — и всё'],
    ['рост [E2, F1] выше', 'рост выше'],
    ['рост [E2; E5] выше', 'рост выше'],
    ['рост [E:clx9a8b7c6d5e4f] выше', 'рост выше'],
    ['рост [F:6f1c2e0a-7b1d-4a53-9a1e-3c2b1a0f9e8d] выше', 'рост выше'],
    ['рост [C:own:0123456789abcdef] выше', 'рост выше'],
    ['a\n\n[E2]\n\nb', 'a\n\nb'],
    ['[E2]\n\nb', 'b'],
    ['a\n\n[E5]', 'a'],
    ['a [E2]\r\n\r\nb', 'a\r\n\r\nb'],
  ])('%j → %j', (input, expected) => {
    expect(stripCitationLabels(input)).toBe(expected);
  });

  test.each([
    '[17.09.2026 5:13] Дарья: Игорь, добрый день!',
    'Сноска [1] и сноска [12]',
    '[сарказм] конечно',
    'регистр другой: [e2] и [f:abc]',
    'ссылка Markdown [E2](https://example.test) и определение [E2]: https://example.test',
    'номер ноль не наш: [E0]',
    'пробел внутри не наш: [ E2 ] и [E 2]',
    'Отдел E2 и статья F1 без скобок',
    '',
  ])('слово человека не трогается: %j', (input) => {
    expect(hasCitationLabels(input)).toBe(false);
    expect(stripCitationLabels(input)).toBe(input);
  });

  test('пустое значение возвращается как есть', () => {
    expect(stripCitationLabels(null)).toBeNull();
    expect(stripCitationLabels(undefined)).toBeUndefined();
  });
});

describe('промпт генератора не просит метку в тексте', () => {
  const context = {
    facts: [
      {
        citationId: 'F1',
        statement: 'Срок уведомления вырос с 7 до 45 дней',
        temporalKind: 'CURRENT',
        freshUntil: '2026-12-01T00:00:00.000Z',
        evidenceCitationIds: ['E2'],
      },
    ],
    evidence: [
      {
        citationId: 'E2',
        title: 'Оферта',
        excerpt: 'Срок уведомления — 45 дней',
        url: 'https://example.test/offer',
        retrievedAt: '2026-09-22T00:00:00.000Z',
        publishedAt: '2026-09-20T00:00:00.000Z',
        provenance: 'CONFIRMED',
      },
    ],
  };

  test('адрес — в usedCitationIds, метка в тексте запрещена прямо', () => {
    const text = loadAgentGraph({ chatModel: {} }).service.renderContext(context);
    expect(text).not.toContain('carry its id');
    expect(text).toContain('List the ids you used in usedCitationIds only.');
    expect(text).toContain(
      'Never write an id or a bracketed label such as [E1] or [F1] inside the post text'
    );
  });
});

describe('суть: метка из ответа модели не доходит до человека', () => {
  const answers = [];
  const { writeCore } = loadWithMocks(
    'libraries/nestjs-libraries/src/content-intelligence/pieces/core-write.ts',
    {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getChatModel: async () => ({
          withStructuredOutput: () => ({
            invoke: async () => answers.shift(),
          }),
        }),
      },
    }
  );

  test('writeCore снимает метки с текста модели', async () => {
    answers.push({
      text: 'Wildberries увеличил срок уведомления с 7 до 45 дней. [E:ev-offer]\n\nЭто повод пересчитать экономику [E2].',
    });
    const core = await writeCore(
      {
        organizationId: 'org-a',
        language: 'ru',
        brief: {
          thesis: 'Маркетплейс не должен быть единственным каналом',
          position: null,
          disagreement: null,
          audience: null,
          goal: null,
          format: null,
          facts: [],
        },
        answers: [],
        questionTextByKey: {},
        personText: 'Маркетплейс не должен быть единственным каналом',
        borrowed: null,
        foreignShingles: [],
      },
      {
        aiUsage: { executeAiOperation: async (_org, _op, run) => run() },
        slopCheck: null,
      }
    );
    expect(core.writtenBy).toBe('model');
    expect(core.text).toBe(
      'Wildberries увеличил срок уведомления с 7 до 45 дней.\n\nЭто повод пересчитать экономику.'
    );
  });
});

describe('находки ресерча: утверждение без адреса промпта', () => {
  const { settleResearchDigest } = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/intake/research-digest.ts',
    {
      '@contentfactory/nestjs-libraries/dtos/content.language': {
        contentLanguageNames: { ru: 'Russian', en: 'English' },
      },
    }
  );
  const source = {
    evidenceId: 'ev-cnews',
    url: 'https://example.test/cnews',
    title: 'Комиссии маркетплейсов',
    excerpt:
      'Комиссии Ozon за год выросли в среднем с 18,6% до 47,8% базовой стоимости товара.',
    text: null,
  };

  test('метка [E:…] в утверждении и в заметке снимается, цитата остаётся дословной', () => {
    const settled = settleResearchDigest(
      {
        verdicts: [
          {
            claimKey: '[C:own:a]',
            verdict: 'confirmed',
            evidenceId: '[E:ev-cnews]',
            quote: 'Комиссии Ozon за год выросли в среднем с 18,6% до 47,8%',
            original: null,
            replacement: null,
            note: 'Источник подтверждает рост [E:ev-cnews].',
          },
        ],
        findings: [
          {
            evidenceId: 'ev-cnews',
            statement: 'Комиссии Ozon выросли с 18,6% до 47,8% [E:ev-cnews]',
            quote: 'Комиссии Ozon за год выросли в среднем с 18,6% до 47,8%',
          },
        ],
      },
      {
        claims: [
          { key: 'own:a', statement: 'Комиссии Ozon выросли почти втрое', own: true },
        ],
        sources: [source],
        level: 'standard',
      }
    );
    expect(settled.findings).toHaveLength(1);
    expect(settled.findings[0].statement).toBe(
      'Комиссии Ozon выросли с 18,6% до 47,8%'
    );
    expect(settled.verdicts[0].status).toBe('confirmed');
    expect(settled.verdicts[0].note).toBe('Источник подтверждает рост.');
  });
});

/* -------------------------------------------------------------------------
 * Разовая команда для записанных черновиков
 * ---------------------------------------------------------------------- */

const { StripAdaptationCitationLabels } = loadWithMocks(
  'apps/commands/src/tasks/strip.adaptation.citation.labels.ts',
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

const EDITORS = { telegram: 'html', discord: 'markdown', x: 'normal' };

/**
 * Поддельная база: строки адаптаций и постов, учёт запросов и транзакция,
 * которая откатывает обе записи, если вторая не нашла свою строку.
 */
const stand = (rows) => {
  const posts = new Map(
    rows.map((row) => [row.post.id, { ...row.post, state: row.state ?? 'DRAFT' }])
  );
  const bodies = new Map(rows.map((row) => [row.id, row.body]));
  const queries = [];
  const writes = [];
  const updateMany = {
    post: async (args) => {
      const post = posts.get(args.where.id);
      const owner = rows.find((row) => row.post.id === args.where.id);
      if (
        !post ||
        owner.organizationId !== args.where.organizationId ||
        post.state !== args.where.state ||
        post.content !== args.where.content
      )
        return { count: 0 };
      post.content = args.data.content;
      return { count: 1 };
    },
    contentDerivation: async (args) => {
      const row = rows.find((item) => item.id === args.where.id);
      if (
        !row ||
        row.organizationId !== args.where.organizationId ||
        bodies.get(row.id) !== args.where.body ||
        row.moveBodyBeforeWrite
      )
        return { count: 0 };
      bodies.set(row.id, args.data.body);
      return { count: 1 };
    },
  };
  const client = {
    organization: { findMany: async () => [{ id: 'org-a' }, { id: 'org-b' }] },
    contentDerivation: {
      findMany: async (args) => {
        queries.push(args);
        return rows
          .filter(
            (row) =>
              row.organizationId === args.where.organizationId &&
              posts.get(row.post.id).state === 'DRAFT'
          )
          .map((row) => ({
            id: row.id,
            body: bodies.get(row.id),
            post: {
              id: row.post.id,
              content: posts.get(row.post.id).content,
              integration: { providerIdentifier: row.post.provider },
            },
          }));
      },
    },
    $transaction: async (run) => {
      const snapshot = {
        posts: new Map([...posts].map(([id, post]) => [id, { ...post }])),
        bodies: new Map(bodies),
      };
      try {
        return await run({
          post: {
            updateMany: async (args) => {
              writes.push(['post', args]);
              return updateMany.post(args);
            },
          },
          contentDerivation: {
            updateMany: async (args) => {
              writes.push(['contentDerivation', args]);
              return updateMany.contentDerivation(args);
            },
          },
        });
      } catch (error) {
        posts.clear();
        for (const [id, post] of snapshot.posts) posts.set(id, post);
        bodies.clear();
        for (const [id, body] of snapshot.bodies) bodies.set(id, body);
        throw error;
      }
    },
  };
  const task = new StripAdaptationCitationLabels(
    { model: client },
    { getSocialIntegration: (identifier) => ({ editor: EDITORS[identifier] }) }
  );
  task._logger = { log: () => undefined };
  return { task, posts, bodies, queries, writes };
};

const draft = (overrides = {}) => ({
  id: 'derivation-1',
  organizationId: 'org-a',
  body: PRODUCTION_BODY,
  ...overrides,
  post: {
    id: 'post-1',
    provider: 'telegram',
    content: editorHtml(PRODUCTION_BODY, 'html'),
    ...(overrides.post || {}),
  },
});

describe('adaptations:strip-citation-labels', () => {
  test('без --apply не пишется ничего, а счёт называется', async () => {
    const { task, posts, bodies, writes } = stand([draft()]);
    const result = await task.strip(false, false);
    expect(result).toEqual({ seen: 1, planned: 1, rewritten: 0, skipped: 0 });
    expect(writes).toEqual([]);
    expect(bodies.get('derivation-1')).toBe(PRODUCTION_BODY);
    expect(posts.get('post-1').content).toBe(editorHtml(PRODUCTION_BODY, 'html'));
  });

  test('--dry-run сильнее --apply', async () => {
    const { task, writes } = stand([draft()]);
    const result = await task.strip(true, true);
    expect(result.rewritten).toBe(0);
    expect(writes).toEqual([]);
  });

  test('с --apply тело и пост теряют метки вместе, второй прогон работы не находит', async () => {
    const { task, posts, bodies } = stand([draft()]);
    const first = await task.strip(true, false);
    expect(first).toEqual({ seen: 1, planned: 1, rewritten: 1, skipped: 0 });
    expect(bodies.get('derivation-1')).toBe(CLEAN_BODY);
    expect(posts.get('post-1').content).toBe(editorHtml(CLEAN_BODY, 'html'));
    expect(posts.get('post-1').content).not.toMatch(/\[E\d\]/);
    expect(posts.get('post-1').content).toContain('<strong>');

    const second = await task.strip(true, false);
    expect(second).toEqual({ seen: 0, planned: 0, rewritten: 0, skipped: 0 });
  });

  test('пост, правленный руками, не трогается и называется', async () => {
    const edited = `${editorHtml(PRODUCTION_BODY, 'html')}<p>Своё дописал.</p>`;
    const { task, posts, bodies, writes } = stand([
      draft({ post: { content: edited } }),
    ]);
    const result = await task.strip(true, false);
    expect(result).toEqual({ seen: 1, planned: 0, rewritten: 0, skipped: 1 });
    expect(writes).toEqual([]);
    expect(posts.get('post-1').content).toBe(edited);
    expect(bodies.get('derivation-1')).toBe(PRODUCTION_BODY);
  });

  test('тело без меток и вышедший пост не читаются как работа', async () => {
    const { task, writes } = stand([
      draft({ id: 'derivation-2', body: CLEAN_BODY, post: { id: 'post-2', content: editorHtml(CLEAN_BODY, 'html') } }),
      draft({ id: 'derivation-3', state: 'PUBLISHED', post: { id: 'post-3' } }),
    ]);
    const result = await task.strip(true, false);
    expect(result).toEqual({ seen: 0, planned: 0, rewritten: 0, skipped: 0 });
    expect(writes).toEqual([]);
  });

  test('строка, тронутая между чтением и записью, откатывает обе записи', async () => {
    const { task, posts, bodies } = stand([draft({ moveBodyBeforeWrite: true })]);
    const result = await task.strip(true, false);
    expect(result).toEqual({ seen: 1, planned: 1, rewritten: 0, skipped: 1 });
    expect(posts.get('post-1').content).toBe(editorHtml(PRODUCTION_BODY, 'html'));
    expect(bodies.get('derivation-1')).toBe(PRODUCTION_BODY);
  });

  test('каждый запрос называет свою область', async () => {
    const { task, queries } = stand([draft()]);
    await task.strip(false, false);
    expect(queries.map((query) => query.where.organizationId)).toEqual([
      'org-a',
      'org-b',
    ]);
    for (const query of queries) {
      expect(query.where.post.is).toEqual({
        organizationId: query.where.organizationId,
        state: 'DRAFT',
        deletedAt: null,
      });
    }
  });
});
