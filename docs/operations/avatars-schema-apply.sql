-- Несколько аватаров на пространство. Применять ТОЛЬКО этот текст, дословно.
--
-- `prisma migrate diff` против боевой базы выдаёт эти пять операторов вместе с
-- DROP TABLE на два десятка таблиц `mastra_*`, которых нет в `schema.prisma`.
-- На 25.08.2026 в базе продукта их нет (разделение выполнено 21.08.2026,
-- `runtime-roles-mastra-split-plan.md`), но проверять это надо каждый раз:
-- `db push` и полный вывод `migrate diff` сносят их молча.
--
-- Порядок: снять счёт таблиц `mastra_*`, применить psql этот файл, снять счёт
-- снова и сверить. Подробности — `production-deploy.md`.
--
-- Обе таблицы аватаров на боевой базе пусты (раздел «Контент» там ещё не
-- использовали), поэтому `DROP INDEX` ниже не может нарушить ни одной строки.

BEGIN;

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

COMMIT;
