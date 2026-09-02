-- Несколько аватаров на пространство. Применять ТОЛЬКО этот текст, дословно.
--
-- `prisma migrate diff` против боевой базы выдаёт эти пять операторов вместе с
-- DROP TABLE на два десятка таблиц `mastra_*`, которых нет в `schema.prisma`.
-- На 25.08.2026 в базе продукта их нет (разделение выполнено 21.08.2026,
-- `runtime-roles-mastra-split-plan.md`), но проверять это надо каждый раз:
-- `db push` и полный вывод `migrate diff` сносят их молча.
--
-- Порядок применения:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table ProjectBrandProfile --diff <шаг 1> --selected этот_файл
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. Повторный migrate diff должен вернуть только mastra_* DROP TABLE.
--
-- Обе таблицы аватаров на боевой базе пусты (раздел «Контент» там ещё не
-- использовали), поэтому `DROP INDEX` ниже не может нарушить ни одной строки.
--
-- Валидатор отвергает BEGIN/COMMIT как неизвестные операции схемы;
-- транзакционность обеспечивает флаг --single-transaction в psql.

-- Человек или бренд. Различие — кто говорит и насколько шумный слепок, а не
-- два отдельных механизма: см. `BrandPersonaV1`.
CREATE TYPE "BrandPersonaKind" AS ENUM ('PERSON', 'BRAND');

-- Аватар перестаёт быть свойством пространства и становится тем, чем
-- пространство владеет. Ровно это ограничение и делало второй аватар
-- невозможным.
DROP INDEX "ProjectBrandProfile_organizationId_key";

ALTER TABLE "ProjectBrandProfile"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "kind" "BrandPersonaKind" NOT NULL DEFAULT 'PERSON',
  ADD COLUMN "name" TEXT;

CREATE INDEX "ProjectBrandProfile_organizationId_isDefault_idx"
  ON "ProjectBrandProfile"("organizationId", "isDefault");

-- Существующий аватар пространства остаётся тем, который выбирается молча.
-- Без этого `isDefault` был бы false у всех, и выбор упал бы на запасное
-- правило «самый старый» — тот же ответ, но по другой причине, а разницу
-- видно только когда кто-нибудь заведёт второй аватар.
UPDATE "ProjectBrandProfile" SET "isDefault" = true WHERE "deletedAt" IS NULL;
