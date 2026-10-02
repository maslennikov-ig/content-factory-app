const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function assertProofExit(result, summary) {
  if (result.status === 0 && result.signal === null) return;
  const redact = (value) =>
    String(value || '')
      .replace(
        /(?:postgres(?:ql)?|rediss?):\/\/[^\s"']+/gi,
        '[database URL redacted]'
      )
      .replace(/POSTGRES_PASSWORD=[^\s"']+/g, 'POSTGRES_PASSWORD=[redacted]')
      .replace(/(--requirepass\s+)[^\s"']+/g, '$1[redacted]')
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]');
  throw new Error(
    `Public funnel proof failed: ${JSON.stringify({
      status: result.status,
      signal: result.signal,
      errorCode: result.error?.code,
      passedChecks: summary?.checks?.length,
      failure: summary?.failure
        ? { ...summary.failure, message: redact(summary.failure.message) }
        : null,
    })}\n` +
      `stderr: ${redact(result.stderr).slice(-8_192)}\n` +
      // Successful check details contain fixture rows; only use stdout when
      // startup failed before the machine-readable summary could be written.
      (summary ? '' : `stdout: ${redact(result.stdout).slice(-8_192)}`)
  );
}

// The proof writes a file that carries the day the run happened, so writing it
// into `.codex/stages/.../public-funnel-runtime` left a dirty working tree
// after every green `pnpm test` — and a release receipt then had to be
// recorded on a tree somebody cleaned by hand (content-factory-next-4a79).
// The committed evidence is a record of a run that happened; refreshing it is
// a deliberate act with its own commit, not a side effect of the suite.
let evidenceDir;
let summaryPath;
let authPath;
let clockPreloadPath;
let clockReceiptPath;

beforeAll(() => {
  evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-public-funnel-'));
  summaryPath = path.join(evidenceDir, 'summary.json');
  authPath = path.join(evidenceDir, 'auth.json');
  clockPreloadPath = path.join(evidenceDir, 'minute-edge.cjs');
  clockReceiptPath = path.join(evidenceDir, 'minute-edge.json');
  // Drive the real tracker's default time across a minute in the child only.
  // The proof must pass its own pinned instant; Date, timers and HMAC stay real.
  fs.writeFileSync(
    clockPreloadPath,
    `const fs = require('node:fs');
const Module = require('node:module');
const trackerPath = ${JSON.stringify(
      path.join(
        root,
        'libraries/nestjs-libraries/src/throttler/transient-client-tracker.ts'
      )
    )};
const originalLoad = Module._load;
const before = ${Date.UTC(2026, 9, 3, 12, 0, 59, 999)};
let defaultCalls = 0;
let explicitCalls = 0;
Module._load = function (request, parent, isMain) {
  const filename = Module._resolveFilename(request, parent, isMain);
  const result = Reflect.apply(originalLoad, this, arguments);
  if (filename === trackerPath) {
    const actualTracker = result.createTransientClientTracker;
    result.createTransientClientTracker = (req, at) => {
      if (at !== undefined) {
        explicitCalls += 1;
        return actualTracker(req, at);
      }
      return actualTracker(req, ++defaultCalls <= 60 ? before : before + 1);
    };
    Module._load = originalLoad;
  }
  return result;
};
process.on('exit', () => fs.writeFileSync(
  ${JSON.stringify(clockReceiptPath)},
  JSON.stringify({ defaultCalls, explicitCalls }),
  { mode: 0o600, flag: 'wx' }
));
`,
    { mode: 0o600, flag: 'wx' }
  );
});

afterAll(() => {
  if (evidenceDir) fs.rmSync(evidenceDir, { recursive: true, force: true });
});

describe('public funnel real Nest and PostgreSQL runtime proof', () => {
  test('produces a no-skip machine-readable PASS and leaves no Docker resources', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--require',
        clockPreloadPath,
        path.join(
          root,
          'scripts/evidence/run-public-funnel-database-proof.cjs'
        ),
        '--evidence-dir',
        evidenceDir,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          // CI has no local .env. Do not let generated Prisma dotenv loading
          // turn an unowned developer Redis into this proof's hidden fixture.
          REDIS_URL: '',
          TS_NODE_PROJECT: path.join(root, 'tsconfig.json'),
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }),
        },
        encoding: 'utf8',
        timeout: 180_000,
      }
    );

    let childSummary;
    if (fs.existsSync(summaryPath)) {
      try {
        childSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      } catch {}
    }
    assertProofExit(result, childSummary);
    expect({ status: result.status, signal: result.signal }).toMatchObject({
      status: 0,
      signal: null,
    });
    expect(fs.existsSync(summaryPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    expect(summary).toMatchObject({
      schemaVersion: 'public-funnel-runtime-proof/v1',
      status: 'PASS',
      skipped: 0,
      runtime: {
        node: 'v22.23.2',
        pnpm: '10.6.1',
        postgres: '17',
        redis: '7.2',
      },
      cleanup: {
        status: 'PASS',
        containers: [],
        volumes: [],
        networks: [],
        containerCleanupFailures: [],
      },
    });
    const environment = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, 'environment.json'), 'utf8')
    );
    expect(environment).toMatchObject({
      redisImage: 'redis:7.2-alpine',
      redisOwned: true,
      redisPersistence: 'tmpfs',
      redisAnonymousVolumes: 0,
    });
    expect(environment.redisServer).toMatch(/^7\.2\./);
    expect(summary.checks).toHaveLength(26);
    expect(summary.checks.every((check) => check.status === 'PASS')).toBe(true);
    expect(JSON.parse(fs.readFileSync(clockReceiptPath, 'utf8'))).toEqual({
      defaultCalls: 0,
      explicitCalls: 121,
    });
    expect(summary.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'LOCAL registration applies the selected workflow through POST /auth/register',
        'OAuth callback token applies the selected workflow through POST /auth/register',
        'a Russian-language registration gets Russian content-workflow tag names',
        'a stale starterTemplate value and an omitted one both accept an omitted workspace and get the same four tags',
        'global whitelist validation silently drops an unsupported or multi-valued starterTemplate and still creates the default four tags',
        'LOCAL duplicate and OAuth replay leave workspace and tag counts unchanged',
        'same-caller successful registration retains its effect limit and creates no second workspace',
        'same-caller ordinary form refusal permits an immediate corrected registration',
        'legacy company and workspaceName registrations persist two distinct tenant identities',
        'each persisted creator is ADMIN only in their own organization',
        'each tenant receives exactly one default workflow tag quartet',
        'both tenant registration replays leave identities memberships and tag seeds unchanged',
        'foreign-organization tag edit is not found and leaves the real tag unchanged',
        'same-organization tag edit succeeds without changing the other tenant',
        'foreign post and group writes are refused without changing persisted posts',
        'same-organization post and group mutations affect only that tenant',
      ])
    );

    expect(fs.existsSync(authPath)).toBe(true);
    const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    expect(auth).toMatchObject({
      boundary: {
        controller: 'AuthController',
        authService: 'AuthService',
        organizationService: 'OrganizationService',
        organizationRepository: 'OrganizationRepository',
        persistence: 'PrismaClient/PostgreSQL',
        oauthProvider: 'strict local in-process stub',
        externalCalls: 0,
      },
      local: { status: 200, tagCount: 4 },
      oauth: {
        callbackStatus: 201,
        registrationStatus: 200,
        tagCount: 4,
      },
      validation: {
        unsupportedStatus: 200,
        multiValueStatus: 200,
      },
      replay: {
        localStatus: 400,
        oauthCallbackStatus: 200,
        oauthRegisterStatus: 200,
        countsUnchanged: true,
      },
      effectLimit: {
        firstStatus: 200,
        repeatedStatus: 429,
        countsUnchanged: true,
        repositoryCalls: 0,
      },
      formRetry: {
        refusedStatus: 400,
        correctedStatus: 200,
        exactlyOneWorkspaceCreated: true,
      },
    });

    const tenants = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, 'tenant-isolation.json'), 'utf8')
    );
    expect(tenants).toMatchObject({
      schemaVersion: 'tenant-isolation-real-db/v1',
      boundary: {
        registration: 'POST /auth/register with real Nest validation',
        tagMutation: 'PostsRepository.editTag with real Prisma/PostgreSQL',
        postMutation: 'PostsRepository with real Prisma/PostgreSQL',
        providerCalls: 0,
      },
      registrations: {
        organizationA: {
          name: 'Legacy Company A',
          workspaceNameForwarded: false,
        },
        organizationB: {
          name: 'Named Workspace B',
          workspaceNameForwarded: true,
        },
        distinctOrganizationIds: true,
        distinctUserIds: true,
      },
      memberships: { ownRoles: ['ADMIN', 'ADMIN'], foreignMembershipCount: 0 },
      defaultTags: { counts: [4, 4], disjointTagIds: true },
      replay: { statuses: [400, 400], allRowsUnchanged: true },
      foreignTagEdit: { code: 'P2025', unchanged: true },
      ownTagEdit: { persisted: true, otherTenantUnchanged: true },
      foreignPosts: {
        postCode: 'POST_NOT_FOUND',
        groupCode: 'POST_NOT_FOUND',
        postStatus: 404,
        groupStatus: 404,
        dateCode: 'P2025',
        dateRowsUnchanged: true,
        groupDeleteResult: null,
        allRowsUnchanged: true,
      },
      ownPosts: {
        dateChanged: true,
        ownGroupDeleted: true,
        otherTenantUnchanged: true,
      },
    });
    expect(tenants.registrations.organizationA.organizationId).not.toBe(
      tenants.registrations.organizationB.organizationId
    );
    expect(tenants.registrations.organizationA.userId).not.toBe(
      tenants.registrations.organizationB.userId
    );
  }, 190_000);
});

describe('public funnel child failure diagnostics', () => {
  test('reports the real phase and code without echoing successful fixture rows', () => {
    expect(() =>
      assertProofExit(
        { status: 1, signal: null, stderr: '', stdout: 'private fixture row' },
        {
          checks: [{ status: 'PASS' }],
          failure: {
            phase: 'behavior-checks',
            name: 'AssertionError',
            code: 'ERR_ASSERTION',
            message: 'registration_budget_unavailable: 503 instead of 200',
          },
        }
      )
    ).toThrow(
      /behavior-checks.*ERR_ASSERTION.*registration_budget_unavailable/
    );
    try {
      assertProofExit(
        { status: 1, signal: null, stderr: '', stdout: 'private fixture row' },
        { checks: [], failure: { message: 'failed' } }
      );
    } catch (error) {
      expect(error.message).not.toContain('private fixture row');
    }
  });

  test('keeps startup diagnostics and redacts temporary connection credentials', () => {
    let message;
    try {
      assertProofExit(
        {
          status: null,
          signal: 'SIGTERM',
          error: { code: 'ETIMEDOUT' },
          stderr:
            'postgresql://user:private-password@localhost/db redis://:private-redis@localhost',
          stdout:
            'startup failed POSTGRES_PASSWORD=private-postgres --requirepass private-pass Bearer private-token',
        },
        undefined
      );
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('ETIMEDOUT');
    expect(message).toContain('startup failed');
    expect(message).toContain('SIGTERM');
    expect(message).not.toContain('private-');
  });
});

describe('public funnel container ownership cleanup', () => {
  const fixtureRunId = 'cf-public-funnel-ownership-fixture';
  const containerIds = {
    redisContainer: 'a'.repeat(64),
    container: 'b'.repeat(64),
  };

  // Execute the actual cleanup block without importing backend/provider code.
  // Docker transport is injected; the native absence case calls real inspect.
  function loadCleanup(transport, enabled, runId = fixtureRunId) {
    const source = fs.readFileSync(
      path.join(root, 'scripts/evidence/run-public-funnel-database-proof.cjs'),
      'utf8'
    );
    const cleanupStart = source.indexOf('\nasync function cleanup() {');
    const guardStart = source.indexOf('\nfunction removeOwnedContainer(');
    const end = source.indexOf('\nconst fixtureSql =', cleanupStart);
    expect(cleanupStart).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(cleanupStart);
    const start =
      guardStart >= 0 && guardStart < cleanupStart ? guardStart : cleanupStart;
    const calls = [];
    const records = {};
    const context = {
      runId,
      resources: {
        container: `${runId}-postgres`,
        redisContainer: `${runId}-redis`,
      },
      created: { container: false, redisContainer: false, ...enabled },
      app: undefined,
      prisma: undefined,
      pg: undefined,
      cleanupEvidence: {},
      closeSharedRedis: () => 'not loaded',
      dockerList: () => [],
      writeJson: (name, value) => {
        records[name] = JSON.parse(JSON.stringify(value));
      },
      command: (tool, args) => {
        calls.push({ tool, args });
        return transport(tool, args, context);
      },
    };
    const run = new vm.Script(
      `${source.slice(start, end)}\ncleanup;`
    ).runInNewContext(context);
    return { run, calls, records };
  }

  test.each(['foreign-project-owner', null, `${fixtureRunId}-other`])(
    'preserves a partial-start Redis with nonmatching owner %s and reports FAIL',
    async (owner) => {
      const fixture = loadCleanup(
        (_tool, args) => {
          if (args[0] === 'container' && args[1] === 'inspect') {
            return JSON.stringify({ id: containerIds.redisContainer, owner });
          }
          if (args[0] === 'rm') return '';
          throw new Error('Unexpected Docker operation');
        },
        { redisContainer: true }
      );
      await fixture.run();
      expect(fixture.calls.some(({ args }) => args[0] === 'rm')).toBe(false);
      expect(fixture.records['cleanup.json']).toMatchObject({
        status: 'FAIL',
        containerCleanupFailures: [
          {
            container: `${fixtureRunId}-redis`,
            reason: 'ownership-label-mismatch',
          },
        ],
      });
    }
  );

  test('applies the same preservation guard to the PostgreSQL container', async () => {
    const fixture = loadCleanup(
      (_tool, args) => {
        if (args[0] === 'container' && args[1] === 'inspect') {
          return JSON.stringify({
            id: containerIds.container,
            owner: 'foreign',
          });
        }
        if (args[0] === 'rm') return '';
        throw new Error('Unexpected Docker operation');
      },
      { container: true }
    );
    await fixture.run();
    expect(fixture.calls.some(({ args }) => args[0] === 'rm')).toBe(false);
    expect(fixture.records['cleanup.json'].status).toBe('FAIL');
  });

  test('inspects exact labels and removes only immutable owned container IDs', async () => {
    const fixture = loadCleanup(
      (_tool, args, context) => {
        if (args[0] === 'container' && args[1] === 'inspect') {
          const key =
            args[2] === context.resources.redisContainer
              ? 'redisContainer'
              : 'container';
          return JSON.stringify({ id: containerIds[key], owner: fixtureRunId });
        }
        if (args[0] === 'rm') return '';
        throw new Error('Unexpected Docker operation');
      },
      { redisContainer: true, container: true }
    );
    await fixture.run();
    expect(fixture.calls.map(({ args }) => args.slice(0, 3))).toEqual([
      ['container', 'inspect', `${fixtureRunId}-redis`],
      ['rm', '-f', '-v'],
      ['container', 'inspect', `${fixtureRunId}-postgres`],
      ['rm', '-f', containerIds.container],
    ]);
    expect(fixture.calls[1].args).toEqual([
      'rm',
      '-f',
      '-v',
      containerIds.redisContainer,
    ]);
    expect(fixture.records['cleanup.json']).toMatchObject({
      status: 'PASS',
      containerCleanupFailures: [],
    });
  });

  test('does not mistake unavailable inspection for an absent container', async () => {
    const fixture = loadCleanup(
      (_tool, args) => {
        if (args[0] === 'container' && args[1] === 'inspect') {
          const error = new Error('inspection unavailable');
          error.status = 1;
          error.stderr = Buffer.from('Cannot connect to the Docker daemon');
          throw error;
        }
        if (args[0] === 'rm') return '';
        throw new Error('Unexpected Docker operation');
      },
      { redisContainer: true }
    );
    await fixture.run();
    expect(fixture.calls.some(({ args }) => args[0] === 'rm')).toBe(false);
    expect(fixture.records['cleanup.json']).toMatchObject({
      status: 'FAIL',
      containerCleanupFailures: [{ reason: 'inspection-unavailable' }],
    });
  });

  test('refuses an invalid container ID even with the exact ownership label', async () => {
    const fixture = loadCleanup(
      (_tool, args) => {
        if (args[0] === 'container' && args[1] === 'inspect') {
          return JSON.stringify({ id: '', owner: fixtureRunId });
        }
        if (args[0] === 'rm') return '';
        throw new Error('Unexpected Docker operation');
      },
      { redisContainer: true }
    );
    await fixture.run();
    expect(fixture.calls.some(({ args }) => args[0] === 'rm')).toBe(false);
    expect(fixture.records['cleanup.json'].status).toBe('FAIL');
  });

  test('accepts native Docker absence without attempting any removal', async () => {
    const runId = `cf-public-funnel-native-absent-${
      process.pid
    }-${randomUUID().slice(0, 8)}`;
    const fixture = loadCleanup(
      (tool, args) => {
        if (args[0] === 'container' && args[1] === 'inspect') {
          return execFileSync(tool, ['--context', 'default', ...args], {
            encoding: 'utf8',
            timeout: 5_000,
            stdio: ['ignore', 'pipe', 'pipe'],
          }).trim();
        }
        // Never execute rm, including while reproducing the old blind cleanup.
        if (args[0] === 'rm') return '';
        throw new Error('Unexpected Docker operation');
      },
      { redisContainer: true },
      runId
    );
    await fixture.run();
    expect(fixture.calls.some(({ args }) => args[0] === 'rm')).toBe(false);
    expect(fixture.records['cleanup.json']).toMatchObject({
      status: 'PASS',
      containerCleanupFailures: [],
    });
  });
});
