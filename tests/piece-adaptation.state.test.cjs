'use strict';

/**
 * Состояние адаптации читается из поста, а не хранится.
 *
 * Это единственное обещание волны «заготовка и адаптации»
 * (`content-factory-next-tu3k.9`), которое можно нарушить бесшумно. Колонка
 * `ContentDerivation.state` была зеркалом поста, зеркало никто не обновлял, и
 * три месяца таблица показывала «черновик» над опубликованным текстом — без
 * единой ошибки, без единой красной проверки. Поэтому здесь проверяется не то,
 * что клетку можно посчитать, а четыре вещи, каждая из которых уже ломалась
 * или готова сломаться:
 *
 * 1. состояние берётся из поста и уважает `deletedAt` — удалённый пост не
 *    «черновик», от него не осталось ничего;
 * 2. два поколения имён площадки живут рядом без переноса: `site` это
 *    `wordpress`, `newsletter` это `listmonk`;
 * 3. колонка — площадка, а не канал: три Telegram-канала дают одну клетку;
 * 4. чтение публикации — ОДИН запрос с `organizationId` в `where`. И то и
 *    другое: три запроса вместо одного это цена страницы, а `where` без
 *    области — это чужие строки.
 */

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const BRAND_VOICE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const MATERIALS =
  'libraries/nestjs-libraries/src/content-intelligence/materials';

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

const sources = {
  './errors': `${MATERIALS}/errors.ts`,
  './material-presentation': `${MATERIALS}/material-presentation.ts`,
  './segment': `${BRAND_VOICE}/segment.ts`,
  './locale-pack.ru': `${BRAND_VOICE}/locale-pack.ru.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut': `${BRAND_VOICE}/recut.ts`,
  '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract': `${BRAND_VOICE}/voice-wiring.contract.ts`,
};

const load = (relativePath) =>
  loadTypeScriptModule(relativePath, prismaMocks, { sources });

const {
  adaptationState,
  bestCell,
  columnsOf,
  kindsOfProvider,
  providerOfPlatform,
  shapeOfProvider,
} = load(`${MATERIALS}/material-presentation.ts`);
const { ContentMaterialRepository } = load(
  `${MATERIALS}/content-material.repository.ts`
);

const at = (iso) => new Date(iso);

/** Адаптация в той части, которую читают клетка и колонка. */
const adaptation = (id, platform, integrationId, post = null) => ({
  id,
  contentPieceId: 'piece-a',
  platform,
  postId: post ? `post-${id}` : null,
  integrationId,
  post,
});

const post = (state, extra = {}) => ({
  state,
  releaseURL: null,
  publishDate: at('2026-09-06T10:00:00.000Z'),
  deletedAt: null,
  ...extra,
});

describe('состояние адаптации приходит из поста', () => {
  test('четыре состояния поста читаются четырьмя состояниями адаптации', () => {
    expect(adaptationState(post('PUBLISHED'))).toBe('published');
    // `QUEUE` в базе, `queued` на экране: имя состояния досталось от апстрима,
    // и переименовывать колонку ради словаря никто не станет.
    expect(adaptationState(post('QUEUE'))).toBe('queued');
    expect(adaptationState(post('ERROR'))).toBe('error');
    expect(adaptationState(post('DRAFT'))).toBe('draft');
  });

  test('удалённый пост состояния не даёт, и его нет вовсе', () => {
    // Не «черновик»: от удалённого поста не осталось ничего, что человек мог
    // бы открыть, и рисовать по нему черновик значило бы обещать
    // несуществующее.
    expect(
      adaptationState(post('PUBLISHED', { deletedAt: at('2026-09-06T11:00:00.000Z') }))
    ).toBeNull();
    expect(adaptationState(null)).toBeNull();
    expect(adaptationState(undefined)).toBeNull();
  });
});

describe('два поколения имён площадки живут рядом', () => {
  test('старые имена перекройки схлопываются в провайдера', () => {
    // Переноса строк нет и не будет: до волны в `platform` клали имя
    // перекройки, с волны — `providerIdentifier` канала. Схлопывает их чтение.
    expect(providerOfPlatform('site')).toBe('wordpress');
    expect(providerOfPlatform('newsletter')).toBe('listmonk');
  });

  test('имя, которое и так провайдер, остаётся собой', () => {
    expect(providerOfPlatform('telegram')).toBe('telegram');
    expect(providerOfPlatform('vk')).toBe('vk');
    expect(providerOfPlatform('Instagram')).toBe('instagram');
    expect(providerOfPlatform(null)).toBe('');
  });

  test('незнакомая площадка получает форму с потолком, а не без него', () => {
    // Ошибиться в сторону «текст придётся сократить» дешевле, чем пообещать
    // «ничего не обрежется» там, где площадка обрежет.
    expect(shapeOfProvider('mastodon').maxChars).toBe(4096);
    expect(shapeOfProvider('wordpress').maxChars).toBeNull();
  });

  test('вид адаптации спрашивается у площадки, а не выдумывается', () => {
    expect(kindsOfProvider('instagram')).toEqual(['caption']);
    expect(kindsOfProvider('wordpress')).toEqual(['article']);
    expect(kindsOfProvider('listmonk')).toEqual(['newsletter']);
    expect(kindsOfProvider('mastodon')).toEqual(['post']);
  });
});

describe('клетка называет площадку, а не канал', () => {
  test('лучшее состояние среди каналов площадки, остальные — счётом', () => {
    const cell = bestCell('telegram', [
      adaptation('a', 'telegram', 'channel-1', post('DRAFT')),
      adaptation('b', 'telegram', 'channel-2', post('PUBLISHED', {
        releaseURL: 'https://t.me/cex/7',
      })),
      adaptation('c', 'telegram', 'channel-3', post('QUEUE')),
      adaptation('d', 'vk', 'channel-vk', post('PUBLISHED')),
    ]);

    expect(cell.state).toBe('published');
    expect(cell.adaptationId).toBe('b');
    expect(cell.url).toBe('https://t.me/cex/7');
    expect(cell.date).toBe('2026-09-06T10:00:00.000Z');
    // «Ещё 2» — это ДВА ОСТАВШИХСЯ КАНАЛА, а не две адаптации: две версии в
    // один канал это одна строка списка, а не два места, где текст вышел.
    expect(cell.more).toBe(2);
  });

  test('две версии в один канал остаются одним каналом', () => {
    const cell = bestCell('telegram', [
      adaptation('a', 'telegram', 'channel-1', post('DRAFT')),
      adaptation('b', 'telegram', 'channel-1', post('DRAFT')),
    ]);

    expect(cell.more).toBe(0);
  });

  test('ошибка публикации старше черновика и младше очереди', () => {
    const cell = bestCell('telegram', [
      adaptation('a', 'telegram', 'channel-1', post('DRAFT')),
      adaptation('b', 'telegram', 'channel-2', post('ERROR')),
    ]);

    expect(cell.state).toBe('error');
    expect(cell.date).toBeNull();
  });

  test('адаптация с удалённым постом клетку не опустошает', () => {
    // Строка производной на месте, текст в ней на месте, публикации нет.
    const cell = bestCell('telegram', [
      adaptation('a', 'telegram', 'channel-1', post('PUBLISHED', {
        deletedAt: at('2026-09-06T11:00:00.000Z'),
      })),
    ]);

    expect(cell.state).toBe('draft');
  });

  test('площадка без адаптаций даёт пустую клетку, а не отсутствие клетки', () => {
    const cell = bestCell('telegram', [
      adaptation('a', 'vk', 'channel-vk', post('PUBLISHED')),
    ]);

    // `none` — «адаптации нет, нажатие начинает её». Отличить это от
    // `no_channel` может только тот, у кого на руках список каналов.
    expect(cell.state).toBe('none');
    expect(cell.more).toBe(0);
  });

  test('старое имя площадки попадает в ту же клетку, что и новое', () => {
    const cell = bestCell('wordpress', [
      adaptation('a', 'site', 'channel-wp', post('PUBLISHED')),
    ]);

    expect(cell.platform).toBe('wordpress');
    expect(cell.state).toBe('published');
  });
});

describe('колонки таблицы заготовок', () => {
  const connected = [
    { providerIdentifier: 'telegram', name: 'Канал цеха' },
    { providerIdentifier: 'vk', name: 'Сообщество' },
  ];

  test('неподключённая площадка без адаптаций колонкой не становится', () => {
    const columns = columnsOf(connected, [
      adaptation('a', 'telegram', 'channel-1', post('PUBLISHED')),
    ]);

    // Пустой столбец, которого никто не просил, это шум.
    expect(columns.map((one) => one.platform)).toEqual(['telegram', 'vk']);
  });

  test('отключённая площадка с публикацией колонку сохраняет', () => {
    const columns = columnsOf(connected, [
      adaptation('a', 'site', 'channel-wp', post('PUBLISHED')),
    ]);

    const wordpress = columns.find((one) => one.platform === 'wordpress');
    // То, что уже вышло, не перестаёт существовать оттого, что канал
    // отвязали; `channels: 0` честно говорит, что писать туда сейчас некуда.
    expect(wordpress).toBeTruthy();
    expect(wordpress.channels).toBe(0);
    expect(wordpress.adaptations).toBe(1);
  });

  test('порядок колонок — по числу адаптаций', () => {
    const columns = columnsOf(connected, [
      adaptation('a', 'vk', 'channel-vk', post('PUBLISHED')),
      adaptation('b', 'vk', 'channel-vk', post('DRAFT')),
      adaptation('c', 'telegram', 'channel-1', post('DRAFT')),
    ]);

    expect(columns.map((one) => one.platform)).toEqual(['vk', 'telegram']);
  });

  test('видео и аудио колонками не становятся', () => {
    // Они — `kind` адаптации, а не место, куда она уходит.
    const columns = columnsOf(connected, [
      adaptation('a', 'video', null, post('DRAFT')),
      adaptation('b', 'audio', null, post('DRAFT')),
    ]);

    expect(columns.map((one) => one.platform)).toEqual(['telegram', 'vk']);
  });
});

describe('чтение публикации — один запрос и одна область', () => {
  function repository() {
    const calls = [];
    const model = {
      contentDerivation: {
        findMany: async (args = {}) => {
          calls.push({ name: 'contentDerivation.findMany', args });
          return [];
        },
      },
    };
    return {
      calls,
      repository: new ContentMaterialRepository({ model }, { model }),
    };
  }

  test('одна страница — один findMany', async () => {
    const store = repository();

    await store.repository.adaptationsByPiece('org-a', ['piece-a', 'piece-b']);

    // До этой волны здесь было три запроса: счётчики группировкой, площадки
    // `distinct` и строки одной заготовки. Все три верили колонке `state`.
    expect(store.calls).toHaveLength(1);
  });

  test('область стоит в where и не зависит от того, что прислали', async () => {
    const store = repository();

    await store.repository.adaptationsByPiece('org-a', ['piece-a']);

    const { where, select } = store.calls[0].args;
    expect(where.organizationId).toBe('org-a');
    expect(where.contentPieceId).toEqual({ in: ['piece-a'] });
    // Состояние читается из поста, а не из колонки строки: `state` в `select`
    // не значится вовсе, и его отсутствие здесь и есть проверка.
    expect(select.post.select.state).toBe(true);
    expect(select.state).toBeUndefined();
  });

  test('пустой список заготовок до базы не доходит', async () => {
    const store = repository();

    const rows = await store.repository.adaptationsByPiece('org-a', []);

    expect(rows).toEqual([]);
    expect(store.calls).toHaveLength(0);
  });
});
