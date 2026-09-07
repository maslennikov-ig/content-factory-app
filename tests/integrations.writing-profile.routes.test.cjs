'use strict';

/**
 * Три двери карточки канала «Как пишем сюда».
 *
 * `content-factory-next-tu3k.2`, решение владельца 06.09.2026 (пункт 5).
 * Проверяются ровно те три вещи, которые здесь можно сделать неправильно и не
 * заметить.
 *
 * Роль. Это единственная дверь под `/integrations/…`, которая не админская, и
 * причина — в матрице ролей: настраивается не канал, а письмо в него. Значит,
 * `PUT` и `DELETE` обязаны нести `Sections.EDITOR`, а чтение — не нести
 * политик вовсе, как и `GET /integrations/:id`.
 *
 * Область. Запрос без `organizationId` вернул бы карточку чужого канала по
 * угаданному идентификатору. Проверяется на настоящем репозитории с поддельным
 * Prisma под ним, а не на пересказе.
 *
 * Смысл `DELETE`. Он не «сохранить пустую карточку», а «вернуться к умолчаниям»,
 * и в колонку обязан лечь `NULL`.
 */

require('reflect-metadata');

const { Prisma } = require('@prisma/client');
const { doorsWithPolicies } = require('./helpers/backend-doors.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const PATH = '/integrations/:id/writing-profile';

describe('who may open the card and who may only read it', () => {
  const doors = doorsWithPolicies();
  const doorAt = (method) =>
    doors.find((door) => door.method === method && door.path === PATH);

  test.each([['PUT'], ['DELETE']])(
    '%s names the editor section, and only it',
    (method) => {
      expect(doorAt(method)?.sections).toEqual(['EDITOR']);
    }
  );

  test('reading carries no policy at all, like reading the channel', () => {
    expect(doorAt('GET')).toBeUndefined();
    expect(
      doors.find(
        (door) => door.method === 'GET' && door.path === '/integrations/:id'
      )
    ).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */

const noop = () => () => undefined;

const { IntegrationsController } = loadWithMocks(
  'apps/backend/src/api/routes/integrations.controller.ts',
  {
    '@nestjs/common': {
      Body: noop,
      Controller: noop,
      Delete: noop,
      Get: noop,
      HttpException: class extends Error {},
      HttpStatus: {},
      Param: noop,
      Post: noop,
      Put: noop,
      Query: noop,
    },
    '@nestjs/swagger': { ApiTags: noop },
    '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: {} },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noop,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class':
      { AuthorizationActions: {}, Sections: {} },
    '@contentfactory/nestjs-libraries/user/org.from.request': {
      GetOrgFromRequest: noop,
    },
    '@contentfactory/nestjs-libraries/user/user.from.request': {
      GetUserFromRequest: noop,
    },
    '@contentfactory/nestjs-libraries/integrations/integration.manager': {
      IntegrationManager: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service':
      { IntegrationService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/refresh.integration.service':
      { RefreshIntegrationService: class {} },
    '@contentfactory/nestjs-libraries/integrations/telegram.updates.service': {
      TelegramUpdatesService: class {},
    },
    '@contentfactory/nestjs-libraries/integrations/social/moltbook.provider': {
      MoltbookProvider: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing': {
      pricing: {},
    },
  }
);

const controllerWith = (calls) =>
  new IntegrationsController(
    {},
    {
      getWritingProfile: async (...args) => {
        calls.push(['get', ...args]);
        return { integrationId: 'channel-1' };
      },
      updateWritingProfile: async (...args) => {
        calls.push(['update', ...args]);
        return { integrationId: 'channel-1' };
      },
    },
    {},
    {},
    {}
  );

const CARD = {
  lengthPolicy: 'provider_max',
  emojiLevel: 'none',
  linkPolicy: 'end',
  hashtagPolicy: 'none',
  ctaKind: 'question',
  formatPreference: 'auto',
};

describe('each door asks the service for exactly one thing', () => {
  test('reading passes the organization of the request', async () => {
    const calls = [];
    await controllerWith(calls).getWritingProfile(
      { id: 'org-1' },
      'channel-1'
    );

    expect(calls).toEqual([['get', 'org-1', 'channel-1']]);
  });

  test('saving passes the body through untouched', async () => {
    const calls = [];
    await controllerWith(calls).updateWritingProfile(
      { id: 'org-1' },
      'channel-1',
      CARD
    );

    expect(calls).toEqual([['update', 'org-1', 'channel-1', CARD]]);
  });

  test('deleting asks for null, which is «back to the defaults»', async () => {
    const calls = [];
    await controllerWith(calls).deleteWritingProfile(
      { id: 'org-1' },
      'channel-1'
    );

    expect(calls).toEqual([['update', 'org-1', 'channel-1', null]]);
  });
});

/* -------------------------------------------------------------------------- */

const findFirst = jest.fn();
const update = jest.fn();

const { IntegrationRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': {
      IntegrationTimeDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': { PlugDto: class {} },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
  }
);

const repository = new IntegrationRepository(
  { model: { integration: { findFirst, update } } },
  {},
  {},
  {},
  {},
  {}
);

describe('a card belongs to a channel of this workspace', () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(null);
    update.mockReset().mockResolvedValue({ id: 'channel-1' });
  });

  test('reading is scoped to the organization and skips a deleted channel', async () => {
    await repository.getWritingProfile('org-1', 'channel-1');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'channel-1', organizationId: 'org-1', deletedAt: null },
      select: {
        id: true,
        name: true,
        providerIdentifier: true,
        contentLanguage: true,
        writingProfile: true,
      },
    });
  });

  test('writing is scoped to the organization too', async () => {
    await repository.updateWritingProfile('org-1', 'channel-1', {
      version: 'channel-writing-profile/v1',
    });

    expect(update.mock.calls[0][0].where).toEqual({
      id: 'channel-1',
      organizationId: 'org-1',
    });
    expect(update.mock.calls[0][0].data.writingProfile).toEqual({
      version: 'channel-writing-profile/v1',
    });
  });

  test('null becomes a database NULL, not a JSON null literal', async () => {
    await repository.updateWritingProfile('org-1', 'channel-1', null);

    // `Prisma.JsonNull` записал бы в колонку JSON-значение `null`, и карточка
    // «которой нет» стала бы карточкой, которая есть и пуста.
    expect(update.mock.calls[0][0].data.writingProfile).toBe(Prisma.DbNull);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Значок «настроено» едет в списке каналов, а не отдельной дверью.
 *
 * `content-factory-next-tu3k.6`. Экран входа показывает у каждого канала
 * «настроено» или «по умолчанию»; до этой волны он узнавал правду только после
 * открытия карточки. Список каналов экран читает и так, поэтому в нём приезжает
 * один булев флаг — и ровно флаг: карточка целиком в общем списке была бы
 * шестью настройками и заметками ради подписи в два слова.
 *
 * Смысл флага тот же, что у `stored` двери карточки, и граница та же: пустая
 * колонка — «карточки нет».
 */
const listRow = (extra) => ({
  id: 'channel-1',
  internalId: 'internal-1',
  name: 'Мой канал',
  providerIdentifier: 'telegram',
  disabled: false,
  inBetweenSteps: false,
  refreshNeeded: false,
  picture: '',
  profile: '',
  type: 'social',
  postingTimes: '[]',
  customer: null,
  additionalSettings: '[]',
  contentLanguage: 'ru',
  writingProfile: null,
  ...extra,
});

const listControllerWith = (rows) =>
  new IntegrationsController(
    { getSocialIntegration: () => ({ editor: 'normal' }) },
    { getIntegrationsForChannelList: async () => rows },
    {},
    {},
    {}
  );

describe('the channel list carries whether the card was set up', () => {
  const listOf = async (rows) =>
    (await listControllerWith(rows).getIntegrationList({ id: 'org-1' }))
      .integrations;

  test('a saved card reads as set up', async () => {
    const [channel] = await listOf([
      listRow({ writingProfile: { version: 'channel-writing-profile/v1' } }),
    ]);

    expect(channel.writingProfileStored).toBe(true);
  });

  test('an empty column reads as the defaults, like the card door', async () => {
    const [channel] = await listOf([listRow()]);

    expect(channel.writingProfileStored).toBe(false);
  });

  test('the card itself stays behind its own door', async () => {
    const [channel] = await listOf([
      listRow({ writingProfile: { emojiLevel: 'none', notes: 'секрет' } }),
    ]);

    expect(channel.writingProfile).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Дверь списка читает из базы только то, что печатает.
 *
 * `content-factory-next-tu3k.12`. Ответ этой двери никогда не содержал
 * `token` и `refreshToken`, но строка канала приезжала целиком: секрет каждого
 * канала рабочей области оказывался в памяти сервиса и контроллера на каждый
 * показ экрана, где он не нужен ни для чего. Разница между «не печатаем» и «не
 * читаем» видна только в запросе, поэтому проверяется текст метода
 * репозитория, а не ответ — ответ выше строится на поддельном репозитории и о
 * запросе не знает ничего.
 *
 * Сужен отдельный метод, а не общий `getIntegrationsList`: у общего восемь
 * вызывающих, и `intake.service` читает у строки `deletedAt`, которого в узком
 * ответе нет. Поэтому здесь же закреплено, что дверь ходит именно в узкий
 * метод — иначе правка вернётся к широкому чтению молча.
 */
describe('the channel list reads only the columns it prints', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');

  const root = join(__dirname, '..');
  const repositorySource = readFileSync(
    join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts'
    ),
    'utf8'
  );

  const narrowMethod = (() => {
    const start = repositorySource.indexOf(
      'getIntegrationsForChannelList(org: string) {'
    );
    expect(start).toBeGreaterThan(-1);
    const end = repositorySource.indexOf('\n  }\n', start);
    expect(end).toBeGreaterThan(start);
    return repositorySource.slice(start, end);
  })();

  test.each([
    ['token'],
    ['refreshToken'],
    ['tokenExpiration'],
    ['customInstanceDetails'],
  ])('the query never asks for %s', (secret) => {
    expect(narrowMethod).not.toMatch(new RegExp(`\\b${secret}\\b`));
  });

  test('it selects columns instead of taking the whole row', () => {
    expect(narrowMethod).toMatch(/select: \{/);
    expect(narrowMethod).not.toMatch(/include: \{/);
  });

  test.each([
    ['id'],
    ['internalId'],
    ['name'],
    ['picture'],
    ['providerIdentifier'],
    ['type'],
    ['disabled'],
    ['inBetweenSteps'],
    ['refreshNeeded'],
    ['profile'],
    ['postingTimes'],
    ['additionalSettings'],
    ['contentLanguage'],
    ['writingProfile'],
    ['customer'],
  ])('%s is still read, because the answer prints it', (column) => {
    expect(narrowMethod).toMatch(new RegExp(`\\b${column}: true`));
  });

  test('the workspace and the deleted rows are filtered as before', () => {
    expect(narrowMethod).toMatch(/organizationId: org/);
    expect(narrowMethod).toMatch(/deletedAt: null/);
  });

  test('the door calls the narrow method, not the wide one', () => {
    const controllerSource = readFileSync(
      join(root, 'apps/backend/src/api/routes/integrations.controller.ts'),
      'utf8'
    );

    expect(controllerSource).toMatch(
      /getIntegrationsForChannelList\(org\.id\)/
    );
    expect(controllerSource).not.toMatch(/getIntegrationsList\(/);
  });
});
