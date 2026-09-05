'use strict';

/**
 * Поиск по фактам — по словам (`content-factory-next-odb8.4`, решение
 * владельца 05.09.2026: обычный текстовый поиск, смысловой — потом).
 *
 * Проверяется ровно то, чего раньше не было и что легко построить наполовину:
 *
 *  - слова доезжают до `where` вместе с `organizationId`, а не вместо него;
 *  - каждое слово обязано встретиться, но встретиться может в любом из полей
 *    карточки — утверждение, тема, значение;
 *  - экран спрашивает сервер, а не прячет уже полученные строки у себя. Это
 *    не придирка: каталог приходит с `take: 100`, поэтому прежний клиентский
 *    поиск честно не видел ничего за первой сотней и молчал об этом;
 *  - поле уходит на сервер с задержкой, а не на каждый набранный символ;
 *  - когда не нашлось ничего, человек видит «ничего не найдено» и поле, в
 *    котором может поправить запрос, а не пустой экран без поиска.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadTypeScriptModule: loadModule } = require('./helpers/load-ts-module.cjs');

const CONTEXT = 'libraries/nestjs-libraries/src/content-intelligence/context';
const base = 'apps/frontend/src/components/content-intelligence';

const FILES = {
  factRepository: `${CONTEXT}/content-fact.repository.ts`,
  searchTerms:
    'libraries/nestjs-libraries/src/content-intelligence/search-terms.ts',
  showcase: `${base}/content-facts.showcase.tsx`,
  adapter: `${base}/content-facts.adapter.ts`,
};

/* -------------------------------------------------------------------------
 * Запрос: слова внутри границы пространства
 * ---------------------------------------------------------------------- */

const searchTerms = loadModule(FILES.searchTerms);

const repositoryModule = loadModule(FILES.factRepository, {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
});
const { ContentFactRepository } = repositoryModule;

const factStore = () => {
  const calls = [];
  const model = {
    contentFact: {
      findMany: async (args = {}) => {
        calls.push(args);
        return [];
      },
    },
    user: { findMany: async () => [] },
  };
  return {
    calls,
    repository: new ContentFactRepository({ model }, { model }),
  };
};

describe('слова факта доезжают до запроса, не подвинув организацию', () => {
  test('пустой поиск оставляет запрос ровно тем, чем он был', async () => {
    const { calls, repository } = factStore();
    await repository.listFacts('org-a');

    expect(calls[0].where).toEqual({
      organizationId: 'org-a',
      status: { not: 'TOMBSTONED' },
    });
  });

  test('слова кладутся внутрь того же where, рядом с organizationId', async () => {
    const { calls, repository } = factStore();
    await repository.listFacts('org-a', ['пробный', 'период']);

    const where = calls[0].where;
    expect(where.organizationId).toBe('org-a');
    expect(where.status).toEqual({ not: 'TOMBSTONED' });
    // И по словам, ИЛИ по полям: слово может стоять в утверждении, в теме
    // или в значении, но встретиться обязано каждое.
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toEqual([
      { statement: { contains: 'пробный', mode: 'insensitive' } },
      { claimKey: { contains: 'пробный', mode: 'insensitive' } },
      { valueText: { contains: 'пробный', mode: 'insensitive' } },
    ]);
    expect(where.AND[1].OR[0]).toEqual({
      statement: { contains: 'период', mode: 'insensitive' },
    });
  });

  test('никакой набор слов не заменяет organizationId', async () => {
    const { calls, repository } = factStore();
    await repository.listFacts('org-a', ['organizationId', 'org-b']);

    expect(calls[0].where.organizationId).toBe('org-a');
  });

  test('поиск идёт моделями Prisma, без сырого SQL и расширений Postgres', () => {
    const code = fs.readFileSync(path.join(root, FILES.factRepository), 'utf8');

    expect(code).not.toMatch(/\$queryRaw|\$executeRaw/);
    expect(code).not.toMatch(/to_tsvector|pg_trgm|websearch_to_tsquery/i);
  });
});

describe('разбор запроса на слова', () => {
  const { searchWords, MAX_SEARCH_WORDS, MAX_SEARCH_QUERY_LENGTH } = searchTerms;

  test('запятые и лишние пробелы — такие же разделители, как пробел', () => {
    expect(searchWords('  поставщик,   подшипники ')).toEqual([
      'поставщик',
      'подшипники',
    ]);
  });

  test('пустое и не-строка дают пустой список, а не падение', () => {
    expect(searchWords('')).toEqual([]);
    expect(searchWords('   ')).toEqual([]);
    expect(searchWords(null)).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
  });

  test('число слов ограничено, а лишние отбрасываются молча', () => {
    const many = Array.from({ length: 30 }, (_, i) => `слово${i}`).join(' ');
    expect(searchWords(many)).toHaveLength(MAX_SEARCH_WORDS);
  });

  test('длина запроса ограничена той же константой, что и в DTO', () => {
    expect(MAX_SEARCH_QUERY_LENGTH).toBe(200);
    expect(searchWords('я'.repeat(MAX_SEARCH_QUERY_LENGTH + 50)).join('')).toHaveLength(
      MAX_SEARCH_QUERY_LENGTH
    );
  });
});

/* -------------------------------------------------------------------------
 * Экран: спрашивает сервер, и не на каждый символ
 * ---------------------------------------------------------------------- */

const showcase = loadTypeScriptModule(FILES.showcase);
const adapter = loadTypeScriptModule(FILES.adapter);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);

const ok = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  clone() {
    return this;
  },
});

const FACT = {
  id: 'fact-1',
  claimKey: 'pricing|trial_length',
  topic: 'pricing',
  topicLabel: 'Pricing',
  statement: 'Пробный период — 14 дней.',
  language: 'ru',
  temporalKind: 'TIMELESS',
  freshUntil: null,
  status: 'UNVERIFIED',
  createdAt: '2026-09-01T10:00:00.000Z',
  grounding: { method: 'OWN_WORD' },
  evidence: [],
};

let urls = [];

const serve = (answerFor) => {
  urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return ok({ facts: answerFor(String(url)) });
  };
};

const renderShowcase = async () => {
  await act(async () => {
    render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map(), dedupingInterval: 0 } },
        React.createElement(
          variables.VariableContextComponent,
          { language: 'ru' },
          React.createElement(showcase.ContentFactsShowcase)
        )
      )
    );
  });
  await act(async () => {});
};

const searchField = () =>
  document.querySelector('input[type="search"]');

const type = async (value) => {
  await act(async () => {
    fireEvent.change(searchField(), { target: { value } });
  });
};

const waitDebounce = async () => {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await act(async () => {});
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  delete global.fetch;
});

describe('витрина фактов спрашивает сервер, а не прячет строки у себя', () => {
  test('пустое поле спрашивает тот же адрес, что и раньше', async () => {
    serve(() => [FACT]);
    await renderShowcase();

    expect(urls).toEqual(['/content-intelligence/facts']);
    expect(adapter.factsListUrl('')).toBe('/content-intelligence/facts');
    expect(adapter.factsListUrl('  ')).toBe('/content-intelligence/facts');
  });

  test('набранное уходит в q — после задержки, а не на каждый символ', async () => {
    serve(() => [FACT]);
    await renderShowcase();
    urls = [];

    await type('про');
    await type('проб');
    await type('пробный');
    // Пока человек печатает, сервер не спрашивают ни разу.
    expect(urls).toEqual([]);

    await waitDebounce();

    expect(urls).toEqual([
      `/content-intelligence/facts?q=${encodeURIComponent('пробный')}`,
    ]);
  });

  test('когда не нашлось ничего — «ничего не найдено» и поле остаётся', async () => {
    serve((url) => (url.includes('q=') ? [] : [FACT]));
    await renderShowcase();

    await type('подшипники');
    await waitDebounce();

    expect(document.body.textContent).toContain('Ничего не найдено');
    // Поле никуда не делось: иначе человек с опечаткой теряет вместе с
    // ответом и то, чем мог бы её поправить.
    expect(searchField()).not.toBeNull();
    expect(searchField().value).toBe('подшипники');
  });

  test('найденные слова подсвечены через <mark> с токенами темы', async () => {
    serve(() => [FACT]);
    await renderShowcase();

    await type('пробный');
    await waitDebounce();

    const marks = [...document.querySelectorAll('mark')];
    expect(marks.map((mark) => mark.textContent.toLocaleLowerCase())).toContain(
      'пробный'
    );
    // Жёлтый по умолчанию — это hex мимо темы и нечитаемый текст на тёмном.
    for (const mark of marks) {
      expect(mark.className).toMatch(/cf-/);
      expect(mark.className).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  test('экран больше не отбирает строки по тому же слову у себя', () => {
    const code = fs.readFileSync(path.join(root, FILES.showcase), 'utf8');

    // Повторный клиентский отбор спрятал бы факт, подошедший по теме или по
    // значению, а не по тексту утверждения, — то есть спорил бы с ответом.
    expect(code).not.toMatch(/statement\.toLocaleLowerCase\(\)\.includes/);
  });
});
