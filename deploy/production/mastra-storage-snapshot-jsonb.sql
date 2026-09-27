-- Mastra storage pre-step: `mastra_workflow_snapshot.snapshot` text -> jsonb.
--
-- Applied only by deploy/production/upgrade-mastra-storage.sh, as POSTGRES_USER,
-- inside the same `psql --single-transaction` as
-- mastra-storage-upgrade-1.27.1.sql and before it. Never paste it into a
-- session by hand.
--
-- Why: production's Mastra database was created by an older `@mastra/pg` that
-- declared `snapshot` as TEXT (restored R2 archive, 27.09.2026; canonical
-- fingerprint 310d75fc…acac8f7). `@mastra/pg` 1.8.5 and 1.27.1 declare it
-- JSONB, and 1.27.1 builds two jsonb expression indexes on it
-- (`mastra_workflow_snapshot_name_status_createdat_idx`,
-- `mastra_workflow_snapshot_threadid_idx`). 1.27.1's own init runs no
-- conversion: on a text column it silently skips both indexes and re-parses
-- every snapshot through `regexp_replace(snapshot::text, …)::jsonb` at query
-- time. Its writes go through `toPgJson`, which strips the NUL and unpaired
-- surrogate escapes jsonb rejects, so a jsonb column is the shape it is built
-- for (a fresh 1.8.5 or 1.27.1 install has exactly this column as jsonb).
--
-- What it does, all inside the caller's transaction:
--   * jsonb already: nothing (the reference base, a fresh install, a rerun);
--   * any type other than text or jsonb: refuses;
--   * text: takes ACCESS EXCLUSIVE on the table (bounded by the caller's
--     lock_timeout), refuses if any row is not valid jsonb input
--     (`pg_input_is_valid`, which also rejects `\u0000` and lone surrogates)
--     and names the offending (workflow_name, run_id) keys, never contents;
--     otherwise `ALTER COLUMN snapshot TYPE jsonb USING snapshot::jsonb`.
-- A refusal aborts the whole transaction: nothing is converted, nothing is
-- upgraded. The caller proves afterwards that the only schema change this
-- step made is that one column type.
LOCK TABLE public.mastra_workflow_snapshot IN ACCESS EXCLUSIVE MODE;

DO $cf_snapshot_jsonb$
DECLARE
  column_type text;
  invalid_rows bigint;
  invalid_keys text;
BEGIN
  SELECT data_type INTO column_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'mastra_workflow_snapshot'
    AND column_name = 'snapshot';

  IF column_type = 'jsonb' THEN
    RETURN;
  END IF;
  IF column_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'mastra_workflow_snapshot.snapshot is %, neither text nor jsonb; refusing to convert it.',
      coalesce(column_type, 'missing');
  END IF;

  SELECT count(*),
         string_agg(format('(%L, %L)', workflow_name, run_id), ', '
                    ORDER BY workflow_name, run_id)
           FILTER (WHERE rn <= 5)
    INTO invalid_rows, invalid_keys
  FROM (
    SELECT workflow_name, run_id,
           row_number() OVER (ORDER BY workflow_name, run_id) AS rn
    FROM public.mastra_workflow_snapshot
    WHERE NOT pg_input_is_valid(snapshot, 'jsonb')
  ) AS invalid;
  IF invalid_rows > 0 THEN
    RAISE EXCEPTION 'mastra_workflow_snapshot has % rows whose snapshot is not valid jsonb; refusing to convert the column. Nothing was changed.', invalid_rows
      USING DETAIL = format('first (workflow_name, run_id) keys: %s', invalid_keys),
            HINT = 'Inspect those runs from the R1 backup, repair or delete them as the owner, then re-run.';
  END IF;

  ALTER TABLE public.mastra_workflow_snapshot
    ALTER COLUMN snapshot TYPE jsonb USING snapshot::jsonb;
END
$cf_snapshot_jsonb$;
