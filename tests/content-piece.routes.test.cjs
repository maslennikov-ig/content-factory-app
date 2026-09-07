'use strict';

/**
 * Пять дверей заготовки и адаптации.
 *
 * Три вещи держатся здесь вместе, и каждая из них уже однажды ломалась в этом
 * репозитории.
 *
 * Маршрут — это обещание контракту: экран строит адреса по `PIECE_ROUTES`, и
 * дверь, съехавшая на один сегмент, отвечает `404` там, где страница ждёт
 * данных. Поэтому маршруты читаются из метаданных Nest, а не из текста файла.
 *
 * Граница отказа проходит по первому байту. Пока стрим не начался, отказ —
 * обычный HTTP с кодом контракта; как только пошли строки NDJSON, менять
 * статус поздно, и всё остальное приходит последней строкой `{name:'error'}`.
 * Обе половины проверены на настоящем контроллере с поддельным сервисом.
 *
 * И тело двери. `content-factory-next-fn33.90.3`: дверь удаления без DTO
 * приняла пустое тело как «все» и стёрла все посты области стенда. Здесь
 * удаление тела не принимает вовсе, а пути без `adaptationId` не существует —
 * это проверяется, а не подразумевается.
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
  controller: 'apps/backend/src/api/routes/content-piece.controller.ts',
  dto: 'libraries/nestjs-libraries/src/dtos/content-intelligence/content-piece.dto.ts',
  module: 'apps/backend/src/api/api.module.ts',
  matrix: 'docs/product/roles-matrix.md',
};

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const contract = loadTypeScriptModule(`${BRAND_VOICE}/voice-wiring.contract.ts`);
const presentation = loadTypeScriptModule(
  `${MATERIALS}/material-presentation.ts`,
  {},
  {
    sources: {
      '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${BRAND_VOICE}/voice-wiring.contract.ts`,
    },
  }
);

const nest = require('@nestjs/common');

/**
 * Загрузка контроллера без Nest-инъекции и без сервиса.
 *
 * Сервис здесь — пустой класс: поток дверей писался параллельно с потоком
 * сервиса, и набор, который зависел бы от настоящей реализации, был бы набором
 * не про двери. Всё, что двери знают о сервисе, — это шесть подписей.
 */
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
        AuthorizationActions: {
          Create: 'create',
          Read: 'read',
          Update: 'update',
          Delete: 'delete',
        },
        Sections: { POSTS_PER_MONTH: 'posts_per_month', EDITOR: 'editor' },
      },
    '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service':
      { PieceService: class {} },
    '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-piece.dto':
      {
        PieceAdaptDto: class {},
        PieceArchiveDto: class {},
        PiecesQueryDto: class {},
      },
  },
  {
    resolve: (request) => {
      if (/(openai|undici|axios|node-fetch|integrations\/|posts\.service|\.provider$)/i.test(request)) {
        throw new Error(`дверь заготовок импортировала лишнее: ${request}`);
      }
      return undefined;
    },
  }
);
const { ContentPieceController } = controllerModule;

/**
 * Отказ сервиса, каким его видит дверь.
 *
 * Собран здесь, а не настоящим `PieceError`: контроллер читает `code`,
 * `status` и `message` утиной типизацией, и набор не должен зависеть от того,
 * в каком порядке поток сервиса расставит аргументы своего конструктора.
 * Форма — та же, что у `IntakeError` и `ContentBriefError`.
 */
const refusal = (code, status, message = '') =>
  Object.assign(new Error(message), { code, status });

const failure = async (run) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('ожидался отказ, а вызов прошёл');
};

/** Ответ Express ровно в той части, которой пользуется дверь. */
const recorder = () => {
  const lines = [];
  const headers = {};
  return {
    lines,
    headers,
    ended: () => recorder.ended,
    response: {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      write: (chunk) => lines.push(chunk),
      end: () => {
        headers.__ended = true;
      },
    },
    events: () =>
      lines
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
  };
};

/* -------------------------------------------------------------------------
 * Маршруты
 * ---------------------------------------------------------------------- */

describe('дверь отвечает ровно по тем адресам, что объявил контракт', () => {
  const declared = () => {
    const prototype = ContentPieceController.prototype;
    const base = Reflect.getMetadata('path', ContentPieceController);
    return Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const method = Reflect.getMetadata('method', prototype[name]);
        const suffix = Reflect.getMetadata('path', prototype[name]);
        const full = `${base}${suffix}`.replace(/\/+$/u, '') || base;
        return `${nest.RequestMethod[method]} ${full}`;
      });
  };

  const expected = [
    `${contract.PIECE_ROUTES.list.method} ${contract.PIECE_ROUTES.list.path}`,
    `${contract.PIECE_ROUTES.detail.method} ${contract.PIECE_ROUTES.detail.path(
      ':id'
    )}`,
    `${contract.PIECE_ROUTES.adapt.method} ${contract.PIECE_ROUTES.adapt.path(
      ':id'
    )}`,
    `${contract.PIECE_ROUTES.answer.method} ${contract.PIECE_ROUTES.answer.path(
      ':id'
    )}`,
    `${contract.PIECE_ROUTES.archive.method} ${contract.PIECE_ROUTES.archive.path(
      ':id'
    )}`,
    `${
      contract.PIECE_ROUTES.deleteAdaptation.method
    } ${contract.PIECE_ROUTES.deleteAdaptation.path(':id', ':adaptationId')}`,
  ];

  test.each(expected)('%s смонтирован', (route) => {
    expect(declared()).toContain(route);
  });

  test('сверх контракта не смонтировано ничего', () => {
    expect(declared().sort()).toEqual([...expected].sort());
  });

  /**
   * Создание — дверь входа, и второй её здесь нет. Контракт называет тот же
   * адрес (`PIECE_ROUTES.create`), и дубль создания разошёлся бы с оригиналом
   * на первой же правке.
   */
  test('создание осталось на двери входа', () => {
    expect(contract.PIECE_ROUTES.create.path).toBe(contract.INTAKE_API_BASE);
    expect(declared().join(' ')).not.toContain(contract.INTAKE_API_BASE);
  });

  test('контроллер объявлен в модуле', () => {
    const module = read(FILES.module);
    expect(module).toContain('ContentPieceController');
    expect(module).toContain(
      "from '@contentfactory/backend/api/routes/content-piece.controller'"
    );
  });
});

/* -------------------------------------------------------------------------
 * Права
 * ---------------------------------------------------------------------- */

describe('чтение открыто области, запись — редактору', () => {
  const source = read(FILES.controller);

  test('на обоих чтениях политики нет', () => {
    // Политика на `GET` закрыла бы список от Пользователя, которому владелец
    // оставил право смотреть (`docs/product/roles-matrix.md`).
    const reads = source.slice(source.indexOf("@Get('/')"), source.indexOf("@Post('/:id/adapt')"));
    expect(reads).not.toContain('@CheckPolicies');
  });

  test.each([
    ["@Post('/:id/adapt')", ['POSTS_PER_MONTH', 'EDITOR']],
    // Ответ на уточнение может стоить одной генерации — тарифный предел
    // назван первым, как и у адаптации (`content-factory-next-m2eg`).
    ["@Post('/:id/answer')", ['POSTS_PER_MONTH', 'EDITOR']],
    ["@Delete('/:id/adaptations/:adaptationId')", ['EDITOR']],
    ["@Post('/:id/archive')", ['EDITOR']],
  ])('%s несёт %s', (decorator, sections) => {
    const at = source.indexOf(decorator);
    expect(at).toBeGreaterThan(-1);
    const block = source.slice(at, at + 400);
    const named = [...block.matchAll(/Sections\.(\w+)/g)].map((m) => m[1]);
    expect(named).toEqual(sections);
  });

  test('раскладка ролей называет три двери записи', () => {
    const matrix = read(FILES.matrix);
    for (const row of [
      '| `/content-intelligence/pieces/:id/adapt` | POSTS_PER_MONTH, EDITOR | 1 |',
      '| `/content-intelligence/pieces/:id/adaptations/:adaptationId` | EDITOR | 1 |',
      '| `/content-intelligence/pieces/:id/archive` | EDITOR | 1 |',
    ]) {
      expect(matrix).toContain(row);
    }
  });
});

/* -------------------------------------------------------------------------
 * Отказ до первого байта и после него
 * ---------------------------------------------------------------------- */

describe('отказ адаптации знает, начался ли ответ', () => {
  test('незнакомый канал — 422 с кодом и предложением, до первого байта', async () => {
    const status = contract.PIECE_ERROR_CODES.PIECE_CHANNEL_UNKNOWN.status;
    const written = recorder();
    const controller = new ContentPieceController({
      prepareAdapt: async () => {
        throw refusal(
          'PIECE_CHANNEL_UNKNOWN',
          status,
          'Такого канала в рабочем пространстве нет или он отключён.'
        );
      },
      adapt: async function* () {
        throw new Error('стрим не должен был начаться');
      },
    });

    const error = await failure(() =>
      controller.adapt(
        { id: 'org-a' },
        { id: 'user-a' },
        'piece-a',
        { integrationId: 'gone' },
        written.response
      )
    );

    expect(error).toBeInstanceOf(nest.HttpException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({
      code: 'PIECE_CHANNEL_UNKNOWN',
      message: 'Такого канала в рабочем пространстве нет или он отключён.',
    });
    // Ни байта: заголовок не выставлен, строк нет, ответ не закрыт.
    expect(written.lines).toEqual([]);
    expect(written.headers['Content-Type']).toBeUndefined();
  });

  test('события идут строками NDJSON, по одной на событие', async () => {
    const written = recorder();
    const controller = new ContentPieceController({
      prepareAdapt: async () => ({ pieceId: 'piece-a', kind: 'post' }),
      adapt: async function* () {
        yield { name: 'adapt-started', pieceId: 'piece-a', kind: 'post' };
        yield { name: 'done', adaptationId: 'ad-1', postId: null };
      },
    });

    await controller.adapt(
      { id: 'org-a' },
      { id: 'user-a' },
      'piece-a',
      { integrationId: 'ch-1' },
      written.response
    );

    expect(written.headers['Content-Type']).toBe(
      'application/json; charset=utf-8'
    );
    expect(written.events().map((event) => event.name)).toEqual([
      'adapt-started',
      'done',
    ]);
    expect(written.lines.every((line) => line.endsWith('\n'))).toBe(true);
  });

  test('поломка внутри стрима приходит последней строкой, а не статусом', async () => {
    const written = recorder();
    const controller = new ContentPieceController({
      prepareAdapt: async () => ({ pieceId: 'piece-a', kind: 'post' }),
      adapt: async function* () {
        yield { name: 'adapt-started', pieceId: 'piece-a', kind: 'post' };
        throw refusal('PIECE_INTERVIEW_EXHAUSTED', 422, 'Круги кончились.');
      },
    });

    await controller.adapt(
      { id: 'org-a' },
      { id: 'user-a' },
      'piece-a',
      { integrationId: 'ch-1' },
      written.response
    );

    const events = written.events();
    expect(events[events.length - 1]).toEqual({
      name: 'error',
      error: true,
      code: 'PIECE_INTERVIEW_EXHAUSTED',
      message: 'Круги кончились.',
    });
    // Ответ всё равно закрыт: клиент не должен висеть на оборванном стриме.
    expect(written.headers.__ended).toBe(true);
  });

  test('безымянная поломка в стриме всё равно называет себя кодом', async () => {
    const written = recorder();
    const controller = new ContentPieceController({
      prepareAdapt: async () => ({ pieceId: 'piece-a' }),
      adapt: async function* () {
        yield { name: 'adapt-started', pieceId: 'piece-a' };
        throw new Error('boom');
      },
    });

    await controller.adapt(
      { id: 'org-a' },
      { id: 'user-a' },
      'piece-a',
      { integrationId: 'ch-1' },
      written.response
    );

    const last = written.events().pop();
    expect(last.name).toBe('error');
    expect(last.code).toBe('PIECE_ADAPT_FAILED');
  });
});

/* -------------------------------------------------------------------------
 * Удаление адаптации
 * ---------------------------------------------------------------------- */

describe('удаление адаптации', () => {
  test('опубликованная не удаляется: 409 и код контракта', async () => {
    const status = contract.PIECE_ERROR_CODES.ADAPTATION_PUBLISHED.status;
    expect(status).toBe(409);

    const controller = new ContentPieceController({
      deleteAdaptation: async () => {
        throw refusal('ADAPTATION_PUBLISHED', status);
      },
    });

    const error = await failure(() =>
      controller.deleteAdaptation({ id: 'org-a' }, 'piece-a', 'ad-1')
    );

    expect(error.getStatus()).toBe(409);
    expect(error.getResponse().code).toBe('ADAPTATION_PUBLISHED');
    // Предложение, а не код: человек читает, почему след остаётся.
    expect(error.getResponse().message).toContain(
      'Происхождение опубликованного текста не стирается'
    );
  });

  test('тот же отказ по-английски, когда просили по-английски', async () => {
    const controller = new ContentPieceController({
      deleteAdaptation: async () => {
        throw refusal('ADAPTATION_PUBLISHED', 409);
      },
    });

    const error = await failure(() =>
      controller.deleteAdaptation({ id: 'org-a' }, 'piece-a', 'ad-1', 'en')
    );

    expect(error.getResponse().message).toContain('already published');
  });

  test('слово сервиса сильнее запасного: свой текст доходит как есть', async () => {
    const controller = new ContentPieceController({
      deleteAdaptation: async () => {
        throw refusal('ADAPTATION_NOT_FOUND', 404, 'Версия уже удалена.');
      },
    });

    const error = await failure(() =>
      controller.deleteAdaptation({ id: 'org-a' }, 'piece-a', 'ad-1')
    );

    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({
      code: 'ADAPTATION_NOT_FOUND',
      message: 'Версия уже удалена.',
    });
  });

  /**
   * `content-factory-next-fn33.90.3` дословно: дверь удаления, у которой тело
   * решает, что удалять, однажды удалила всё. Здесь удалять нечем, кроме двух
   * идентификаторов из пути.
   */
  test('у двери удаления нет ни тела, ни пути без идентификатора версии', () => {
    const source = read(FILES.controller);
    const at = source.indexOf("@Delete(");
    const block = source.slice(at, source.indexOf("@Post('/:id/archive')"));

    expect(block).not.toContain('@Body(');
    expect(block).toContain("@Param('adaptationId')");
    // Ни одного `@Delete` без `adaptationId` в пути: массового удаления нет
    // даже как маршрута, поэтому промахнуться некуда.
    const deletes = [...source.matchAll(/@Delete\('([^']*)'\)/g)].map(
      (match) => match[1]
    );
    expect(deletes).toEqual(['/:id/adaptations/:adaptationId']);
  });

  test('каждая дверь берёт область из запроса, а не из того, что прислали', async () => {
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
    const controller = new ContentPieceController(stub);
    const organization = { id: 'org-a' };

    await controller.list(organization, {});
    await controller.detail(organization, 'piece-a');
    await controller.deleteAdaptation(organization, 'piece-a', 'ad-1');
    await controller.archive(organization, 'piece-a', { archived: true });

    expect(seen).toEqual(['org-a', 'org-a', 'org-a', 'org-a']);
  });
});

/* -------------------------------------------------------------------------
 * Что дверь принимает
 * ---------------------------------------------------------------------- */

describe('DTO отказывает мусору и принимает то, что объявил контракт', () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const dto = loadTypeScriptModule(FILES.dto, {}, { sources: {} });

  const codes = async (Klass, plain) =>
    (await validate(plainToInstance(Klass, plain))).map(
      (failed) => failed.property
    );

  /**
   * Списка шести видов в контракте нет как значения — только как тип, а
   * проверяющему нужна строка во время выполнения. Значит, список в DTO
   * держится сверкой с тем, что уже объявлено значением: виды площадок плюс
   * «позже».
   */
  test('шесть видов адаптации — те же шесть, что знает продукт', () => {
    const fromProduct = new Set([
      'post',
      ...Object.values(presentation.KINDS_BY_PROVIDER).flat(),
      ...contract.ADAPTATION_KINDS_LATER,
    ]);

    expect([...dto.PIECE_ADAPTATION_KINDS].sort()).toEqual(
      [...fromProduct].sort()
    );
  });

  test('вид вне списка не проходит', async () => {
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        kind: 'videoclip',
      })
    ).toEqual(['kind']);

    // А объявленный — проходит, даже «позже»: отказать по нему должен сервис
    // кодом `ADAPTATION_KIND_UNSUPPORTED`, чтобы человек прочёл «позже», а не
    // «неверное значение».
    expect(
      await codes(dto.PieceAdaptDto, { integrationId: 'ch-1', kind: 'video' })
    ).toEqual([]);
  });

  test('«Реши сама» не приходит ответом человека', async () => {
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        answers: [{ key: 'hook', text: 'Вот так', origin: 'model' }],
      })
    ).toEqual(['answers']);

    for (const origin of ['person', 'confirmed']) {
      expect(
        await codes(dto.PieceAdaptDto, {
          integrationId: 'ch-1',
          answers: [{ key: 'hook', text: 'Вот так', origin }],
        })
      ).toEqual([]);
    }
  });

  test('ключ вопроса вне девяти не проходит ни ответом, ни «реши сама»', async () => {
    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        answers: [{ key: 'wallet_seed', text: 'нет', origin: 'person' }],
      })
    ).toEqual(['answers']);

    expect(
      await codes(dto.PieceAdaptDto, {
        integrationId: 'ch-1',
        decideKeys: ['wallet_seed'],
      })
    ).toEqual(['decideKeys']);
  });

  test('канал обязателен и пустой строкой не подменяется', async () => {
    expect(await codes(dto.PieceAdaptDto, {})).toEqual(['integrationId']);
    expect(await codes(dto.PieceAdaptDto, { integrationId: '' })).toEqual([
      'integrationId',
    ]);
  });

  test('поля брифа в двери ответов — те же пять, что знают ворота', async () => {
    /*
      Список в DTO написан заново: `IsIn` нужна строка во время выполнения, а
      тип `BriefField` в проверяющий не попадает. Здесь он сверяется с воротами
      — двум спискам одного решения незачем расходиться.
    */
    expect([...dto.PIECE_BRIEF_FIELDS].sort()).toEqual(
      ['thesis', 'facts', 'position', 'disagreement', 'audience'].sort()
    );
  });

  test('ответ опознаётся полем брифа, а чужое поле не проходит', async () => {
    expect(await codes(dto.PieceAnswerDoorDto, {})).toEqual([]);
    expect(
      await codes(dto.PieceAnswerDoorDto, {
        answers: [{ field: 'facts', text: 'своими словами' }],
      })
    ).toEqual([]);
    expect(
      await codes(dto.PieceAnswerDoorDto, {
        answers: [{ field: 'wallet_seed', text: 'нет' }],
      })
    ).toEqual(['answers']);
    expect(
      await codes(dto.PieceAnswerDoorDto, { decide: ['wallet_seed'] })
    ).toEqual(['decide']);
    expect(await codes(dto.PieceAnswerDoorDto, { decide: ['facts'] })).toEqual(
      []
    );
  });

  test('архив требует сказанного решения, а не пустого тела', async () => {
    expect(await codes(dto.PieceArchiveDto, {})).toEqual(['archived']);
    expect(await codes(dto.PieceArchiveDto, { archived: false })).toEqual([]);
    expect(await codes(dto.PieceArchiveDto, { archived: 'да' })).toEqual([
      'archived',
    ]);
  });

  test('фильтры списка: четыре состояния, «да» строкой из адреса', async () => {
    expect(await codes(dto.PiecesQueryDto, {})).toEqual([]);
    expect(await codes(dto.PiecesQueryDto, { state: 'burning' })).toEqual([
      'state',
    ]);
    for (const state of ['published', 'queued', 'error', 'draft']) {
      expect(await codes(dto.PiecesQueryDto, { state })).toEqual([]);
    }

    const query = plainToInstance(dto.PiecesQueryDto, {
      includeArchived: 'true',
      q: 'подшипники',
      missingOn: 'telegram',
    });
    expect(await validate(query)).toEqual([]);
    expect(query.includeArchived).toBe(true);
  });
});
