# Таблица продуктовых событий на боевой базе

**Статус:** `current`
**Проверено:** 2026-08-18 (DDL снят с `prisma migrate diff --from-empty` по текущей `schema.prisma`)

Продуктовая аналитика пишет одну новую таблицу — `ProductEvent`. Пока её нет в
базе, продукт работает: запись события обёрнута в try/catch и попадает в лог,
регистрация и подключение канала завершаются как обычно. Но отчёт
`/admin/product-events` до появления таблицы будет пустым и в логе будет копиться
`P2021`, поэтому таблицу надо создать в том же обновлении, что и код.

## Как применять

Порядком владеет
[«Если изменилась Prisma-схема»](production-deploy.md#если-изменилась-prisma-схема)
в руководстве по развёртыванию. Ничего своего здесь не изобретается: `prisma db
push` на этой базе запрещён (в той же схеме `public` живут таблицы `mastra_*`),
поэтому `migrate diff` печатает SQL, вы вручную отбираете из него операторы по
своей таблице, валидатор сверяет отобранный файл с предпросмотром, и только
проверенный файл уходит в `psql` одной транзакцией.

Для этого изменения в шаге проверки указывается одна собственная таблица:

```bash
docker compose exec -T cf-app node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff /tmp/cf-prisma-diff.sql \
  --selected /tmp/cf-prisma-selected.sql \
  --allow-table ProductEvent
```

Сам скрипт `scripts/operations/validate-prisma-migration-sql.cjs` приходит из
задачи `content-factory-next-3tx`; если в вашей сборке его ещё нет, значит эта
ветка развёрнута раньше неё, и применять схему нужно только после того, как обе
попадут в один образ.

## Что должно быть в отобранном файле

Ровно эти восемь операторов и ничего больше. Текст совпадает с тем, что печатает
шаг предпросмотра; сверяйте посимвольно, а не по смыслу.

```sql
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "properties" JSONB NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");

CREATE INDEX "ProductEvent_name_createdAt_idx" ON "ProductEvent"("name", "createdAt");

CREATE INDEX "ProductEvent_organizationId_createdAt_idx" ON "ProductEvent"("organizationId", "createdAt");

CREATE INDEX "ProductEvent_userId_createdAt_idx" ON "ProductEvent"("userId", "createdAt");

CREATE UNIQUE INDEX "ProductEvent_organizationId_deduplicationKey_key" ON "ProductEvent"("organizationId", "deduplicationKey");

ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Что здесь важно и почему это безопасно:

- четыре индекса, а не три. `ProductEvent_createdAt_idx` обслуживает ленту
  последних событий (`ORDER BY "createdAt" DESC LIMIT 50`), которой остальные
  три не помогают: ни один из них не начинается с `createdAt`;
- `ON DELETE CASCADE` на обеих связях — удаление организации или пользователя
  забирает их события с собой, отдельной уборки не требуется;
- ни одного `DROP`, ни одного изменения типа, ни одной строки про `mastra_*`.
  Если предпросмотр показал такое по нашей таблице — остановитесь.

После применения проверьте, что чужие таблицы на месте (шаг 7 руководства), и
что таблица создалась:

```bash
docker compose exec -T cf-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_name='ProductEvent';"   # 1
```

## Сколько строк это может занять

Клиент сам выбирает ключ дедупликации, поэтому уникальность
`(organizationId, deduplicationKey)` останавливает повтор одного ключа и ничего
больше. Границы две, обе в коде:

- почасовой лимит запросов на организацию на маршруте `POST /product-events`
  (`apps/backend/src/api/routes/product-events.controller.ts`);
- суточная квота на организацию перед записью
  (`CLIENT_DAILY_ORGANIZATION_QUOTA`, 500 событий за сутки). Серверные события
  `register` и `channel_added` в квоту не входят.

## Ретенция

Хранить события бессрочно незачем: отчёт не принимает диапазон длиннее 366 дней,
поэтому окно хранения — 400 дней (`PRODUCT_EVENT_RETENTION_DAYS`). Одно и то же
окно реализовано дважды.

На сервере — ограниченным `DELETE`, потому что приложение `apps/commands` в
боевой образ не собирается (корневой `build` собирает только frontend, backend и
orchestrator). Команду можно повесить на `cron` рядом с резервным копированием:

```bash
set -a; . ./.env; set +a
docker compose exec -T cf-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v ON_ERROR_STOP=1 -c \
  "DELETE FROM \"ProductEvent\" WHERE \"createdAt\" < now() - interval '400 days';"
```

Там, где `apps/commands` собран (разработка, разовый запуск из полного дерева),
то же самое делает команда `product-events:prune [days]`
(`apps/commands/src/tasks/prune.product.events.ts`). Ни один из двух путей не
трогает ничего, кроме `ProductEvent`.
