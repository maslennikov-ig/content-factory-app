-- Mastra storage upgrade: `@mastra/pg` 1.8.5 schema (29 deployment tables) to
-- the `@mastra/pg` 1.27.1 schema (45 deployment tables).
--
-- Applied only by deploy/production/upgrade-mastra-storage.sh, as POSTGRES_USER,
-- inside one `psql --single-transaction`. Never paste it into a session by hand,
-- never run Mastra's own init (`disableInit: false`) against production instead,
-- and never `prisma db push`.
--
-- Provenance: the 96 DDL statements `@mastra/pg` 1.27.1 init executed against a
-- 1.8.5 database on the stand with `log_statement = ddl` (kcxz.2 spike,
-- .codex/stages/content-factory-next-kcxz/evidence/spike-2026-09-26/ddl/upgrade-1.8.5-to-1.27.1-postgres-ddl-log.txt),
-- rewritten by .codex/stages/content-factory-next-kcxz/evidence/w1-mastra-upgrade/generate-upgrade-sql.mjs
-- in exactly two ways:
--   * the 23 `CREATE [UNIQUE] INDEX CONCURRENTLY` became plain
--     `CREATE [UNIQUE] INDEX IF NOT EXISTS`: CONCURRENTLY cannot run inside a
--     transaction and leaves INVALID indexes behind when interrupted; the
--     Mastra database is small enough for a plain build;
--   * the 11 `ADD COLUMN` without a guard became `ADD COLUMN IF NOT EXISTS`.
-- Every statement is therefore rerunnable. Every added column is nullable and
-- every added table is new, so the previous image keeps working on the result.
--
-- `trigger_set_timestamps()` is replaced with CREATE OR REPLACE, which keeps
-- its owner and ACL. It is never dropped: a re-created function would get
-- EXECUTE for PUBLIC, which check-postgres-role-isolation.sh refuses. The
-- REVOKE at the end holds that line even for a fresh install.
--
-- When `@mastra/pg` moves again: capture the new DDL log the same way, write a
-- new file next to this one, and do not edit this one.

CREATE TABLE IF NOT EXISTS "public"."mastra_workflow_definitions" (
  "id" TEXT PRIMARY KEY NOT NULL,
"description" TEXT ,
"metadata" JSONB ,
"inputSchema" JSONB NOT NULL,
"outputSchema" JSONB NOT NULL,
"stateSchema" JSONB ,
"requestContextSchema" JSONB ,
"graph" JSONB NOT NULL,
"schedule" JSONB ,
"status" TEXT NOT NULL,
"source" TEXT NOT NULL,
"authorId" TEXT ,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_nodes" (
  "id" TEXT PRIMARY KEY NOT NULL,
"type" TEXT NOT NULL,
"name" TEXT NOT NULL,
"canonicalName" TEXT NOT NULL,
"kind" TEXT ,
"content" TEXT ,
"description" TEXT ,
"scope" JSONB NOT NULL,
"scopeKey" TEXT NOT NULL,
"version" INTEGER NOT NULL,
"mergedInto" TEXT ,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_notifications" (
  "id" TEXT NOT NULL,
"threadId" TEXT NOT NULL,
"source" TEXT NOT NULL,
"kind" TEXT NOT NULL,
"priority" TEXT NOT NULL,
"status" TEXT NOT NULL,
"summary" TEXT NOT NULL,
"payload" JSONB ,
"resourceId" TEXT ,
"agentId" TEXT ,
"sourceId" TEXT ,
"dedupeKey" TEXT ,
"coalesceKey" TEXT ,
"coalescedCount" INTEGER NOT NULL,
"attributes" JSONB ,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"deliveredAt" TIMESTAMP ,
"seenAt" TIMESTAMP ,
"dismissedAt" TIMESTAMP ,
"archivedAt" TIMESTAMP ,
"discardedAt" TIMESTAMP ,
"deliverAt" TIMESTAMP ,
"summaryAt" TIMESTAMP ,
"deliveryReason" TEXT ,
"deliveryAttempts" INTEGER NOT NULL,
"lastDeliveryAttemptAt" TIMESTAMP ,
"lastDeliveryError" TEXT ,
"deliveredSignalId" TEXT ,
"summarySignalId" TEXT ,
"metadata" JSONB ,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"deliveredAtZ" TIMESTAMPTZ DEFAULT NOW(),
"seenAtZ" TIMESTAMPTZ DEFAULT NOW(),
"dismissedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"archivedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"discardedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"deliverAtZ" TIMESTAMPTZ DEFAULT NOW(),
"summaryAtZ" TIMESTAMPTZ DEFAULT NOW(),
"lastDeliveryAttemptAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_favorites" (
  "userId" TEXT NOT NULL,
"entityType" TEXT NOT NULL,
"entityId" TEXT NOT NULL,
"createdAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY ("userId", "entityType", "entityId")
);

CREATE TABLE IF NOT EXISTS "public"."mastra_tool_provider_connections" (
  "authorId" TEXT NOT NULL,
"providerId" TEXT NOT NULL,
"connectionId" TEXT NOT NULL,
"toolkit" TEXT NOT NULL,
"label" TEXT ,
"scope" TEXT NOT NULL,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY ("authorId", "providerId", "connectionId")
);

CREATE TABLE IF NOT EXISTS "public"."mastra_background_tasks" (
  "id" TEXT PRIMARY KEY NOT NULL,
"tool_call_id" TEXT NOT NULL,
"tool_name" TEXT NOT NULL,
"agent_id" TEXT NOT NULL,
"run_id" TEXT NOT NULL,
"thread_id" TEXT ,
"resource_id" TEXT ,
"status" TEXT NOT NULL,
"args" JSONB NOT NULL,
"result" JSONB ,
"error" JSONB ,
"suspend_payload" JSONB ,
"retry_count" INTEGER NOT NULL,
"max_retries" INTEGER NOT NULL,
"timeout_ms" INTEGER NOT NULL,
"createdAt" TIMESTAMP NOT NULL,
"startedAt" TIMESTAMP ,
"suspendedAt" TIMESTAMP ,
"completedAt" TIMESTAMP ,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"startedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"suspendedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"completedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_channel_installations" (
  "id" TEXT PRIMARY KEY NOT NULL,
"platform" TEXT NOT NULL,
"agentId" TEXT NOT NULL,
"status" TEXT NOT NULL,
"webhookId" TEXT ,
"data" JSONB NOT NULL,
"configHash" TEXT ,
"error" TEXT ,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_schedules" (
  "id" TEXT PRIMARY KEY NOT NULL,
"target" JSONB NOT NULL,
"cron" TEXT NOT NULL,
"timezone" TEXT ,
"status" TEXT NOT NULL,
"next_fire_at" BIGINT NOT NULL,
"last_fire_at" BIGINT ,
"last_run_id" TEXT ,
"created_at" BIGINT NOT NULL,
"updated_at" BIGINT NOT NULL,
"metadata" JSONB ,
"owner_type" TEXT ,
"owner_id" TEXT 
);

CREATE TABLE IF NOT EXISTS "public"."mastra_thread_state" (
  "threadId" TEXT NOT NULL,
"type" TEXT NOT NULL,
"value" JSONB NOT NULL,
"createdAt" TIMESTAMP NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY ("threadId", "type")
);

CREATE OR REPLACE FUNCTION "public".trigger_set_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW."createdAt" = NOW();
        NEW."updatedAt" = NOW();
        NEW."createdAtZ" = NOW();
        NEW."updatedAtZ" = NOW();
    ELSIF TG_OP = 'UPDATE' THEN
        NEW."updatedAt" = NOW();
        NEW."updatedAtZ" = NOW();
        NEW."createdAt" = OLD."createdAt";
        NEW."createdAtZ" = OLD."createdAtZ";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $mastra_timestamps_trigger$
BEGIN
    -- Recreating the trigger unconditionally would take an ACCESS EXCLUSIVE
    -- lock on the table (DROP TRIGGER does, even when nothing changes), and
    -- init runs on every process start. Skip when the trigger is already
    -- exactly what the CREATE below would produce.
    --
    -- tgtype 23 = ROW (1) | BEFORE (2) | INSERT (4) | UPDATE (16), so a trigger
    -- whose timing or events differ still falls through and gets rebuilt. The
    -- behaviour itself lives in the function, which is replaced above on every
    -- init, so an upgraded function body lands without touching the trigger.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger tg
        JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE tg.tgname = 'mastra_ai_spans_timestamps'
          AND c.relname = 'mastra_ai_spans'
          AND n.nspname = 'public'
          AND NOT tg.tgisinternal
          AND tg.tgtype = 23
          AND tg.tgfoid = '"public".trigger_set_timestamps()'::regprocedure
    ) THEN
        DROP TRIGGER IF EXISTS "mastra_ai_spans_timestamps" ON "public"."mastra_ai_spans";
        CREATE TRIGGER "mastra_ai_spans_timestamps"
            BEFORE INSERT OR UPDATE ON "public"."mastra_ai_spans"
            FOR EACH ROW
            EXECUTE FUNCTION "public".trigger_set_timestamps();
    END IF;
END
$mastra_timestamps_trigger$;

ALTER TABLE "public"."mastra_scorers" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "public"."mastra_scorer_definitions" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "mastra_workflow_snapshot_name_createdat_idx" ON "public"."mastra_workflow_snapshot" ("workflow_name", "createdAt" DESC);

ALTER TABLE "public"."mastra_skills" ADD COLUMN IF NOT EXISTS "visibility" TEXT;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

ALTER TABLE "public"."mastra_agents" ADD COLUMN IF NOT EXISTS "visibility" TEXT;

ALTER TABLE "public"."mastra_datasets" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_workflow_definitions_status" ON "public"."mastra_workflow_definitions" ("status");

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_records" (
  "id" TEXT PRIMARY KEY NOT NULL,
"node" TEXT NOT NULL,
"text" TEXT NOT NULL,
"scope" JSONB NOT NULL,
"scopeKey" TEXT NOT NULL,
"sourceThreadId" TEXT NOT NULL,
"capturedAt" TIMESTAMP NOT NULL,
"when" TIMESTAMP ,
"maxScope" TEXT ,
"metadata" JSONB ,
"deletedAt" TIMESTAMP ,
"deletedBy" TEXT ,
"capturedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"whenZ" TIMESTAMPTZ DEFAULT NOW(),
"deletedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_notifications_thread_status_updated" ON "public"."mastra_notifications" ("threadId", "status", "updatedAt");

CREATE INDEX IF NOT EXISTS idx_favorites_entity ON "public"."mastra_favorites" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "idx_tool_provider_connections_author" ON "public"."mastra_tool_provider_connections" ("authorId", "providerId", "toolkit");

CREATE INDEX IF NOT EXISTS "mastra_bg_tasks_status_created_at_idx" ON "public"."mastra_background_tasks" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "public"."mastra_channel_config" (
  "platform" TEXT PRIMARY KEY NOT NULL,
"data" JSONB NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "public"."mastra_schedule_triggers" (
  "id" TEXT PRIMARY KEY NOT NULL,
"schedule_id" TEXT NOT NULL,
"run_id" TEXT ,
"scheduled_fire_at" BIGINT NOT NULL,
"actual_fire_at" BIGINT NOT NULL,
"outcome" TEXT NOT NULL,
"error" TEXT ,
"trigger_kind" TEXT NOT NULL,
"parent_trigger_id" TEXT ,
"metadata" JSONB 
);

ALTER TABLE "public"."mastra_ai_spans" ADD COLUMN IF NOT EXISTS "entityVersionId" TEXT;

ALTER TABLE "public"."mastra_scorers" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "public"."mastra_scorer_definitions" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "mastra_workflow_snapshot_name_status_createdat_idx" ON "public"."mastra_workflow_snapshot" (workflow_name, (snapshot ->> 'status'), "createdAt" DESC);

ALTER TABLE "public"."mastra_skills" ADD COLUMN IF NOT EXISTS "favoriteCount" INTEGER;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "public"."mastra_agents" ADD COLUMN IF NOT EXISTS "favoriteCount" INTEGER;

ALTER TABLE "public"."mastra_datasets" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_mentions" (
  "sourceType" TEXT NOT NULL,
"sourceId" TEXT NOT NULL,
"recordId" TEXT NOT NULL,
PRIMARY KEY ("sourceType", "sourceId", "recordId")
);

CREATE INDEX IF NOT EXISTS "idx_notifications_coalescing" ON "public"."mastra_notifications" ("threadId", "source", "kind", "status", "agentId", "resourceId", "dedupeKey", "coalesceKey");

CREATE INDEX IF NOT EXISTS "mastra_bg_tasks_agent_status_idx" ON "public"."mastra_background_tasks" ("agent_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_channel_installations_webhook" ON "public"."mastra_channel_installations" ("webhookId");

CREATE INDEX IF NOT EXISTS "idx_mastra_schedules_status_next_fire" ON "public"."mastra_schedules" ("status", "next_fire_at");

ALTER TABLE "public"."mastra_ai_spans" ADD COLUMN IF NOT EXISTS "parentEntityVersionId" TEXT;

ALTER TABLE "public"."mastra_scorers" ADD COLUMN IF NOT EXISTS "batchId" TEXT;

CREATE INDEX IF NOT EXISTS "mastra_workflow_snapshot_threadid_idx" ON "public"."mastra_workflow_snapshot" ((COALESCE(jsonb_path_query_first(snapshot, '$.context.* ? (@.status == "suspended").suspendPayload.__streamState.messageList.memoryInfo.threadId') #>> '{}', snapshot #>> '{context,input,messageListState,memoryInfo,threadId}')));

ALTER TABLE "public"."mastra_skill_versions" ADD COLUMN IF NOT EXISTS "files" JSONB;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "provenance" JSONB;

ALTER TABLE "public"."mastra_agent_versions" ADD COLUMN IF NOT EXISTS "durable" JSONB;

ALTER TABLE "public"."mastra_datasets" ADD COLUMN IF NOT EXISTS "candidateKey" TEXT;

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_cursors" (
  "sourceThreadId" TEXT NOT NULL,
"agent" TEXT NOT NULL,
"lastKnowledgeId" TEXT NOT NULL,
"updatedAt" TIMESTAMP NOT NULL,
"updatedAtZ" TIMESTAMPTZ DEFAULT NOW(),
PRIMARY KEY ("sourceThreadId", "agent")
);

CREATE INDEX IF NOT EXISTS "idx_notifications_due" ON "public"."mastra_notifications" ("status", "deliverAt", "summaryAt");

CREATE INDEX IF NOT EXISTS "mastra_bg_tasks_thread_idx" ON "public"."mastra_background_tasks" ("thread_id", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_channel_installations_platform_agent" ON "public"."mastra_channel_installations" ("platform", "agentId");

CREATE INDEX IF NOT EXISTS "idx_mastra_schedule_triggers_schedule_fire" ON "public"."mastra_schedule_triggers" ("schedule_id", "actual_fire_at" DESC);

ALTER TABLE "public"."mastra_ai_spans" ADD COLUMN IF NOT EXISTS "rootEntityVersionId" TEXT;

ALTER TABLE "public"."mastra_scorers" ADD COLUMN IF NOT EXISTS "datasetId" TEXT;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "runnerAttestation" JSONB;

ALTER TABLE "public"."mastra_agent_versions" ADD COLUMN IF NOT EXISTS "browser" JSONB;

ALTER TABLE "public"."mastra_datasets" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_activity" (
  "id" TEXT PRIMARY KEY NOT NULL,
"action" TEXT NOT NULL,
"recordType" TEXT NOT NULL,
"recordId" TEXT NOT NULL,
"scope" JSONB NOT NULL,
"scopeKey" TEXT NOT NULL,
"sourceThreadId" TEXT ,
"createdAt" TIMESTAMP NOT NULL,
"createdAtZ" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "mastra_bg_tasks_tool_call_idx" ON "public"."mastra_background_tasks" ("tool_call_id");

ALTER TABLE "public"."mastra_scorers" ADD COLUMN IF NOT EXISTS "datasetItemId" TEXT;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "experimentSetId" TEXT;

ALTER TABLE "public"."mastra_agent_versions" ADD COLUMN IF NOT EXISTS "toolProviders" JSONB;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "expectedTrajectory" JSONB;

CREATE TABLE IF NOT EXISTS "public"."mastra_knowledge_semantic_outbox" (
  "id" TEXT PRIMARY KEY NOT NULL,
"idempotencyKey" TEXT NOT NULL,
"documentId" TEXT NOT NULL,
"documentType" TEXT NOT NULL,
"operation" TEXT NOT NULL,
"scope" JSONB NOT NULL,
"scopeKey" TEXT NOT NULL,
"status" TEXT NOT NULL,
"attempts" INTEGER NOT NULL,
"availableAt" TIMESTAMP NOT NULL,
"claimedAt" TIMESTAMP ,
"claimedBy" TEXT ,
"createdAt" TIMESTAMP NOT NULL,
"completedAt" TIMESTAMP ,
"availableAtZ" TIMESTAMPTZ DEFAULT NOW(),
"claimedAtZ" TIMESTAMPTZ DEFAULT NOW(),
"createdAtZ" TIMESTAMPTZ DEFAULT NOW(),
"completedAtZ" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "comparisonId" TEXT;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_nodes_identity ON "public"."mastra_knowledge_nodes" ("type", "scopeKey", "canonicalName");

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_scope ON "public"."mastra_knowledge_nodes" ("scopeKey", "type");

CREATE INDEX IF NOT EXISTS idx_knowledge_records_node_latest ON "public"."mastra_knowledge_records" ("node", "id" DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_records_thread_latest ON "public"."mastra_knowledge_records" ("sourceThreadId", "id" DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_mentions_record ON "public"."mastra_knowledge_mentions" ("recordId", "sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS idx_knowledge_activity_latest ON "public"."mastra_knowledge_activity" ("id" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_outbox_idempotency ON "public"."mastra_knowledge_semantic_outbox" ("idempotencyKey");

CREATE INDEX IF NOT EXISTS idx_knowledge_outbox_claim ON "public"."mastra_knowledge_semantic_outbox" ("status", "availableAt", "createdAt");

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "trialIndex" INTEGER;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "toolMocks" JSONB;

ALTER TABLE "public"."mastra_experiments" ADD COLUMN IF NOT EXISTS "scorerIds" JSONB;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "unmockedToolPolicy" TEXT;

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "comment" TEXT;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "scorerIds" JSONB;

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "toolMockReport" JSONB;

ALTER TABLE "public"."mastra_dataset_items" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "idx_dataset_items_external_id_history" ON "public"."mastra_dataset_items" ("datasetId", "externalId", "datasetVersion");

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_datasets_org_project" ON "public"."mastra_datasets" ("organizationId", "projectId");

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "idx_datasets_candidate" ON "public"."mastra_datasets" ("candidateKey", "candidateId");

ALTER TABLE "public"."mastra_experiment_results" ADD COLUMN IF NOT EXISTS "attempt" INTEGER;

CREATE INDEX IF NOT EXISTS "idx_dataset_items_org_project" ON "public"."mastra_dataset_items" ("organizationId", "projectId");

DROP INDEX IF EXISTS "public"."idx_experiment_results_exp_item";

CREATE INDEX IF NOT EXISTS "idx_experiments_grouping" ON "public"."mastra_experiments" ("experimentSetId", "comparisonId", "variantId", "trialIndex");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_experiment_results_exp_item_attempt" ON "public"."mastra_experiment_results" ("experimentId", "itemId", "attempt");

CREATE INDEX IF NOT EXISTS "idx_experiments_org_project" ON "public"."mastra_experiments" ("organizationId", "projectId");

CREATE INDEX IF NOT EXISTS "idx_experiment_results_org_project" ON "public"."mastra_experiment_results" ("organizationId", "projectId");

CREATE INDEX IF NOT EXISTS "idx_experiment_results_tags_gin" ON "public"."mastra_experiment_results" USING gin ("tags");

REVOKE ALL ON FUNCTION "public".trigger_set_timestamps() FROM PUBLIC;
