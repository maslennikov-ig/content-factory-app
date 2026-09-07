'use strict';

require('reflect-metadata');

/**
 * Внутренний поиск действительно доезжает до тех, кто его спрашивает.
 *
 * `content-factory-next-m2eg.19`. Зелёный набор доказывает единицу и никогда
 * не доказывает проводку — это записано в `upload-module.wiring.test.cjs`,
 * который появился после того, как приложение отказалось стартовать при
 * полностью зелёных наборах.
 *
 * Здесь ловится вторая форма той же ошибки, и она хуже первой, потому что
 * тихая. Параметр объявлен как `TextSearchService | null`, а
 * `emitDecoratorMetadata` пишет для объединения `Object`: Nest пошёл бы
 * искать провайдера `Object`, не нашёл бы, и `@Optional()` подставил бы
 * `undefined`. Приложение стартует, наборы зелены, поиска нет — и узнать об
 * этом можно было бы только на боевом, по молчащему списку «свои тексты по
 * теме».
 *
 * Поэтому модуль здесь собирается по-настоящему, а проверка — та самая, что
 * различает две формы: сервис, а не `undefined`.
 */

const { Test } = require('@nestjs/testing');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const SEARCH =
  'libraries/nestjs-libraries/src/content-intelligence/search/text-search.service.ts';
const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const { TextSearchService } = loadTypeScriptModule(SEARCH, prismaMocks);

/**
 * Токен репозитория берётся у самого сервиса, а не вторым чтением файла.
 *
 * Загрузчик наборов исполняет модуль заново на каждый вызов, поэтому второе
 * чтение `text-search.repository.ts` дало бы ДРУГОЙ класс с тем же именем —
 * Nest не нашёл бы его и отказал бы там, где в приложении всё сходится. То,
 * что этот токен вообще читается, — уже проверка: параметр объявлен обычным
 * типом, и метаданные о нём есть.
 */
const REPOSITORY_TOKEN = Reflect.getMetadata(
  'design:paramtypes',
  TextSearchService
)[0];

describe('the internal search is constructible by Nest', () => {
  test('the service resolves its repository', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TextSearchService,
        { provide: REPOSITORY_TOKEN, useValue: { load: async () => ({}) } },
      ],
    }).compile();

    expect(moduleRef.get(TextSearchService)).toBeInstanceOf(TextSearchService);
  });

  test('a consumer really receives the service, not a silent undefined', async () => {
    const { Injectable, Inject, Optional } = require('@nestjs/common');

    /*
      Тот же приём, что в продукте: `@Optional()` вместе с явным `@Inject`.
      Именно `@Inject` и делает проводку живой — без него metadata параметра
      была бы `Object`.
    */
    class Consumer {
      constructor(search) {
        this.search = search;
      }
    }
    Injectable()(Consumer);
    Optional()(Consumer, undefined, 0);
    Inject(TextSearchService)(Consumer, undefined, 0);

    const moduleRef = await Test.createTestingModule({
      providers: [
        Consumer,
        TextSearchService,
        { provide: REPOSITORY_TOKEN, useValue: { load: async () => ({}) } },
      ],
    }).compile();

    expect(moduleRef.get(Consumer).search).toBeInstanceOf(TextSearchService);
  });

  test('a workspace without the provider still boots the consumer', async () => {
    const { Injectable, Inject, Optional } = require('@nestjs/common');

    class Consumer {
      constructor(search) {
        this.search = search;
      }
    }
    Injectable()(Consumer);
    Optional()(Consumer, undefined, 0);
    Inject(TextSearchService)(Consumer, undefined, 0);

    const moduleRef = await Test.createTestingModule({
      providers: [Consumer],
    }).compile();

    // Запасной путь — поиск по словам — по-прежнему работает, поэтому
    // отсутствие провайдера не должно валить сборку.
    expect(moduleRef.get(Consumer).search).toBeUndefined();
  });
});

describe('the consumers ask for the service by an explicit token', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');

  test.each([
    'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts',
    'libraries/nestjs-libraries/src/content-intelligence/materials/content-material.service.ts',
    'libraries/nestjs-libraries/src/content-intelligence/context/content-fact.service.ts',
  ])('%s names the token instead of trusting the emitted type', (file) => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');

    expect(source).toMatch(
      /@Optional\(\)\s*\n\s*@Inject\(TextSearchService\)/
    );
  });

  test('the module that owns the provider lists both halves', () => {
    const module = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/database/prisma/database.module.ts'
      ),
      'utf8'
    );

    expect(module).toMatch(/TextSearchRepository,/);
    expect(module).toMatch(/TextSearchService,/);
  });
});
