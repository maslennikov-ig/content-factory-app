'use strict';

/**
 * What each of the three roles gets when it knocks on the doors that matter.
 *
 * `roles-matrix.guard.test.cjs` next door asks a different question: whether
 * the document tells the truth about which sections a door names. It would
 * stay green if `Sections.EDITOR` meant nothing at all — the decorator would
 * be there and the matrix would agree with it. This file asks what the decorator
 * *does*, and it asks it of the real `permissions.service.ts` rather than of a
 * reimplementation of the rule.
 *
 * Owner decision of 05.09.2026 (`content-factory-next-fn33.90`, option «в»):
 * the editor writes what the workspace publishes; the administrator keeps what
 * the workspace owns; the user reads. The live walkthrough of 04.09 had put
 * `EDITOR` and `USER` through the same circle and got two byte-identical
 * recordings — the defect this closes.
 *
 * `STRIPE_PUBLISHABLE_KEY` is cleared for every case on purpose, because that
 * is our instance: with no billing configured the plan sections are granted
 * outright and the role sections are the only refusal left. A test that ran
 * with billing on would be testing somebody else's deployment.
 */

const { doorsWithPolicies } = require('./helpers/backend-doors.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const Sections = {
  CHANNEL: 'channel',
  POSTS_PER_MONTH: 'posts_per_month',
  VIDEOS_PER_MONTH: 'videos_per_month',
  TEAM_MEMBERS: 'team_members',
  COMMUNITY_FEATURES: 'community_features',
  FEATURED_PLAN: 'featured_plan',
  AI: 'ai',
  IMPORT_FROM_CHANNELS: 'import_from_channels',
  ADMIN: 'admin',
  EDITOR: 'editor',
  WEBHOOKS: 'webhooks',
};

const AuthorizationActions = {
  Create: 'create',
  Read: 'read',
  Update: 'update',
  Delete: 'delete',
};

const notNeeded = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(
        `A role refusal must not reach billing: ${String(property)}`
      );
    },
  }
);

const { PermissionsService } = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permissions.service.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service':
      { SubscriptionService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service':
      { WebhooksService: class {} },
    './permission.exception.class': { AuthorizationActions, Sections },
  }
);

const { SubscriptionException } = loadTypeScriptModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
);

const service = () =>
  new PermissionsService(notNeeded, notNeeded, notNeeded, notNeeded);

const doors = doorsWithPolicies();

const doorAt = (method, path) => {
  const found = doors.find(
    (candidate) => candidate.method === method && candidate.path === path
  );
  if (!found) {
    throw new Error(`No door ${method} ${path}: the route was renamed or lost`);
  }
  return found;
};

/**
 * Whether this role passes every policy on the door — the guard's own rule.
 *
 * `permissions.guard.ts` refuses on the first policy that does not hold, so a
 * door is open only when all of them do. The action on each policy is the one
 * the decorator carries; that matters, because `can(Create, X)` says nothing
 * about `can(Delete, X)`.
 */
const opensFor = async (door, role) => {
  const requested = door.sections.map((section) => [
    AuthorizationActions.Create,
    Sections[section],
  ]);
  const ability = await service().check(
    'organization-1',
    new Date('2026-01-01T00:00:00.000Z'),
    role,
    requested
  );
  return requested.every(([action, section]) => ability.can(action, section));
};

/**
 * The doors the owner named, one per group, plus the ones that had to move the
 * other way. Named by hand rather than swept up by prefix: a list generated
 * from the code cannot disagree with the code, and disagreeing with the code
 * is this file's whole job.
 */
const EDITOR_DOORS = [
  ['POST', '/posts', 'написать пост'],
  ['DELETE', '/posts/:group', 'удалить пост'],
  ['PUT', '/posts/:id/date', 'передвинуть пост в расписании'],
  ['POST', '/content-intelligence/voice/avatars', 'создать аватар'],
  ['POST', '/content-intelligence/voice/passport/field', 'править голос бренда'],
  ['POST', '/content-intelligence/brand-profile/drafts', 'завести профиль бренда'],
  ['POST', '/content-intelligence/sources', 'внести источник'],
  ['POST', '/content-intelligence/sources/:id/rights', 'подтвердить права'],
  ['POST', '/content-intelligence/facts', 'записать факт'],
  [
    'POST',
    '/content-intelligence/facts/:factId/evidence/:evidenceId/confirm',
    'подтвердить свидетельство',
  ],
  [
    'POST',
    '/content-intelligence/evidence/:evidenceId/assessment',
    'оценить свидетельство',
  ],
  ['POST', '/content-intelligence/leads/subscriptions', 'завести ленту идей'],
  ['POST', '/content-intelligence/leads/:id/accept', 'взять повод в работу'],
  ['POST', '/content-intelligence/brief/draft', 'собрать бриф'],
  ['POST', '/content-intelligence/materials/archive/import', 'занести материал'],
  ['POST', '/sets', 'создать набор'],
  ['POST', '/signatures', 'создать подпись'],
  ['POST', '/autopost', 'завести правило автопоста'],
  ['POST', '/copilot/agent', 'позвать помощника'],
  ['POST', '/copilot/chat', 'говорить с помощником'],
  ['DELETE', '/media/:id', 'удалить файл из библиотеки'],
  ['POST', '/media/generate-image', 'сгенерировать картинку'],
];

const ADMIN_DOORS = [
  ['GET', '/integrations/social/:integration', 'подключить канал'],
  ['DELETE', '/integrations', 'удалить канал'],
  ['POST', '/settings/team', 'пригласить человека'],
  ['GET', '/settings/ai', 'ключи и расход на модели'],
  ['POST', '/webhooks', 'завести вебхук'],
  ['POST', '/user/oauth-app', 'приложение OAuth'],
  ['POST', '/settings/shortlink', 'короткие ссылки'],
  ['PUT', '/integrations/:id/group', 'переложить канал в группу'],
  ['POST', '/integrations/:id/settings', 'настройки канала'],
];

const READ_DOORS = [
  ['GET', '/content-intelligence/facts', 'смотреть факты'],
  ['GET', '/copilot/list', 'смотреть разговоры с помощником'],
];

describe('the editor writes what the workspace publishes', () => {
  test.each(EDITOR_DOORS)('%s %s — %s', async (method, path) => {
    const door = doorAt(method, path);

    expect({
      USER: await opensFor(door, 'USER'),
      EDITOR: await opensFor(door, 'EDITOR'),
      ADMIN: await opensFor(door, 'ADMIN'),
      SUPERADMIN: await opensFor(door, 'SUPERADMIN'),
    }).toEqual({
      USER: false,
      EDITOR: true,
      ADMIN: true,
      SUPERADMIN: true,
    });
  });

  test('every one of them names the editor section', () => {
    const missing = EDITOR_DOORS.filter(
      ([method, path]) => !doorAt(method, path).sections.includes('EDITOR')
    ).map(([method, path]) => `${method} ${path}`);

    expect(missing).toEqual([]);
  });
});

describe('the administrator keeps what the workspace owns', () => {
  test.each(ADMIN_DOORS)('%s %s — %s', async (method, path) => {
    const door = doorAt(method, path);

    expect({
      USER: await opensFor(door, 'USER'),
      EDITOR: await opensFor(door, 'EDITOR'),
      ADMIN: await opensFor(door, 'ADMIN'),
    }).toEqual({ USER: false, EDITOR: false, ADMIN: true });
  });
});

describe('reading stays open to everyone in the workspace', () => {
  test.each(READ_DOORS)('%s %s — %s', async (method, path) => {
    const door = doorAt(method, path);

    expect({
      USER: await opensFor(door, 'USER'),
      EDITOR: await opensFor(door, 'EDITOR'),
    }).toEqual({ USER: true, EDITOR: true });
  });
});

describe('a refusal by role is not a refusal by plan', () => {
  /**
   * 402 means «pay and you get it», and the screen answers it with a button
   * into billing. There is no billing on this instance and no price on a
   * role, so that button would lead nowhere. Both role sections answer 403.
   */
  test.each([
    ['admin', 403],
    ['editor', 403],
    ['posts_per_month', 402],
    ['ai', 402],
    ['webhooks', 402],
    ['channel', 402],
  ])('a refusal on %s is %i', (section, status) => {
    const exception = new SubscriptionException({
      section,
      action: 'create',
    });

    expect(exception.getStatus()).toBe(status);
  });
});

describe('an unknown role is not a licence', () => {
  /**
   * The ranking table already answers `0` for a role this build has never
   * heard of. The sections must agree: a role nobody defined opens neither.
   */
  test.each([
    ['DEPUTY_EMPEROR'],
    [undefined],
    [null],
    [''],
  ])('%s opens neither role section', async (role) => {
    const editorDoor = doorAt('POST', '/sets');
    const adminDoor = doorAt('POST', '/webhooks');

    expect({
      editor: await opensFor(editorDoor, role),
      admin: await opensFor(adminDoor, role),
    }).toEqual({ editor: false, admin: false });
  });
});

describe('the two roles are no longer the same person', () => {
  /**
   * The measurement that opened `content-factory-next-fn33.90`: ten doors
   * asked under both roles gave ten identical answers. If that ever becomes
   * true again, the role is a name with nothing behind it and this fails.
   */
  test('the editor and the user do not answer alike', async () => {
    const differences = [];
    for (const door of doors) {
      const user = await opensFor(door, 'USER');
      const editor = await opensFor(door, 'EDITOR');
      if (user !== editor) differences.push(`${door.method} ${door.path}`);
    }

    expect(differences.length).toBeGreaterThan(50);
  });
});

describe('every door the parser finds is decided, not skipped', () => {
  /**
   * A section name in a decorator that `Sections` does not carry would make
   * `requested` hold `undefined`, and CASL would answer about a subject
   * nobody asked for. Cheap to check, and it is the failure mode that would
   * make every assertion above meaningless at once.
   */
  test('every section named on a door exists in the enum', () => {
    const unknown = [
      ...new Set(doors.flatMap((door) => door.sections)),
    ].filter((section) => Sections[section] === undefined);

    expect(unknown).toEqual([]);
  });
});

const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
beforeEach(() => {
  delete process.env.STRIPE_PUBLISHABLE_KEY;
});
afterAll(() => {
  if (originalStripeKey === undefined) {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  } else {
    process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
  }
});
