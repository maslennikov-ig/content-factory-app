-- Редакционный этап поста (content-factory-next-pdbe). Применять ТОЛЬКО этот
-- текст, дословно.
--
-- Применён на боевой 02.09.2026 в версии с тремя языками; расширенный список
-- нужен другим инстансам.
--
-- `prisma migrate diff` против боевой базы печатает эти три оператора вместе с
-- DROP TABLE на mastra_* таблицы, которых нет в schema.prisma — ожидаемо и
-- пропускается validate-prisma-migration-sql.cjs (Mastra-owned target), но
-- проверять надо каждый раз: db push и полный вывод migrate diff сносят их
-- молча.
--
-- Владелец решил 02.09.2026: редакционный этап — ОТДЕЛЬНОЕ ПОЛЕ поста, а не
-- метка. Значения enum совпадают один в один с CONTENT_WORKFLOW_TAG_KEYS
-- (organization.repository.ts) — так перенос существующих меток в четвёртом
-- операторе точен. Поле nullable: у всех постов, созданных до этой задачи,
-- этапа нет, и это нормальное состояние, а не дефект.
--
-- Порядок применения:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table Post --allow-enum EditorialStage
--        --diff <шаг 1> --selected операторы 1-3 этого файла (без четвёртого)
--      Страж ОТКАЗЫВАЕТ на четвёртом операторе — это UPDATE, а страж считает
--      любой UPDATE изменением данных и отвергает его безусловно (тот же
--      случай, что и `avatars-schema-apply.sql`: UPDATE "isDefault" там тоже
--      не проходит стража и применяется по решению владельца руками).
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. Повторный migrate diff должен вернуть только mastra_* DROP TABLE.
--
-- Валидатор отвергает BEGIN/COMMIT как неизвестные операции схемы;
-- транзакционность обеспечивает флаг --single-transaction в psql.
--
-- Ни один существующий пост не теряет метку — TagsPosts и Tags не трогаются
-- этим файлом вообще. Четвёртый оператор только ЧИТАЕТ их, чтобы заполнить
-- новое поле; удаление меток — отдельное и намеренно не это.

-- CreateEnum
CREATE TYPE "EditorialStage" AS ENUM ('PLAN', 'DRAFT', 'REVIEW', 'SCHEDULED');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "editorialStage" "EditorialStage";

-- CreateIndex
CREATE INDEX "Post_organizationId_editorialStage_idx" ON "Post"("organizationId", "editorialStage");

-- Перенос существующих меток процесса в новое поле.
--
-- Метка опознаётся по ПАРЕ «цвет + имя», а не по одному цвету.
--
-- Цвета фиксированы в CONTENT_WORKFLOW_TAGS и от языка не зависят, имя —
-- зависит (translateBackendString, три языка: en, ru, he). Соблазн взять один
-- цвет велик, и он неверен: метки в этом продукте свободные. Человек может
-- перекрасить «Проверку» через ColorPicker (tags.component.tsx:549) и может
-- завести свою метку любого цвета, включая эти четыре — палитра не
-- ограничена. Сопоставление по одному цвету тогда либо промахивается мимо
-- переименованной метки, либо, что хуже, молча проставляет чужой метке чужой
-- этап.
--
-- Пара сужает это до безопасной стороны. Метка, которую человек перекрасил или
-- переименовал, в перенос НЕ попадёт — пост останется без этапа, и человек
-- проставит его сам. Это осознанный выбор: недовезти лучше, чем приписать.
--
--   #7FB03A + Plan     / План       / תוכנית      -> PLAN
--   #4D7CFE + Draft    / Черновик   / טיוטה       -> DRAFT
--   #F59E0B + Review   / Проверка   / סקירה       -> REVIEW
--   #8B5CF6 + Schedule / Расписание / לוח זמנים   -> SCHEDULED
--
-- Если на посте больше одной из этих четырёх меток разом (человек мог
-- проставить их вручную, метки свободны), в поле идёт та, что дальше по
-- процессу — SCHEDULED старше REVIEW старше DRAFT старше PLAN. Мягко
-- удалённые метки (Tags.deletedAt) не считаются. Пост, у которого уже стоит
-- значение поля, не трогается — оператор идемпотентен при повторном запуске.
UPDATE "Post" p
SET "editorialStage" = ranked.stage::"EditorialStage"
FROM (
  SELECT
    tp."postId" AS post_id,
    (ARRAY['SCHEDULED', 'REVIEW', 'DRAFT', 'PLAN'])[
      MIN(
        CASE
          WHEN t.color = '#8B5CF6'
            AND t.name IN ('Schedule', 'לוח זמנים', 'Расписание', '排期', 'Planning', 'Programación', 'Agenda', 'Zeitplan', 'Pianificazione', 'スケジュール', '일정', 'جدول', 'Program', 'Lịch trình', 'সময়সূচী', 'განრიგი') THEN 1
          WHEN t.color = '#F59E0B'
            AND t.name IN ('Review', 'סקירה', 'Проверка', '审核', 'Révision', 'Revisión', 'Revisão', 'Prüfung', 'Revisione', 'レビュー', '검토', 'مراجعة', 'İnceleme', 'Xem xét', 'পর্যালোচনা', 'განხილვა') THEN 2
          WHEN t.color = '#4D7CFE'
            AND t.name IN ('Draft', 'טיוטה', 'Черновик', '草稿', 'Brouillon', 'Borrador', 'Rascunho', 'Entwurf', 'Bozza', '下書き', '초안', 'مسودة', 'Taslak', 'Bản nháp', 'খসড়া', 'მონახაზი') THEN 3
          WHEN t.color = '#7FB03A'
            AND t.name IN ('Plan', 'תוכנית', 'План', '计划', 'Plan', 'Plan', 'Plano', 'Plan', 'Piano', 'プラン', '계획', 'خطة', 'Plan', 'Kế hoạch', 'পরিকল্পনা', 'გეგმა') THEN 4
        END
      )
    ] AS stage
  FROM "TagsPosts" tp
  JOIN "Tags" t ON t.id = tp."tagId"
  WHERE t."deletedAt" IS NULL
    AND (
      (t.color = '#8B5CF6' AND t.name IN ('Schedule', 'לוח זמנים', 'Расписание', '排期', 'Planning', 'Programación', 'Agenda', 'Zeitplan', 'Pianificazione', 'スケジュール', '일정', 'جدول', 'Program', 'Lịch trình', 'সময়সূচী', 'განრიგი')) OR
      (t.color = '#F59E0B' AND t.name IN ('Review', 'סקירה', 'Проверка', '审核', 'Révision', 'Revisión', 'Revisão', 'Prüfung', 'Revisione', 'レビュー', '검토', 'مراجعة', 'İnceleme', 'Xem xét', 'পর্যালোচনা', 'განხილვა')) OR
      (t.color = '#4D7CFE' AND t.name IN ('Draft', 'טיוטה', 'Черновик', '草稿', 'Brouillon', 'Borrador', 'Rascunho', 'Entwurf', 'Bozza', '下書き', '초안', 'مسودة', 'Taslak', 'Bản nháp', 'খসड়া', 'მონახაზი')) OR
      (t.color = '#7FB03A' AND t.name IN ('Plan', 'תוכנית', 'План', '计划', 'Plan', 'Plan', 'Plano', 'Plan', 'Piano', 'プラン', '계획', 'خطة', 'Plan', 'Kế hoạch', 'পরিকল্পনা', 'გეგმა'))
    )
  GROUP BY tp."postId"
) ranked
WHERE p.id = ranked.post_id
  AND p."editorialStage" IS NULL;
