'use strict';

/**
 * Correctness review W3-19 (`content-factory-next-kcxz.19`, channels from the
 * chat): what the recorded scenarios do not reach.
 *
 * - P2-1: deleting a channel deletes only its own posts. A post group spans
 *   every channel the composer wrote it for; the other channels' posts in
 *   the group stay live, and only the deleted roots' workflows are stopped.
 * - P3-9: posting times over MCP name their zone; a bare «10:00» is refused.
 * - P3-3, P3-4: the connect card credits only its own, finished channel, and
 *   reads a failed return from the platform.
 */

const {
  IDENTITY,
  executeTool,
  fixtures,
  loadRegistry,
  permissionsService,
  requestContextFor,
  servicesFrom,
} = require('./helpers/agent-capabilities.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadPostsService } = require('./helpers/posts-service.module.cjs');
const tsx = require('./helpers/load-tsx.cjs');

const { PostsRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto': { Post: class {} },
    '@prisma/client': {
      APPROVED_SUBMIT_FOR_ORDER: { NO: 'NO' },
      CreationMethod: { WEB: 'WEB' },
      State: {},
    },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': { GetPostsDto: class {} },
    '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': { GetPostsListDto: class {} },
    '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': { CreateTagDto: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload': {
      safeErrorLedgerPayload: () => ({ message: '{}', body: '{}' }),
    },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize':
        'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
      './content-context.errors':
        'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
    },
  }
);
const { PostsService } = loadPostsService();
const { deleteChannelWithPosts } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/integrations/delete-channel.ts',
  {}
);

/**
 * A post table the way Prisma filters it for these calls: every key of
 * `where` is an equality (`null` included), across one list of rows.
 */
const postTable = (rows) => {
  const matches = (row, where) =>
    Object.entries(where).every(([key, value]) => (row[key] ?? null) === value);
  const calls = [];
  return {
    calls,
    model: {
      post: {
        findMany: async ({ where, orderBy }) => {
          calls.push(['findMany', where]);
          const found = rows.filter((row) => matches(row, where));
          if (orderBy?.id === 'asc') found.sort((a, b) => a.id.localeCompare(b.id));
          return found.map((row) => ({ id: row.id }));
        },
        updateMany: async ({ where, data }) => {
          calls.push(['updateMany', where]);
          const found = rows.filter((row) => matches(row, where));
          for (const row of found) Object.assign(row, data);
          return { count: found.length };
        },
      },
    },
  };
};

/**
 * One post written in the composer for Telegram «A» and LinkedIn «B» (one
 * group `g`, each channel its root, «A» with a thread item), a post only on
 * «A», and a post of another workspace on a channel with the same id.
 */
const twoChannelGroup = () => [
  { id: 'a-root', organizationId: 'org', group: 'g', integrationId: 'A', parentPostId: null, deletedAt: null, state: 'QUEUE' },
  { id: 'a-thread', organizationId: 'org', group: 'g', integrationId: 'A', parentPostId: 'a-root', deletedAt: null, state: 'QUEUE' },
  { id: 'b-root', organizationId: 'org', group: 'g', integrationId: 'B', parentPostId: null, deletedAt: null, state: 'QUEUE' },
  { id: 'a-solo', organizationId: 'org', group: 'h', integrationId: 'A', parentPostId: null, deletedAt: null, state: 'DRAFT' },
  { id: 'gone', organizationId: 'org', group: 'k', integrationId: 'A', parentPostId: null, deletedAt: new Date('2026-01-01'), state: 'QUEUE' },
  { id: 'foreign', organizationId: 'org-2', group: 'g2', integrationId: 'A', parentPostId: null, deletedAt: null, state: 'QUEUE' },
];

const repositoryOver = (rows) => {
  const table = postTable(rows);
  const repository = Object.create(PostsRepository.prototype);
  repository._post = table;
  return { repository, table };
};

/** Temporal's client as `stopPostWorkflows` uses it; records what is stopped. */
const temporal = () => {
  const stopped = [];
  return {
    stopped,
    service: {
      client: {
        getRawClient: () => ({
          workflow: {
            getHandle: (id) => ({ terminate: async () => void stopped.push(id) }),
            list: () => (async function* () {})(),
          },
        }),
        getWorkflowHandle: async () => null,
      },
    },
  };
};

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe('P2-1: deleting a channel deletes only that channel’s posts', () => {
  test('the repository marks this channel’s rows only; the group’s other channel stays live', async () => {
    const rows = twoChannelGroup();
    const { repository, table } = repositoryOver(rows);
    expect(await repository.deleteChannelPosts('org', 'A')).toEqual(['a-root', 'a-solo']);
    const deleted = rows.filter((row) => row.deletedAt).map((row) => row.id).sort();
    expect(deleted).toEqual(['a-root', 'a-solo', 'a-thread', 'gone']);
    // The sibling on «B» is untouched and is still the group's live root, so
    // the composer can open, move and schedule it (`createOrUpdatePost`
    // reads the group's live root the same way).
    expect(rows.find((row) => row.id === 'b-root')).toMatchObject({ deletedAt: null, state: 'QUEUE' });
    expect(await repository.channelRootPosts('org', 'B')).toEqual([{ id: 'b-root' }]);
    expect(rows.find((row) => row.id === 'foreign').deletedAt).toBeNull();
    // Never a condition on the group alone.
    const update = table.calls.find(([name]) => name === 'updateMany')[1];
    expect(update).toEqual({ organizationId: 'org', integrationId: 'A', deletedAt: null });
  });

  test('the repository refuses a missing channel id (fn33.90.3)', async () => {
    const rows = twoChannelGroup();
    const { repository, table } = repositoryOver(rows);
    await expect(repository.deleteChannelPosts('org', '')).rejects.toThrow(/channel id/);
    expect(() => repository.channelRootPosts('org', undefined)).toThrow(/channel id/);
    expect(table.calls).toEqual([]);
    expect(rows.filter((row) => row.deletedAt).map((row) => row.id)).toEqual(['gone']);
  });

  test('the door’s step stops the workflows of the deleted roots only', async () => {
    const rows = twoChannelGroup();
    const { repository } = repositoryOver(rows);
    const clock = temporal();
    const posts = Object.create(PostsService.prototype);
    posts._postRepository = repository;
    posts._temporalService = clock.service;
    const deletedChannels = [];
    const answer = await deleteChannelWithPosts(
      {
        integrations: {
          getIntegrationById: async (org, id) => (org === 'org' && id === 'A' ? { id } : null),
          deleteChannel: async (_org, id) => void deletedChannels.push(id) || { id },
        },
        posts,
      },
      'org',
      'A'
    );
    await settle();
    expect(answer).toEqual({ channel: { id: 'A' }, posts: 2 });
    expect(deletedChannels).toEqual(['A']);
    expect(clock.stopped.sort()).toEqual(['post_a-root', 'post_a-solo']);
    expect(clock.stopped).not.toContain('post_b-root');
    expect(rows.find((row) => row.id === 'b-root').deletedAt).toBeNull();
  });

  test('the count the chat says is the roots the step deletes', async () => {
    const rows = twoChannelGroup();
    const { repository } = repositoryOver(rows);
    const posts = Object.create(PostsService.prototype);
    posts._postRepository = repository;
    posts._temporalService = temporal().service;
    const counted = await posts.channelPostIds('org', 'A');
    const deleted = await posts.deleteChannelPosts('org', 'A');
    await settle();
    expect(counted).toEqual(deleted);
  });
});

describe('P3-9: posting times over MCP name their zone', () => {
  const registry = loadRegistry();
  const find = (id) => registry.CAPABILITY_CATALOGUE.find((one) => one.id === id);
  const setup = (entrance) => {
    const bodies = [];
    const base = fixtures()['channel.times'].services;
    const services = {
      ...base,
      IntegrationService: {
        ...base.IntegrationService,
        setTimes: async (_org, id, body) => void bodies.push([id, body]),
      },
    };
    const tool = registry.buildCapabilityTool(find('channel.times'), {
      services: servicesFrom(services),
      language: 'en',
      entrance,
      ...(entrance === 'mcp' ? { gate: new registry.DoorPolicyGate(permissionsService()) } : {}),
    });
    // MCP knows no browser: the identity's zone is the saved offset or UTC.
    const context = requestContextFor(registry, { ...IDENTITY, role: 'ADMIN', timeZone: 'UTC' });
    return { tool, bodies, context };
  };

  test('a bare local time over MCP is refused, nothing written', async () => {
    const { tool, bodies, context } = setup('mcp');
    const { output } = await executeTool(tool, { channelId: 'c1', times: ['10:00'] }, { requestContext: context });
    expect(output).toMatchObject({ ok: false, code: 'CHANNEL_TIME_ZONE_REQUIRED' });
    expect(bodies).toEqual([]);
  });

  test('over MCP with a named zone: stored at that zone’s offset (+05:30, a half-hour zone)', async () => {
    const { tool, bodies, context } = setup('mcp');
    const { output } = await executeTool(
      tool,
      { channelId: 'c1', times: ['10:00'], timeZone: 'Asia/Kolkata' },
      { requestContext: context }
    );
    expect(output).toMatchObject({ ok: true, summary: { times: ['10:00'], timeZone: expect.stringMatching(/^Asia\/(Kolkata|Calcutta)$/) } });
    // 10:00 at +05:30 is 04:30 UTC.
    expect(bodies).toEqual([['c1', { time: [{ time: 270 }] }]]);
  });

  test('an unknown zone is refused, never guessed; clearing needs no zone', async () => {
    const { tool, bodies, context } = setup('mcp');
    const unknown = await executeTool(
      tool,
      { channelId: 'c1', times: ['10:00'], timeZone: 'Mars/Olympus' },
      { requestContext: context }
    );
    expect(unknown.output).toMatchObject({ ok: false, code: 'CHANNEL_TIME_ZONE_UNKNOWN' });
    const cleared = await executeTool(tool, { channelId: 'c1', times: [] }, { requestContext: context });
    expect(cleared.output).toMatchObject({ ok: true, summary: { times: [] } });
    expect(bodies).toEqual([['c1', { time: [] }]]);
  });

  test('the web chat keeps the person’s zone from the identity', async () => {
    const { tool, bodies } = setup('chat');
    const context = requestContextFor(registry, { ...IDENTITY, role: 'ADMIN', timeZone: 'Europe/Moscow' });
    const { output } = await executeTool(tool, { channelId: 'c1', times: ['09:00'] }, { requestContext: context });
    expect(output).toMatchObject({ ok: true, summary: { timeZone: 'Europe/Moscow' } });
    expect(bodies).toEqual([['c1', { time: [{ time: 360 }] }]]);
  });
});

describe('P3-3, P3-4: the connect card credits its own channel and reads a failed return', () => {
  const contract = tsx.loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const since = '2026-09-28T10:00:00.000Z';
  const at = (minutes) => new Date(Date.parse(since) + minutes * 60 * 1000).toISOString();
  const connect = { provider: 'linkedin', name: 'LinkedIn', flow: 'oauth', known: ['old'], since };
  const row = (id, createdAt, more = {}) => ({ id, name: id, identifier: 'linkedin', createdAt, ...more });

  test('a channel created after the card, within its window, finished', () => {
    expect(contract.arrivedChannelOf(connect, [row('old', at(-600)), row('new', at(5))])).toMatchObject({ id: 'new' });
  });

  test('not a channel from before the card, nor one weeks later, nor a half-finished one', () => {
    // Before the card (the list had not caught up, or another member earlier).
    expect(contract.arrivedChannelOf(connect, [row('early', at(-30))])).toBeNull();
    // An old card in the history does not claim a later connection.
    expect(contract.arrivedChannelOf(connect, [row('later', at(60 * 24 * 14))])).toBeNull();
    // The page choice left unfinished, or a channel that already needs reconnecting.
    expect(contract.arrivedChannelOf(connect, [row('half', at(5), { inBetweenSteps: true })])).toBeNull();
    expect(contract.arrivedChannelOf(connect, [row('stale', at(5), { refreshNeeded: true })])).toBeNull();
    // Another platform.
    expect(contract.arrivedChannelOf(connect, [{ ...row('tg', at(5)), identifier: 'telegram' }])).toBeNull();
    // A card without its time credits nothing.
    expect(contract.arrivedChannelOf({ ...connect, since: null }, [row('new', at(5))])).toBeNull();
  });

  test('the window closes', () => {
    expect(contract.connectWindowOpen(connect, Date.parse(at(60)))).toBe(true);
    expect(contract.connectWindowOpen(connect, Date.parse(at(60 * 7)))).toBe(false);
    expect(contract.connectWindowOpen({ ...connect, since: null }, Date.parse(at(1)))).toBe(false);
  });

  test('the platform’s return, as the callback page writes it', () => {
    expect(contract.connectReturnOf('?precondition=true')).toEqual({ kind: 'precondition' });
    expect(contract.connectReturnOf('?msg=Token expired')).toEqual({ kind: 'failed', message: 'Token expired' });
    // A success carries its own «msg» beside «added».
    expect(contract.connectReturnOf('?added=linkedin&msg=Channel Updated')).toBeNull();
    expect(contract.connectReturnOf('')).toBeNull();
    expect(contract.connectReturnOf(`?msg=${'x'.repeat(500)}`).message).toHaveLength(200);
  });
});
