'use strict';

/**
 * Внутренний поиск области: индекс, стемминг, площадка и сброс.
 *
 * `content-factory-next-m2eg.19`, решение владельца 07.09.2026: «нам это нужно
 * сразу сделать, чтобы модель научилась на них ссылаться… использовал
 * внутренний поиск для этого… какую-то хорошую библиотеку для поиска взял, а
 * не сам городил».
 *
 * Здесь проверяется то, ради чего библиотеку и брали, а не то, что она
 * работает: русский стемминг («сроки» находят «срок» — этого поиск по словам
 * через `contains` не умел никогда), отбор по площадке, «только то, на что
 * можно сослаться», и то, что запись текста делает его находимым сразу.
 *
 * Ни базы, ни сети: репозиторий подменён, и в нём лежат ровно те строки, из
 * которых сервис собирает документы.
 */

const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const INDEX =
  'libraries/nestjs-libraries/src/content-intelligence/search/text-search.index.ts';
const SERVICE =
  'libraries/nestjs-libraries/src/content-intelligence/search/text-search.service.ts';

const { TextSearchIndex, excerptOf, stemWord } = loadTypeScriptModule(INDEX);
const { TextSearchService, TEXT_SEARCH_TTL_MS } = loadTypeScriptModule(SERVICE);

const at = (iso) => new Date(iso);

/** Область с четырьмя текстами: заготовка, две адаптации и пост из календаря. */
const rows = (overrides = {}) => ({
  pieces: [
    {
      id: 'piece-1',
      title: 'Почему мы держим сроки поставки',
      body: 'Из шести сроков сдвинулись пять. Клиентский срок не сдвинулся ни разу.',
      createdAt: at('2026-08-01T10:00:00.000Z'),
    },
    {
      id: 'piece-2',
      title: 'Про кофе в студии',
      body: 'Мы поставили вторую кофемашину и перестали спорить о зёрнах.',
      createdAt: at('2026-08-02T10:00:00.000Z'),
    },
  ],
  derivations: [
    {
      id: 'adaptation-1',
      contentPieceId: 'piece-1',
      platform: 'telegram',
      title: 'Срок, о котором знает клиент',
      body: 'Срок держится, когда о нём знает кто-то ещё.',
      createdAt: at('2026-08-03T10:00:00.000Z'),
      postId: 'post-1',
      post: {
        state: 'PUBLISHED',
        content: '<p>Срок держится, когда о нём знает кто-то ещё.</p>',
        releaseURL: 'https://t.me/studio/17',
        publishDate: at('2026-08-03T12:00:00.000Z'),
        deletedAt: null,
      },
    },
    {
      id: 'adaptation-2',
      contentPieceId: 'piece-1',
      platform: 'linkedin',
      title: 'Сроки поставки как обещание',
      body: 'Сроки поставки — это обещание, а не прогноз.',
      createdAt: at('2026-08-04T10:00:00.000Z'),
      postId: 'post-2',
      post: {
        state: 'DRAFT',
        content: null,
        releaseURL: null,
        publishDate: at('2026-08-04T12:00:00.000Z'),
        deletedAt: null,
      },
    },
  ],
  posts: [
    {
      id: 'post-9',
      content: '<p>Мы сорвали срок один раз и написали об этом сами.</p>',
      releaseURL: 'https://t.me/studio/3',
      publishDate: at('2026-07-20T12:00:00.000Z'),
      integration: { providerIdentifier: 'telegram' },
    },
    // Пост адаптации второй строкой не идёт: тот же текст, две записи.
    {
      id: 'post-1',
      content: '<p>Срок держится, когда о нём знает кто-то ещё.</p>',
      releaseURL: 'https://t.me/studio/17',
      publishDate: at('2026-08-03T12:00:00.000Z'),
      integration: { providerIdentifier: 'telegram' },
    },
  ],
  facts: [
    {
      id: 'fact-1',
      claimKey: 'сроки|срыв',
      statement: 'Из шести дедлайнов сдвинулись пять',
    },
    {
      id: 'fact-2',
      claimKey: 'кофе|расход',
      statement: 'Кофемашина окупилась за четыре месяца',
    },
  ],
  ...overrides,
});

const build = (options = {}) => {
  const calls = { load: [] };
  let clock = options.startedAt ?? 1_000;
  const repository = {
    load: async (organizationId) => {
      calls.load.push(organizationId);
      return options.rows ? options.rows() : rows();
    },
  };
  const service = new TextSearchService(repository, () => clock);
  return {
    service,
    calls,
    tick: (ms) => {
      clock += ms;
    },
  };
};

describe('русский стемминг — то, ради чего брали библиотеку', () => {
  test('«срок» и «сроки» — одно слово', () => {
    expect(stemWord('сроки')).toBe(stemWord('срок'));
    expect(stemWord('поставки')).toBe(stemWord('поставка'));
    // Английское слово идёт английскому стеммеру, а не русскому.
    expect(stemWord('deadlines')).toBe(stemWord('deadline'));
  });

  test('запрос в одной форме находит текст в другой', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'срок поставки', {
      kinds: ['PIECE'],
    });

    expect(hits.map((hit) => hit.id)).toContain('piece-1');
    expect(hits.map((hit) => hit.id)).not.toContain('piece-2');
  });

  test('«встретиться должно всё» осталось отбором по умолчанию', async () => {
    const { service } = build();
    // «кофе» есть у одного текста, «сроки» — у другого; вместе не встречаются
    // нигде, и строгий отбор отвечает пустотой.
    expect(
      await service.search('org-a', 'кофе сроки', { kinds: ['PIECE'] })
    ).toEqual([]);
    // Тот же запрос с ранжированием отвечает обоими — это другой вопрос.
    const ranked = await service.search('org-a', 'кофе сроки', {
      kinds: ['PIECE'],
      mode: 'ranked',
    });
    expect(ranked.length).toBe(2);
  });

  test('пустой запрос не отдаёт весь архив', async () => {
    const { service } = build();
    expect(await service.search('org-a', '   ')).toEqual([]);
  });
});

describe('что попадает в индекс', () => {
  test('адаптация забирает адрес и площадку у своего поста, а пост второй строкой не идёт', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'срок', { mode: 'ranked', limit: 50 });
    const adaptation = hits.find((hit) => hit.id === 'adaptation-1');

    expect(adaptation).toBeTruthy();
    expect(adaptation.kind).toBe('ADAPTATION');
    expect(adaptation.url).toBe('https://t.me/studio/17');
    expect(adaptation.platform).toBe('telegram');
    expect(adaptation.pieceId).toBe('piece-1');
    // Тот же текст пришёл и постом `post-1`; двух строк об одном тексте нет.
    expect(hits.filter((hit) => hit.url === 'https://t.me/studio/17')).toHaveLength(1);
  });

  test('пост, написанный мимо заготовок, виден отдельным видом', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'срок', { mode: 'ranked', limit: 50 });
    const post = hits.find((hit) => hit.id === 'post-9');

    expect(post).toBeTruthy();
    expect(post.kind).toBe('POST');
    expect(post.url).toBe('https://t.me/studio/3');
    // Заголовка у поста календаря нет: его делает первая фраза текста, и
    // разметка до заголовка не доезжает.
    expect(post.title).not.toMatch(/</);
  });

  test('сослаться можно только на вышедшее со своим адресом', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'сроки поставки', {
      kinds: ['ADAPTATION', 'POST'],
      linkableOnly: true,
      mode: 'ranked',
      limit: 50,
    });

    // `adaptation-2` — черновик LinkedIn: адреса нет, значит и ссылки нет.
    expect(hits.map((hit) => hit.id)).not.toContain('adaptation-2');
    expect(hits.every((hit) => Boolean(hit.url))).toBe(true);
  });

  test('площадка отбирает: ссылка из Telegram ведёт в Telegram', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'срок', {
      platform: 'telegram',
      kinds: ['ADAPTATION', 'POST'],
      linkableOnly: true,
      mode: 'ranked',
      limit: 50,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.platform === 'telegram')).toBe(true);
  });

  test('факты лежат в том же индексе и отбираются своим видом', async () => {
    const { service } = build();
    const hits = await service.search('org-a', 'дедлайн', { kinds: ['FACT'] });

    expect(hits.map((hit) => hit.id)).toEqual(['fact-1']);
  });

  test('удалённый пост не даёт адаптации ни адреса, ни даты', async () => {
    const { service } = build({
      rows: () => {
        const base = rows();
        base.derivations[0].post.deletedAt = at('2026-08-05T00:00:00.000Z');
        base.posts = [];
        return base;
      },
    });
    const hits = await service.search('org-a', 'срок', {
      kinds: ['ADAPTATION'],
      mode: 'ranked',
      limit: 50,
    });
    const adaptation = hits.find((hit) => hit.id === 'adaptation-1');

    expect(adaptation.url).toBeNull();
    expect(adaptation.publishedAt).toBeNull();
  });
});

describe('кэш: срок жизни и сброс по записи', () => {
  test('индекс строится один раз и переживает следующие запросы', async () => {
    const { service, calls } = build();
    await service.search('org-a', 'срок');
    await service.search('org-a', 'кофе');

    expect(calls.load).toEqual(['org-a']);
  });

  test('через срок жизни индекс собирается заново', async () => {
    const { service, calls, tick } = build();
    await service.search('org-a', 'срок');
    tick(TEXT_SEARCH_TTL_MS + 1);
    await service.search('org-a', 'срок');

    expect(calls.load).toEqual(['org-a', 'org-a']);
  });

  test('сброс делает только что записанный текст находимым сразу', async () => {
    let extra = false;
    const { service, calls } = build({
      rows: () => {
        const base = rows();
        if (extra) {
          base.pieces.push({
            id: 'piece-3',
            title: 'Подшипники и новый поставщик',
            body: 'Мы поменяли поставщика подшипников за неделю.',
            createdAt: at('2026-08-06T10:00:00.000Z'),
          });
        }
        return base;
      },
    });

    expect(
      await service.search('org-a', 'подшипники', { kinds: ['PIECE'] })
    ).toEqual([]);

    extra = true;
    // Без сброса область отвечала бы старым индексом ещё пять минут.
    expect(
      await service.search('org-a', 'подшипники', { kinds: ['PIECE'] })
    ).toEqual([]);

    service.invalidate('org-a');
    const found = await service.search('org-a', 'подшипники', {
      kinds: ['PIECE'],
    });

    expect(found.map((hit) => hit.id)).toEqual(['piece-3']);
    expect(calls.load).toHaveLength(2);
  });

  test('две области не делят один индекс', async () => {
    const { service, calls } = build();
    await service.search('org-a', 'срок');
    await service.search('org-b', 'срок');

    expect(calls.load).toEqual(['org-a', 'org-b']);
  });

  test('два запроса в холодную область ждут одной сборки', async () => {
    const { service, calls } = build();
    await Promise.all([
      service.search('org-a', 'срок'),
      service.search('org-a', 'кофе'),
    ]);

    expect(calls.load).toEqual(['org-a']);
  });

  test('отказ базы — пустой ответ, а не падение окна', async () => {
    const service = new TextSearchService(
      {
        load: async () => {
          throw new Error('the database is unreachable');
        },
      },
      () => 1_000
    );

    expect(await service.search('org-a', 'срок')).toEqual([]);
    expect(await service.ready('org-a')).toBe(false);
  });
});

describe('идентификаторы для отбора списков', () => {
  test('пустой запрос отвечает `null`, а не пустым множеством', async () => {
    const { service } = build();
    // `null` оставляет список таким, каким он был бы без запроса; пустое
    // множество спрятало бы каждую строку.
    expect(await service.matchingIds('org-a', '', 'PIECE')).toBeNull();
    expect(await service.matchingIds('org-a', '   ', 'PIECE')).toBeNull();
  });

  test('пустой индекс отвечает `null`: искать надо старым способом', async () => {
    const { service } = build({
      rows: () => ({ pieces: [], derivations: [], posts: [], facts: [] }),
    });

    expect(await service.matchingIds('org-a', 'срок', 'PIECE')).toBeNull();
  });

  test('найденное отвечает множеством заготовок', async () => {
    const { service } = build();
    const matched = await service.matchingIds('org-a', 'сроки', 'PIECE');

    expect([...matched]).toEqual(['piece-1']);
  });
});

describe('выдержка', () => {
  test('режется по слову и отмечается многоточием', () => {
    const long = `${'слово '.repeat(200)}конец`;
    const excerpt = excerptOf(long);

    expect(excerpt.length).toBeLessThanOrEqual(241);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toMatch(/сло…$/);
  });

  test('короткий текст остаётся целым', () => {
    expect(excerptOf('  Срок держится,   когда о нём знает кто-то ещё. ')).toBe(
      'Срок держится, когда о нём знает кто-то ещё.'
    );
  });
});

test('набор читает тот самый модуль, который отгружается', () => {
  expect(path.basename(SERVICE)).toBe('text-search.service.ts');
  expect(path.basename(INDEX)).toBe('text-search.index.ts');
});
