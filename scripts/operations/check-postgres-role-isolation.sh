#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly postgres_container="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"

for name in \
  POSTGRES_USER \
  POSTGRES_DB \
  PRODUCT_RUNTIME_USER \
  MASTRA_DATABASE_NAME \
  MASTRA_RUNTIME_USER \
  LISTMONK_DB_NAME; do
  [[ -n "${!name:-}" ]] || {
    printf 'Load the production .env before running the role preflight.\n' >&2
    exit 1
  }
  [[ "${!name}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
done

# psql output is suppressed because this is a boolean preflight, not an
# inventory. It never prints connection strings, role names, or secrets.
docker exec -i "$postgres_container" sh -ceu '
  exec psql --quiet --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
    --no-password --dbname postgres \
    --set=owner_role="$POSTGRES_USER" \
    --set=product_database="$POSTGRES_DB" \
    --set=product_role="$PRODUCT_RUNTIME_USER" \
    --set=mastra_database="$MASTRA_DATABASE_NAME" \
    --set=mastra_role="$MASTRA_RUNTIME_USER" \
    --set=listmonk_database="$LISTMONK_DB_NAME"
' >/dev/null <<'SQL'
SELECT count(*) = 2 AND bool_and(
  role.rolcanlogin
  AND NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND NOT EXISTS (
    SELECT FROM pg_database database WHERE database.datdba = role.oid
  )
  AND NOT EXISTS (
    SELECT
    FROM pg_auth_members membership
    WHERE membership.member = role.oid OR membership.roleid = role.oid
  )
) AS roles_ok
FROM pg_roles role
WHERE role.rolname IN (:'product_role', :'mastra_role') \gset
\if :roles_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT count(*) = 2 AS owners_ok
FROM pg_database database
JOIN pg_roles owner ON owner.oid = database.datdba
WHERE (database.datname, owner.rolname) IN (
  (:'product_database', :'owner_role'),
  (:'mastra_database', :'owner_role')
) \gset
\if :owners_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT
  has_database_privilege(:'product_role', :'product_database', 'CONNECT')
  AND NOT has_database_privilege(:'product_role', :'mastra_database', 'CONNECT')
  AND NOT has_database_privilege(:'product_role', 'temporal', 'CONNECT')
  AND NOT has_database_privilege(:'product_role', 'temporal_visibility', 'CONNECT')
  AND has_database_privilege(:'mastra_role', :'mastra_database', 'CONNECT')
  AND NOT has_database_privilege(:'mastra_role', :'product_database', 'CONNECT')
  AND NOT has_database_privilege(:'mastra_role', 'temporal', 'CONNECT')
  AND NOT has_database_privilege(:'mastra_role', 'temporal_visibility', 'CONNECT')
  AND CASE WHEN EXISTS (
    SELECT FROM pg_database WHERE datname = :'listmonk_database'
  ) THEN
    NOT has_database_privilege(:'product_role', :'listmonk_database', 'CONNECT')
    AND NOT has_database_privilege(:'mastra_role', :'listmonk_database', 'CONNECT')
  ELSE true END
  AS connections_ok \gset
\if :connections_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

\connect :"product_database"
WITH runtime_roles AS (
  SELECT oid, rolname
  FROM pg_roles
  WHERE rolname IN (:'product_role', :'mastra_role')
), application_classes AS (
  SELECT object.oid, object.relkind, object.relowner, object.relacl, schema.nspname
  FROM pg_class object
  JOIN pg_namespace schema ON schema.oid = object.relnamespace
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    AND object.relkind = ANY (ARRAY['r', 'p', 'v', 'm', 'f', 'S']::"char"[])
), application_functions AS (
  SELECT function.oid, function.proowner
  FROM pg_proc function
  JOIN pg_namespace schema ON schema.oid = function.pronamespace
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
), application_schemas AS (
  SELECT schema.oid, schema.nspowner, schema.nspname, schema.nspacl
  FROM pg_namespace schema
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
)
SELECT
  NOT EXISTS (
    SELECT
    FROM pg_shdepend dependency
    JOIN runtime_roles role ON role.oid = dependency.refobjid
    WHERE dependency.dbid = (
      SELECT oid FROM pg_database WHERE datname = current_database()
    )
      AND dependency.refclassid = 'pg_authid'::regclass
      AND dependency.deptype = 'o'
  )
  AND
  NOT EXISTS (
    SELECT FROM application_classes object
    JOIN runtime_roles role ON role.oid = object.relowner
  )
  AND NOT EXISTS (
    SELECT FROM application_functions function
    JOIN runtime_roles role ON role.oid = function.proowner
  )
  AND NOT EXISTS (
    SELECT FROM application_schemas schema
    JOIN runtime_roles role ON role.oid = schema.nspowner
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN LATERAL aclexplode(COALESCE(
      object.relacl,
      acldefault(
        CASE WHEN object.relkind = 'S' THEN 'S' ELSE 'r' END::"char",
        object.relowner
      )
    )) privilege
    WHERE object.nspname = 'public' AND privilege.grantee = 0
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN runtime_roles role
    WHERE object.relkind = 'S'
      AND NOT (
        object.nspname = 'public'
        AND role.rolname = :'product_role'
      )
      AND (
        has_sequence_privilege(role.oid, object.oid, 'USAGE')
        OR has_sequence_privilege(role.oid, object.oid, 'SELECT')
        OR has_sequence_privilege(role.oid, object.oid, 'UPDATE')
      )
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN runtime_roles role
    WHERE object.relkind <> 'S'
      AND (
        has_table_privilege(role.oid, object.oid, 'TRUNCATE')
        OR has_table_privilege(role.oid, object.oid, 'REFERENCES')
        OR has_table_privilege(role.oid, object.oid, 'TRIGGER')
        OR (
          NOT (
            object.nspname = 'public'
            AND role.rolname = :'product_role'
          )
          AND (
            has_table_privilege(role.oid, object.oid, 'SELECT')
            OR has_table_privilege(role.oid, object.oid, 'INSERT')
            OR has_table_privilege(role.oid, object.oid, 'UPDATE')
            OR has_table_privilege(role.oid, object.oid, 'DELETE')
          )
        )
      )
  )
  AND NOT EXISTS (
    SELECT
    FROM application_functions function
    CROSS JOIN runtime_roles role
    WHERE has_function_privilege(role.oid, function.oid, 'EXECUTE')
  )
  AND NOT EXISTS (
    SELECT
    FROM application_schemas schema
    CROSS JOIN LATERAL aclexplode(COALESCE(
      schema.nspacl,
      acldefault('n'::"char", schema.nspowner)
    )) privilege
    JOIN runtime_roles role ON role.oid = privilege.grantee
    WHERE privilege.privilege_type = 'CREATE'
      OR NOT (
        schema.nspname = 'public'
        AND role.rolname = :'product_role'
        AND privilege.privilege_type = 'USAGE'
      )
  ) AS product_object_boundary_ok \gset
\if :product_object_boundary_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

WITH owner AS (
  SELECT oid FROM pg_roles WHERE rolname = :'owner_role'
), object_types(object_type) AS (
  VALUES ('r'::"char"), ('S'::"char"), ('f'::"char")
)
SELECT
  NOT EXISTS (
    SELECT
    FROM pg_default_acl defaults
    LEFT JOIN pg_namespace schema ON schema.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole = (SELECT oid FROM owner)
      AND (
        defaults.defaclnamespace = 0 OR schema.nspname = 'public'
      )
      AND defaults.defaclobjtype IN ('r', 'S', 'f')
      AND privilege.grantee = 0
  )
  AND NOT EXISTS (
    SELECT
    FROM owner
    CROSS JOIN object_types
    LEFT JOIN pg_default_acl defaults
      ON defaults.defaclrole = owner.oid
     AND defaults.defaclnamespace = 0
     AND defaults.defaclobjtype = object_types.object_type
    CROSS JOIN LATERAL aclexplode(COALESCE(
      defaults.defaclacl,
      acldefault(object_types.object_type, owner.oid)
    )) privilege
    WHERE privilege.grantee = 0
  ) AS product_public_defaults_ok \gset
\if :product_public_defaults_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT
  has_schema_privilege(:'product_role', 'public', 'USAGE')
  AND NOT has_schema_privilege(:'product_role', 'public', 'CREATE')
  AND NOT has_schema_privilege(:'mastra_role', 'public', 'USAGE')
  AND NOT has_schema_privilege(:'mastra_role', 'public', 'CREATE')
  AND NOT EXISTS (
    SELECT
    FROM pg_tables table_object
    WHERE table_object.schemaname = 'public'
      AND table_object.tableowner IN (:'product_role', :'mastra_role')
  )
  AND COALESCE(bool_and(
    has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'SELECT'
    )
    AND has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'INSERT'
    )
    AND has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'UPDATE'
    )
    AND has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'DELETE'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'TRUNCATE'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'REFERENCES'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'TRIGGER'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'SELECT'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'INSERT'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'UPDATE'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'DELETE'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'TRUNCATE'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'REFERENCES'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'TRIGGER'
    )
  ), false) AS product_privileges_ok
FROM pg_tables
WHERE schemaname = 'public' \gset
\if :product_privileges_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT
  NOT EXISTS (
    SELECT
    FROM pg_sequences sequence_object
    WHERE sequence_object.schemaname = 'public'
      AND sequence_object.sequenceowner IN (:'product_role', :'mastra_role')
  )
  AND COALESCE(bool_and(
    has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'USAGE'
    )
    AND has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'SELECT'
    )
    AND has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'UPDATE'
    )
    AND NOT has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'USAGE'
    )
    AND NOT has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'SELECT'
    )
    AND NOT has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'UPDATE'
    )
  ), true) AS product_sequences_ok
FROM pg_sequences
WHERE schemaname = 'public' \gset
\if :product_sequences_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT NOT EXISTS (
  SELECT
  FROM pg_proc routine
  JOIN pg_namespace schema ON schema.oid = routine.pronamespace
  JOIN pg_roles owner ON owner.oid = routine.proowner
  WHERE schema.nspname = 'public'
    AND (
      owner.rolname IN (:'product_role', :'mastra_role')
      OR has_function_privilege(:'product_role', routine.oid, 'EXECUTE')
      OR has_function_privilege(:'mastra_role', routine.oid, 'EXECUTE')
    )
) AS product_functions_ok \gset
\if :product_functions_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

\connect :"mastra_database"
WITH runtime_roles AS (
  SELECT oid, rolname
  FROM pg_roles
  WHERE rolname IN (:'product_role', :'mastra_role')
), application_classes AS (
  SELECT object.oid, object.relkind, object.relowner, object.relacl, schema.nspname
  FROM pg_class object
  JOIN pg_namespace schema ON schema.oid = object.relnamespace
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    AND object.relkind = ANY (ARRAY['r', 'p', 'v', 'm', 'f', 'S']::"char"[])
), application_functions AS (
  SELECT function.oid, function.proowner
  FROM pg_proc function
  JOIN pg_namespace schema ON schema.oid = function.pronamespace
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
), application_schemas AS (
  SELECT schema.oid, schema.nspowner, schema.nspname, schema.nspacl
  FROM pg_namespace schema
  WHERE schema.nspname <> 'information_schema'
    AND schema.nspname NOT LIKE 'pg\_%' ESCAPE '\'
)
SELECT
  NOT EXISTS (
    SELECT
    FROM pg_shdepend dependency
    JOIN runtime_roles role ON role.oid = dependency.refobjid
    WHERE dependency.dbid = (
      SELECT oid FROM pg_database WHERE datname = current_database()
    )
      AND dependency.refclassid = 'pg_authid'::regclass
      AND dependency.deptype = 'o'
  )
  AND
  NOT EXISTS (
    SELECT FROM application_classes object
    JOIN runtime_roles role ON role.oid = object.relowner
  )
  AND NOT EXISTS (
    SELECT FROM application_functions function
    JOIN runtime_roles role ON role.oid = function.proowner
  )
  AND NOT EXISTS (
    SELECT FROM application_schemas schema
    JOIN runtime_roles role ON role.oid = schema.nspowner
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN LATERAL aclexplode(COALESCE(
      object.relacl,
      acldefault(
        CASE WHEN object.relkind = 'S' THEN 'S' ELSE 'r' END::"char",
        object.relowner
      )
    )) privilege
    WHERE object.nspname = 'public' AND privilege.grantee = 0
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN runtime_roles role
    WHERE object.relkind = 'S'
      AND NOT (
        object.nspname = 'public'
        AND role.rolname = :'mastra_role'
      )
      AND (
        has_sequence_privilege(role.oid, object.oid, 'USAGE')
        OR has_sequence_privilege(role.oid, object.oid, 'SELECT')
        OR has_sequence_privilege(role.oid, object.oid, 'UPDATE')
      )
  )
  AND NOT EXISTS (
    SELECT
    FROM application_classes object
    CROSS JOIN runtime_roles role
    WHERE object.relkind <> 'S'
      AND (
        has_table_privilege(role.oid, object.oid, 'TRUNCATE')
        OR has_table_privilege(role.oid, object.oid, 'REFERENCES')
        OR has_table_privilege(role.oid, object.oid, 'TRIGGER')
        OR (
          NOT (
            object.nspname = 'public'
            AND role.rolname = :'mastra_role'
          )
          AND (
            has_table_privilege(role.oid, object.oid, 'SELECT')
            OR has_table_privilege(role.oid, object.oid, 'INSERT')
            OR has_table_privilege(role.oid, object.oid, 'UPDATE')
            OR has_table_privilege(role.oid, object.oid, 'DELETE')
          )
        )
      )
  )
  AND NOT EXISTS (
    SELECT
    FROM application_functions function
    CROSS JOIN runtime_roles role
    WHERE has_function_privilege(role.oid, function.oid, 'EXECUTE')
  )
  AND NOT EXISTS (
    SELECT
    FROM application_schemas schema
    CROSS JOIN LATERAL aclexplode(COALESCE(
      schema.nspacl,
      acldefault('n'::"char", schema.nspowner)
    )) privilege
    JOIN runtime_roles role ON role.oid = privilege.grantee
    WHERE privilege.privilege_type = 'CREATE'
      OR NOT (
        schema.nspname = 'public'
        AND role.rolname = :'mastra_role'
        AND privilege.privilege_type = 'USAGE'
      )
  ) AS mastra_object_boundary_ok \gset
\if :mastra_object_boundary_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

WITH owner AS (
  SELECT oid FROM pg_roles WHERE rolname = :'owner_role'
), object_types(object_type) AS (
  VALUES ('r'::"char"), ('S'::"char"), ('f'::"char")
)
SELECT
  NOT EXISTS (
    SELECT
    FROM pg_default_acl defaults
    LEFT JOIN pg_namespace schema ON schema.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole = (SELECT oid FROM owner)
      AND (
        defaults.defaclnamespace = 0 OR schema.nspname = 'public'
      )
      AND defaults.defaclobjtype IN ('r', 'S', 'f')
      AND privilege.grantee = 0
  )
  AND NOT EXISTS (
    SELECT
    FROM owner
    CROSS JOIN object_types
    LEFT JOIN pg_default_acl defaults
      ON defaults.defaclrole = owner.oid
     AND defaults.defaclnamespace = 0
     AND defaults.defaclobjtype = object_types.object_type
    CROSS JOIN LATERAL aclexplode(COALESCE(
      defaults.defaclacl,
      acldefault(object_types.object_type, owner.oid)
    )) privilege
    WHERE privilege.grantee = 0
  ) AS mastra_public_defaults_ok \gset
\if :mastra_public_defaults_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT
  has_schema_privilege(:'mastra_role', 'public', 'USAGE')
  AND NOT has_schema_privilege(:'mastra_role', 'public', 'CREATE')
  AND NOT has_schema_privilege(:'product_role', 'public', 'USAGE')
  AND NOT has_schema_privilege(:'product_role', 'public', 'CREATE')
  AND NOT EXISTS (
    SELECT
    FROM pg_tables table_object
    WHERE table_object.schemaname = 'public'
      AND table_object.tableowner IN (:'product_role', :'mastra_role')
  )
  AND COALESCE(bool_and(
    has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'SELECT'
    )
    AND has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'INSERT'
    )
    AND has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'UPDATE'
    )
    AND has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'DELETE'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'TRUNCATE'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'REFERENCES'
    )
    AND NOT has_table_privilege(
      :'mastra_role', format('%I.%I', schemaname, tablename), 'TRIGGER'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'SELECT'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'INSERT'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'UPDATE'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'DELETE'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'TRUNCATE'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'REFERENCES'
    )
    AND NOT has_table_privilege(
      :'product_role', format('%I.%I', schemaname, tablename), 'TRIGGER'
    )
  ), false) AS mastra_privileges_ok
FROM pg_tables
WHERE schemaname = 'public' \gset
\if :mastra_privileges_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT
  NOT EXISTS (
    SELECT
    FROM pg_sequences sequence_object
    WHERE sequence_object.schemaname = 'public'
      AND sequence_object.sequenceowner IN (:'product_role', :'mastra_role')
  )
  AND COALESCE(bool_and(
    has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'USAGE'
    )
    AND has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'SELECT'
    )
    AND has_sequence_privilege(
      :'mastra_role', format('%I.%I', schemaname, sequencename), 'UPDATE'
    )
    AND NOT has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'USAGE'
    )
    AND NOT has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'SELECT'
    )
    AND NOT has_sequence_privilege(
      :'product_role', format('%I.%I', schemaname, sequencename), 'UPDATE'
    )
  ), true) AS mastra_sequences_ok
FROM pg_sequences
WHERE schemaname = 'public' \gset
\if :mastra_sequences_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif

SELECT NOT EXISTS (
  SELECT
  FROM pg_proc routine
  JOIN pg_namespace schema ON schema.oid = routine.pronamespace
  JOIN pg_roles owner ON owner.oid = routine.proowner
  WHERE schema.nspname = 'public'
    AND (
      owner.rolname IN (:'product_role', :'mastra_role')
      OR has_function_privilege(:'product_role', routine.oid, 'EXECUTE')
      OR has_function_privilege(:'mastra_role', routine.oid, 'EXECUTE')
    )
) AS mastra_functions_ok \gset
\if :mastra_functions_ok
\else
  SELECT 'role isolation preflight failed'::integer;
\endif
SQL

printf 'PostgreSQL role isolation preflight passed.\n'
