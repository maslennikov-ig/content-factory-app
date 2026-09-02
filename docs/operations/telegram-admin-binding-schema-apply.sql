-- Привязка личного Telegram-чата администратора (content-factory-next-rmfv).
-- Применять ТОЛЬКО этот текст, дословно.
--
-- `prisma migrate diff` против боевой базы печатает эти операторы вместе с
-- DROP TABLE на mastra_* таблицы, которых нет в schema.prisma — ожидаемо и
-- пропускается validate-prisma-migration-sql.cjs (Mastra-owned target), но
-- проверять надо каждый раз: db push и полный вывод migrate diff сносят их
-- молча.
--
-- Три новых, все nullable-поля на User:
--   telegramChatId               — куда слать уведомление, после привязки.
--   telegramBindingCode          — одноразовый секрет для `/start <code>`.
--   telegramBindingCodeExpiresAt — срок этого секрета.
-- У всех существующих строк ровно одно новое непустое значение появится
-- только после того, как конкретный администратор сам нажмёт «Подключить
-- Telegram» — до этого все три поля NULL, это нормальное состояние.
--
-- Порядок применения:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table User --diff <шаг 1> --selected этот_файл
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. Повторный migrate diff должен вернуть только mastra_* DROP TABLE.
--
-- Валидатор отвергает BEGIN/COMMIT как неизвестные операции схемы;
-- транзакционность обеспечивает флаг --single-transaction в psql.
--
-- Применено локально на cf-dev-postgres (порт 5433) 02.09.2026 тем же текстом;
-- на боевую базу — отдельным решением владельца, не этой задачей.

ALTER TABLE "User" ADD COLUMN     "telegramBindingCode" TEXT,
ADD COLUMN     "telegramBindingCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramChatId" TEXT;

CREATE INDEX "User_telegramBindingCode_idx" ON "User"("telegramBindingCode");
