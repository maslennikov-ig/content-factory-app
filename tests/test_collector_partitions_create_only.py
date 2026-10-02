"""Focused real PostgreSQL 18 execution; explicitly opt in, never use a live DB.

CF_COLLECTOR_PARTITIONS_EXECUTION_TEST=1 enables a new disposable local cluster
with tmpfs data, no Docker volumes, and one loopback-only random port. psycopg
3.3.2 matches the installed collector. No application DB or provider is used.
"""
from datetime import datetime, timedelta, timezone
import atexit
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock
from uuid import UUID, uuid4


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/operations/collector-partitions-create-only.py"
SPEC = importlib.util.spec_from_file_location("collector_create_only", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
DAY = datetime(2026, 10, 1, tzinfo=timezone.utc)
DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]


def recorded_native_creator(**kwargs):
    """The frozen 6.0.5 output form, independent of helper normalization.

    The installed native importer is checked separately by a read-only host
    plan. These execution cases exercise the helper/DB transaction path.
    """
    def bound(moment):
        return UUID(int=(int(moment.timestamp() * 1000) << 80) | (7 << 76) | (2 << 62))

    parent, partition = kwargs["parent_table"], kwargs["partition_name"]
    sqls = [f"CREATE TABLE IF NOT EXISTS {partition} PARTITION OF {parent}\n"
            f"FOR VALUES FROM ('{bound(kwargs['start_date'])}') TO ('{bound(kwargs['end_date'])}')\n"
            "PARTITION BY HASH (organization_id);"]
    sqls += [f"CREATE TABLE IF NOT EXISTS {partition}_h{i} PARTITION OF {partition}\n"
             f"FOR VALUES WITH (MODULUS {kwargs['hash_buckets']}, REMAINDER {i});"
             for i in range(kwargs["hash_buckets"])]
    return sqls


class InputGuards(unittest.TestCase):
    def test_clock_is_caller_pinnable_without_the_real_calendar(self):
        for year in [2026, 2099]:
            value = f"{year}-10-01T23:59:59Z"
            self.assertEqual(MODULE.utc_now({"CF_COLLECTOR_PARTITIONS_NOW": value}),
                             datetime(year, 10, 1, 23, 59, 59, tzinfo=timezone.utc))
        for value in ["2026-10-01", "2026-10-01T00:00:00+03:00", "x' DROP TABLE t;", "x" * 65]:
            with self.assertRaisesRegex(MODULE.Refused, "CF_PARTITION_INVALID_NOW"):
                MODULE.utc_now({"CF_COLLECTOR_PARTITIONS_NOW": value})

    def test_native_output_is_allowlisted_instead_of_trusting_a_generator(self):
        self.assertEqual(len(MODULE.checked_native_creation(DAY, recorded_native_creator)), 5)
        def changed(**kwargs):
            return recorded_native_creator(**kwargs) + ["DROP TABLE other_project;"]
        with self.assertRaisesRegex(MODULE.Refused, "CF_PARTITION_NATIVE_SQL_DRIFT"):
            MODULE.checked_native_creation(DAY, changed)
        def changed_bucket(**kwargs):
            statements = recorded_native_creator(**kwargs)
            statements[1] = statements[1].replace("MODULUS 4", "MODULUS 8")
            return statements
        with self.assertRaisesRegex(MODULE.Refused, "CF_PARTITION_NATIVE_SQL_DRIFT"):
            MODULE.checked_native_creation(DAY, changed_bucket)

    def test_source_and_effective_retention_guards_fail_without_mutation(self):
        with tempfile.TemporaryDirectory(prefix="cf-collector-source-") as directory:
            source = Path(directory) / "frozen.py"
            source.write_text("frozen source\n")
            expected = {str(source): hashlib.sha256(source.read_bytes()).hexdigest()}
            with mock.patch.object(MODULE, "EXPECTED_SOURCE_SHA256", expected):
                MODULE.verify_sources()
                source.write_text("changed source\n")
                with self.assertRaisesRegex(MODULE.Refused, "CF_PARTITION_SOURCE_DRIFT"):
                    MODULE.verify_sources()
        settings = SimpleNamespace(PARTITION_HASH_BUCKETS=4, GLITCHTIP_MAX_EVENT_LIFE_DAYS=90,
                                   GLITCHTIP_MAX_FILE_LIFE_DAYS=90)
        before = vars(settings).copy()
        MODULE.verify_settings(settings)
        self.assertEqual(vars(settings), before)
        settings.GLITCHTIP_MAX_EVENT_LIFE_DAYS = 30
        before = vars(settings).copy()
        with self.assertRaisesRegex(MODULE.Refused, "CF_PARTITION_SETTINGS_DRIFT"):
            MODULE.verify_settings(settings)
        self.assertEqual(vars(settings), before)

    def test_errors_never_print_arbitrary_database_details(self):
        self.assertEqual(MODULE.safe_error(RuntimeError("private payload secret")),
                         "CF_PARTITION_FAILED_RuntimeError")
        self.assertNotIn("private", MODULE.safe_error(RuntimeError("private payload secret")))


SCHEMA = """
CREATE TABLE public.organizations_ext_organization(id bigint PRIMARY KEY);
CREATE TABLE public.issue_events_issue(id bigint PRIMARY KEY);
CREATE TABLE public.releases_release(id bigint PRIMARY KEY);
CREATE TABLE public.other_project_sentinel(id bigint PRIMARY KEY, note text NOT NULL);
CREATE TABLE public.retention_sentinel(event_days integer NOT NULL, file_days integer NOT NULL);
INSERT INTO public.organizations_ext_organization SELECT generate_series(1,100);
INSERT INTO public.issue_events_issue VALUES (1),(2);
INSERT INTO public.releases_release VALUES (1);
INSERT INTO public.other_project_sentinel VALUES (1,'unchanged synthetic other project');
INSERT INTO public.retention_sentinel VALUES (90,90);
CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$SELECT pg_catalog.uuidv7()$$;
CREATE TABLE public.issue_events_issueevent (
 id uuid DEFAULT public.uuid_generate_v7() CONSTRAINT issue_events_issueevent_id_not_null1 NOT NULL,
 event_id uuid,
 "timestamp" timestamptz CONSTRAINT issue_events_issueevent_timestamp_not_null1 NOT NULL,
 created timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
 issue_id bigint CONSTRAINT issue_events_issueevent_issue_id_not_null1 NOT NULL,
 organization_id bigint NOT NULL,
 release_id bigint,
 type smallint DEFAULT 0 CONSTRAINT issue_events_issueevent_type_not_null1 NOT NULL,
 level smallint DEFAULT 4 CONSTRAINT issue_events_issueevent_level_not_null1 NOT NULL,
 title varchar(255) CONSTRAINT issue_events_issueevent_title_not_null1 NOT NULL,
 transaction varchar(1024) CONSTRAINT issue_events_issueevent_transaction_not_null1 NOT NULL,
 data jsonb CONSTRAINT issue_events_issueevent_data_not_null1 NOT NULL,
 tags jsonb CONSTRAINT issue_events_issueevent_tags_not_null1 NOT NULL,
 hashes text[] DEFAULT ARRAY[]::text[] CONSTRAINT issue_events_issueevent_hashes_not_null1 NOT NULL,
 CONSTRAINT issue_events_issueevent_level_check CHECK (level>=0 AND level<=5),
 CONSTRAINT issue_events_issueevent_type_check CHECK (type>=0)
) PARTITION BY RANGE (id);
ALTER TABLE ONLY public.issue_events_issueevent ADD CONSTRAINT issue_events_issueevent_pkey PRIMARY KEY(id,organization_id);
CREATE INDEX issueevent_event_id_idx ON ONLY public.issue_events_issueevent(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX issueevent_hashes_idx ON ONLY public.issue_events_issueevent USING gin(hashes);
CREATE INDEX issueevent_issue_id_idx ON ONLY public.issue_events_issueevent(issue_id,id DESC);
CREATE INDEX issueevent_release_idx ON ONLY public.issue_events_issueevent(release_id);
ALTER TABLE public.issue_events_issueevent ADD CONSTRAINT issue_events_issueevent_issue_id_fkey
 FOREIGN KEY(issue_id) REFERENCES public.issue_events_issue(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.issue_events_issueevent ADD CONSTRAINT issue_events_issueevent_organization_id_fkey
 FOREIGN KEY(organization_id) REFERENCES public.organizations_ext_organization(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.issue_events_issueevent ADD CONSTRAINT issue_events_issueevent_release_id_fkey
 FOREIGN KEY(release_id) REFERENCES public.releases_release(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
"""


@unittest.skipUnless(os.environ.get("CF_COLLECTOR_PARTITIONS_EXECUTION_TEST") == "1",
                     "opt in to disposable local PostgreSQL 18 execution")
class PostgreSQL18Execution(unittest.TestCase):
    @classmethod
    def command(cls, arguments, *, check=True):
        result = subprocess.run(DOCKER + arguments, capture_output=True, text=True, timeout=45)
        if check and result.returncode:
            raise AssertionError(f"Disposable Docker command failed: {result.stderr[-1000:]}")
        return result

    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.psycopg = psycopg
        cls.cid = None
        cls.owner = "cf-collector-partitions-" + uuid4().hex[:12]
        cls.report = {"format": "cf-collector-partitions-pg18-execution/v1", "checks": [],
                      "scope": "new disposable local synthetic database only", "driver": psycopg.__version__}
        cls.command(["image", "inspect", "postgres:18"])
        try:
            cls.cid = cls.command([
                "run", "-d", "--name", cls.owner, "--label", "cf.collector-partitions-test-owner=" + cls.owner,
                "--memory", "512m", "--cpus", "1", "--pids-limit", "128",
                "--tmpfs", "/var/lib/postgresql:rw,size=268435456",
                "--publish", "127.0.0.1::5432", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
                "postgres:18", "-c", "max_connections=12", "-c", "shared_buffers=32MB",
            ]).stdout.strip()
            # unittest can be interrupted while a lock case is running; the
            # exact labelled disposable container still needs process cleanup.
            atexit.register(cls.cleanup)
            deadline = time.monotonic() + 40
            while cls.command(["exec", cls.cid, "pg_isready", "-U", "postgres"], check=False).returncode:
                if time.monotonic() >= deadline:
                    raise AssertionError("Disposable PostgreSQL readiness deadline")
                time.sleep(0.2)
            address = cls.command(["port", cls.cid, "5432/tcp"]).stdout.strip()
            if not re.fullmatch(r"127\.0\.0\.1:\d+", address):
                raise AssertionError("Disposable DB must be loopback-only")
            cls.port = address.rsplit(":", 1)[1]
            cls.admin = cls.connect("postgres")
            version = cls.admin.execute("SELECT version()").fetchone()[0]
            cls.report["postgres_version"] = version
            if not version.startswith("PostgreSQL 18."):
                raise AssertionError("Actual PostgreSQL 18 is required")
        except BaseException:
            cls.cleanup()
            raise

    @classmethod
    def connect(cls, database):
        return cls.psycopg.connect(host="127.0.0.1", port=cls.port, dbname=database,
                                  user="postgres", connect_timeout=5, autocommit=True)

    @classmethod
    def cleanup(cls):
        if getattr(cls, "admin", None) is not None:
            cls.admin.close()
        if cls.cid:
            actual_owner = cls.command(["inspect", "--format", '{{index .Config.Labels "cf.collector-partitions-test-owner"}}', cls.cid]).stdout.strip()
            if actual_owner != cls.owner:
                raise AssertionError("Do not remove a container whose exact owner label changed")
            volumes = cls.command(["inspect", "--format", '{{range .Mounts}}{{.Type}} {{end}}', cls.cid]).stdout.split()
            cls.command(["rm", "-f", cls.cid])
            absent = cls.command(["inspect", cls.cid], check=False).returncode != 0
            cls.report["cleanup"] = {"exact_container_absent": absent, "docker_volumes_created": volumes.count("volume"),
                                     "only_loopback_port": True}
            cls.cid = None
            if not absent or "volume" in volumes:
                raise AssertionError("Disposable test must leave no container or Docker volume")

    @classmethod
    def tearDownClass(cls):
        cls.cleanup()
        report_path = os.environ.get("CF_COLLECTOR_PARTITIONS_TEST_REPORT")
        if report_path:
            Path(report_path).write_text(json.dumps(cls.report, sort_keys=True, indent=2) + "\n")

    def setUp(self):
        self.database = "cf_case_" + uuid4().hex[:12]
        self.admin.execute(f'CREATE DATABASE "{self.database}"')
        self.connection = self.connect(self.database)
        self.connection.execute(SCHEMA)
        old = DAY - timedelta(days=11)
        for statement in MODULE.expected_creation(old):
            self.connection.execute(statement)
        self.old_name = MODULE.names_for_day(old)[0]
        self.insert_event(MODULE.uuid_bound(old), 2)
        self.before = self.preservation()

    def tearDown(self):
        self.connection.close()
        self.report["checks"].append(self._testMethodName)

    def preservation(self):
        # Compare old/reference table definitions and synthetic other-project
        # rows/retention. Expected added partitions/indexes are excluded.
        return self.connection.execute(f"""SELECT jsonb_build_object(
          'old_rows',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM {self.old_name} e),
          'other_rows',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM other_project_sentinel s),
          'retention',(SELECT jsonb_agg(to_jsonb(s)) FROM retention_sentinel s),
          'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexdef) FROM pg_indexes
             WHERE schemaname='public' AND tablename NOT LIKE 'issue_events_issueevent_202610%'),
          'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull)
                                     ORDER BY a.attrelid,a.attnum)
             FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
             WHERE c.relnamespace='public'::regnamespace AND a.attnum>0
               AND c.relname NOT LIKE 'issue_events_issueevent_202610%'))""").fetchone()[0]

    def insert_event(self, identifier, organization):
        self.connection.execute("""INSERT INTO public.issue_events_issueevent
          (id,organization_id,issue_id,"timestamp",title,transaction,data,tags)
          VALUES (%s,%s,1,'2026-10-01T00:01Z','synthetic local proof','','{}','{}')""",
                                [identifier, organization])

    def run_helper(self, *, apply=True, connection=None, moment=DAY):
        return MODULE.run_days(connection or self.connection, moment, recorded_native_creator, apply=apply)

    def count_new_tables(self):
        return self.connection.execute("""SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace
          AND relkind IN ('p','r') AND relname ~ '^issue_events_issueevent_2026100[1-7](_h[0-3])?$'""").fetchone()[0]

    def assert_refused_unchanged(self, reason):
        with self.assertRaisesRegex(Exception, reason):
            self.run_helper()
        self.assertEqual(self.preservation(), self.before)

    def test_create_exact_seven_days_repeat_and_all_four_buckets(self):
        plan = self.run_helper(apply=False)
        self.assertEqual(len(plan["planned_new_tables"]), 35)
        self.assertEqual(self.count_new_tables(), 0)
        result = self.run_helper()
        self.assertEqual(len(result["created_tables"]), 35)
        self.assertEqual(self.count_new_tables(), 35)
        for remainder in range(4):
            organization = self.connection.execute("""SELECT n FROM generate_series(1,100) n
              WHERE satisfies_hash_partition('public.issue_events_issueevent_20261001'::regclass,4,%s,n::bigint) LIMIT 1""",
                                                   [remainder]).fetchone()[0]
            self.insert_event(str(UUID(int=UUID(MODULE.uuid_bound(DAY)).int + remainder + 1)), organization)
        buckets = self.connection.execute("SELECT count(DISTINCT tableoid) FROM public.issue_events_issueevent_20261001").fetchone()[0]
        self.assertEqual(buckets, 4)
        repeated = self.run_helper()
        self.assertEqual(repeated["created_tables"], [])
        self.assertEqual(repeated["planned_new_tables"], [])
        self.assertEqual(self.count_new_tables(), 35)
        self.assertEqual(self.preservation(), self.before)

    def test_only_missing_future_day_is_added(self):
        self.run_helper()
        result = self.run_helper(moment=DAY + timedelta(days=1))
        self.assertEqual(result["created_tables"], MODULE.names_for_day(DAY + timedelta(days=7)))
        self.assertEqual(self.preservation(), self.before)

    def test_wrong_bound_on_a_later_day_aborts_before_first_creation(self):
        day = DAY + timedelta(days=3)
        statement = MODULE.expected_creation(day)[0]
        wrong_end = MODULE.uuid_bound(day + timedelta(days=1, milliseconds=-1))
        statement = statement.replace(MODULE.uuid_bound(day + timedelta(days=1)), wrong_end)
        self.connection.execute(statement)
        for child in MODULE.expected_creation(day)[1:]:
            self.connection.execute(child)
        before_count = self.count_new_tables()
        self.assert_refused_unchanged("CF_PARTITION_DAY_BOUND_OR_PARENT_DRIFT")
        self.assertEqual(self.count_new_tables(), before_count)

    def test_partial_day_refused_without_filling_or_deleting_it(self):
        statements = MODULE.expected_creation(DAY)
        for statement in statements[:2]:
            self.connection.execute(statement)
        self.assert_refused_unchanged("CF_PARTITION_PARTIAL_DAY|CF_PARTITION_ROOT_INDEX_DRIFT")
        self.assertEqual(self.count_new_tables(), 2)

    def test_four_wrong_hash_buckets_are_refused(self):
        for statement in MODULE.expected_creation(DAY):
            self.connection.execute(statement.replace("MODULUS 4", "MODULUS 8"))
        self.assert_refused_unchanged("CF_PARTITION_HASH_COVERAGE_DRIFT|CF_PARTITION_ROOT_INDEX_DRIFT")
        self.assertEqual(self.count_new_tables(), 5)

    def test_default_and_namespace_name_collision_refused(self):
        self.connection.execute("CREATE TABLE public.issue_events_issueevent_default PARTITION OF public.issue_events_issueevent DEFAULT")
        self.before = self.preservation()  # The deliberately invalid fixture already exists before helper execution.
        self.assert_refused_unchanged("CF_PARTITION_DEFAULT_FORBIDDEN")
        self.assertEqual(self.count_new_tables(), 0)

    def test_unrelated_existing_target_is_never_adopted(self):
        self.connection.execute("CREATE TABLE public.issue_events_issueevent_20261001_h0(id integer)")
        self.assert_refused_unchanged("CF_PARTITION_PARTIAL_DAY")
        self.assertEqual(self.count_new_tables(), 1)

    def test_parent_lock_refused_promptly(self):
        with self.connect(self.database) as other:
            other.execute("BEGIN")
            other.execute("LOCK TABLE ONLY public.issue_events_issueevent IN ACCESS EXCLUSIVE MODE")
            started = time.monotonic()
            with self.assertRaisesRegex(Exception, "could not obtain lock"):
                self.run_helper()
            self.assertLess(time.monotonic() - started, 2)
            other.execute("ROLLBACK")
        self.assertEqual(self.count_new_tables(), 0)
        self.assertEqual(self.preservation(), self.before)

    def test_advisory_lock_refused_without_creating(self):
        with self.connect(self.database) as other:
            other.execute("BEGIN")
            other.execute("SELECT pg_advisory_xact_lock(%s,%s)", MODULE.ADVISORY_KEY)
            self.assert_refused_unchanged("CF_PARTITION_ADVISORY_BUSY")
            other.execute("ROLLBACK")
        self.assertEqual(self.count_new_tables(), 0)

    def test_referenced_table_lock_timeout_rolls_back_the_new_day(self):
        with self.connect(self.database) as other:
            other.execute("BEGIN")
            other.execute("LOCK TABLE ONLY public.issue_events_issue IN ACCESS EXCLUSIVE MODE")
            started = time.monotonic()
            with self.assertRaisesRegex(Exception, "lock timeout"):
                self.run_helper()
            self.assertLess(time.monotonic() - started, 3)
            other.execute("ROLLBACK")
        self.assertEqual(self.count_new_tables(), 0)
        self.assertEqual(self.preservation(), self.before)

    def test_mid_transaction_database_error_rolls_back_parent_children_and_fks(self):
        class FaultCursor:
            def __init__(self, real): self.real, self.created = real, 0
            def __enter__(self): self.real.__enter__(); return self
            def __exit__(self, *args): return self.real.__exit__(*args)
            def fetchone(self): return self.real.fetchone()
            def fetchall(self): return self.real.fetchall()
            def execute(self, statement, parameters=None):
                result = self.real.execute(statement, parameters)
                if statement.startswith("CREATE TABLE public.issue_events_issueevent_20261001"):
                    self.created += 1
                    if self.created == 2:
                        self.real.execute("SELECT 1/0")  # A real PostgreSQL transaction failure.
                return result
        class FaultConnection:
            autocommit = True
            def cursor(inner): return FaultCursor(self.connection.cursor())
            def close(inner): self.connection.close()
        with self.assertRaisesRegex(Exception, "division by zero"):
            self.run_helper(connection=FaultConnection())
        self.assertEqual(self.count_new_tables(), 0)
        self.assertEqual(self.preservation(), self.before)
        self.assertEqual(self.connection.execute("SELECT count(*) FROM pg_constraint WHERE conrelid='public.issue_events_issueevent'::regclass AND contype='f'").fetchone()[0], 3)

    def test_whole_transaction_deadline_rolls_back_even_when_each_sleep_is_shorter(self):
        class SlowCursor:
            def __init__(self, real): self.real, self.created = real, 0
            def __enter__(self): self.real.__enter__(); return self
            def __exit__(self, *args): return self.real.__exit__(*args)
            def fetchone(self): return self.real.fetchone()
            def fetchall(self): return self.real.fetchall()
            def execute(self, statement, parameters=None):
                result = self.real.execute(statement, parameters)
                if statement.startswith("CREATE TABLE public.issue_events_issueevent_20261001"):
                    self.created += 1
                    if self.created <= 2:
                        self.real.execute("SELECT pg_sleep(3)")
                return result
        class SlowConnection:
            autocommit = True
            def cursor(inner): return SlowCursor(self.connection.cursor())
            def close(inner): self.connection.close()
        started = time.monotonic()
        with self.assertRaisesRegex(Exception, "transaction timeout"):
            self.run_helper(connection=SlowConnection())
        self.assertLess(time.monotonic() - started, 7)
        self.connection.close()
        self.connection = self.connect(self.database)
        self.assertEqual(self.count_new_tables(), 0)
        self.assertEqual(self.preservation(), self.before)


if __name__ == "__main__":
    unittest.main()
