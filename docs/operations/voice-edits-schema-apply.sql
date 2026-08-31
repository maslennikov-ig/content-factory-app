-- Правки автора в черновиках продукта: одна новая таблица.
--
-- Эпик `content-factory-next-pl1`, задача `pl1.32`. Ни одного `DROP`, ни одного
-- `TRUNCATE`, ни одного изменения существующей таблицы: только `CREATE TABLE`,
-- четыре индекса и два внешних ключа. Всё одной транзакцией.
--
-- Текст взят из `prisma migrate diff` и очищен от `DROP TABLE` по таблицам
-- `mastra_*`, которых нет в `schema.prisma`. Подробности — в
-- `voice-edits-schema-apply.md`.
--
-- `BEGIN`/`COMMIT` здесь нет намеренно: транзакцию даёт `psql
-- --single-transaction`, а файл без них проходит через
-- `validate-prisma-migration-sql.cjs`, который знает операторы схемы и не знает
-- ключевых слов транзакции. Файл, который страж не может прочитать, стражем не
-- прикрыт.

CREATE TABLE "BrandVoiceEdit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,
    "profileVersionId" TEXT,
    "postId" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "proposedText" TEXT NOT NULL,
    "sentText" TEXT NOT NULL,
    "proposedChars" INTEGER NOT NULL,
    "sentChars" INTEGER NOT NULL,
    "pairHash" TEXT NOT NULL,
    "changed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BrandVoiceEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrandVoiceEdit_organizationId_avatarId_deletedAt_idx" ON "BrandVoiceEdit"("organizationId", "avatarId", "deletedAt");

CREATE INDEX "BrandVoiceEdit_organizationId_createdAt_idx" ON "BrandVoiceEdit"("organizationId", "createdAt");

CREATE UNIQUE INDEX "BrandVoiceEdit_organizationId_id_key" ON "BrandVoiceEdit"("organizationId", "id");

CREATE UNIQUE INDEX "BrandVoiceEdit_organizationId_avatarId_pairHash_key" ON "BrandVoiceEdit"("organizationId", "avatarId", "pairHash");

ALTER TABLE "BrandVoiceEdit" ADD CONSTRAINT "BrandVoiceEdit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrandVoiceEdit" ADD CONSTRAINT "BrandVoiceEdit_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "ProjectBrandProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
