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
    expect(summary.checks).toHaveLength(26);
    expect(summary.checks.every((check) => check.status === 'PASS')).toBe(true);
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
