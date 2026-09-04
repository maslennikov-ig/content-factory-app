'use strict';

/**
 * The brief gate and the topic radar, as routes.
 *
 * Three rules are worth a test each, and they are the three the feature exists
 * for. A brief that is missing something returns the missing question and no
 * draft — a model asked to write about nothing writes fluently and says
 * nothing, and nobody notices until it is published. A fact without somewhere
 * it came from is not a fact, and an id that belongs to no fact in *this*
 * workspace is worse than no id at all. And "нечего написать" arrives in
 * words: an empty list of topics with no sentence beside it reads as a broken
 * radar rather than as an honest answer.
 *
 * Everything here runs on doubles. The fact memory, the posts and the channels
 * are read through the same repositories the product uses, with a fake Prisma
 * client underneath, so the tenant scope of every query is visible to the
 * assertions at the bottom.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const BRIEF_DIR = 'libraries/nestjs-libraries/src/content-intelligence/brief';
const CONTEXT_DIR = 'libraries/nestjs-libraries/src/content-intelligence/context';
const VOICE_DIR = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const PROFILE_DIR =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';
const MATERIALS_DIR =
  'libraries/nestjs-libraries/src/content-intelligence/materials';
const DTO = 'libraries/nestjs-libraries/src/dtos/content-intelligence/content-brief.dto.ts';
const CONTROLLER = 'apps/backend/src/api/routes/content-brief.controller.ts';

const sources = {
  './content-brief.errors': `${BRIEF_DIR}/content-brief.errors.ts`,
  './content-brief.repository': `${BRIEF_DIR}/content-brief.repository.ts`,
  './content-brief.radar': `${BRIEF_DIR}/content-brief.radar.ts`,
  // `content-fact.service.ts` reuses the radar's own `claimKey` split for
  // the witness screen's topic filter (`content-factory-next-odb8.1`)
  // rather than a second parser, and reaches it by the alias, not a
  // relative import.
  '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.radar': `${BRIEF_DIR}/content-brief.radar.ts`,
  './content-brief.compose': `${BRIEF_DIR}/content-brief.compose.ts`,
  './content-fact.repository': `${CONTEXT_DIR}/content-fact.repository.ts`,
  './content-context.errors': `${CONTEXT_DIR}/content-context.errors.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brief-gate': `${VOICE_DIR}/brief-gate.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.service': `${CONTEXT_DIR}/content-fact.service.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-fact.repository': `${CONTEXT_DIR}/content-fact.repository.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.service': `${BRIEF_DIR}/content-brief.service.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation': `${MATERIALS_DIR}/material-presentation.ts`,
  // What `materialFormat` counts a long piece with.
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut': `${VOICE_DIR}/recut.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/text-truncate': `${VOICE_DIR}/text-truncate.ts`,
  './segment': `${VOICE_DIR}/segment.ts`,
  './locale-pack.ru': `${VOICE_DIR}/locale-pack.ru.ts`,
  '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-brief.dto': DTO,
  // Which avatar a space means when it does not say. Real rather than mocked:
  // a stub sort order would let the brief read a different avatar than the
  // voice screens do, and the two would disagree about who wrote a draft.
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types': `${PROFILE_DIR}/brand-profile.types.ts`,
};

const noopDecorator = () => () => undefined;

const mocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository': {
    PostsRepository: class PostsRepository {},
  },
  '@nestjs/swagger': { ApiTags: noopDecorator },
  '@contentfactory/nestjs-libraries/user/org.from.request': {
    GetOrgFromRequest: noopDecorator,
  },
  '@contentfactory/nestjs-libraries/user/user.from.request': {
    GetUserFromRequest: noopDecorator,
  },
  '@contentfactory/backend/services/auth/permissions/permissions.ability': {
    CheckPolicies: noopDecorator,
  },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class':
    {
      AuthorizationActions: {
        Create: 'create',
        Read: 'read',
        Update: 'update',
        Delete: 'delete',
      },
      Sections: { POSTS_PER_MONTH: 'posts_per_month', ADMIN: 'admin' },
    },
};

const load = (relativePath) => loadTypeScriptModule(relativePath, mocks, { sources });

const { ContentBriefService } = load(`${BRIEF_DIR}/content-brief.service.ts`);
const { ContentBriefRepository } = load(`${BRIEF_DIR}/content-brief.repository.ts`);
const { ContentFactRepository } = load(`${CONTEXT_DIR}/content-fact.repository.ts`);
const { ContentFactService } = load(`${CONTEXT_DIR}/content-fact.service.ts`);
const { ContentBriefController } = load(CONTROLLER);
const contract = load(`${VOICE_DIR}/voice-wiring.contract.ts`);

const ORG = 'org-1';
const OTHER_ORG = 'org-other';
const NOW = new Date('2026-08-22T12:00:00.000Z');

const fact = (over = {}) => ({
  id: 'fact-1',
  organizationId: ORG,
  claimKey: 'склад|остатки',
  statement: 'Остатки на складе видны в реальном времени.',
  language: 'ru',
  temporalKind: 'CURRENT',
  freshUntil: new Date('2026-09-01T00:00:00.000Z'),
  status: 'VERIFIED',
  evidenceLinks: [],
  ...over,
});

/**
 * A Prisma stand-in that answers only what these routes ask, and records every
 * `where` it was asked with. The tenant assertions at the bottom read that log.
 */
function prismaDouble({
  facts = [],
  posts = [],
  channels = [],
  profiles = [],
  failFacts = false,
}) {
  const calls = [];
  const pieces = [];
  const derivations = [];
  const scoped = (rows, where) =>
    rows.filter((row) => row.organizationId === where.organizationId);

  return {
    calls,
    pieces,
    derivations,
    model: {
      contentFact: {
        findMany: async (args) => {
          calls.push({ query: 'contentFact.findMany', where: args.where });
          if (failFacts) throw new Error('fact memory is unavailable');
          const ids = args.where?.id?.in;
          return scoped(facts, args.where).filter(
            (row) =>
              (!ids || ids.includes(row.id)) &&
              (!args.where?.status?.not || row.status !== args.where.status.not)
          );
        },
      },
      // `content-factory-next-odb8.1`: `ContentFactRepository.listFacts`
      // resolves each fact's author name for the «ваше слово» card with a
      // second query, since `ContentFact.createdByUserId` carries no Prisma
      // relation. Empty is a legitimate answer here — this suite's facts
      // are not read back through `listFacts`'s own shaping — but the query
      // itself must not throw.
      user: {
        findMany: async (args) => {
          calls.push({ query: 'user.findMany', where: args.where });
          return [];
        },
      },
      post: {
        findMany: async (args) => {
          calls.push({ query: 'post.findMany', where: args.where });
          return scoped(posts, args.where).filter(
            (row) => !args.where.state || row.state === args.where.state
          );
        },
      },
      integration: {
        findMany: async (args) => {
          calls.push({ query: 'integration.findMany', where: args.where });
          return scoped(channels, args.where);
        },
      },
      projectBrandProfile: {
        findFirst: async (args) => {
          calls.push({ query: 'projectBrandProfile.findFirst', where: args.where });
          return scoped(profiles, args.where)[0] ?? null;
        },
      },
      contentPiece: {
        create: async (args) => {
          const row = { id: `piece-${pieces.length + 1}`, ...args.data };
          pieces.push(row);
          return row;
        },
      },
      contentDerivation: {
        create: async (args) => {
          const row = { id: `derivation-${derivations.length + 1}`, ...args.data };
          derivations.push(row);
          return row;
        },
      },
      // The library write is one transaction: a piece with no derivation would
      // claim in the library to have produced nothing.
      $transaction: async (run) => run({
        contentPiece: {
          create: async (args) => {
            const row = { id: `piece-${pieces.length + 1}`, ...args.data };
            pieces.push(row);
            return row;
          },
        },
        contentDerivation: {
          create: async (args) => {
            const row = { id: `derivation-${derivations.length + 1}`, ...args.data };
            derivations.push(row);
            return row;
          },
        },
      }),
    },
  };
}

function build(world = {}) {
  const prisma = prismaDouble(world);
  const drafted = [];
  const postsRepository = {
    createOrUpdatePost: async (state, orgId, date, body, tags, creationMethod) => {
      drafted.push({ state, orgId, date, body, tags, creationMethod });
      return { previousPost: undefined, posts: [{ id: 'post-created-1' }] };
    },
  };
  const repository = new ContentBriefRepository({ model: prisma.model }, postsRepository);
  const facts = new ContentFactService(
    new ContentFactRepository({ model: prisma.model }, { model: prisma.model })
  );
  /**
   * The context builder, as a double.
   *
   * `content-factory-next-fn33.89`: the brief now records the snapshot its
   * draft stood on, so the archive's «Разбор» has a list of facts to show.
   * The double records what it was asked to build, which is what the
   * assertions below are actually about — that the brief names its own facts
   * explicitly and never asks for a gate (`REQUIRE_CURRENT`) on a record.
   */
  const contextCalls = [];
  const contexts = world.contexts === null
    ? undefined
    : {
        build: async (organizationId, input) => {
          contextCalls.push({ organizationId, input });
          if (world.contextFails) throw new Error('context unavailable');
          return { contentContextSnapshotId: 'snapshot-1' };
        },
      };
  const service = new ContentBriefService(
    repository,
    facts,
    () => NOW,
    contexts
  );
  return { service, prisma, drafted, contextCalls };
}

const CHANNEL = {
  id: 'integration-1',
  organizationId: ORG,
  name: 'Телеграм цеха',
  providerIdentifier: 'telegram',
};

const COMPLETE = {
  goal: 'Объяснить, почему поставщика поменяли',
  thesis: 'Смена поставщика сократила срыв сроков вдвое.',
  channel: 'telegram',
  format: 'post',
  facts: [
    {
      statement: 'Срывов стало вдвое меньше за квартал.',
      sourceUrl: 'https://example.com/report',
    },
  ],
  position: 'Считаю, что менять поставщика надо было раньше.',
  disagreement: 'Скажут, что дело в сезоне, а не в поставщике.',
  audience: 'Начальники смен и снабженцы цеха',
};

describe('the gate returns the missing question instead of a draft', () => {
  test('an incomplete brief creates nothing and names what is missing', async () => {
    const { service, drafted } = build({ channels: [CHANNEL] });

    const answer = await service.draft(ORG, {
      thesis: 'Смена поставщика сократила срыв сроков вдвое.',
      facts: [{ statement: 'Стало лучше.', sourceUrl: 'https://example.com/x' }],
    });

    expect(answer.outcome).toBe('insufficient');
    expect(answer.questions.map((row) => row.field)).toEqual(
      expect.arrayContaining(['position', 'disagreement', 'audience'])
    );
    // A question a person can answer, not "field required".
    expect(answer.questions[0].question.length).toBeGreaterThan(20);
    expect(drafted).toHaveLength(0);
  });

  test('a complete brief becomes a draft through the existing post path', async () => {
    const { service, drafted } = build({ channels: [CHANNEL] });

    const answer = await service.draft(ORG, COMPLETE);

    expect(answer).toEqual({ outcome: 'ready', postId: 'post-created-1' });
    expect(drafted).toHaveLength(1);
    expect(drafted[0].state).toBe('draft');
    expect(drafted[0].orgId).toBe(ORG);
    expect(drafted[0].body.integration.id).toBe(CHANNEL.id);
    expect(drafted[0].body.value[0].content).toContain(COMPLETE.thesis);
    expect(drafted[0].body.value[0].content).toContain(COMPLETE.disagreement);
  });

  test('a draft leaves a piece in the library and says which post it produced', async () => {
    // `migration-map.md` puts a Content Variant between a brief and a post.
    // This path wrote only the post, so nothing in the product ever created a
    // `ContentPiece` and the Material tab could not fill for any workspace
    // (`content-factory-next-vme.21.6`).
    const world = build({
      channels: [CHANNEL],
      profiles: [{ organizationId: ORG, activeVersionId: 'version-7' }],
    });

    const answer = await world.service.draft(ORG, COMPLETE, 'ru', 'user-1');

    expect(answer.outcome).toBe('ready');
    expect(answer.pieceId).toBe('piece-1');

    expect(world.prisma.pieces).toHaveLength(1);
    const piece = world.prisma.pieces[0];
    expect(piece.organizationId).toBe(ORG);
    expect(piece.createdByUserId).toBe('user-1');
    expect(piece.body).toContain(COMPLETE.thesis);
    // Named after the thesis, because a library of rows named after the goal
    // is a library of identical rows.
    expect(piece.title).toBe(COMPLETE.thesis);
    // And it carries the voice that wrote it, so a later recut can say
    // whether the voice has moved on.
    expect(piece.brandProfileVersionId).toBe('version-7');

    expect(world.prisma.derivations).toHaveLength(1);
    const derivation = world.prisma.derivations[0];
    expect(derivation.contentPieceId).toBe('piece-1');
    expect(derivation.postId).toBe('post-created-1');
    expect(derivation.platform).toBe(CHANNEL.providerIdentifier);
    expect(derivation.state).toBe('DRAFT');
    // The word the library prints in its own format column, from the same
    // function the library uses — not a second vocabulary for one cut.
    expect(['короткий', 'длинный']).toContain(derivation.format);
  });

  test('a draft built on remembered facts records the context it stood on', async () => {
    // `content-factory-next-fn33.89`: the piece was written with an empty
    // `contentContextSnapshotId`, so the archive's «На чём стоит этот текст»
    // answered a draft that was minutes old with «написан до того, как
    // черновик стал запоминать».
    const world = build({ channels: [CHANNEL], facts: [fact()] });

    const answer = await world.service.draft(
      ORG,
      {
        ...COMPLETE,
        facts: [
          { statement: 'Остатки видны в реальном времени.', factId: 'fact-1' },
        ],
      },
      'ru',
      'user-1'
    );

    expect(answer.outcome).toBe('ready');
    expect(world.prisma.pieces[0].contentContextSnapshotId).toBe('snapshot-1');

    expect(world.contextCalls).toHaveLength(1);
    // The brief's own facts, named explicitly — not whatever the builder would
    // have ranked by word overlap on its own.
    expect(world.contextCalls[0].input.factIds).toEqual(['fact-1']);
    expect(world.contextCalls[0].organizationId).toBe(ORG);
    // A record, not a gate: `REQUIRE_CURRENT` would refuse to remember exactly
    // the drafts whose provenance matters most.
    expect(world.contextCalls[0].input.freshnessMode).not.toBe(
      'REQUIRE_CURRENT'
    );
  });

  test('a brief with no remembered fact records no context and still writes', async () => {
    // A snapshot built with no explicit ids is filled by word overlap, and a
    // provenance list assembled that way names facts the draft never used.
    const world = build({ channels: [CHANNEL] });

    const answer = await world.service.draft(ORG, COMPLETE, 'ru', 'user-1');

    expect(answer.outcome).toBe('ready');
    expect(world.contextCalls).toHaveLength(0);
    expect(world.prisma.pieces[0].contentContextSnapshotId).toBeNull();
  });

  test('a context that will not build costs the provenance, never the draft', async () => {
    const world = build({
      channels: [CHANNEL],
      facts: [fact()],
      contextFails: true,
    });

    const answer = await world.service.draft(
      ORG,
      {
        ...COMPLETE,
        facts: [
          { statement: 'Остатки видны в реальном времени.', factId: 'fact-1' },
        ],
      },
      'ru',
      'user-1'
    );

    expect(answer.outcome).toBe('ready');
    expect(world.prisma.pieces).toHaveLength(1);
    expect(world.prisma.pieces[0].contentContextSnapshotId).toBeNull();
  });

  test('an anonymous caller still gets the draft, and no half-written library row', async () => {
    // `ContentPiece.createdByUserId` is not nullable, and inventing an author
    // for a library row is worse than not having the row.
    const world = build({ channels: [CHANNEL] });

    const answer = await world.service.draft(ORG, COMPLETE);

    expect(answer).toEqual({ outcome: 'ready', postId: 'post-created-1' });
    expect(world.prisma.pieces).toHaveLength(0);
    expect(world.prisma.derivations).toHaveLength(0);
  });

  test('evaluating says the same thing without touching a post', async () => {
    const { service, drafted } = build({ channels: [CHANNEL] });

    const answer = await service.evaluate(ORG, COMPLETE);

    expect(answer.ready).toBe(true);
    expect(answer.missing).toEqual([]);
    expect(answer.brief.thesis).toBe(COMPLETE.thesis);
    expect(drafted).toHaveLength(0);
  });
});

describe('a fact without a source is not a fact', () => {
  test('an offered fact with nothing to check is named, and facts stay missing', async () => {
    const { service } = build({ channels: [CHANNEL] });

    const answer = await service.evaluate(ORG, {
      ...COMPLETE,
      facts: [{ statement: 'Все говорят, что стало лучше.' }],
    });

    expect(answer.ready).toBe(false);
    expect(answer.missing).toContain('facts');
    expect(answer.ungroundedFacts).toEqual(['Все говорят, что стало лучше.']);
  });

  test('a fact carried from the workspace memory grounds without a URL', async () => {
    const { service } = build({ channels: [CHANNEL], facts: [fact()] });

    const answer = await service.evaluate(ORG, {
      ...COMPLETE,
      facts: [{ statement: 'Остатки видны в реальном времени.', factId: 'fact-1' }],
    });

    expect(answer.ready).toBe(true);
    expect(answer.ungroundedFacts).toEqual([]);
  });

  test('an id that belongs to another workspace is refused, not believed', async () => {
    const { service } = build({
      channels: [CHANNEL],
      facts: [fact({ id: 'fact-elsewhere', organizationId: OTHER_ORG })],
    });

    const attempt = service.evaluate(ORG, {
      ...COMPLETE,
      facts: [{ statement: 'Заимствованный факт.', factId: 'fact-elsewhere' }],
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'BRIEF_FACT_UNGROUNDED',
      status: 422,
    });
  });

  test('a retracted fact loses its ground and the draft is refused with it', async () => {
    const { service, drafted } = build({
      channels: [CHANNEL],
      facts: [fact({ id: 'fact-gone', status: 'RETRACTED' })],
    });

    const attempt = service.draft(ORG, {
      ...COMPLETE,
      facts: [{ statement: 'Снятый факт.', factId: 'fact-gone' }],
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'BRIEF_FACT_UNGROUNDED',
      status: 422,
    });
    expect(drafted).toHaveLength(0);
  });
});

describe('the radar ranks with reasons, and says when there is nothing', () => {
  test('topics come out of the facts on hand, each with why it ranks there', async () => {
    const { service } = build({
      facts: [
        fact(),
        fact({ id: 'fact-2', claimKey: 'склад|инвентаризация' }),
        fact({
          id: 'fact-3',
          claimKey: 'поставщики|сроки',
          statement: 'Новый поставщик держит график.',
        }),
      ],
    });

    const answer = await service.radar(ORG);
    const warehouse = answer.topics.find((topic) => topic.id === 'склад');

    expect(answer.topics.length).toBe(2);
    expect(warehouse.evidenceCount).toBe(2);
    expect(warehouse.reasons.length).toBeGreaterThan(1);
    // Two facts: «2 подтверждённых факта». The reason counts in Russian since
    // `content-factory-next-fn33.98`; it used to say «фактов» whatever the
    // number was.
    expect(warehouse.reasons.join(' ')).toContain('2 подтверждённых факта');
    // A rank is not one number: the score is there, and so is the argument.
    expect(typeof warehouse.score).toBe('number');
  });

  test('a topic the workspace already published on says so', async () => {
    const { service } = build({
      facts: [fact({ claimKey: 'поставщики|сроки' })],
      posts: [
        {
          id: 'post-1',
          organizationId: ORG,
          state: 'PUBLISHED',
          content: '<p>Мы уже писали про поставщики и сроки отгрузок.</p>',
          publishDate: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });

    const answer = await service.radar(ORG);

    expect(answer.topics[0].reasons.join(' ')).toContain('уже писали');
  });

  test('another workspace’s published posts do not decide our topics', async () => {
    const { service } = build({
      facts: [fact({ claimKey: 'поставщики|сроки' })],
      posts: [
        {
          id: 'post-foreign',
          organizationId: OTHER_ORG,
          state: 'PUBLISHED',
          content: '<p>Поставщики и сроки у соседей.</p>',
          publishDate: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });

    const answer = await service.radar(ORG);

    expect(answer.topics[0].reasons.join(' ')).toContain('ещё не писали');
  });

  test('nothing to write about arrives in words rather than as an empty list', async () => {
    const { service } = build({ facts: [] });

    const answer = await service.radar(ORG);

    expect(answer.topics).toEqual([]);
    expect(answer.state).toBe('empty');
    expect(String(answer.notice).length).toBeGreaterThan(20);
    expect(answer.notice).toMatch(/факт/i);
  });

  test('facts with nothing confirmed rank, and the notice says why they are low', async () => {
    const { service } = build({
      facts: [fact({ status: 'UNVERIFIED' })],
    });

    const answer = await service.radar(ORG);

    expect(answer.topics[0].evidenceCount).toBe(0);
    expect(answer.topics[0].reasons.join(' ')).toContain('писать пока не на чем');
    expect(String(answer.notice).length).toBeGreaterThan(20);
  });

  test('a radar that cannot be built refuses by name', async () => {
    const { service } = build({ failFacts: true });

    await expect(service.radar(ORG)).rejects.toMatchObject({
      code: 'RADAR_UNAVAILABLE',
      status: 503,
    });
  });

  test('a broken radar does not take the brief and its answers down with it', async () => {
    const { service } = build({ failFacts: true, channels: [CHANNEL] });

    const answer = await service.evaluate(ORG, COMPLETE);

    expect(answer.ready).toBe(true);
    expect(answer.state).toBe('error');
    expect(answer.topics).toEqual([]);
    expect(String(answer.notice).length).toBeGreaterThan(10);
  });
});

describe('everything is scoped to the workspace that asked', () => {
  test('every read carries the organisation, and none of them takes it from the body', async () => {
    const { service, prisma } = build({ channels: [CHANNEL], facts: [fact()] });

    await service.evaluate(ORG, {
      ...COMPLETE,
      organizationId: OTHER_ORG,
      facts: [{ statement: 'Из памяти.', factId: 'fact-1' }],
    });
    await service.radar(ORG);

    expect(prisma.calls.length).toBeGreaterThan(2);
    for (const call of prisma.calls) {
      // `User` carries no `organizationId` column at all — a person can
      // belong to more than one workspace — so `listFacts`'s author lookup
      // (`content-factory-next-odb8.1`) scopes by the fact ids it already
      // read under `ORG`, not by a tenant column this table does not have.
      // Everything that reads a tenant-owned table still must.
      if (call.query === 'user.findMany') continue;
      expect(call.where.organizationId).toBe(ORG);
    }
  });

  test('the controller takes the organisation from the request and nowhere else', async () => {
    const seen = [];
    const controller = new ContentBriefController({
      radar: async (organizationId, language) => {
        seen.push({ route: 'radar', organizationId, language });
        return { topics: [] };
      },
      evaluate: async (organizationId, body) => {
        seen.push({ route: 'evaluate', organizationId, body });
        return { ready: false };
      },
      draft: async (organizationId, body) => {
        seen.push({ route: 'draft', organizationId, body });
        return { outcome: 'ready', postId: 'post-1' };
      },
    });

    const body = { ...COMPLETE, organizationId: OTHER_ORG };
    await controller.radar({ id: ORG }, undefined);
    await controller.evaluate({ id: ORG }, body);
    await controller.draft({ id: ORG }, body);

    expect(seen.map((call) => call.organizationId)).toEqual([ORG, ORG, ORG]);
  });
});

describe('the routes are the ones the contract registered', () => {
  const joined = (methodName) => {
    const base = Reflect.getMetadata('path', ContentBriefController);
    const own = Reflect.getMetadata(
      'path',
      ContentBriefController.prototype[methodName]
    );
    return `${base}${own}`.replace(/\/+$/, '');
  };

  test('radar, evaluate and draft sit where the contract says', () => {
    const declared = contract.VOICE_SURFACES.brief.routes.map((route) => route.path);

    expect(declared).toEqual(
      expect.arrayContaining([joined('radar'), joined('evaluate'), joined('draft')])
    );
  });

  test('the radar is a read and the other two are writes', () => {
    const { RequestMethod } = require('@nestjs/common');
    const method = (name) =>
      Reflect.getMetadata('method', ContentBriefController.prototype[name]);

    expect(method('radar')).toBe(RequestMethod.GET);
    expect(method('evaluate')).toBe(RequestMethod.POST);
    expect(method('draft')).toBe(RequestMethod.POST);
  });
});

describe('the brief prepares text and reaches no platform', () => {
  const files = [
    ...fs
      .readdirSync(path.resolve(__dirname, '..', BRIEF_DIR))
      .map((name) => `${BRIEF_DIR}/${name}`),
    DTO,
    CONTROLLER,
  ];

  const stripped = (relativePath) =>
    fs
      .readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  test('no provider, no integration client, no network', () => {
    for (const file of files) {
      const code = stripped(file);
      // `docs/product/migration-map.md`: a new entity reaching a platform
      // directly is what it forbids. Delivery stays with PostsService and the
      // providers, and this path stops at a draft.
      expect([file, /^import .*(?:integrations|providers|provider')/m.test(code)]).toEqual([
        file,
        false,
      ]);
      expect([file, /\bfetch\(|\baxios\b|\bundici\b/.test(code)]).toEqual([file, false]);
      expect([file, /\.(?:publish|schedule|deliver|send)\s*\(/.test(code)]).toEqual([
        file,
        false,
      ]);
    }
  });

  test('the draft is written as a draft and never as a queued post', () => {
    const code = stripped(`${BRIEF_DIR}/content-brief.repository.ts`);

    expect(code).toContain("'draft'");
    expect(code).not.toMatch(/['"](?:now|schedule)['"]\s*,/);
  });
});
