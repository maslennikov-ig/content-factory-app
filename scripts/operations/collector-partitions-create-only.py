#!/usr/bin/env python3
"""Create only the collector's seven UTC daily issue-event partitions.

Run on stdin inside the existing GlitchTip 6.0.5 container. The default is a
READ ONLY plan; --apply admits only native CREATE TABLE statements. This never
calls maintenance, changes retention, replays a task, or removes a table.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from uuid import UUID


ROOT = "public.issue_events_issueevent"
HORIZON_DAYS = 7
HASH_BUCKETS = 4
MAX_NEW_TABLES = 35
ADVISORY_KEY = (1128682324, 1)
EXPECTED_SOURCE_SHA256 = {
    "/code/glitchtip/partition_manager.py": "d6ac1d9b6ee34fe1a035afe9ef1307c30847cb6be26589c41a8384de911ff86f",
    "/code/glitchtip/management/commands/maintain_partitions.py": "a502399206a6a03e7fa642302ef2eb6bdf9fcba3afc3a9727e8d96ddc0c23cac",
    "/code/glitchtip/settings.py": "01d5f14fdeffb8d5885ede7519c4a7db7c40d2a7c20ff9eba427045930a5f1e0",
    "/code/apps/issue_events/models.py": "5a64954fbd9225f4ea31027f5e8b900d0ee9719c90a4a81a2a64bce9bcc9a145",
}
EXPECTED_FIELDS = [
    ["id", "uuid", True], ["event_id", "uuid", False],
    ["timestamp", "timestamp with time zone", True],
    ["created", "timestamp with time zone", True],
    ["issue_id", "bigint", True], ["organization_id", "bigint", True],
    ["release_id", "bigint", False], ["type", "smallint", True],
    ["level", "smallint", True], ["title", "character varying(255)", True],
    ["transaction", "character varying(1024)", True], ["data", "jsonb", True],
    ["tags", "jsonb", True], ["hashes", "text[]", True],
]
EXPECTED_INDEX_DEFINITIONS = sorted([
    "CREATE UNIQUE INDEX issue_events_issueevent_pkey ON ONLY public.issue_events_issueevent USING btree (id, organization_id)",
    "CREATE INDEX issueevent_event_id_idx ON ONLY public.issue_events_issueevent USING btree (event_id) WHERE (event_id IS NOT NULL)",
    "CREATE INDEX issueevent_hashes_idx ON ONLY public.issue_events_issueevent USING gin (hashes)",
    "CREATE INDEX issueevent_issue_id_idx ON ONLY public.issue_events_issueevent USING btree (issue_id, id DESC)",
    "CREATE INDEX issueevent_release_idx ON ONLY public.issue_events_issueevent USING btree (release_id)",
])
EXPECTED_FOREIGN_KEYS = sorted([
    "FOREIGN KEY (issue_id) REFERENCES issue_events_issue(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED",
    "FOREIGN KEY (organization_id) REFERENCES organizations_ext_organization(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED",
    "FOREIGN KEY (release_id) REFERENCES releases_release(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED",
])


class Refused(RuntimeError):
    """Static, safe-to-log refusal code; never include DB or event payloads."""


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def utc_now(environ=None) -> datetime:
    value = (os.environ if environ is None else environ).get("CF_COLLECTOR_PARTITIONS_NOW", "")
    if not value:
        return datetime.now(timezone.utc)
    try:
        if len(value) > 64 or not value.isascii():
            raise ValueError
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if moment.tzinfo is None or moment.utcoffset() != timedelta(0):
            raise ValueError
        if not 1970 <= moment.year <= 9998:
            raise ValueError
        return moment.astimezone(timezone.utc)
    except ValueError as error:
        raise Refused("CF_PARTITION_INVALID_NOW") from error


def verify_sources() -> None:
    try:
        if any(hashlib.sha256(Path(path).read_bytes()).hexdigest() != expected
               for path, expected in EXPECTED_SOURCE_SHA256.items()):
            raise Refused("CF_PARTITION_SOURCE_DRIFT")
    except OSError as error:
        raise Refused("CF_PARTITION_SOURCE_UNAVAILABLE") from error


def verify_settings(settings) -> None:
    if (getattr(settings, "PARTITION_HASH_BUCKETS", None),
        getattr(settings, "GLITCHTIP_MAX_EVENT_LIFE_DAYS", None),
        getattr(settings, "GLITCHTIP_MAX_FILE_LIFE_DAYS", None)) != (4, 90, 90):
        raise Refused("CF_PARTITION_SETTINGS_DRIFT")


def names_for_day(day: datetime) -> list[str]:
    name = f"{ROOT}_{day:%Y%m%d}"
    return [name] + [f"{name}_h{i}" for i in range(HASH_BUCKETS)]


def uuid_bound(day: datetime) -> str:
    timestamp_ms = int(day.timestamp() * 1000)
    return str(UUID(int=(timestamp_ms << 80) | (7 << 76) | (2 << 62)))


def expected_creation(day: datetime) -> list[str]:
    names = names_for_day(day)
    return [
        f"CREATE TABLE {names[0]} PARTITION OF {ROOT} "
        f"FOR VALUES FROM ('{uuid_bound(day)}') TO ('{uuid_bound(day + timedelta(days=1))}') "
        "PARTITION BY HASH (organization_id);",
        *[f"CREATE TABLE {name} PARTITION OF {names[0]} "
          f"FOR VALUES WITH (MODULUS 4, REMAINDER {i});"
          for i, name in enumerate(names[1:])],
    ]


def checked_native_creation(day: datetime, creator) -> list[str]:
    sqls = creator(
        parent_table=ROOT, partition_name=names_for_day(day)[0],
        start_date=day, end_date=day + timedelta(days=1),
        hash_buckets=4, hash_column="organization_id", key_type="uuid7",
        partition_column="id",
    )
    if not isinstance(sqls, list) or len(sqls) != 5 or any(not isinstance(sql, str) for sql in sqls):
        raise Refused("CF_PARTITION_NATIVE_SQL_DRIFT")
    # The frozen API uses IF NOT EXISTS; after locked catalog validation, a
    # collision must fail rather than quietly accepting an unrelated object.
    normalized = [re.sub(r"\s+", " ", sql.strip().replace("CREATE TABLE IF NOT EXISTS ", "CREATE TABLE ", 1)) for sql in sqls]
    if normalized != expected_creation(day):
        raise Refused("CF_PARTITION_NATIVE_SQL_DRIFT")
    return normalized


def root_guard_sql() -> str:
    fields = sql_literal(json.dumps(EXPECTED_FIELDS))
    indexes = sql_literal(json.dumps(EXPECTED_INDEX_DEFINITIONS))
    foreign_keys = sql_literal(json.dumps(EXPECTED_FOREIGN_KEYS))
    return f"""DO $root_guard$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 18 THEN
    RAISE EXCEPTION 'CF_PARTITION_PG_VERSION_DRIFT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('{ROOT}')
                 AND c.relkind='p' AND NOT c.relispartition
                 AND pg_get_userbyid(c.relowner)=current_user)
     OR current_user <> 'postgres'
     OR NOT has_schema_privilege(current_user,'public','CREATE')
     OR pg_get_partkeydef(to_regclass('{ROOT}')) IS DISTINCT FROM 'RANGE (id)' THEN
    RAISE EXCEPTION 'CF_PARTITION_ROOT_DRIFT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
             WHERE i.inhparent='{ROOT}'::regclass
               AND pg_get_expr(c.relpartbound,c.oid)='DEFAULT') THEN
    RAISE EXCEPTION 'CF_PARTITION_DEFAULT_FORBIDDEN';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtenabled <> 'D') THEN
    RAISE EXCEPTION 'CF_PARTITION_DDL_TRIGGER_FORBIDDEN';
  END IF;
  IF (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull)
                      ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid='{ROOT}'::regclass AND a.attnum>0 AND NOT a.attisdropped)
     IS DISTINCT FROM {fields}::jsonb THEN
    RAISE EXCEPTION 'CF_PARTITION_ROOT_COLUMNS_DRIFT';
  END IF;
  IF (SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid))
      FROM pg_index i WHERE i.indrelid='{ROOT}'::regclass) IS DISTINCT FROM {indexes}::jsonb
     OR EXISTS (SELECT 1 FROM pg_index WHERE indrelid='{ROOT}'::regclass
                AND (NOT indisvalid OR NOT indisready OR NOT indislive)) THEN
    RAISE EXCEPTION 'CF_PARTITION_ROOT_INDEX_DRIFT';
  END IF;
  IF (SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY pg_get_constraintdef(k.oid))
      FROM pg_constraint k WHERE k.conrelid='{ROOT}'::regclass AND k.contype='f')
     IS DISTINCT FROM {foreign_keys}::jsonb THEN
    RAISE EXCEPTION 'CF_PARTITION_ROOT_FK_DRIFT';
  END IF;
END
$root_guard$;"""


def day_validation_sql(day: datetime) -> str:
    names = names_for_day(day)
    array = "ARRAY[" + ",".join(map(sql_literal, names)) + "]"
    bounds = f"FOR VALUES FROM ('{uuid_bound(day)}') TO ('{uuid_bound(day + timedelta(days=1))}')"
    hash_bounds = "ARRAY[" + ",".join(sql_literal(f"FOR VALUES WITH (modulus 4, remainder {i})") for i in range(4)) + "]"
    return f"""DO $daily_guard$
DECLARE
  target text;
  present integer;
  actual_hash_bounds text[];
BEGIN
  SELECT count(*) INTO present FROM unnest({array}) AS t(name) WHERE to_regclass(t.name) IS NOT NULL;
  IF present=0 THEN RETURN; END IF;
  IF present<>5 THEN RAISE EXCEPTION 'CF_PARTITION_PARTIAL_DAY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_inherits i ON i.inhrelid=c.oid
                 WHERE c.oid='{names[0]}'::regclass AND c.relkind='p' AND c.relispartition
                   AND i.inhparent='{ROOT}'::regclass
                   AND pg_get_expr(c.relpartbound,c.oid)={sql_literal(bounds)}
                   AND pg_get_partkeydef(c.oid)='HASH (organization_id)') THEN
    RAISE EXCEPTION 'CF_PARTITION_DAY_BOUND_OR_PARENT_DRIFT';
  END IF;
  SELECT array_agg(pg_get_expr(c.relpartbound,c.oid) ORDER BY c.relname)
    INTO actual_hash_bounds FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid
    WHERE i.inhparent='{names[0]}'::regclass AND c.relkind IN ('p','r','f');
  IF actual_hash_bounds IS DISTINCT FROM {hash_bounds} THEN
    RAISE EXCEPTION 'CF_PARTITION_HASH_COVERAGE_DRIFT';
  END IF;
  FOREACH target IN ARRAY {array} LOOP
    IF target <> '{names[0]}' AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_inherits i ON i.inhrelid=c.oid
        WHERE c.oid=to_regclass(target) AND c.relkind='r' AND c.relispartition
          AND i.inhparent='{names[0]}'::regclass) THEN
      RAISE EXCEPTION 'CF_PARTITION_LEAF_PARENT_DRIFT';
    END IF;
    IF EXISTS (
      (SELECT a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attcollation,
              a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=to_regclass(target) AND a.attnum>0 AND NOT a.attisdropped
       EXCEPT ALL
       SELECT a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attcollation,
              a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid='{ROOT}'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      UNION ALL
      (SELECT a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attcollation,
              a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid='{ROOT}'::regclass AND a.attnum>0 AND NOT a.attisdropped
       EXCEPT ALL
       SELECT a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attcollation,
              a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=to_regclass(target) AND a.attnum>0 AND NOT a.attisdropped)) THEN
      RAISE EXCEPTION 'CF_PARTITION_COLUMNS_DRIFT';
    END IF;
    IF (SELECT array_agg(pg_get_constraintdef(k.oid) ORDER BY pg_get_constraintdef(k.oid))
        FROM pg_constraint k WHERE k.conrelid=to_regclass(target)) IS DISTINCT FROM
       (SELECT array_agg(pg_get_constraintdef(k.oid) ORDER BY pg_get_constraintdef(k.oid))
        FROM pg_constraint k WHERE k.conrelid='{ROOT}'::regclass) THEN
      RAISE EXCEPTION 'CF_PARTITION_CONSTRAINT_DRIFT';
    END IF;
    IF (SELECT count(*) FROM pg_index WHERE indrelid=to_regclass(target))<>5
       OR EXISTS (SELECT 1 FROM pg_index WHERE indrelid=to_regclass(target)
                  AND (NOT indisvalid OR NOT indisready OR NOT indislive))
       OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass(target)
                  AND (NOT convalidated OR NOT conenforced)) THEN
      RAISE EXCEPTION 'CF_PARTITION_INVALID_CONSTRAINT_OR_INDEX';
    END IF;
    IF EXISTS (
      SELECT am.amname,i.indisunique,i.indisprimary,i.indnkeyatts,i.indkey::text,
             i.indclass::text,i.indcollation::text,i.indoption::text,
             pg_get_expr(i.indpred,i.indrelid),pg_get_expr(i.indexprs,i.indrelid)
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
      WHERE i.indrelid=to_regclass(target)
      EXCEPT ALL
      SELECT am.amname,i.indisunique,i.indisprimary,i.indnkeyatts,i.indkey::text,
             i.indclass::text,i.indcollation::text,i.indoption::text,
             pg_get_expr(i.indpred,i.indrelid),pg_get_expr(i.indexprs,i.indrelid)
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam
      WHERE i.indrelid='{ROOT}'::regclass) THEN
      RAISE EXCEPTION 'CF_PARTITION_INDEX_DEFINITION_DRIFT';
    END IF;
  END LOOP;
END
$daily_guard$;"""


@contextmanager
def transaction(connection, *, read_only=False):
    with connection.cursor() as cursor:
        cursor.execute("BEGIN READ ONLY" if read_only else "BEGIN")
        try:
            for name, value in [
                ("statement_timeout", "5000ms"), ("lock_timeout", "1000ms"),
                ("transaction_timeout", "5000ms"), ("idle_in_transaction_session_timeout", "5000ms"),
            ]:
                cursor.execute(f"SET LOCAL {name} = '{value}'")
            cursor.execute("SET LOCAL search_path = pg_catalog, public")
            yield cursor
            cursor.execute("ROLLBACK" if read_only else "COMMIT")
        except BaseException:
            try:
                cursor.execute("ROLLBACK")
            except Exception:
                connection.close()
            raise


def catalog_identity(cursor) -> dict:
    cursor.execute("""SELECT c.oid,n.nspname,c.relname,c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'""")
    return {row[0]: tuple(row[1:]) for row in cursor.fetchall()}


def assert_created_scope(cursor, before: dict, names: list[str]) -> None:
    after = catalog_identity(cursor)
    if any(after.get(oid) != definition for oid, definition in before.items()):
        raise Refused("CF_PARTITION_EXISTING_CATALOG_CHANGED")
    added = set(after) - set(before)
    new_tables = {oid for oid in added if after[oid][2] in ("p", "r")}
    expected_names = {name.split(".", 1)[1] for name in names}
    if {after[oid][1] for oid in new_tables} != expected_names or len(new_tables) != 5:
        raise Refused("CF_PARTITION_NEW_TABLE_SCOPE_DRIFT")
    cursor.execute("SELECT indexrelid,indrelid FROM pg_index WHERE indexrelid=ANY(%s)", [list(added - new_tables)])
    indexes = dict(cursor.fetchall())
    if len(added) != 30 or len(indexes) != 25 or set(indexes) != added - new_tables:
        raise Refused("CF_PARTITION_NEW_DEPENDENCY_SCOPE_DRIFT")
    if any(after[oid][0] != "public" for oid in added) or any(owner not in new_tables for owner in indexes.values()):
        raise Refused("CF_PARTITION_NEW_DEPENDENCY_OWNER_DRIFT")


def run_days(connection, moment: datetime, creator, *, apply=False, source_check=None) -> dict:
    if moment.tzinfo is None or moment.utcoffset() != timedelta(0):
        raise Refused("CF_PARTITION_INVALID_NOW")
    autocommit = connection.get_autocommit() if hasattr(connection, "get_autocommit") else connection.autocommit
    if not autocommit:
        raise Refused("CF_PARTITION_CONNECTION_MUST_BE_AUTOCOMMIT")
    today = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    days = [today + timedelta(days=i) for i in range(HORIZON_DAYS)]
    creation = [checked_native_creation(day, creator) for day in days]
    if sum(len(sqls) for sqls in creation) != MAX_NEW_TABLES:
        raise Refused("CF_PARTITION_HORIZON_DRIFT")
    planned = []
    # Reject any incompatible day before making the first persistent change.
    # Apply rechecks each day under a fresh root lock to handle catalog races.
    with transaction(connection, read_only=True) as cursor:
        cursor.execute(f"LOCK TABLE ONLY {ROOT} IN ACCESS SHARE MODE NOWAIT")
        cursor.execute(root_guard_sql())
        for day in days:
            cursor.execute(day_validation_sql(day))
            cursor.execute("SELECT to_regclass(%s)", [names_for_day(day)[0]])
            if cursor.fetchone()[0] is None:
                planned.extend(names_for_day(day))
    created = []
    if apply:
        for day, sqls in zip(days, creation):
            if source_check is not None:
                source_check()
            with transaction(connection) as cursor:
                cursor.execute("SELECT pg_try_advisory_xact_lock(%s,%s)", ADVISORY_KEY)
                if not cursor.fetchone()[0]:
                    raise Refused("CF_PARTITION_ADVISORY_BUSY")
                cursor.execute(f"LOCK TABLE ONLY {ROOT} IN ACCESS SHARE MODE NOWAIT")
                cursor.execute(root_guard_sql())
                cursor.execute(day_validation_sql(day))
                cursor.execute("SELECT to_regclass(%s)", [names_for_day(day)[0]])
                if cursor.fetchone()[0] is not None:
                    continue
                cursor.execute(f"LOCK TABLE ONLY {ROOT} IN ACCESS EXCLUSIVE MODE NOWAIT")
                before = catalog_identity(cursor)
                for sql in sqls:
                    cursor.execute(sql)
                cursor.execute(day_validation_sql(day))
                cursor.execute(f"SELECT EXISTS (SELECT 1 FROM {names_for_day(day)[0]} LIMIT 1)")
                if cursor.fetchone()[0]:
                    raise Refused("CF_PARTITION_NEW_DAY_NOT_EMPTY")
                assert_created_scope(cursor, before, names_for_day(day))
            created.extend(names_for_day(day))
            if len(created) > MAX_NEW_TABLES:
                raise Refused("CF_PARTITION_CREATE_LIMIT_EXCEEDED")
    return {
        "format": "cf-collector-partitions-create-only/v1", "mode": "apply" if apply else "plan",
        "today_utc": today.date().isoformat(), "coverage_end_utc": (today + timedelta(days=7)).isoformat(),
        "validated_days": [day.date().isoformat() for day in days],
        "planned_new_tables": planned, "created_tables": created,
        "max_new_tables": MAX_NEW_TABLES, "retention_changed": False,
    }


def safe_error(error: Exception) -> str:
    if isinstance(error, Refused):
        return str(error)
    cause = getattr(error, "__cause__", None)
    diagnostic = getattr(error, "diag", None) or getattr(cause, "diag", None)
    primary = getattr(diagnostic, "message_primary", "") or ""
    if re.fullmatch(r"CF_PARTITION_[A-Z_]+", primary):
        return primary
    return f"CF_PARTITION_FAILED_{type(error).__name__}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="create missing reviewed daily partitions; default is read-only")
    args = parser.parse_args(argv)
    connection = None
    try:
        verify_sources()
        moment = utc_now()
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "glitchtip.settings")
        import django
        django.setup()
        from django.conf import settings
        from django.db import connection as db_connection
        from glitchtip.partition_manager import PartitionManager
        verify_settings(settings)
        connection = db_connection
        if connection.vendor != "postgresql":
            raise Refused("CF_PARTITION_DATABASE_BACKEND_DRIFT")
        # This invocation owns a fresh connection. Bound connection setup locally;
        # do not edit GlitchTip settings or the collector's process environment.
        connection.settings_dict["OPTIONS"] = {**connection.settings_dict.get("OPTIONS", {}), "connect_timeout": 5}
        result = run_days(connection, moment, PartitionManager().create_time_partition,
                          apply=args.apply, source_check=verify_sources)
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except Exception as error:
        print(json.dumps({"format": "cf-collector-partitions-create-only/v1", "status": "refused",
                          "reason": safe_error(error)}, sort_keys=True), file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
