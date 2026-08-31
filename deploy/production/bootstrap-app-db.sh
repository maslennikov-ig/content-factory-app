#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly postgres_container="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"

: "${PRODUCT_RUNTIME_USER:?Load the production .env before running this owner-only bootstrap.}"
: "${PRODUCT_RUNTIME_PASSWORD:?Load the production .env before running this owner-only bootstrap.}"
: "${MASTRA_RUNTIME_USER:?Load the production .env before running this owner-only bootstrap.}"
: "${MASTRA_RUNTIME_PASSWORD:?Load the production .env before running this owner-only bootstrap.}"
: "${MASTRA_DATABASE_NAME:?Load the production .env before running this owner-only bootstrap.}"
: "${LISTMONK_DB_NAME:?Load the production .env before running this owner-only bootstrap.}"

for identifier in \
  "$PRODUCT_RUNTIME_USER" \
  "$MASTRA_RUNTIME_USER" \
  "$MASTRA_DATABASE_NAME" \
  "$LISTMONK_DB_NAME"; do
  [[ "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
done

[[ "$PRODUCT_RUNTIME_USER" != "$MASTRA_RUNTIME_USER" ]] || {
  printf 'Product and Mastra runtime roles must be different.\n' >&2
  exit 1
}

# Values are read inside the container. Passwords never enter host argv or SQL
# stdin and therefore cannot leak through process inspection or shell tracing.
docker exec -i "$postgres_container" sh -ceu '
  exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname postgres \
    --set=owner_role="$POSTGRES_USER" \
    --set=product_database="$POSTGRES_DB" \
    --set=product_role="$PRODUCT_RUNTIME_USER" \
    --set=product_password="$PRODUCT_RUNTIME_PASSWORD" \
    --set=mastra_database="$MASTRA_DATABASE_NAME" \
    --set=mastra_role="$MASTRA_RUNTIME_USER" \
    --set=mastra_password="$MASTRA_RUNTIME_PASSWORD" \
    --set=listmonk_database="$LISTMONK_DB_NAME"
' <<'SQL'
-- These checks must remain before every CREATE/ALTER/GRANT/REVOKE. In
-- particular, a stale runtime name must never rotate the owner password.
SELECT
  :'product_role' <> :'owner_role'
  AND :'mastra_role' <> :'owner_role'
  AND :'product_role' <> :'mastra_role'
  AND COALESCE(bool_and(
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
  ), true) AS existing_roles_safe
FROM pg_roles role
WHERE role.rolname IN (:'product_role', :'mastra_role') \gset
\if :existing_roles_safe
\else
  \echo 'Existing application role is the owner, privileged, or belongs to another role.'
  SELECT 'role isolation guard failed'::integer;
\endif

SELECT
  EXISTS (
    SELECT
    FROM pg_database database
    JOIN pg_roles owner ON owner.oid = database.datdba
    WHERE database.datname = :'product_database'
      AND owner.rolname = :'owner_role'
  )
  AND NOT EXISTS (
    SELECT
    FROM pg_database database
    JOIN pg_roles owner ON owner.oid = database.datdba
    WHERE database.datname = :'mastra_database'
      AND owner.rolname <> :'owner_role'
  ) AS existing_database_owners_safe \gset
\if :existing_database_owners_safe
\else
  \echo 'Product or existing Mastra database has an unexpected owner.'
  SELECT 'role isolation guard failed'::integer;
\endif

SELECT count(*) = 3 AS prerequisite_databases_ok
FROM pg_database
WHERE datname IN (
  :'product_database',
  'temporal',
  'temporal_visibility'
) \gset
\if :prerequisite_databases_ok
\else
  \echo 'Product and both Temporal databases must exist before role isolation.'
  SELECT 'role isolation guard failed'::integer;
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
    CROSS JOIN runtime_roles role
    WHERE object.relkind = 'S'
      AND (
        (
          object.nspname <> 'public'
          AND (
            has_sequence_privilege(role.oid, object.oid, 'USAGE')
            OR has_sequence_privilege(role.oid, object.oid, 'SELECT')
            OR has_sequence_privilege(role.oid, object.oid, 'UPDATE')
          )
        )
        OR (
          object.nspname = 'public'
          AND role.rolname <> :'product_role'
          AND EXISTS (
            SELECT
            FROM aclexplode(COALESCE(
              object.relacl,
              acldefault('S'::"char", object.relowner)
            )) privilege
            WHERE privilege.grantee = role.oid
          )
        )
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
          object.nspname <> 'public'
          AND (
            has_table_privilege(role.oid, object.oid, 'SELECT')
            OR has_table_privilege(role.oid, object.oid, 'INSERT')
            OR has_table_privilege(role.oid, object.oid, 'UPDATE')
            OR has_table_privilege(role.oid, object.oid, 'DELETE')
          )
        )
        OR (
          object.nspname = 'public'
          AND role.rolname <> :'product_role'
          AND EXISTS (
            SELECT
            FROM aclexplode(COALESCE(
              object.relacl,
              acldefault('r'::"char", object.relowner)
            )) privilege
            WHERE privilege.grantee = role.oid
              AND privilege.privilege_type IN (
                'SELECT', 'INSERT', 'UPDATE', 'DELETE'
              )
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
  ) AS product_object_boundary_safe \gset
\if :product_object_boundary_safe
\else
  \echo 'A runtime role owns an object or has excess privileges in the product database.'
  SELECT 'role isolation guard failed'::integer;
\endif

\connect postgres
SELECT EXISTS (
  SELECT FROM pg_database WHERE datname = :'mastra_database'
) AS mastra_database_exists \gset
\if :mastra_database_exists
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
      CROSS JOIN runtime_roles role
      WHERE object.relkind = 'S'
        AND (
          (
            object.nspname <> 'public'
            AND (
              has_sequence_privilege(role.oid, object.oid, 'USAGE')
              OR has_sequence_privilege(role.oid, object.oid, 'SELECT')
              OR has_sequence_privilege(role.oid, object.oid, 'UPDATE')
            )
          )
          OR (
            object.nspname = 'public'
            AND role.rolname <> :'mastra_role'
            AND EXISTS (
              SELECT
              FROM aclexplode(COALESCE(
                object.relacl,
                acldefault('S'::"char", object.relowner)
              )) privilege
              WHERE privilege.grantee = role.oid
            )
          )
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
            object.nspname <> 'public'
            AND (
              has_table_privilege(role.oid, object.oid, 'SELECT')
              OR has_table_privilege(role.oid, object.oid, 'INSERT')
              OR has_table_privilege(role.oid, object.oid, 'UPDATE')
              OR has_table_privilege(role.oid, object.oid, 'DELETE')
            )
          )
          OR (
            object.nspname = 'public'
            AND role.rolname <> :'mastra_role'
            AND EXISTS (
              SELECT
              FROM aclexplode(COALESCE(
                object.relacl,
                acldefault('r'::"char", object.relowner)
              )) privilege
              WHERE privilege.grantee = role.oid
                AND privilege.privilege_type IN (
                  'SELECT', 'INSERT', 'UPDATE', 'DELETE'
                )
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
    ) AS mastra_object_boundary_safe \gset
  \if :mastra_object_boundary_safe
  \else
    \echo 'A runtime role owns an object or has excess privileges in the Mastra database.'
    SELECT 'role isolation guard failed'::integer;
  \endif
  \connect postgres
\endif

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
  role_name
)
FROM (VALUES (:'product_role'), (:'mastra_role')) AS wanted(role_name)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) \gexec

SELECT count(*) = 2 AND bool_and(
  role.rolcanlogin
  AND NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND NOT EXISTS (
    SELECT
    FROM pg_auth_members membership
    WHERE membership.member = role.oid OR membership.roleid = role.oid
  )
) AS runtime_roles_ok
FROM pg_roles role
WHERE role.rolname IN (:'product_role', :'mastra_role') \gset
\if :runtime_roles_ok
\else
  \echo 'Application role creation did not preserve the restricted attributes.'
  SELECT 'role isolation guard failed'::integer;
\endif

SELECT format('ALTER ROLE %I PASSWORD %L', role_name, role_password)
FROM (VALUES
  (:'product_role', :'product_password'),
  (:'mastra_role', :'mastra_password')
) AS wanted(role_name, role_password) \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'mastra_database', :'owner_role')
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = :'mastra_database'
) \gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', database_name)
FROM (VALUES
  (:'product_database'),
  (:'mastra_database'),
  ('temporal'),
  ('temporal_visibility'),
  (:'listmonk_database')
) AS databases(database_name)
WHERE EXISTS (SELECT FROM pg_database WHERE datname = database_name) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'product_database', :'product_role') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'mastra_database', :'mastra_role') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM %I', database_name, role_name)
FROM (VALUES
  (:'product_database', :'mastra_role'),
  (:'mastra_database', :'product_role'),
  ('temporal', :'product_role'),
  ('temporal', :'mastra_role'),
  ('temporal_visibility', :'product_role'),
  ('temporal_visibility', :'mastra_role'),
  (:'listmonk_database', :'product_role'),
  (:'listmonk_database', :'mastra_role')
) AS denied(database_name, role_name)
WHERE EXISTS (SELECT FROM pg_database WHERE datname = database_name) \gexec

\connect :"product_database"
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON SCHEMA public FROM %I', :'product_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'product_role') \gexec
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
  :'product_role'
) \gexec
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'product_role'
) \gexec
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
SELECT format(
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'owner_role',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'owner_role',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'owner_role',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'owner_role',
  :'product_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
  :'owner_role',
  :'product_role'
) \gexec

\connect :"mastra_database"
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON SCHEMA public FROM %I', :'mastra_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'mastra_role') \gexec
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
  :'mastra_role'
) \gexec
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  :'mastra_role'
) \gexec
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
SELECT format(
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
  :'owner_role'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',
  :'owner_role',
  :'mastra_role'
) \gexec
SQL

printf 'Product and Mastra PostgreSQL runtime roles are ready.\n'
