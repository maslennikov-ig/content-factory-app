const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const value = (source, name) =>
  source.match(new RegExp(`^${name}="([^"]+)"$`, 'm'))?.[1];

describe('PostgreSQL production roles stay least-privilege and isolated', () => {
  test('uses distinct product and Mastra runtime connections without runtime DDL', () => {
    const ownerEnv = read('deploy/production/env.example');
    const appEnv = read('deploy/production/app.env.example');
    const productUrl = new URL(value(appEnv, 'DATABASE_URL'));
    const mastraUrl = new URL(value(appEnv, 'MASTRA_DATABASE_URL'));

    expect(productUrl.username).toBe(value(ownerEnv, 'PRODUCT_RUNTIME_USER'));
    expect(productUrl.password).toBe(
      value(ownerEnv, 'PRODUCT_RUNTIME_PASSWORD')
    );
    expect(productUrl.pathname.slice(1)).toBe(value(ownerEnv, 'POSTGRES_DB'));
    expect(mastraUrl.username).toBe(value(ownerEnv, 'MASTRA_RUNTIME_USER'));
    expect(mastraUrl.password).toBe(
      value(ownerEnv, 'MASTRA_RUNTIME_PASSWORD')
    );
    expect(mastraUrl.pathname.slice(1)).toBe(
      value(ownerEnv, 'MASTRA_DATABASE_NAME')
    );
    expect(productUrl.username).not.toBe(value(ownerEnv, 'POSTGRES_USER'));
    expect(mastraUrl.username).not.toBe(value(ownerEnv, 'POSTGRES_USER'));
    expect(productUrl.username).not.toBe(mastraUrl.username);
    expect(productUrl.pathname).not.toBe(mastraUrl.pathname);

    const storeSource = read(
      'libraries/nestjs-libraries/src/chat/mastra.store.ts'
    );
    expect(storeSource).toContain('process.env.MASTRA_DATABASE_URL');
    expect(storeSource).toMatch(/disableInit:\s*Boolean\(mastraDatabaseUrl\)/);
  });

  test('keeps owner and database-role secrets out of the application env', () => {
    const ownerEnv = read('deploy/production/env.example');
    const appEnv = read('deploy/production/app.env.example');
    const compose = read('deploy/production/docker-compose.yaml');
    const app = compose.match(/  cf-app:[\s\S]*?(?=\n  cf-postgres:)/)?.[0] || '';
    const postgres =
      compose.match(/  cf-postgres:[\s\S]*?(?=\n  cf-redis:)/)?.[0] || '';

    for (const name of [
      'POSTGRES_PASSWORD',
      'PRODUCT_RUNTIME_PASSWORD',
      'MASTRA_RUNTIME_PASSWORD',
      'LISTMONK_DB_PASSWORD',
    ]) {
      expect(ownerEnv).toMatch(new RegExp(`^${name}=`, 'm'));
      expect(appEnv).not.toMatch(new RegExp(`^${name}=`, 'm'));
      expect(app).not.toContain(name);
      expect(postgres).toContain(name);
    }
  });

  test('owner bootstrap creates restricted roles and denies cross-database CONNECT', () => {
    const script = 'deploy/production/bootstrap-app-db.sh';
    expect(exists(script)).toBe(true);
    if (!exists(script)) return;

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-role-bootstrap-'));
    const bin = path.join(temp, 'bin');
    const argsFile = path.join(temp, 'args');
    const stdinFile = path.join(temp, 'stdin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'docker'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >"$CF_STUB_ARGS"\ncat >"$CF_STUB_STDIN"\n`,
      { mode: 0o755 }
    );

    execFileSync(path.join(root, script), [], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PRODUCT_RUNTIME_USER: 'cf_runtime',
        PRODUCT_RUNTIME_PASSWORD: 'product-secret',
        MASTRA_RUNTIME_USER: 'mastra_runtime',
        MASTRA_RUNTIME_PASSWORD: 'mastra-secret',
        MASTRA_DATABASE_NAME: 'contentfactory_mastra',
        LISTMONK_DB_NAME: 'listmonk',
        CF_STUB_ARGS: argsFile,
        CF_STUB_STDIN: stdinFile,
      },
      stdio: 'pipe',
    });

    const args = fs.readFileSync(argsFile, 'utf8');
    const sql = fs.readFileSync(stdinFile, 'utf8');
    expect(args).not.toMatch(/product-secret|mastra-secret/);
    expect(sql).not.toMatch(/product-secret|mastra-secret/);
    expect(sql).toMatch(
      /LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/
    );
    expect(sql).toMatch(/REVOKE CONNECT ON DATABASE %I FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE CONNECT ON DATABASE %I FROM %I/);
    expect(sql).toContain("('temporal', :'product_role')");
    expect(sql).toContain("('temporal_visibility', :'mastra_role')");
    expect(sql).toMatch(/REVOKE ALL ON SCHEMA public FROM PUBLIC/);
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA public TO/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES/);

    // Every privilege this bootstrap hands a runtime role, read off the SQL it
    // actually sends. The roles never appear by name — the script builds every
    // statement from `%I` and `:'product_role'` — so a check written against
    // the literal string "runtime" can never fail whatever the GRANTs say.
    const runtimeGrants = sql
      .split(/\\gexec|;/)
      .filter((statement) => /:'(?:product_role|mastra_role)'/.test(statement))
      .flatMap((statement) =>
        [...statement.matchAll(/\bGRANT\s+([A-Za-z ,]+?)\s+ON\b/gi)].map(
          (match) => match[1]
        )
      )
      .flatMap((privileges) =>
        privileges.split(',').map((privilege) => privilege.trim().toUpperCase())
      );
    const allowed = new Set([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'USAGE',
      'CONNECT',
    ]);

    expect(runtimeGrants.length).toBeGreaterThan(0);
    expect(runtimeGrants.filter((privilege) => !allowed.has(privilege))).toEqual(
      []
    );
    fs.rmSync(temp, { recursive: true, force: true });
  });

  test('Mastra source schema dump is owner-run, exact, transactional and grants only DML afterward', () => {
    const migration = 'deploy/production/migrate-mastra-storage.sh';
    const preflight = 'scripts/operations/check-postgres-role-isolation.sh';
    expect(exists(migration)).toBe(true);
    expect(exists(preflight)).toBe(true);
    if (!exists(migration) || !exists(preflight)) return;

    const source = read(migration);
    expect(source).toContain('pg_dump --schema-only');
    expect(source).toContain('29-table deployment contract');
    expect(source).not.toContain("exportSchemas('public')");
    expect(source).not.toContain('docker compose');
    expect(source).toContain('--single-transaction');
    expect(source).toContain('MASTRA_RUNTIME_USER');
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
    expect(source).toContain('--copy-existing');
    expect(source).not.toContain('prisma db push');

    for (const file of [migration, preflight, 'deploy/production/bootstrap-app-db.sh']) {
      const result = spawnSync('bash', ['-n', path.join(root, file)], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    }
  });

  // The CONNECT boundary is written out by hand three times: the bootstrap
  // grants it, the restore reapplies it after `createdb` hands PUBLIC CONNECT
  // back, and the local proof asserts it. Nothing at runtime derives one from
  // another, so a sixth database or a third runtime role added to two of them
  // would leave the third quietly enforcing the old boundary. Extracting the
  // matrix into a file the three shell scripts read was the other option and
  // was rejected: two of them are hand-delivered to the server one file at a
  // time by the runbook, so a shared data file becomes a fourth artifact whose
  // absence breaks an owner-run migration mid-deploy. This test catches the
  // same drift while it is still being written, and costs nothing at runtime.
  test('the CONNECT matrix agrees across bootstrap, restore and the restore proof', () => {
    const DATABASES = {
      product_database: 'product',
      mastra_database: 'mastra',
      newsletter_database: 'listmonk',
      listmonk_database: 'listmonk',
      temporal: 'temporal',
      temporal_database: 'temporal',
      temporal_visibility: 'visibility',
      visibility_database: 'visibility',
    };
    const ROLES = {
      product_role: 'product',
      mastra_role: 'mastra',
      listmonk_role: 'listmonk',
      product_runtime_user: 'product',
      mastra_runtime_user: 'mastra',
      newsletter_user: 'listmonk',
    };
    const token = (raw, table) => {
      const name = raw.trim().replace(/^[:$]/, '').replace(/^'|'$/g, '');
      expect({ name, known: table[name] }).toEqual({
        name,
        known: expect.any(String),
      });
      return table[name];
    };
    // Only the two application runtime roles: Listmonk's own CONNECT is granted
    // by its separate bootstrap and the restore proof does not assert it.
    const runtimeOnly = (matrix) =>
      Object.fromEntries(
        Object.entries(matrix).filter(([key]) => !key.endsWith(':listmonk'))
      );
    // The nearest `FROM (VALUES` before the alias, not the first one in the
    // file: both scripts have several unrelated VALUES lists above these.
    const valuesBlock = (source, alias) => {
      const end = source.indexOf(`) AS ${alias}(database_name, role_name)`);
      expect(end).toBeGreaterThan(-1);
      const start = source.lastIndexOf('FROM (VALUES', end);
      return source.slice(start + 'FROM (VALUES'.length, end);
    };
    const pairs = (block, verdict) =>
      Object.fromEntries(
        [...block.matchAll(/\(([^(),]+),\s*([^(),]+)\)/g)].map((match) => [
          `${token(match[1], DATABASES)}:${token(match[2], ROLES)}`,
          verdict,
        ])
      );

    const bootstrap = read('deploy/production/bootstrap-app-db.sh');
    const restore = read('scripts/operations/postgres-backup-restore.sh');
    const proof = read('scripts/operations/verify-postgres-backup-restore.sh');

    const bootstrapMatrix = runtimeOnly({
      ...pairs(valuesBlock(bootstrap, 'denied'), 'deny'),
      ...Object.fromEntries(
        [
          ...bootstrap.matchAll(
            /GRANT CONNECT ON DATABASE %I TO %I',\s*(:'[a-z_]+'),\s*(:'[a-z_]+')/g
          ),
        ].map((match) => [
          `${token(match[1], DATABASES)}:${token(match[2], ROLES)}`,
          'allow',
        ])
      ),
    });
    const restoreMatrix = runtimeOnly({
      ...pairs(valuesBlock(restore, 'denied'), 'deny'),
      ...pairs(valuesBlock(restore, 'allowed'), 'allow'),
    });
    const proofMatrix = Object.fromEntries(
      [
        ...proof.matchAll(
          /(NOT )?has_database_privilege\('(\$[a-z_]+|[a-z_]+)',\s*'(\$[a-z_]+|[a-z_]+)',\s*'CONNECT'\)/g
        ),
      ].map((match) => [
        `${token(match[3], DATABASES)}:${token(match[2], ROLES)}`,
        match[1] ? 'deny' : 'allow',
      ])
    );

    const expected = {
      'product:product': 'allow',
      'product:mastra': 'deny',
      'mastra:product': 'deny',
      'mastra:mastra': 'allow',
      'temporal:product': 'deny',
      'temporal:mastra': 'deny',
      'visibility:product': 'deny',
      'visibility:mastra': 'deny',
      'listmonk:product': 'deny',
      'listmonk:mastra': 'deny',
    };

    expect(bootstrapMatrix).toEqual(expected);
    expect(restoreMatrix).toEqual(expected);
    expect(proofMatrix).toEqual(expected);
  });

  test('Listmonk bootstrap revokes public and application-role CONNECT', () => {
    const source = read('deploy/production/bootstrap-listmonk-db.sh');
    expect(source).toMatch(/REVOKE CONNECT ON DATABASE %I FROM PUBLIC/);
    expect(source).toContain('PRODUCT_RUNTIME_USER');
    expect(source).toContain('MASTRA_RUNTIME_USER');
  });
});
