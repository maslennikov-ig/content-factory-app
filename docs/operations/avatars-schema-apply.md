# Применение схемы нескольких аватаров к боевой базе

**Эпик:** `content-factory-next-pl1`, решение владельца 25.08.2026.

**Что применяется:** `ProjectBrandProfile` перестаёт быть одним на пространство.
Снимается уникальный индекс по `organizationId`, добавляются три колонки —
`name`, `kind` (`PERSON` | `BRAND`), `isDefault` — и индекс по
`(organizationId, isDefault)`.

**Проверенный текст операторов:**
[`avatars-schema-apply.sql`](./avatars-schema-apply.sql). Пять операторов и одно
обновление строк, в одной транзакции. **Ни одного `DROP TABLE`, ни одного
`TRUNCATE`** — один `DROP INDEX`, и это тот самый индекс, который делал второй
аватар невозможным.

---

## Главное предупреждение

`prisma migrate diff` против боевой базы выдаёт эти пять операторов **вместе с
`DROP TABLE` на два десятка таблиц `mastra_*`**, которых нет в `schema.prisma`.
Применять его вывод целиком нельзя, и `prisma db push` нельзя тем более:
`--accept-data-loss` не спасает, пустую таблицу он снесёт молча.

На 25.08.2026 таблиц `mastra_*` в базе продукта нет — разделение выполнено
21.08.2026, см. [`runtime-roles-mastra-split-plan.md`](./runtime-roles-mastra-split-plan.md).
Проверять это всё равно надо каждый раз: диагноз годичной давности не является
состоянием базы сегодня.

## Порядок

```bash
# 1. Сколько таблиц Mastra в базе продукта сейчас
psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_name like 'mastra_%'"

# 2. Предпросмотр — читать, не применять
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --script

# 3. Применить только проверенный текст
psql "$DATABASE_URL" -f docs/operations/avatars-schema-apply.sql

# 4. Тот же счёт, что и в шаге 1
psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_name like 'mastra_%'"
```

Шаги 1 и 4 обязаны дать одно и то же число.

## Почему это безопасно именно сейчас

Обе таблицы аватаров на `factory.aidevteam.ru` пусты: раздел «Контент» там ещё
никто не использовал. Снятие уникального индекса не может нарушить ни одной
строки, потому что строк нет. Позже цена та же — индекс снимается, а не
добавляется, — но проверять пустоту всё равно стоит:

```bash
psql "$DATABASE_URL" -tAc 'select count(*) from "ProjectBrandProfile"'
```

## Что делает последний оператор

```sql
UPDATE "ProjectBrandProfile" SET "isDefault" = true WHERE "deletedAt" IS NULL;
```

Существующий аватар пространства остаётся тем, который выбирается молча. Без
этого `isDefault` был бы `false` у всех, и выбор упал бы на запасное правило
«самый старый» — тот же ответ, но по другой причине. Разница видна только когда
кто-нибудь заведёт второй аватар, то есть ровно тогда, когда её уже поздно
замечать.

## Откат

```sql
BEGIN;
DROP INDEX "ProjectBrandProfile_organizationId_isDefault_idx";
ALTER TABLE "ProjectBrandProfile"
  DROP COLUMN "isDefault", DROP COLUMN "kind", DROP COLUMN "name";
DROP TYPE "BrandPersonaKind";
CREATE UNIQUE INDEX "ProjectBrandProfile_organizationId_key"
  ON "ProjectBrandProfile"("organizationId");
COMMIT;
```

Возврат уникального индекса **упадёт**, если к тому моменту в одном пространстве
уже больше одного аватара. Это не дефект отката, а его смысл: откат схемы, под
которой успели создать данные, обязан остановиться, а не выбрать, какой аватар
удалить.
