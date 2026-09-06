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
