'use strict';

/**
 * Дверь проверки на ИИ-штампы.
 *
 * `content-factory-next-tu3k.3`. У этой двери три обещания, и каждое здесь
 * проверено, потому что каждое легко потерять правкой рядом:
 *
 *  - право редактора. Проверять текст может тот, кто его пишет; участнику без
 *    роли проверять нечего, у него нет черновика;
 *  - двадцать тысяч знаков — тот же потолок, что у входа одной мыслью. Разные
 *    потолки означали бы отказ на тексте, который продукт минуту назад
 *    согласился прочитать;
 *  - ни модели, ни базы, ни платформы. Дверь считает строку и возвращает
 *    находки; из-за этого её нет ни в допуске ИИ, ни в расходе.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const CONTROLLER = 'apps/backend/src/api/routes/content-text-quality.controller.ts';
const DTO = 'libraries/nestjs-libraries/src/dtos/content-intelligence/text-quality.dto.ts';
const VOICE_DIR = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const noopDecorator = () => () => undefined;

const policies = [];

const mocks = {
  '@nestjs/swagger': { ApiTags: noopDecorator },
  '@contentfactory/backend/services/auth/permissions/permissions.ability': {
    CheckPolicies: (...args) => {
      policies.push(args);
      return () => undefined;
    },
  },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class':
    {
      AuthorizationActions: {
        Create: 'create',
        Read: 'read',
        Update: 'update',
        Delete: 'delete',
      },
      Sections: {
        EDITOR: 'editor',
        ADMIN: 'admin',
        POSTS_PER_MONTH: 'posts_per_month',
      },
    },
};

const { ContentTextQualityController } = loadTypeScriptModule(CONTROLLER, mocks);
const { SlopCheckDto } = loadTypeScriptModule(DTO);
const contract = loadTypeScriptModule(`${VOICE_DIR}/voice-wiring.contract.ts`);

const read = (relative) =>
  fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

describe('дверь стоит там, где её объявил контракт', () => {
  test('путь и способ — те же, что в INTAKE_ROUTES', () => {
    const base = Reflect.getMetadata('path', ContentTextQualityController);
    const own = Reflect.getMetadata(
      'path',
      ContentTextQualityController.prototype.check
    );

    expect(`${base}${own}`).toBe(contract.INTAKE_ROUTES.slopCheck.path);
    expect(`${base}${own}`).toBe(
      `${contract.TEXT_QUALITY_API_BASE}/slop-check`
    );

    const { RequestMethod } = require('@nestjs/common');
    expect(
      Reflect.getMetadata('method', ContentTextQualityController.prototype.check)
    ).toBe(RequestMethod.POST);
  });

  test('открыта редактору, и только по праву писать', () => {
    // Одна политика, а не две: пост эта дверь не создаёт, поэтому месячного
    // лимита постов у неё быть не может.
    expect(policies).toHaveLength(1);
    expect(policies[0]).toEqual([['create', 'editor']]);
  });
});

describe('потолок текста — двадцать тысяч знаков', () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');

  test('ровно потолок проходит, знак сверху — отказ', async () => {
    const atCeiling = plainToInstance(SlopCheckDto, { text: 'а'.repeat(20_000) });
    expect(await validate(atCeiling)).toEqual([]);

    const over = plainToInstance(SlopCheckDto, { text: 'а'.repeat(20_001) });
    const refusals = await validate(over);
    expect(refusals).not.toEqual([]);
    expect(refusals[0].property).toBe('text');
  });

  test('потолок тот же, что у входа одной мыслью', () => {
    expect(contract.INTAKE_INPUT_MAX_CHARS).toBe(20_000);
    expect(read(DTO)).toContain('20_000');
  });

  test('язык — только ru или en', async () => {
    const ru = plainToInstance(SlopCheckDto, { text: 'Текст.', locale: 'ru' });
    expect(await validate(ru)).toEqual([]);

    const wrong = plainToInstance(SlopCheckDto, { text: 'Текст.', locale: 'de' });
    const refusals = await validate(wrong);
    expect(refusals.map((row) => row.property)).toEqual(['locale']);
  });

  test('незнакомая площадка отказом не становится', async () => {
    const unknown = plainToInstance(SlopCheckDto, {
      text: 'Текст.',
      platform: 'mastodon',
    });

    expect(await validate(unknown)).toEqual([]);
  });

  test('текст обязателен: пустое тело — отказ, а не пустой отчёт', async () => {
    const refusals = await validate(plainToInstance(SlopCheckDto, {}));

    expect(refusals.map((row) => row.property)).toEqual(['text']);
  });
});

describe('дверь считает строку и ничего больше', () => {
  test('отчёт приходит из общей проверки, с площадкой и языком запроса', () => {
    const controller = new ContentTextQualityController();

    const answer = controller.check({
      text: 'В современном мире важно отметить, что это не просто текст.',
      platform: 'telegram',
      locale: 'ru',
    });

    expect(answer.version).toBe('slop-check/1.0.0');
    expect(answer.platform).toBe('telegram');
    expect(answer.locale).toBe('ru');
    expect(answer.findings.length).toBeGreaterThan(0);
    expect(answer.verdict).toMatch(/clean|review|rewrite/);
  });

  test('ни модели, ни базы, ни площадки публикации', () => {
    const code = read(CONTROLLER)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    expect(/openai|anthropic|AiProvider|ai\.service/i.test(code)).toBe(false);
    expect(/prisma|Repository|\.model\./i.test(code)).toBe(false);
    expect(/fetch\(|axios|undici/.test(code)).toBe(false);
    // Ни одного динамического импорта по алиасу: это отдельный страж
    // репозитория, и новая дверь его не должна ронять.
    expect(/await import\(/.test(code)).toBe(false);
  });

  test('организация ей не нужна и не запрашивается', () => {
    // Ничего не читается и не пишется, поэтому и области видимости тут не за
    // чем следить: тело приходит и уходит.
    expect(read(CONTROLLER)).not.toContain('GetOrgFromRequest');
  });
});
