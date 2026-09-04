const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

// The proof writes a file that carries the day the run happened, so writing it
// into `.codex/stages/.../public-funnel-runtime` left a dirty working tree
// after every green `pnpm test` — and a release receipt then had to be
// recorded on a tree somebody cleaned by hand (content-factory-next-4a79).
// The committed evidence is a record of a run that happened; refreshing it is
// a deliberate act with its own commit, not a side effect of the suite.
let evidenceDir;
let summaryPath;
let authPath;

beforeAll(() => {
  evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-public-funnel-'));
  summaryPath = path.join(evidenceDir, 'summary.json');
  authPath = path.join(evidenceDir, 'auth.json');
});

afterAll(() => {
  if (evidenceDir) fs.rmSync(evidenceDir, { recursive: true, force: true });
});

describe('public funnel real Nest and PostgreSQL runtime proof', () => {
  test('produces a no-skip machine-readable PASS and leaves no Docker resources', () => {
    const result = spawnSync(
      process.execPath,
      [
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
          TS_NODE_PROJECT: path.join(root, 'tsconfig.json'),
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }),
        },
        encoding: 'utf8',
        timeout: 180_000,
      }
    );

    expect({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toMatchObject({ status: 0, signal: null });
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
      },
      cleanup: {
        status: 'PASS',
        containers: [],
        volumes: [],
        networks: [],
      },
    });
    expect(summary.checks).toHaveLength(16);
    expect(summary.checks.every((check) => check.status === 'PASS')).toBe(
      true
    );
    expect(summary.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'LOCAL registration applies the selected workflow through POST /auth/register',
        'OAuth callback token applies the selected workflow through POST /auth/register',
        'a Russian-language registration gets Russian content-workflow tag names',
        'a stale starterTemplate value and an omitted one both accept an omitted workspace and get the same four tags',
        'global whitelist validation silently drops an unsupported or multi-valued starterTemplate and still creates the default four tags',
        'LOCAL duplicate and OAuth replay leave workspace and tag counts unchanged',
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
    });
  }, 190_000);
});
