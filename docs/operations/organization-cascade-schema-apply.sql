-- Каскады удаления области. Применять ТОЛЬКО этот текст, дословно.
--
-- Зачем: владелец хотел, чтобы удаление аккаунта с единоличной областью, в
-- которой есть контент, шло через второе подтверждение «вместе с областью и её
-- данными» (`content-factory-next-fn33.32`). Без этих внешних ключей так
-- нельзя: у почти всех связей Organization не было правила удаления, поэтому
-- `organization.delete` для непустой области отвечал ошибкой внешнего ключа, а
-- дверь `POST /admin/users/:id/delete` отказывала кодом
-- `account_delete_workspace_has_content` и предлагать «удалить вместе с
-- областью» было нечем.
--
-- Что меняется: 44 внешних ключа получают `ON DELETE CASCADE`. Ни одна таблица,
-- ни один столбец, ни одна строка не удаляются — правило удаления в PostgreSQL
-- нельзя изменить на месте, поэтому `prisma migrate diff` печатает пару «снять
-- ограничение — поставить его же обратно под тем же именем». Между двумя
-- операторами пары ключ отсутствует, поэтому применять надо одной транзакцией
-- (`--single-transaction`), как и все прежние применения.
--
-- Что НЕ каскадится и почему:
--   * `MessagesGroup.buyerOrganizationId` — цепочка торговой площадки
--     (MessagesGroup -> Orders -> OrderItems -> PayoutProblems) хранит деньги и
--     второго участника; область не должна уносить её с собой. Дверь удаления
--     отказывает перед ней тем же прежним кодом.
--   * `OrderItems.integrationId` — то же основание.
--   * `Post.submittedForOrganizationId` — пост принадлежит своей области, а
--     «предложен для» другой; остаётся `SET NULL`, как и было.
--   * `User` — с областью уходит только `UserOrganization` (участие), сам
--     аккаунт нет.
--   * Строки аудита области (`BrandProfileAuditEvent`) каскадятся: это журнал
--     самой области, а не общий журнал инстанса. Общего журнала со ссылкой на
--     Organization в схеме нет. `Errors` — тоже журнал области, каскадится.
--   * Таблиц Mastra в `schema.prisma` нет, и этот файл их не касается.
--
-- Побочное следствие: `Media` уходит вместе с областью, но файлы в хранилище
-- (диск или S3) остаются — их удаление отдельная задача, не этот файл.
--
-- Порядок применения:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --diff <шаг 1> --selected этот_файл
--        --allow-table AutoPost --allow-table BrandProfileAuditEvent
--        --allow-table Comments --allow-table ContentContextItem
--        --allow-table ContentEvidenceAssessment --allow-table ContentFactEvidence
--        --allow-table ContentOutputContext --allow-table Credits
--        --allow-table Customer --allow-table DraftEvidence
--        --allow-table Errors --allow-table ExisingPlugData
--        --allow-table GitHub --allow-table Integration
--        --allow-table IntegrationsWebhooks --allow-table Media
--        --allow-table Notifications --allow-table OAuthApp
--        --allow-table OAuthAuthorization --allow-table Plugs
--        --allow-table Post --allow-table ProjectBrandProfileVersion
--        --allow-table Sets --allow-table Signatures
--        --allow-table SourceEvidence --allow-table SourceSyncRun
--        --allow-table Subscription --allow-table Tags
--        --allow-table TagsPosts --allow-table ThirdParty
--        --allow-table UsedCodes --allow-table UserOrganization
--        --allow-table Webhooks
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. Повторный migrate diff должен вернуть только mastra_* DROP TABLE.
--
-- Валидатор пропускает `DROP CONSTRAINT` только тогда, когда тот же файл
-- возвращает то же имя как `ADD CONSTRAINT ... FOREIGN KEY`. `DROP TABLE` и
-- `DROP COLUMN` он по-прежнему отвергает. BEGIN/COMMIT в файле нет:
-- транзакцию даёт флаг `--single-transaction`.
--
-- Каскады добавлены в schema.prisma 05.09.2026 (`content-factory-next-fn33.32`).
-- На боевой базе ПРИМЕНЕНО 05.09.2026 до переключения на выпуск dcb6eae72608,
-- одним файлом вместе с ai-role-models-schema-apply.sql (копия
-- 20260905T075257Z-pre-cleanup-product-only, повторный diff пуст, каскадных
-- ключей 30 → 74). Повторно не запускать — `ADD CONSTRAINT` откажет на уже
-- существующем имени.

-- DropForeignKey
ALTER TABLE "Tags" DROP CONSTRAINT "Tags_orgId_fkey";

-- DropForeignKey
ALTER TABLE "TagsPosts" DROP CONSTRAINT "TagsPosts_postId_fkey";

-- DropForeignKey
ALTER TABLE "TagsPosts" DROP CONSTRAINT "TagsPosts_tagId_fkey";

-- DropForeignKey
ALTER TABLE "UsedCodes" DROP CONSTRAINT "UsedCodes_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrganization" DROP CONSTRAINT "UserOrganization_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "GitHub" DROP CONSTRAINT "GitHub_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Media" DROP CONSTRAINT "Media_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Credits" DROP CONSTRAINT "Credits_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Signatures" DROP CONSTRAINT "Signatures_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Comments" DROP CONSTRAINT "Comments_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Comments" DROP CONSTRAINT "Comments_postId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Notifications" DROP CONSTRAINT "Notifications_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Plugs" DROP CONSTRAINT "Plugs_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "Plugs" DROP CONSTRAINT "Plugs_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ExisingPlugData" DROP CONSTRAINT "ExisingPlugData_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationsWebhooks" DROP CONSTRAINT "IntegrationsWebhooks_integrationId_fkey";

-- DropForeignKey
ALTER TABLE "IntegrationsWebhooks" DROP CONSTRAINT "IntegrationsWebhooks_webhookId_fkey";

-- DropForeignKey
ALTER TABLE "Webhooks" DROP CONSTRAINT "Webhooks_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "AutoPost" DROP CONSTRAINT "AutoPost_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Sets" DROP CONSTRAINT "Sets_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ThirdParty" DROP CONSTRAINT "ThirdParty_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Errors" DROP CONSTRAINT "Errors_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Errors" DROP CONSTRAINT "Errors_postId_fkey";

-- DropForeignKey
ALTER TABLE "OAuthApp" DROP CONSTRAINT "OAuthApp_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OAuthAuthorization" DROP CONSTRAINT "OAuthAuthorization_oauthAppId_fkey";

-- DropForeignKey
ALTER TABLE "OAuthAuthorization" DROP CONSTRAINT "OAuthAuthorization_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectBrandProfileVersion" DROP CONSTRAINT "ProjectBrandProfileVersion_organizationId_profileId_fkey";

-- DropForeignKey
ALTER TABLE "BrandProfileAuditEvent" DROP CONSTRAINT "BrandProfileAuditEvent_organizationId_profileId_fkey";

-- DropForeignKey
ALTER TABLE "SourceSyncRun" DROP CONSTRAINT "SourceSyncRun_organizationId_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "SourceEvidence" DROP CONSTRAINT "SourceEvidence_organizationId_sourceSnapshotId_fkey";

-- DropForeignKey
ALTER TABLE "ContentEvidenceAssessment" DROP CONSTRAINT "ContentEvidenceAssessment_organizationId_evidenceId_fkey";

-- DropForeignKey
ALTER TABLE "ContentFactEvidence" DROP CONSTRAINT "ContentFactEvidence_organizationId_factId_fkey";

-- DropForeignKey
ALTER TABLE "ContentFactEvidence" DROP CONSTRAINT "ContentFactEvidence_organizationId_evidenceId_fkey";

-- DropForeignKey
ALTER TABLE "ContentContextItem" DROP CONSTRAINT "ContentContextItem_organizationId_contentContextSnapshotId_fkey";

-- DropForeignKey
ALTER TABLE "ContentOutputContext" DROP CONSTRAINT "ContentOutputContext_organizationId_postId_fkey";

-- DropForeignKey
ALTER TABLE "ContentOutputContext" DROP CONSTRAINT "ContentOutputContext_organizationId_contentContextSnapshot_fkey";

-- DropForeignKey
ALTER TABLE "DraftEvidence" DROP CONSTRAINT "DraftEvidence_organizationId_postId_fkey";

-- DropForeignKey
ALTER TABLE "DraftEvidence" DROP CONSTRAINT "DraftEvidence_organizationId_evidenceId_fkey";

-- DropForeignKey
ALTER TABLE "DraftEvidence" DROP CONSTRAINT "DraftEvidence_organizationId_contentContextSnapshotId_fkey";

-- AddForeignKey
ALTER TABLE "Tags" ADD CONSTRAINT "Tags_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsPosts" ADD CONSTRAINT "TagsPosts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsPosts" ADD CONSTRAINT "TagsPosts_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsedCodes" ADD CONSTRAINT "UsedCodes_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganization" ADD CONSTRAINT "UserOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHub" ADD CONSTRAINT "GitHub_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credits" ADD CONSTRAINT "Credits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signatures" ADD CONSTRAINT "Signatures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comments" ADD CONSTRAINT "Comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notifications" ADD CONSTRAINT "Notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plugs" ADD CONSTRAINT "Plugs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plugs" ADD CONSTRAINT "Plugs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExisingPlugData" ADD CONSTRAINT "ExisingPlugData_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationsWebhooks" ADD CONSTRAINT "IntegrationsWebhooks_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationsWebhooks" ADD CONSTRAINT "IntegrationsWebhooks_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhooks" ADD CONSTRAINT "Webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoPost" ADD CONSTRAINT "AutoPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sets" ADD CONSTRAINT "Sets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThirdParty" ADD CONSTRAINT "ThirdParty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Errors" ADD CONSTRAINT "Errors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Errors" ADD CONSTRAINT "Errors_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthApp" ADD CONSTRAINT "OAuthApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorization" ADD CONSTRAINT "OAuthAuthorization_oauthAppId_fkey" FOREIGN KEY ("oauthAppId") REFERENCES "OAuthApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorization" ADD CONSTRAINT "OAuthAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBrandProfileVersion" ADD CONSTRAINT "ProjectBrandProfileVersion_organizationId_profileId_fkey" FOREIGN KEY ("organizationId", "profileId") REFERENCES "ProjectBrandProfile"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandProfileAuditEvent" ADD CONSTRAINT "BrandProfileAuditEvent_organizationId_profileId_fkey" FOREIGN KEY ("organizationId", "profileId") REFERENCES "ProjectBrandProfile"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSyncRun" ADD CONSTRAINT "SourceSyncRun_organizationId_sourceId_fkey" FOREIGN KEY ("organizationId", "sourceId") REFERENCES "ContentSource"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceEvidence" ADD CONSTRAINT "SourceEvidence_organizationId_sourceSnapshotId_fkey" FOREIGN KEY ("organizationId", "sourceSnapshotId") REFERENCES "SourceSnapshot"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEvidenceAssessment" ADD CONSTRAINT "ContentEvidenceAssessment_organizationId_evidenceId_fkey" FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "SourceEvidence"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFactEvidence" ADD CONSTRAINT "ContentFactEvidence_organizationId_factId_fkey" FOREIGN KEY ("organizationId", "factId") REFERENCES "ContentFact"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFactEvidence" ADD CONSTRAINT "ContentFactEvidence_organizationId_evidenceId_fkey" FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "SourceEvidence"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentContextItem" ADD CONSTRAINT "ContentContextItem_organizationId_contentContextSnapshotId_fkey" FOREIGN KEY ("organizationId", "contentContextSnapshotId") REFERENCES "ContentContextSnapshot"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOutputContext" ADD CONSTRAINT "ContentOutputContext_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentOutputContext" ADD CONSTRAINT "ContentOutputContext_organizationId_contentContextSnapshot_fkey" FOREIGN KEY ("organizationId", "contentContextSnapshotId") REFERENCES "ContentContextSnapshot"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftEvidence" ADD CONSTRAINT "DraftEvidence_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftEvidence" ADD CONSTRAINT "DraftEvidence_organizationId_evidenceId_fkey" FOREIGN KEY ("organizationId", "evidenceId") REFERENCES "SourceEvidence"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftEvidence" ADD CONSTRAINT "DraftEvidence_organizationId_contentContextSnapshotId_fkey" FOREIGN KEY ("organizationId", "contentContextSnapshotId") REFERENCES "ContentContextSnapshot"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

