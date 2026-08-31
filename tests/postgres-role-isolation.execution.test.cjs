const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bootstrap = path.join(root, 'deploy/production/bootstrap-app-db.sh');
const preflight = path.join(
  root,
  'scripts/operations/check-postgres-role-isolation.sh'
);
const container = `cf-role-safety-proof-${process.pid}`;
const objectContainer = `cf-role-object-proof-${process.pid}`;
const membershipContainer = `cf-role-membership-proof-${process.pid}`;

const docker = (...args) =>
  spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });

const dockerAvailable =
  docker('info', '--format', '{{.ServerVersion}}').status === 0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

describeWithDocker('PostgreSQL role bootstrap mutation ordering', () => {
  jest.setTimeout(60_000);

  afterEach(() => {
    for (const disposable of [
      container,
      objectContainer,
      membershipContainer,
    ]) {
      docker('stop', disposable);
      docker('rm', disposable);
    }
  });

  test('rejects owned objects and excess grants before rotating a runtime password', () => {
    expect(docker('inspect', objectContainer).status).not.toBe(0);
    const started = docker(
      'run',
      '--detach',
      '--name',
      objectContainer,
      '--env',
      'POSTGRES_USER=cf_owner',
      '--env',
      'POSTGRES_PASSWORD=owner-password',
      '--env',
      'POSTGRES_DB=cf_product',
      '--env',
      'PRODUCT_RUNTIME_USER=cf_runtime',
      '--env',
      'PRODUCT_RUNTIME_PASSWORD=runtime-password-after',
      '--env',
      'MASTRA_DATABASE_NAME=cf_mastra',
      '--env',
      'MASTRA_RUNTIME_USER=cf_mastra_runtime',
      '--env',
      'MASTRA_RUNTIME_PASSWORD=mastra-password-after',
      '--env',
      'LISTMONK_DB_NAME=cf_listmonk',
      'postgres:17-alpine'
    );
    expect(started.status).toBe(0);

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = docker('logs', objectContainer);
      const initialized = `${logs.stdout}${logs.stderr}`.includes(
        'PostgreSQL init process complete; ready for start up.'
      );
      if (
        initialized &&
        docker(
          'exec',
          objectContainer,
          'psql',
          '-U',
          'cf_owner',
          '-d',
          'postgres',
          '-c',
          'SELECT 1'
        ).status === 0
      ) {
        ready = true;
        break;
      }
      spawnSync('sleep', ['0.2']);
    }
    expect(ready).toBe(true);

    const psql = (database, sql) =>
      docker(
        'exec',
        objectContainer,
        'psql',
        '--set',
        'ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '-U',
        'cf_owner',
        '-d',
        database,
        '-c',
        sql
      );

    expect(
      psql(
        'postgres',
        `CREATE ROLE cf_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
           NOREPLICATION NOBYPASSRLS PASSWORD 'runtime-password-before';
         CREATE ROLE cf_mastra_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
           NOREPLICATION NOBYPASSRLS PASSWORD 'mastra-password-before';`
      ).status
    ).toBe(0);
    expect(
      docker('exec', objectContainer, 'createdb', '-U', 'cf_owner', 'temporal')
        .status
    ).toBe(0);
    expect(
      docker(
        'exec',
        objectContainer,
        'createdb',
        '-U',
        'cf_owner',
        'temporal_visibility'
      ).status
    ).toBe(0);
    expect(
      docker(
        'exec',
        objectContainer,
        'createdb',
        '-U',
        'cf_owner',
        '-O',
        'cf_owner',
        'cf_mastra'
      ).status
    ).toBe(0);
    expect(
      psql('cf_product', 'CREATE TABLE owner_table (id bigint primary key);')
        .status
    ).toBe(0);
    expect(
      psql(
        'cf_mastra',
        'CREATE TABLE mastra_owner_table (id bigint primary key);'
      ).status
    ).toBe(0);

    const productPasswordBefore = psql(
      'postgres',
      "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_runtime';"
    ).stdout.trim();
    const mastraPasswordBefore = psql(
      'postgres',
      "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_mastra_runtime';"
    ).stdout.trim();
    const runtimeEnv = {
      ...process.env,
      CF_POSTGRES_CONTAINER: objectContainer,
      POSTGRES_USER: 'cf_owner',
      POSTGRES_DB: 'cf_product',
      PRODUCT_RUNTIME_USER: 'cf_runtime',
      PRODUCT_RUNTIME_PASSWORD: 'runtime-password-after',
      MASTRA_DATABASE_NAME: 'cf_mastra',
      MASTRA_RUNTIME_USER: 'cf_mastra_runtime',
      MASTRA_RUNTIME_PASSWORD: 'mastra-password-after',
      LISTMONK_DB_NAME: 'cf_listmonk',
    };
    const contaminationCases = [
      {
        name: 'product table ownership',
        database: 'cf_product',
        setup:
          'CREATE TABLE runtime_table (id bigint); ALTER TABLE runtime_table OWNER TO cf_runtime;',
        cleanup: 'DROP TABLE runtime_table;',
      },
      {
        name: 'product sequence ownership',
        database: 'cf_product',
        setup:
          'CREATE SEQUENCE runtime_sequence; ALTER SEQUENCE runtime_sequence OWNER TO cf_runtime;',
        cleanup: 'DROP SEQUENCE runtime_sequence;',
      },
      {
        name: 'product function ownership',
        database: 'cf_product',
        setup: `CREATE FUNCTION runtime_function() RETURNS integer
                  LANGUAGE SQL IMMUTABLE AS 'SELECT 1';
                REVOKE EXECUTE ON FUNCTION runtime_function() FROM PUBLIC;
                ALTER FUNCTION runtime_function() OWNER TO cf_runtime;`,
        cleanup: 'DROP FUNCTION runtime_function();',
      },
      {
        name: 'product enum ownership',
        database: 'cf_product',
        setup: `CREATE TYPE runtime_enum AS ENUM ('unsafe');
                ALTER TYPE runtime_enum OWNER TO cf_runtime;`,
        cleanup: 'DROP TYPE runtime_enum;',
      },
      {
        name: 'product extended statistics ownership',
        database: 'cf_product',
        setup: `CREATE TABLE statistics_source (left_value integer, right_value integer);
                CREATE STATISTICS runtime_statistics
                  ON left_value, right_value FROM statistics_source;
                ALTER STATISTICS runtime_statistics OWNER TO cf_runtime;`,
        cleanup:
          'DROP STATISTICS runtime_statistics; DROP TABLE statistics_source;',
      },
      ...['TRUNCATE', 'REFERENCES', 'TRIGGER'].map((privilege) => ({
        name: `product ${privilege} privilege`,
        database: 'cf_product',
        setup: `GRANT ${privilege} ON owner_table TO cf_runtime;`,
        cleanup: `REVOKE ${privilege} ON owner_table FROM cf_runtime;`,
      })),
      {
        name: 'PUBLIC destructive table privilege',
        database: 'cf_product',
        setup: 'GRANT TRUNCATE ON owner_table TO PUBLIC;',
        cleanup: 'REVOKE TRUNCATE ON owner_table FROM PUBLIC;',
      },
      {
        name: 'non-public DML privilege',
        database: 'cf_product',
        setup: `CREATE SCHEMA private;
                CREATE TABLE private.rogue_table (id bigint);
                GRANT USAGE ON SCHEMA private TO cf_runtime;
                GRANT SELECT ON private.rogue_table TO cf_runtime;`,
        cleanup: 'DROP SCHEMA private CASCADE;',
      },
      {
        name: 'Mastra table ownership',
        database: 'cf_mastra',
        setup:
          'CREATE TABLE runtime_table (id bigint); ALTER TABLE runtime_table OWNER TO cf_mastra_runtime;',
        cleanup: 'DROP TABLE runtime_table;',
      },
    ];

    for (const contamination of contaminationCases) {
      expect(psql(contamination.database, contamination.setup).status).toBe(0);
      const result = spawnSync(bootstrap, [], {
        cwd: root,
        encoding: 'utf8',
        env: runtimeEnv,
      });

      expect({ case: contamination.name, status: result.status }).toEqual({
        case: contamination.name,
        status: 3,
      });
      expect(result.stdout).toContain(
        'owns an object or has excess privileges'
      );
      expect(
        psql(
          'postgres',
          "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_runtime';"
        ).stdout.trim()
      ).toBe(productPasswordBefore);
      expect(
        psql(
          'postgres',
          "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_mastra_runtime';"
        ).stdout.trim()
      ).toBe(mastraPasswordBefore);
      expect(
        psql(
          'cf_product',
          "SELECT has_table_privilege('cf_runtime', 'public.owner_table', 'SELECT');"
        ).stdout.trim()
      ).toBe('f');
      expect(psql(contamination.database, contamination.cleanup).status).toBe(
        0
      );
    }

    expect(
      psql(
        'cf_product',
        `CREATE SEQUENCE owner_sequence;
         GRANT SELECT ON owner_table TO PUBLIC;
         GRANT USAGE ON owner_sequence TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
           GRANT SELECT ON TABLES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
           GRANT USAGE ON SEQUENCES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT SELECT ON TABLES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT USAGE ON SEQUENCES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT EXECUTE ON FUNCTIONS TO PUBLIC;`
      ).status
    ).toBe(0);
    expect(
      psql(
        'cf_mastra',
        `CREATE SEQUENCE mastra_owner_sequence;
         GRANT SELECT ON mastra_owner_table TO PUBLIC;
         GRANT USAGE ON mastra_owner_sequence TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
           GRANT SELECT ON TABLES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
           GRANT USAGE ON SEQUENCES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT SELECT ON TABLES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT USAGE ON SEQUENCES TO PUBLIC;
         ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
           GRANT EXECUTE ON FUNCTIONS TO PUBLIC;`
      ).status
    ).toBe(0);

    const successfulBootstrap = spawnSync(bootstrap, [], {
      cwd: root,
      encoding: 'utf8',
      env: runtimeEnv,
    });
    expect(successfulBootstrap.stderr).toBe('');
    expect(successfulBootstrap.status).toBe(0);

    for (const database of ['cf_product', 'cf_mastra']) {
      expect(
        psql(
          database,
          `SELECT count(*)
           FROM pg_class object
           JOIN pg_namespace schema ON schema.oid = object.relnamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(
             object.relacl,
             acldefault(
               CASE WHEN object.relkind = 'S' THEN 'S' ELSE 'r' END::"char",
               object.relowner
             )
           )) privilege
           WHERE schema.nspname = 'public' AND privilege.grantee = 0;`
        ).stdout.trim()
      ).toBe('0');
      expect(
        psql(
          database,
          `SELECT count(*)
           FROM pg_default_acl defaults
           JOIN pg_namespace schema ON schema.oid = defaults.defaclnamespace
           CROSS JOIN LATERAL aclexplode(defaults.defaclacl) privilege
           WHERE schema.nspname = 'public'
             AND defaults.defaclobjtype IN ('r', 'S')
             AND privilege.grantee = 0;`
        ).stdout.trim()
      ).toBe('0');
      expect(
        psql(
          database,
          `WITH owner AS (
             SELECT oid FROM pg_roles WHERE rolname = 'cf_owner'
           ), object_types(object_type) AS (
             VALUES ('r'::"char"), ('S'::"char"), ('f'::"char")
           )
           SELECT count(*)
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
           WHERE privilege.grantee = 0;`
        ).stdout.trim()
      ).toBe('0');
    }

    expect(
      psql(
        'cf_product',
        `CREATE TABLE future_table (id bigint);
         CREATE SEQUENCE future_sequence;
         CREATE FUNCTION future_function() RETURNS integer
           LANGUAGE SQL IMMUTABLE AS 'SELECT 1';`
      ).status
    ).toBe(0);
    expect(
      psql(
        'cf_mastra',
        `CREATE TABLE future_table (id bigint);
         CREATE SEQUENCE future_sequence;
         CREATE FUNCTION future_function() RETURNS integer
           LANGUAGE SQL IMMUTABLE AS 'SELECT 1';`
      ).status
    ).toBe(0);

    for (const database of ['cf_product', 'cf_mastra']) {
      expect(
        psql(
          database,
          `SELECT count(*)
           FROM pg_proc routine
           JOIN pg_namespace schema ON schema.oid = routine.pronamespace
           CROSS JOIN LATERAL aclexplode(COALESCE(
             routine.proacl,
             acldefault('f'::"char", routine.proowner)
           )) privilege
           WHERE schema.nspname = 'public'
             AND routine.proname = 'future_function'
             AND privilege.grantee = 0;`
        ).stdout.trim()
      ).toBe('0');
    }

    const successfulPreflight = spawnSync(preflight, [], {
      cwd: root,
      encoding: 'utf8',
      env: runtimeEnv,
    });
    expect(successfulPreflight.stderr).toBe('');
    expect(successfulPreflight.status).toBe(0);
    expect(successfulPreflight.stdout).toContain(
      'PostgreSQL role isolation preflight passed.'
    );

    const publicAclContaminations = [
      {
        name: 'current PUBLIC table ACL',
        setup: 'GRANT SELECT ON owner_table TO PUBLIC;',
        cleanup: 'REVOKE SELECT ON owner_table FROM PUBLIC;',
      },
      {
        name: 'future PUBLIC table ACL',
        setup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
                  GRANT SELECT ON TABLES TO PUBLIC;`,
        cleanup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
                    REVOKE SELECT ON TABLES FROM PUBLIC;`,
      },
      {
        name: 'future PUBLIC sequence ACL',
        setup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
                  GRANT USAGE ON SEQUENCES TO PUBLIC;`,
        cleanup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner IN SCHEMA public
                    REVOKE USAGE ON SEQUENCES FROM PUBLIC;`,
      },
      {
        name: 'global future PUBLIC table ACL',
        setup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                  GRANT SELECT ON TABLES TO PUBLIC;`,
        cleanup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                    REVOKE SELECT ON TABLES FROM PUBLIC;`,
      },
      {
        name: 'global future PUBLIC sequence ACL',
        setup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                  GRANT USAGE ON SEQUENCES TO PUBLIC;`,
        cleanup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                    REVOKE USAGE ON SEQUENCES FROM PUBLIC;`,
      },
      {
        name: 'global future PUBLIC function ACL',
        setup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;`,
        cleanup: `ALTER DEFAULT PRIVILEGES FOR ROLE cf_owner
                    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
      },
    ];
    for (const contamination of publicAclContaminations) {
      expect(psql('cf_product', contamination.setup).status).toBe(0);
      const rejectedPreflight = spawnSync(preflight, [], {
        cwd: root,
        encoding: 'utf8',
        env: runtimeEnv,
      });
      expect({
        case: contamination.name,
        status: rejectedPreflight.status,
      }).toEqual({ case: contamination.name, status: 3 });
      expect(psql('cf_product', contamination.cleanup).status).toBe(0);
    }

    for (const contamination of contaminationCases) {
      expect(psql(contamination.database, contamination.setup).status).toBe(0);
      const rejectedPreflight = spawnSync(preflight, [], {
        cwd: root,
        encoding: 'utf8',
        env: runtimeEnv,
      });
      expect({
        case: contamination.name,
        status: rejectedPreflight.status,
      }).toEqual({
        case: contamination.name,
        status: 3,
      });
      expect(psql(contamination.database, contamination.cleanup).status).toBe(
        0
      );
    }

    const restoredPreflight = spawnSync(preflight, [], {
      cwd: root,
      encoding: 'utf8',
      env: runtimeEnv,
    });
    expect(restoredPreflight.stderr).toBe('');
    expect(restoredPreflight.status).toBe(0);
  });

  test('rejects an owner/privileged runtime role before changing any role or database', () => {
    expect(docker('inspect', container).status).not.toBe(0);
    const started = docker(
      'run',
      '--detach',
      '--name',
      container,
      '--env',
      'POSTGRES_USER=cf_owner',
      '--env',
      'POSTGRES_PASSWORD=owner-password-before',
      '--env',
      'POSTGRES_DB=cf_product',
      '--env',
      'PRODUCT_RUNTIME_USER=cf_owner',
      '--env',
      'PRODUCT_RUNTIME_PASSWORD=owner-password-after',
      '--env',
      'MASTRA_DATABASE_NAME=cf_mastra',
      '--env',
      'MASTRA_RUNTIME_USER=cf_mastra_runtime',
      '--env',
      'MASTRA_RUNTIME_PASSWORD=mastra-password-after',
      '--env',
      'LISTMONK_DB_NAME=cf_listmonk',
      'postgres:17-alpine'
    );
    expect(started.status).toBe(0);

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = docker('logs', container);
      const initialized = `${logs.stdout}${logs.stderr}`.includes(
        'PostgreSQL init process complete; ready for start up.'
      );
      if (
        initialized &&
        docker(
          'exec',
          container,
          'psql',
          '-U',
          'cf_owner',
          '-d',
          'postgres',
          '-c',
          'SELECT 1'
        ).status === 0
      ) {
        ready = true;
        break;
      }
      spawnSync('sleep', ['0.2']);
    }
    expect(ready).toBe(true);

    const query = (sql) => {
      const result = docker(
        'exec',
        container,
        'psql',
        '--tuples-only',
        '--no-align',
        '-U',
        'cf_owner',
        '-d',
        'postgres',
        '-c',
        sql
      );
      expect(result.status).toBe(0);
      return result.stdout.trim();
    };

    const passwordBefore = query(
      "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_owner';"
    );
    const result = spawnSync(bootstrap, [], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CF_POSTGRES_CONTAINER: container,
        PRODUCT_RUNTIME_USER: 'cf_owner',
        PRODUCT_RUNTIME_PASSWORD: 'owner-password-after',
        MASTRA_DATABASE_NAME: 'cf_mastra',
        MASTRA_RUNTIME_USER: 'cf_mastra_runtime',
        MASTRA_RUNTIME_PASSWORD: 'mastra-password-after',
        LISTMONK_DB_NAME: 'cf_listmonk',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Existing application role');
    expect(result.stderr).toContain('role isolation guard failed');
    expect(
      query("SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_owner';")
    ).toBe(passwordBefore);
    expect(
      query(
        "SELECT count(*) FROM pg_roles WHERE rolname = 'cf_mastra_runtime';"
      )
    ).toBe('0');
    expect(
      query("SELECT count(*) FROM pg_database WHERE datname = 'cf_mastra';")
    ).toBe('0');
  });

  test('rejects membership edges in either direction before rotating passwords', () => {
    expect(docker('inspect', membershipContainer).status).not.toBe(0);
    expect(
      docker(
        'run',
        '--detach',
        '--name',
        membershipContainer,
        '--env',
        'POSTGRES_USER=cf_owner',
        '--env',
        'POSTGRES_PASSWORD=owner-password',
        '--env',
        'POSTGRES_DB=cf_product',
        '--env',
        'PRODUCT_RUNTIME_USER=cf_runtime',
        '--env',
        'PRODUCT_RUNTIME_PASSWORD=runtime-password-before',
        '--env',
        'MASTRA_DATABASE_NAME=cf_mastra',
        '--env',
        'MASTRA_RUNTIME_USER=cf_mastra_runtime',
        '--env',
        'MASTRA_RUNTIME_PASSWORD=mastra-password-before',
        '--env',
        'LISTMONK_DB_NAME=cf_listmonk',
        'postgres:17-alpine'
      ).status
    ).toBe(0);

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = docker('logs', membershipContainer);
      const initialized = `${logs.stdout}${logs.stderr}`.includes(
        'PostgreSQL init process complete; ready for start up.'
      );
      if (
        initialized &&
        docker(
          'exec',
          membershipContainer,
          'psql',
          '-U',
          'cf_owner',
          '-d',
          'postgres',
          '-c',
          'SELECT 1'
        ).status === 0
      ) {
        ready = true;
        break;
      }
      spawnSync('sleep', ['0.2']);
    }
    expect(ready).toBe(true);

    const psql = (database, sql) =>
      docker(
        'exec',
        membershipContainer,
        'psql',
        '--set',
        'ON_ERROR_STOP=1',
        '--tuples-only',
        '--no-align',
        '-U',
        'cf_owner',
        '-d',
        database,
        '-c',
        sql
      );
    expect(
      docker(
        'exec',
        membershipContainer,
        'createdb',
        '-U',
        'cf_owner',
        'temporal'
      ).status
    ).toBe(0);
    expect(
      docker(
        'exec',
        membershipContainer,
        'createdb',
        '-U',
        'cf_owner',
        'temporal_visibility'
      ).status
    ).toBe(0);

    const runtimeEnv = {
      ...process.env,
      CF_POSTGRES_CONTAINER: membershipContainer,
      POSTGRES_USER: 'cf_owner',
      POSTGRES_DB: 'cf_product',
      PRODUCT_RUNTIME_USER: 'cf_runtime',
      PRODUCT_RUNTIME_PASSWORD: 'runtime-password-before',
      MASTRA_DATABASE_NAME: 'cf_mastra',
      MASTRA_RUNTIME_USER: 'cf_mastra_runtime',
      MASTRA_RUNTIME_PASSWORD: 'mastra-password-before',
      LISTMONK_DB_NAME: 'cf_listmonk',
    };
    expect(
      spawnSync(bootstrap, [], {
        cwd: root,
        encoding: 'utf8',
        env: runtimeEnv,
      }).status
    ).toBe(0);
    expect(psql('postgres', 'CREATE ROLE delegated_role NOLOGIN;').status).toBe(
      0
    );

    const membershipCases = [
      {
        name: 'runtime is a member',
        setup: 'GRANT delegated_role TO cf_runtime;',
        cleanup: 'REVOKE delegated_role FROM cf_runtime;',
      },
      {
        name: 'runtime is a granted role',
        setup: 'GRANT cf_runtime TO delegated_role;',
        cleanup: 'REVOKE cf_runtime FROM delegated_role;',
      },
    ];
    for (const membership of membershipCases) {
      expect(psql('postgres', membership.setup).status).toBe(0);
      const productPasswordBefore = psql(
        'postgres',
        "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_runtime';"
      ).stdout.trim();
      const invalidEnv = {
        ...runtimeEnv,
        PRODUCT_RUNTIME_PASSWORD: 'runtime-password-after',
        MASTRA_RUNTIME_PASSWORD: 'mastra-password-after',
      };
      const rejectedBootstrap = spawnSync(bootstrap, [], {
        cwd: root,
        encoding: 'utf8',
        env: invalidEnv,
      });
      expect({
        case: membership.name,
        status: rejectedBootstrap.status,
      }).toEqual({ case: membership.name, status: 3 });
      expect(
        psql(
          'postgres',
          "SELECT rolpassword FROM pg_authid WHERE rolname = 'cf_runtime';"
        ).stdout.trim()
      ).toBe(productPasswordBefore);

      const rejectedPreflight = spawnSync(preflight, [], {
        cwd: root,
        encoding: 'utf8',
        env: runtimeEnv,
      });
      expect({
        case: membership.name,
        status: rejectedPreflight.status,
      }).toEqual({ case: membership.name, status: 3 });
      expect(psql('postgres', membership.cleanup).status).toBe(0);
    }
    expect(psql('postgres', 'DROP ROLE delegated_role;').status).toBe(0);
  });

  test('preflight checks each table DML privilege independently', () => {
    const source = require('node:fs').readFileSync(preflight, 'utf8');
    expect(source).not.toContain("'SELECT,INSERT,UPDATE,DELETE'");
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(
        source.match(new RegExp(`'${privilege}'`, 'g'))?.length
      ).toBeGreaterThanOrEqual(4);
    }
    for (const privilege of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      expect(
        source.match(new RegExp(`'${privilege}'`, 'g'))?.length
      ).toBeGreaterThanOrEqual(6);
    }
    expect(source).toContain('has_sequence_privilege');
    expect(source).toContain('has_function_privilege');
    expect(source).toContain("'EXECUTE'");
  });
});
