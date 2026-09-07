-- Шесть столбцов и один индекс: заготовка и адаптации. Применять ТОЛЬКО этот
-- текст, дословно.
--
-- Зачем: решение владельца 06.09.2026 (`content-factory-next-tu3k.9`). Человек
-- сначала делает нейтральную ЗАГОТОВКУ — суть одним текстом плюс бриф, без
-- площадки, — а потом сам решает, во что её превратить: пост в Telegram,
-- подпись в Instagram, позже видео и аудио. Каждая такая версия — АДАПТАЦИЯ.
-- Таблицы остаются те же, добавляются только необязательные колонки:
--
--   ContentPiece.kind   — 'CORE' у заготовки; NULL у материала до этой волны;
--   ContentPiece.brief  — `ZagotovkaCoreV1` без `text`: заполненный бриф с
--                         происхождением полей, ответы интервью дословно,
--                         отчёт проверки на штампы, кем написана суть;
--   ContentDerivation.kind    — вид адаптации (post | caption | article |
--                         newsletter | video | audio), а НЕ площадка: видео
--                         это не площадка. NULL читается как 'post';
--   ContentDerivation.title   — заголовок адаптации;
--   ContentDerivation.body    — текст адаптации простым текстом. NULL у строк
--                         до волны: их текст живёт в посте;
--   ContentDerivation.mediaId — своя картинка адаптации, когда она своя.
--
-- Индекс `ContentDerivation (organizationId, postId)` — потому что состояние
-- адаптации теперь ЧИТАЕТСЯ ИЗ ПОСТА, а не хранится. Колонка
-- `ContentDerivation.state` три месяца была зеркалом, которое никто не
-- обновлял, и расходилась с постом; она остаётся на месте, но больше не
-- источник правды. Список заготовок берёт состояние одним запросом по этой
-- паре, и без индекса это чтение выродилось бы в перебор производных области.
-- Снос `state` — отдельный план миграции, не шаг этого файла.
--
-- Все шесть столбцов nullable и без значения по умолчанию, поэтому операторы
-- не переписывают таблицы и окно простоя не нужно. Существующие строки
-- получают NULL, и NULL читается как «материал до волны»: суть не выделена,
-- текст производной берётся из поста — ровно то, что продукт показывал до
-- волны. Шага данных нет. Обратного шага не нужно: на старом образе лишние
-- nullable-колонки и лишний индекс никому не мешают.
--
-- Порядок применения — ДО переключения образа этой волны, не после. Новый код
-- читает `kind` и `brief` при каждом открытии списка заготовок и при каждом
-- входе одной мыслью и пишет `body` производной при каждой адаптации; без
-- колонок падает не редкий экран, а вход — ошибкой Prisma «column
-- ContentPiece.kind does not exist».
--
-- Одна ловушка не в схеме, а рядом: обучение аватара сравнивает предложение
-- продукта с отправленным текстом, и до волны предложение бралось из
-- `ContentPiece.body`. Как только тело становится нейтральной сутью, сравнение
-- стало бы ложью — аватар выучил бы «резать текст и добавлять эмодзи». Правка
-- `voice-edit.repository.ts` едет тем же коммитом, что и схема; образ без неё
-- с этой схемой не выпускать.
--
-- `prisma migrate diff` против боевой базы печатает эти операторы вместе с
-- DROP TABLE на mastra_* таблицы, которых нет в schema.prisma. Их пропускает
-- validate-prisma-migration-sql.cjs (Mastra-owned target), но проверять
-- каждый раз всё равно нужно: db push и полный вывод migrate diff сносят их
-- молча.
--
-- Порядок применения:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table ContentPiece --allow-table ContentDerivation
--        --diff <шаг 1> --selected этот_файл
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. Повторный migrate diff должен вернуть только mastra_* DROP TABLE.
--
-- Валидатор отвергает BEGIN/COMMIT как неизвестные операции схемы;
-- транзакционность обеспечивает флаг --single-transaction в psql.
--
-- Столбцы и индекс добавлены в schema.prisma 06.09.2026
-- (content-factory-next-tu3k.9.2). На боевой базе ПРИМЕНЕНО 07.09.2026 до
-- переключения на a6be7f3fbb92 (запись в production-deploy.md).
-- Повторно не запускать: ADD COLUMN без IF NOT EXISTS откажет на существующей
-- колонке.

-- AlterTable
ALTER TABLE "ContentPiece" ADD COLUMN     "brief" JSONB,
ADD COLUMN     "kind" TEXT;

-- AlterTable
ALTER TABLE "ContentDerivation" ADD COLUMN     "body" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "ContentDerivation_organizationId_postId_idx" ON "ContentDerivation"("organizationId", "postId");
