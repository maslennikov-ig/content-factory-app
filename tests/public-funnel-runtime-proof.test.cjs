const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(
  root,
  '.codex/stages/content-factory-next-or3/evidence/public-funnel-runtime'
);
const summaryPath = path.join(evidenceDir, 'summary.json');
const authPath = path.join(evidenceDir, 'auth.json');

describe('public funnel real Nest and PostgreSQL runtime proof', () => {
  test('produces a no-skip machine-readable PASS and leaves no Docker resources', () => {
    fs.rmSync(evidenceDir, { recursive: true, force: true });

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
    expect(summary.checks).toHaveLength(15);
    expect(summary.checks.every((check) => check.status === 'PASS')).toBe(
      true
    );
    expect(summary.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'LOCAL registration applies the selected workflow through POST /auth/register',
        'OAuth callback token applies the selected workflow through POST /auth/register',
        'blank and omitted starter intent accept an omitted workspace',
        'global DTO validation rejects unsupported and multi-valued starter intent',
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
        unsupportedStatus: 400,
        multiValueStatus: 400,
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
