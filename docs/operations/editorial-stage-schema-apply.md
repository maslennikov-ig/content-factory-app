# Применение схемы редакционного этапа к боевой базе

**Задача:** `content-factory-next-pdbe`, решение владельца 02.09.2026: редакционный
этап — отдельное поле поста, а не метка из модели `Tags`.

**Что применяется:** новый enum `EditorialStage` (`PLAN`, `DRAFT`, `REVIEW`,
`SCHEDULED` — один в один с `CONTENT_WORKFLOW_TAG_KEYS`), необязательная колонка
`Post.editorialStage`, индекс `(organizationId, editorialStage)` и один перенос
существующих меток процесса в новое поле.

**Проверенный текст:**
[`editorial-stage-schema-apply.sql`](./editorial-stage-schema-apply.sql).
Три аддитивных оператора (`CREATE TYPE`, `ALTER TABLE ... ADD COLUMN`,
`CREATE INDEX`) и один `UPDATE`, который только читает существующие метки и
заполняет новое поле — ни одна метка не удаляется и не изменяется.

---

## Почему в одном файле есть `UPDATE`, и почему это не сломает автоматическую проверку

Страж `validate-prisma-migration-sql.cjs` отвергает **любой** `UPDATE`
безусловно — он не умеет отличать перенос данных от их порчи, и не должен: это
и есть его работа. Первые три оператора (без `UPDATE`, без `BEGIN`/`COMMIT`)
проходят стража сами по себе:

```bash
node scripts/operations/validate-prisma-migration-sql.cjs \
  --diff <шаг 1 ниже> --selected <первые три оператора без BEGIN/COMMIT/UPDATE> \
  --mode update --allow-table Post --allow-enum EditorialStage
# SQL apply guard passed: 3 explicitly selected statement(s).
```

Файл целиком страж не проверяет — как и `avatars-schema-apply.sql`, чей
`UPDATE "isDefault"` тоже отвергается стражем и применяется по решению
владельца руками. Это тот же прецедент, а не новое исключение.

## Порядок применения

```bash
# 1. Сколько таблиц Mastra в базе продукта сейчас (ожидание: 0, см.
#    runtime-roles-mastra-split-plan.md)
psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_name like 'mastra_%'"

# 2. Предпросмотр — читать, не применять
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel libraries/nestjs-libraries/src/database/prisma/schema.prisma \
  --script > /tmp/diff.sql

# 3. Страж проверяет только первые три оператора (см. предупреждение выше)

# 4. Применить проверенный текст целиком, одной транзакцией
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f docs/operations/editorial-stage-schema-apply.sql

# 5. Тот же счёт, что и в шаге 1
psql "$DATABASE_URL" -tAc \
  "select count(*) from information_schema.tables where table_name like 'mastra_%'"
```

Шаги 1 и 5 обязаны дать одно и то же число.

## Что делает перенос меток и почему по цвету, а не по имени

Имя метки локализовано языком регистрации
(`translateBackendString`/`resolveBackendLocale` в `organization.repository.ts`)
— на разных пространствах строка "Review" может быть "Проверка" или любым
другим переводом. Цвет из `CONTENT_WORKFLOW_TAGS` фиксирован и от языка не
зависит, поэтому перенос сопоставляет по цвету:

| Цвет      | Ключ (`CONTENT_WORKFLOW_TAG_KEYS`) | `EditorialStage` |
|-----------|-------------------------------------|-------------------|
| `#7FB03A` | `content_workflow_tag_plan`         | `PLAN`            |
| `#4D7CFE` | `content_workflow_tag_draft`        | `DRAFT`           |
| `#F59E0B` | `content_workflow_tag_review`       | `REVIEW`          |
| `#8B5CF6` | `content_workflow_tag_schedule`     | `SCHEDULED`       |

Метки свободны, и ничто не мешает повесить на один пост сразу две из этих
четырёх. Тогда в поле идёт наиболее продвинутая по процессу —
`SCHEDULED > REVIEW > DRAFT > PLAN`. Мягко удалённая метка (`Tags.deletedAt`
не `NULL`) в расчёт не берётся. Оператор ничего не меняет в `Tags` или
`TagsPosts`: метки остаются данными людей, только читаются.

Оператор идемпотентен: условие `p."editorialStage" IS NULL` не даст повторному
запуску переписать уже заполненное значение.

## Откат

```sql
BEGIN;
DROP INDEX "Post_organizationId_editorialStage_idx";
ALTER TABLE "Post" DROP COLUMN "editorialStage";
DROP TYPE "EditorialStage";
COMMIT;
```

Аддитивно к моменту применения: колонка новая, значения в ней — производные от
меток, которые остаются на месте. Откат теряет только сами значения поля, не
исходные метки.

## Применено

Не применялось нигде: подготовлено этой задачей, применение на боевой базе —
отдельное решение владельца (как и на локальном стенде — см.
`prisma db push` запрещён везде, где рядом может быть чужая схема; на чистом
стенде без Mastra `db push` допустим, см. `content-creation-schema-apply.md`).
