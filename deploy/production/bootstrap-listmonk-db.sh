#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly postgres_container="${CF_POSTGRES_CONTAINER:-cf-next-postgres}"

: "${LISTMONK_DB_USER:?Load the production .env before running this owner-only bootstrap.}"
: "${LISTMONK_DB_PASSWORD:?Load the production .env before running this owner-only bootstrap.}"
: "${LISTMONK_DB_NAME:?Load the production .env before running this owner-only bootstrap.}"
: "${PRODUCT_RUNTIME_USER:?Load the production .env before running this owner-only bootstrap.}"
: "${MASTRA_RUNTIME_USER:?Load the production .env before running this owner-only bootstrap.}"

for identifier in \
  "$LISTMONK_DB_USER" \
  "$LISTMONK_DB_NAME" \
  "$PRODUCT_RUNTIME_USER" \
  "$MASTRA_RUNTIME_USER"; do
  [[ "$identifier" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
    printf 'Unsafe PostgreSQL identifier refused.\n' >&2
    exit 1
  }
done

# The psql variables are populated from the container environment set by
# Compose. No secret is interpolated into this script, stdin, or host argv.
docker exec -i "$postgres_container" sh -ceu '
  exec psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --no-password \
    --dbname postgres \
    --set=listmonk_role="$LISTMONK_DB_USER" \
    --set=listmonk_password="$LISTMONK_DB_PASSWORD" \
    --set=listmonk_database="$LISTMONK_DB_NAME" \
    --set=product_role="$PRODUCT_RUNTIME_USER" \
    --set=mastra_role="$MASTRA_RUNTIME_USER"
' <<'SQL'
SELECT COALESCE(bool_and(
  role.rolcanlogin
  AND NOT role.rolsuper
  AND NOT role.rolcreatedb
  AND NOT role.rolcreaterole
  AND NOT role.rolreplication
  AND NOT role.rolbypassrls
  AND NOT EXISTS (
    SELECT FROM pg_auth_members membership WHERE membership.member = role.oid
  )
), true) AS existing_listmonk_role_safe
FROM pg_roles role
WHERE role.rolname = :'listmonk_role' \gset
\if :existing_listmonk_role_safe
\else
  \echo 'Existing Listmonk role has unsafe privileges or belongs to another role.'
  SELECT 'Listmonk role guard failed'::integer;
\endif

SELECT NOT EXISTS (
  SELECT
  FROM pg_database database
  JOIN pg_roles owner ON owner.oid = database.datdba
  WHERE database.datname = :'listmonk_database'
    AND owner.rolname <> :'listmonk_role'
) AS existing_listmonk_database_safe \gset
\if :existing_listmonk_database_safe
\else
  \echo 'Existing Listmonk database has an unexpected owner.'
  SELECT 'Listmonk database guard failed'::integer;
\endif

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'listmonk_role',
  :'listmonk_password'
)
WHERE NOT EXISTS (
  SELECT FROM pg_roles WHERE rolname = :'listmonk_role'
) \gexec

SELECT EXISTS (
  SELECT FROM pg_roles role
  WHERE role.rolname = :'listmonk_role'
    AND role.rolcanlogin
    AND NOT role.rolsuper
    AND NOT role.rolcreatedb
    AND NOT role.rolcreaterole
    AND NOT role.rolreplication
    AND NOT role.rolbypassrls
    AND NOT EXISTS (
      SELECT FROM pg_auth_members membership
      WHERE membership.member = role.oid
    )
) AS listmonk_role_ok \gset
\if :listmonk_role_ok
\else
  \echo 'Existing Listmonk role is missing login, has unsafe privileges, or belongs to another role.'
  SELECT 'Listmonk role creation guard failed'::integer;
\endif

SELECT format(
  'CREATE DATABASE %I OWNER %I',
  :'listmonk_database',
  :'listmonk_role'
)
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = :'listmonk_database'
) \gexec

SELECT EXISTS (
  SELECT
  FROM pg_database database
  JOIN pg_roles owner ON owner.oid = database.datdba
  WHERE database.datname = :'listmonk_database'
    AND owner.rolname = :'listmonk_role'
) AS listmonk_database_ok \gset
\if :listmonk_database_ok
\else
  \echo 'Existing Listmonk database has an unexpected owner.'
  SELECT 'Listmonk database creation guard failed'::integer;
\endif

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'listmonk_database') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM %I', :'listmonk_database', role_name)
FROM (VALUES (:'product_role'), (:'mastra_role')) AS denied(role_name) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'listmonk_database', :'listmonk_role') \gexec
SQL

printf 'Listmonk PostgreSQL role and database are ready.\n'
