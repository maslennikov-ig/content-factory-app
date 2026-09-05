'use strict';

/**
 * Генератор сам ищет в вебе — и только когда это уместно
 * (`content-factory-next-ec48.1`, решение владельца 05.09.2026).
 *
 * Платная проверка 05.09 (`docs/product/material-quality-check-2026-09-05.md`)
 * показала пустое место в середине продукта: строитель контекста берёт только
 * то, что уже лежит в памяти области, а класть туда свежее было некому —
 * витрина «Откуда факты» ждёт, что человек сходит поискать сам. Пять генераций
 * подряд опирались ни на что.
 *
 * Здесь проверяется весь ход целиком, без единого платного вызова: поиск
 * подменён, реестр источников подменён, до модели дело не доходит — набор
 * берёт из потока только первое событие, а оно выдаётся раньше, чем граф
 * скомпилирован.
 *
 * Три условия, и все три — про то, чтобы не мешать человеку и не тратить
 * чужие деньги: явный материал отменяет поиск, выключенный поиск не считается
 * поломкой, отказ поиска не валит генерацию.
 */

const path = require('node:path');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const SERVICE = 'libraries/nestjs-libraries/src/agent/agent.graph.service.ts';

/** Своя, чтобы набор мог её бросить и проверить `instanceof` в продукте. */
class WebSearchNotConfigured extends Error {}

const { AgentGraphService } = loadWithMocks(SERVICE, {
  '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
    PostsService: class {},
  },
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {
    MediaService: class {},
  },
  '@contentfactory/nestjs-libraries/upload/upload.factory': {
    UploadFactory: { createStorage: () => ({}) },
  },
  '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
    GeneratorDto: class {},
  },
  '@contentfactory/nestjs-libraries/openai/generation.error': {
    generationError: (error) => error,
  },
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async () => {
      throw new Error('no model call belongs in this suite');
    },
    getImageModel: async () => {
      throw new Error('no model call belongs in this suite');
    },
  },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
    AiUsageService: class {},
  },
  '@contentfactory/nestjs-libraries/openai/web.research.service': {
    WebResearchService: class {},
    WebSearchNotConfigured,
  },
  '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service':
    { ContentContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    { BrandProfileContextService: class {} },
  '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service':
    { ContentSourceRegistryService: class {} },
});

const envelope = () => ({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  builtAt: '2026-09-05T10:00:00.000Z',
  expiresAt: '2026-09-05T10:15:00.000Z',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence: [],
  rejected: [],
  errorCode: null,
  renderedCharacterCount: 0,
  selectionHash: 'selection-1',
});

const searchAnswer = () => ({
  summary: 'Что нашлось',
  provider: 'tavily',
  facts: [
    { text: 'Первая находка.', sourceUrl: 'https://example.test/one' },
    { text: 'Вторая находка.', sourceUrl: 'https://example.test/two' },
  ],
  sources: [
    {
      url: 'https://example.test/one',
      title: 'Первый источник',
      publishedAt: '2026-09-01T00:00:00.000Z',
      provider: 'tavily',
    },
  ],
});

const body = (overrides = {}) => ({
  research: 'Что нового у ретейлеров',
  isPicture: false,
  format: 'one_short',
  tone: 'company',
  language: 'ru',
  ...overrides,
});

/**
 * Собирает сервис с подменёнными сотрудниками и прокручивает `start()` ровно
 * до первого события. Дальше идёт компиляция графа и платные узлы, а всё, что
 * этот набор судит, случается раньше.
 */
const run = async ({ research, accept, requestBody = body() }) => {
  const calls = { research: [], accept: [], build: [] };
  const service = new AgentGraphService(
    {},
    {},
    {
      research: async (...args) => {
        calls.research.push(args);
        return research();
      },
    },
    { executeAiStreamOperation: () => (async function* () {})() },
    {
      build: async (organizationId, request) => {
        calls.build.push([organizationId, request]);
        return envelope();
      },
    },
    { resolve: async () => ({ effectiveVoice: {} }) },
    null,
    {
      acceptSearchResult: async (...args) => {
        calls.accept.push(args);
        return accept(...args);
      },
    }
  );
  const iterator = service.start('org-a', requestBody);
  const first = await iterator.next();
  return { calls, first };
};

const acceptsInOrder = () => {
  let index = 0;
  return async () => ({ evidenceId: `evidence-${++index}` });
};

describe('the generator looks for material itself when nobody handed it any', () => {
  test('the find is kept as evidence and handed to the builder as explicit material', async () => {
    const { calls } = await run({
      research: searchAnswer,
      accept: acceptsInOrder(),
    });

    expect(calls.research).toEqual([
      ['org-a', 'Что нового у ретейлеров', { language: 'ru' }],
    ]);
    // Заголовок и дата берутся из строки источника с тем же адресом, а
    // находка без своей строки не выдумывает их и не теряется.
    expect(calls.accept.map(([, input]) => input)).toEqual([
      {
        url: 'https://example.test/one',
        title: 'Первый источник',
        excerpt: 'Первая находка.',
        publishedAt: '2026-09-01T00:00:00.000Z',
        provider: 'tavily',
      },
      {
        url: 'https://example.test/two',
        title: null,
        excerpt: 'Вторая находка.',
        publishedAt: null,
        provider: 'tavily',
      },
    ]);
    // Каждая находка сохраняется с просьбой переиспользовать запись того же
    // адреса (рецензия ec48, P2-4), а не только того же куска.
    expect(calls.accept.map(([, , options]) => options)).toEqual(
      calls.accept.map(() => ({ reuseBy: 'url' }))
    );
    expect(calls.build).toHaveLength(1);
    expect(calls.build[0][1].userMaterialEvidenceIds).toEqual([
      'evidence-1',
      'evidence-2',
    ]);
  });

  test('a person who brought their own material is not argued with', async () => {
    const { calls } = await run({
      research: () => {
        throw new Error('web search must not run over explicit material');
      },
      accept: acceptsInOrder(),
      requestBody: body({ sourceIds: ['source-1'] }),
    });

    expect(calls.research).toEqual([]);
    expect(calls.accept).toEqual([]);
    expect(calls.build[0][1].sourceIds).toEqual(['source-1']);
    expect(calls.build[0][1].userMaterialEvidenceIds).toBeUndefined();
  });

  test('search switched off in the workspace is a setting, not a failure', async () => {
    const { calls, first } = await run({
      research: () => {
        throw new WebSearchNotConfigured();
      },
      accept: acceptsInOrder(),
    });

    expect(calls.accept).toEqual([]);
    expect(calls.build).toHaveLength(1);
    expect(calls.build[0][1].userMaterialEvidenceIds).toBeUndefined();
    // Генерация идёт дальше, и ложного «поиск был» в ней нет: контекст пуст,
    // а честный ответ промпту даёт `research()` по пустому контексту.
    expect(first.value.name).toBe('content-context');
  });

  test('one unusable find does not take the others with it', async () => {
    let seen = 0;
    const { calls } = await run({
      research: searchAnswer,
      accept: async () => {
        seen += 1;
        if (seen === 1) throw new Error('PARSE_FAILED');
        return { evidenceId: 'evidence-2' };
      },
    });

    expect(calls.accept).toHaveLength(2);
    expect(calls.build[0][1].userMaterialEvidenceIds).toEqual(['evidence-2']);
  });

  test('a search that answers with nothing leaves the context empty', async () => {
    const { calls } = await run({
      research: () => ({
        summary: '',
        provider: 'tavily',
        facts: [],
        sources: [],
      }),
      accept: acceptsInOrder(),
    });

    expect(calls.accept).toEqual([]);
    expect(calls.build[0][1].userMaterialEvidenceIds).toBeUndefined();
  });
});

test('the suite reads the shipped generation node, not a copy of it', () => {
  expect(path.basename(SERVICE)).toBe('agent.graph.service.ts');
});
