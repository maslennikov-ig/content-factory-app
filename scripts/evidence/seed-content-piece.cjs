#!/usr/bin/env node
/**
 * Puts one long material in the library so screen 11 has something to show.
 *
 * There is no route that creates a `ContentPiece` — the material library reads
 * what the source registry and the drafting path write, and neither runs on a
 * stand with no connected source. The row is written here directly and every
 * read after it goes through the product's own routes.
 *
 * Usage: node scripts/evidence/seed-content-piece.cjs <organizationId> <userId>
 */

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const CONTAINER = process.env.CF_PG_CONTAINER || 'cf-dev-postgres';
const USER = process.env.CF_PG_USER || 'cf-dev';
const DB = process.env.CF_PG_DB || 'cf-dev-db';

const [organizationId, userId] = process.argv.slice(2);
if (!organizationId || !userId) {
  console.error('need an organization id and a user id');
  process.exit(2);
}

const psql = (sql) =>
  execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB, '-At', '-c', sql],
    { encoding: 'utf8' },
  ).trim();

const body = [
  'Мы отделили паспорт голоса от корпуса образцов, и это оказалось важнее, чем выглядело на бумаге.',
  'Корпус живёт по своим правилам: образец можно удалить, срок хранения истекает, права на чужой текст',
  'заканчиваются. Паспорт живёт по другим: активная версия обязана держаться, пока её не сменили явно.',
  '',
  'Когда обе сущности лежали в одной таблице, удаление одного образца тихо двигало коридоры шкал, а вместе',
  'с ними — то, что генератору разрешено писать. Разбор теперь помечается устаревшим, а не пересчитывается',
  'на лету. Пересчёт остаётся действием, у которого есть автор и время.',
  '',
  'Материал в библиотеке — это исходный длинный текст, а не пост. Перекройка готовит текст под площадку и',
  'останавливается: доставку делает обычный путь через PostsService и провайдеров. Так библиотека не',
  'превращается во вторую очередь публикации со своими правилами повторов и своими ошибками.',
  '',
  'Происхождение мы держим рядом с материалом, а не в журнале. Через год вопрос звучит не «что случилось',
  'в системе», а «откуда взялся вот этот абзац», и ответ должен лежать в одном чтении.',
].join('\n');

const id = crypto.randomUUID();
const title = 'Почему паспорт голоса и корпус образцов живут отдельно';
const tags = JSON.stringify(['голос', 'библиотека материалов', 'происхождение']);

const versionId = psql(
  `SELECT "activeVersionId" FROM "ProjectBrandProfile"
   WHERE "organizationId" = '${organizationId}'`,
);

const escape = (value) => value.replace(/'/g, "''");

psql(
  `INSERT INTO "ContentPiece"
     (id, "organizationId", title, body, language, tags,
      "brandProfileVersionId", "createdByUserId", "createdAt", "updatedAt")
   VALUES
     ('${id}', '${organizationId}', '${escape(title)}', '${escape(body)}', 'ru',
      '${escape(tags)}'::jsonb,
      ${versionId ? `'${versionId}'` : 'NULL'},
      '${userId}', now(), now())`,
);

console.log(JSON.stringify({ id, title, chars: body.length, brandProfileVersionId: versionId || null }));
