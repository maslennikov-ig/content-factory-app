'use strict';

/**
 * The material library, its provenance, and the draft that comes out of it.
 *
 * Three rules hold this surface together, and each of them is a test below.
 *
 * A material is a finished text that exists apart from any post, so the
 * library can say how many posts came out of it and how many are still
 * waiting — numbers a person checks against what they remember publishing.
 *
 * The recut preview is arithmetic, and it is *borrowed* arithmetic: the same
 * `previewRecut` the screens were built against, not a second implementation
 * that will drift from it by a hundred characters and be believed anyway.
 *
 * And nothing on this path reaches a platform. It prepares text; `PostsService`
 * and the providers deliver it, which `docs/product/migration-map.md` states
 * as a rule rather than a preference. The last describe reads imports and
 * calls to keep it, because a scan for words would fail the files for saying
 * which rule they keep.
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
  controller: 'apps/backend/src/api/routes/content-material.controller.ts',
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
  './segment': `${BRAND_VOICE}/segment.ts`,
  './locale-pack.ru': `${BRAND_VOICE}/locale-pack.ru.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut': `${BRAND_VOICE}/recut.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${BRAND_VOICE}/voice-wiring.contract.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation': FILES.archivePresentation,
};

/**
 * A load that refuses the network and the model, the way the running service
 * does. A forbidden import fails the suite where it is written rather than in
 * production, which is the whole point of putting the fence in the loader.
 */
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

const recut = load(`${BRAND_VOICE}/recut.ts`);
const { MaterialError } = load(FILES.errors);
const { ContentMaterialRepository } = load(FILES.repository);
const { ContentMaterialService } = load(FILES.service);
const contract = load(`${BRAND_VOICE}/voice-wiring.contract.ts`);

/* -------------------------------------------------------------------------
 * A database that remembers, without being one
 * ---------------------------------------------------------------------- */

const LONG_BODY = 'Сроки сдвинулись на два дня. '.repeat(300);
const SHORT_BODY = `Что проверяем:

- остатки на складе
- график отгрузок`;

const at = (iso) => new Date(iso);

function fixture() {
  return {
    pieces: [
      {
        id: 'piece-a',
        organizationId: 'org-a',
        title: 'Почему мы поменяли поставщика подшипников',
        body: LONG_BODY,
        language: 'ru',
        tags: null,
        brandProfileVersionId: 'version-3',
        contentContextSnapshotId: null,
        archivedAt: null,
        createdByUserId: 'user-a',
        createdAt: at('2026-08-05T09:00:00.000Z'),
        brandProfileVersion: { versionNumber: 3, label: null },
      },
      {
        id: 'piece-b',
        organizationId: 'org-a',
        title: 'Итоги наладки линии',
        body: SHORT_BODY,
        language: 'ru',
        tags: null,
        brandProfileVersionId: null,
        contentContextSnapshotId: null,
        archivedAt: null,
        createdByUserId: 'user-a',
        createdAt: at('2026-08-12T09:00:00.000Z'),
        brandProfileVersion: null,
      },
      {
        id: 'piece-archived',
        organizationId: 'org-a',
        title: 'Снятый с публикации разбор',
        body: SHORT_BODY,
        language: 'ru',
        tags: null,
        brandProfileVersionId: null,
        contentContextSnapshotId: null,
        archivedAt: at('2026-08-13T09:00:00.000Z'),
        createdByUserId: 'user-a',
        createdAt: at('2026-08-01T09:00:00.000Z'),
        brandProfileVersion: null,
      },
      {
        id: 'piece-elsewhere',
        organizationId: 'org-b',
        title: 'Чужой материал',
        body: SHORT_BODY,
        language: 'ru',
        tags: null,
        brandProfileVersionId: null,
        contentContextSnapshotId: null,
        archivedAt: null,
        createdByUserId: 'user-b',
        createdAt: at('2026-08-06T09:00:00.000Z'),
        brandProfileVersion: null,
      },
    ],
    derivations: [
      {
        id: 'der-1',
        organizationId: 'org-a',
        contentPieceId: 'piece-a',
        postId: 'post-1',
        integrationId: 'integration-telegram',
        platform: 'telegram',
        format: 'короткий',
        brandProfileVersionId: 'version-3',
        state: 'PUBLISHED',
        createdAt: at('2026-08-06T09:00:00.000Z'),
      },
      {
        id: 'der-2',
        organizationId: 'org-a',
        contentPieceId: 'piece-a',
        postId: 'post-2',
        integrationId: 'integration-vk',
        platform: 'vk',
        format: 'короткий',
        brandProfileVersionId: 'version-3',
        state: 'QUEUED',
        createdAt: at('2026-08-07T09:00:00.000Z'),
      },
      {
        id: 'der-3',
        organizationId: 'org-a',
        contentPieceId: 'piece-a',
        postId: 'post-3',
        integrationId: 'integration-telegram',
        platform: 'telegram',
        format: 'короткий',
        brandProfileVersionId: 'version-3',
        state: 'DRAFT',
        createdAt: at('2026-08-08T09:00:00.000Z'),
      },
    ],
    integrations: [
      {
        id: 'integration-telegram',
        organizationId: 'org-a',
        providerIdentifier: 'telegram',
        name: 'Канал цеха',
        disabled: false,
        deletedAt: null,
        createdAt: at('2026-07-01T09:00:00.000Z'),
      },
      {
        id: 'integration-vk',
        organizationId: 'org-a',
        providerIdentifier: 'vk',
        name: 'Сообщество',
        disabled: false,
        deletedAt: null,
        createdAt: at('2026-07-02T09:00:00.000Z'),
      },
    ],
  };
}

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, condition]) => {
    if (condition === null) return row[key] === null || row[key] === undefined;
    if (condition && typeof condition === 'object') {
      if ('in' in condition) return condition.in.includes(row[key]);
      if ('not' in condition) return row[key] !== condition.not;
    }
    return row[key] === condition;
  });

const byOrder = (orderBy) => (left, right) => {
  if (!orderBy) return 0;
  const [key, direction] = Object.entries(orderBy)[0];
  const delta = left[key] > right[key] ? 1 : left[key] < right[key] ? -1 : 0;
  return direction === 'desc' ? -delta : delta;
};

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
        return seed.derivations
          .filter((derivation) => matches(derivation, args.where))
          .sort(byOrder(args.orderBy));
      },
      create: async (args = {}) => {
        record('contentDerivation.create', args);
        created += 1;
        const row = { id: `der-new-${created}`, ...args.data };
        seed.derivations.push(row);
        return row;
      },
    },
    integration: {
      findFirst: async (args = {}) => {
        record('integration.findFirst', args);
        return (
          seed.integrations
            .filter((integration) => matches(integration, args.where))
            .sort(byOrder(args.orderBy))[0] || null
        );
      },
    },
    post: {
      create: async (args = {}) => {
        record('post.create', args);
        created += 1;
        return { id: `post-new-${created}`, ...args.data };
      },
    },
    $transaction: async (run) => run(model),
  };

  return { model, calls, seed };
}

function service(seed = fixture(), now = () => at('2026-08-22T10:00:00.000Z')) {
  const store = database(seed);
  const repository = new ContentMaterialRepository(
    { model: store.model },
    { model: store.model }
  );
  return {
    store,
    service: new ContentMaterialService(repository, now),
  };
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
 * The library
 * ---------------------------------------------------------------------- */

describe('the library lists what a workspace already wrote', () => {
  test('a row counts the posts that went out and the ones still waiting', async () => {
    const { service: materials } = service();
    const response = await materials.listMaterials('org-a');

    expect(response.state).toBe('default');
    expect(response.materials.map((row) => row.code)).toEqual([
      'cnt-01',
      'cnt-02',
    ]);

    const [first] = response.materials;
    expect(first.id).toBe('piece-a');
    expect(first.title).toBe('Почему мы поменяли поставщика подшипников');
    // One published, one queued, one still a draft: a draft is neither out
    // nor waiting, and counting it as either would misreport the library.
    expect(first.postCount).toBe(1);
    expect(first.queuedCount).toBe(1);
    expect(first.voiceVersion).toBe('v3');
    expect(first.date).toBe('05.08.26');
    expect(typeof first.format).toBe('string');
    expect(first.format.length).toBeGreaterThan(0);
  });

  test('an archived piece and another workspace stay out of the list', async () => {
    const { service: materials, store } = service();
    const response = await materials.listMaterials('org-a');

    expect(response.materials.map((row) => row.id)).not.toContain(
      'piece-archived'
    );
    expect(response.materials.map((row) => row.id)).not.toContain(
      'piece-elsewhere'
    );

    const query = store.calls.find(
      (call) => call.name === 'contentPiece.findMany'
    );
    expect(query.args.where.organizationId).toBe('org-a');
  });

  test('a workspace with nothing written reports empty rather than an error', async () => {
    const { service: materials } = service();
    const response = await materials.listMaterials('org-empty');

    expect(response.state).toBe('empty');
    expect(response.materials).toEqual([]);
    expect(response.derived).toEqual([]);
  });

  test('the response carries every field the screen declares', async () => {
    const { service: materials } = service();
    const response = await materials.listMaterials('org-a');

    for (const field of contract.VOICE_SURFACES.materials.dataFields) {
      if (field === 'recut' || field === 'notice') continue;
      expect(response).toHaveProperty(field);
    }
  });
});

/* -------------------------------------------------------------------------
 * Provenance
 * ---------------------------------------------------------------------- */

describe('a material says which posts came out of it', () => {
  test('provenance names the platform and the state of each post', async () => {
    const { service: materials } = service();
    const response = await materials.getDerivations('org-a', 'piece-a');

    expect(response.state).toBe('selected');
    expect(response.derived).toEqual([
      { platform: 'telegram', state: 'PUBLISHED', date: '06.08.26' },
      { platform: 'vk', state: 'QUEUED', date: '07.08.26' },
      { platform: 'telegram', state: 'DRAFT', date: '08.08.26' },
    ]);
    // The table stays on screen behind the open row.
    expect(response.materials.length).toBe(2);
  });

  test('another workspace cannot open a material it does not own', async () => {
    const { service: materials, store } = service();
    const error = await failure(() =>
      materials.getDerivations('org-a', 'piece-elsewhere')
    );

    expect(error.name).toBe('MaterialError');
    expect(error.code).toBe('MATERIAL_NOT_FOUND');
    expect(error.status).toBe(
      contract.VOICE_ERROR_CODES.MATERIAL_NOT_FOUND.status
    );

    // The scoping is in the query, not in a filter applied afterwards: the
    // row never leaves the database in the first place.
    for (const call of store.calls) {
      expect(call.args.where.organizationId).toBe('org-a');
    }
  });
});

/* -------------------------------------------------------------------------
 * The recut
 * ---------------------------------------------------------------------- */

describe('the recut preview is the arithmetic the screens were built on', () => {
  test('the preview is exactly what previewRecut returns for the piece', async () => {
    const { service: materials } = service();
    const response = await materials.previewRecut('org-a', 'piece-a', {
      platform: 'telegram',
    });

    const expected = recut.previewRecut({
      body: LONG_BODY,
      images: 0,
      links: 0,
      platform: 'telegram',
    });

    expect(response.recut.platform).toBe('telegram');
    expect(response.recut.code).toBe('cnt-01');
    expect(response.recut.voiceVersion).toBe('v3');
    expect(response.recut.changes).toEqual(expected.changes);
    expect(response.recut.unchanged).toBe(expected.unchanged);
    // Cutting text away is a loss, and the preview says so.
    expect(
      response.recut.changes.find((change) => change.aspect === 'length')
    ).toMatchObject({ to: '4096', lossy: true });
  });

  test('the open row keeps its provenance while the panel is open', async () => {
    const { service: materials } = service();
    const response = await materials.previewRecut('org-a', 'piece-a', {
      platform: 'vk',
    });

    expect(response.state).toBe('selected');
    expect(response.derived.length).toBe(3);
  });

  test('a platform this product cannot cut for is refused by name', async () => {
    const { service: materials } = service();
    const error = await failure(() =>
      materials.previewRecut('org-a', 'piece-a', { platform: 'myspace' })
    );

    expect(error.code).toBe('MATERIAL_PLATFORM_UNSUPPORTED');
    expect(error.status).toBe(
      contract.VOICE_ERROR_CODES.MATERIAL_PLATFORM_UNSUPPORTED.status
    );
    expect(error.subject).toBe('myspace');
  });
});

/* -------------------------------------------------------------------------
 * The draft
 * ---------------------------------------------------------------------- */

describe('a draft made from a material keeps the link back to it', () => {
  test('the draft is a post in DRAFT and a derivation pointing at it', async () => {
    const { service: materials, store } = service();
    const response = await materials.createDraft('org-a', 'piece-a', {
      platform: 'telegram',
    });

    expect(response).toEqual({
      postId: expect.any(String),
      derivationId: expect.any(String),
      contentPieceId: 'piece-a',
      platform: 'telegram',
    });

    const post = store.calls.find((call) => call.name === 'post.create');
    expect(post.args.data.state).toBe('DRAFT');
    expect(post.args.data.organizationId).toBe('org-a');
    expect(post.args.data.content).toBe(LONG_BODY);
    expect(post.args.data.integrationId).toBe('integration-telegram');

    const derivation = store.calls.find(
      (call) => call.name === 'contentDerivation.create'
    );
    expect(derivation.args.data).toMatchObject({
      organizationId: 'org-a',
      contentPieceId: 'piece-a',
      postId: response.postId,
      platform: 'telegram',
      state: 'DRAFT',
    });
    // The voice that wrote the piece is the voice the draft is attributed to.
    expect(derivation.args.data.brandProfileVersionId).toBe('version-3');
  });

  test('a named channel is used when the request names one', async () => {
    const { service: materials, store } = service();
    await materials.createDraft('org-a', 'piece-a', {
      platform: 'vk',
      integrationId: 'integration-vk',
    });

    const lookup = store.calls.find(
      (call) => call.name === 'integration.findFirst'
    );
    expect(lookup.args.where).toMatchObject({
      organizationId: 'org-a',
      id: 'integration-vk',
    });
  });

  test('a workspace with no channel for the platform is told which platform', async () => {
    const { service: materials } = service();
    const error = await failure(() =>
      materials.createDraft('org-a', 'piece-a', { platform: 'newsletter' })
    );

    expect(error.code).toBe('MATERIAL_PLATFORM_UNSUPPORTED');
    expect(error.subject).toBe('newsletter');
  });

  test('another workspace cannot make a draft from a material it does not own', async () => {
    const { service: materials, store } = service();
    const error = await failure(() =>
      materials.createDraft('org-a', 'piece-elsewhere', {
        platform: 'telegram',
      })
    );

    expect(error.code).toBe('MATERIAL_NOT_FOUND');

    const query = store.calls.find(
      (call) => call.name === 'contentPiece.findFirst'
    );
    expect(query.args.where).toMatchObject({
      organizationId: 'org-a',
      id: 'piece-elsewhere',
    });
    expect(store.calls.some((call) => call.name === 'post.create')).toBe(false);
    expect(
      store.calls.some((call) => call.name === 'contentDerivation.create')
    ).toBe(false);
  });

  test('a channel belonging to another workspace is not borrowed', async () => {
    const seed = fixture();
    seed.integrations.push({
      id: 'integration-foreign',
      organizationId: 'org-b',
      providerIdentifier: 'listmonk',
      name: 'Чужая рассылка',
      disabled: false,
      deletedAt: null,
      createdAt: at('2026-07-03T09:00:00.000Z'),
    });
    const { service: materials } = service(seed);

    const error = await failure(() =>
      materials.createDraft('org-a', 'piece-a', {
        platform: 'newsletter',
        integrationId: 'integration-foreign',
      })
    );

    expect(error.code).toBe('MATERIAL_PLATFORM_UNSUPPORTED');
  });
});

/* -------------------------------------------------------------------------
 * The routes
 * ---------------------------------------------------------------------- */

describe('the controller answers exactly the routes the contract declares', () => {
  const nest = require('@nestjs/common');
  const controllerModule = loadTypeScriptModule(
    FILES.controller,
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
      '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service':
        { ContentMaterialService: class {} },
      '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-material.dto':
        { MaterialRecutDto: class {}, MaterialDraftDto: class {} },
      '@contentfactory/nestjs-libraries/content-intelligence/materials/archive-presentation':
        load(FILES.archivePresentation),
    },
    { resolve: forbidPlatformAndNetworkImports }
  );
  const { ContentMaterialController } = controllerModule;

  const declared = () => {
    const prototype = ContentMaterialController.prototype;
    const base = Reflect.getMetadata('path', ContentMaterialController);
    return Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const method = Reflect.getMetadata('method', prototype[name]);
        const suffix = Reflect.getMetadata('path', prototype[name]);
        const full = `${base}${suffix}`.replace(/\/+$/u, '') || base;
        return `${nest.RequestMethod[method]} ${full}`;
      });
  };

  test('every route the registry lists is mounted', () => {
    const mounted = declared();
    for (const route of contract.VOICE_SURFACES.materials.routes) {
      expect(mounted).toContain(`${route.method} ${route.path}`);
    }
  });

  test('nothing beyond the contract is mounted', () => {
    expect(declared().sort()).toEqual(
      contract.VOICE_SURFACES.materials.routes
        .map((route) => `${route.method} ${route.path}`)
        .sort()
    );
  });

  test('a refusal reaches the screen as its code and its status', async () => {
    const controller = new ContentMaterialController({
      getDerivations: async () => {
        throw new MaterialError(
          'MATERIAL_NOT_FOUND',
          'Материал не найден',
          404
        );
      },
    });

    const error = await failure(() =>
      controller.derivations({ id: 'org-a' }, 'piece-x')
    );

    expect(error).toBeInstanceOf(nest.HttpException);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ code: 'MATERIAL_NOT_FOUND' });
  });

  test('every handler is handed the organisation from the request', async () => {
    const seen = [];
    const stub = new Proxy(
      {},
      {
        get: () => async (organizationId) => {
          seen.push(organizationId);
          return {};
        },
      }
    );
    const controller = new ContentMaterialController(stub);
    const organization = { id: 'org-a' };

    await controller.list(organization);
    await controller.derivations(organization, 'piece-a');
    await controller.recutPreview(organization, 'piece-a', {
      platform: 'telegram',
    });
    await controller.draft(organization, 'piece-a', { platform: 'telegram' });

    expect(seen).toEqual(['org-a', 'org-a', 'org-a', 'org-a']);
  });
});

/* -------------------------------------------------------------------------
 * The boundary
 * ---------------------------------------------------------------------- */

describe('the material path prepares text and never reaches a platform', () => {
  const sourceOf = (key) =>
    fs
      .readFileSync(path.join(root, FILES[key]), 'utf8')
      // Comments blanked, and the check is on imports and calls rather than on
      // words: these files name the rule they keep, and a scan for the words
      // would fail them for documenting it.
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  test.each(Object.keys(FILES))(
    '%s imports no provider, no integration client and no delivery service',
    (key) => {
      const code = sourceOf(key);

      // `docs/product/migration-map.md`: a new entity reaching a platform
      // directly is exactly what it forbids. Delivery stays with PostsService
      // and the providers.
      expect(code).not.toMatch(
        /^\s*import[\s\S]*?from\s+['"][^'"]*(?:integrations\/|\.provider|posts\.service)['"]/m
      );
      expect(code).not.toMatch(
        /^\s*import .*(?:PostsService|Integrations?Service)/m
      );
      expect(code).not.toMatch(/\bfetch\(|\baxios\b|\bnode-fetch\b/);
      expect(code).not.toMatch(/\.(?:publish|schedule|deliver|send)\s*\(/);
    }
  );

  test('the preview is borrowed from recut.ts rather than reimplemented', () => {
    const code = `${sourceOf('service')}\n${sourceOf('presentation')}`;

    expect(code).toMatch(/\bpreviewRecut\b/);
    expect(code).toMatch(/\bdescribePiece\b/);
    expect(
      code.match(
        /from\s+'@contentfactory\/nestjs-libraries\/content-intelligence\/brand-voice\/recut'/g
      ).length
    ).toBe(2);
    // A second copy of the arithmetic is the failure this guards: it drifts,
    // and the number on the screen keeps being believed.
    expect(code).not.toMatch(/PLATFORM_SHAPES\s*[:=]\s*\{/);
    expect(code).not.toMatch(/\b4096\b/);
  });

  test('the validator and the shape table agree on the platform list', () => {
    const { RECUT_PLATFORM_VALUES } = load(FILES.dto);
    const { RECUT_PLATFORMS } = load(FILES.presentation);

    // The DTO cannot import the type it validates, so the two lists are
    // written twice. Written twice and never compared is how they drift.
    expect([...RECUT_PLATFORM_VALUES].sort()).toEqual(
      [...RECUT_PLATFORMS].sort()
    );
  });

  test('storage goes through Prisma models rather than raw SQL', () => {
    const code = sourceOf('repository');

    expect(code).not.toMatch(/\$queryRaw|\$executeRaw/);
    expect(code).toMatch(/contentPiece\./);
    expect(code).toMatch(/contentDerivation\./);
  });
});
