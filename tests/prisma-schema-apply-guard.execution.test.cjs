const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const guardScript = path.join(root, 'scripts/operations/validate-prisma-migration-sql.cjs');

// An unwritable temporary directory fails the suite rather than skipping it.
// A skip would report a green run with nothing executed, which is exactly the
// shape of failure this guard is supposed to make impossible.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-prisma-schema-guard-'));

function writeFixture(name, contents) {
  const file = path.join(workspace, name);
  fs.writeFileSync(file, contents);
  return file;
}

function runGuard({ diff, selected, allowedTables = [], allowedEnums = [], mode }) {
  const diffFile = writeFixture('diff.sql', diff);
  const selectedFile = writeFixture('selected.sql', selected);
  const args = [guardScript, '--diff', diffFile, '--selected', selectedFile];

  if (mode) {
    args.push('--mode', mode);
  }

  for (const table of allowedTables) {
    args.push('--allow-table', table);
  }

  for (const enumType of allowedEnums) {
    args.push('--allow-enum', enumType);
  }

  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

function runGuardWithArguments(args) {
  return spawnSync(process.execPath, [guardScript, ...args], { encoding: 'utf8' });
}

describe('Prisma production SQL apply guard', () => {
  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('allows an explicitly selected additive change printed by migrate diff', () => {
    const statement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${statement}\nCREATE INDEX "TelegramUpdateFailureState_id_idx" ON "TelegramUpdateFailureState"("id");\n`,
      selected: `${statement}\nCREATE INDEX "TelegramUpdateFailureState_id_idx" ON "TelegramUpdateFailureState"("id");\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('SQL apply guard passed');
  });

  test('bootstrap accepts the complete selected product schema while omitting Mastra storage', () => {
    const productStatements = [
      'CREATE TYPE "Provider" AS ENUM (\'LOCAL\', \'TELEGRAM\')',
      'CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY)',
      'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL)',
      'CREATE INDEX "TelegramUpdateFailureState_userId_idx" ON "TelegramUpdateFailureState"("userId")',
      'ALTER TABLE "TelegramUpdateFailureState" ADD CONSTRAINT "TelegramUpdateFailureState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")',
    ];
    const mastraStatements = [
      'CREATE TABLE "mastra_workflow_snapshot" ("id" TEXT NOT NULL PRIMARY KEY)',
      'CREATE INDEX "mastra_workflow_snapshot_id_idx" ON "mastra_workflow_snapshot"("id")',
    ];
    const result = runGuard({
      diff: `${[...productStatements, ...mastraStatements].join(';\n')};\n`,
      selected: `${productStatements.join(';\n')};\n`,
      mode: 'bootstrap',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('bootstrap rejects a selected enum whose literal differs from the diff', () => {
    const diffStatement = 'CREATE TYPE "Provider" AS ENUM (\'LOCAL\', \'TELEGRAM\');';
    const selectedStatement = 'CREATE TYPE "Provider" AS ENUM (\'LOCAL\', \'GOOGLE\');';
    const result = runGuard({
      diff: `${diffStatement}\n`,
      selected: `${selectedStatement}\n`,
      mode: 'bootstrap',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not printed by the current migrate diff');
  });

  test.each([
    ['DROP TABLE "User";', 'destructive'],
    ['CREATE SCHEMA "unexpected";', 'unknown schema operation'],
  ])('bootstrap rejects %s', (statement, expectedError) => {
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      mode: 'bootstrap',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });

  describe('update mode and CREATE TYPE ... AS ENUM', () => {
    const createEnum = 'CREATE TYPE "AiUsageMode" AS ENUM (\'included\', \'workspace_key\');';
    const addColumn =
      'ALTER TABLE "AiProviderSetting" ADD COLUMN     "usageMode" "AiUsageMode" NOT NULL DEFAULT \'workspace_key\';';

    test('accepts an enum the operator named with --allow-enum', () => {
      const sql = `${createEnum}\n${addColumn}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('2 explicitly selected statement(s)');
    });

    test('still refuses an enum that no --allow-enum names', () => {
      const sql = `${createEnum}\n${addColumn}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['AiProviderSetting'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-enum');
    });

    test('refuses an enum named by a different --allow-enum than the diff creates', () => {
      const sql = `${createEnum}\n${addColumn}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageStatus'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-enum');
    });

    test('refuses an --allow-enum the current diff does not create', () => {
      const sql = `${createEnum}\n${addColumn}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageMode', 'AiUsageStatus'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('AiUsageStatus');
      expect(result.stderr).toContain('--allow-enum');
    });

    test('refuses a selection that keeps the column but leaves the named enum out', () => {
      const result = runGuard({
        diff: `${createEnum}\n${addColumn}\n`,
        selected: `${addColumn}\n`,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('omits a statement');
    });

    test('naming an enum does not admit a table absent from --allow-table', () => {
      const sql = `${createEnum}\n${addColumn}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['User'],
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-table');
    });

    test('refuses ALTER TYPE ... ADD VALUE even when the enum is named', () => {
      const statement = 'ALTER TYPE "AiUsageMode" ADD VALUE \'metered\';';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('ALTER TYPE');
    });

    test('refuses DROP TYPE even when the enum is named', () => {
      const statement = 'DROP TYPE "AiUsageMode";';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
    });

    test('refuses a Mastra-owned enum even when it is named', () => {
      const statement = 'CREATE TYPE "mastra_span_kind" AS ENUM (\'llm\', \'tool\');';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['AiProviderSetting'],
        allowedEnums: ['mastra_span_kind'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Mastra-owned');
    });

    test('requires the named enum to be printed verbatim by the diff', () => {
      const result = runGuard({
        diff: `${createEnum}\n`,
        selected: 'CREATE TYPE "AiUsageMode" AS ENUM (\'included\', \'metered\');\n',
        allowedEnums: ['AiUsageMode'],
        mode: 'update',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('not printed by the current migrate diff');
    });

    test('applies today production slice in one pass with two enums and five tables', () => {
      const statements = [
        'CREATE TYPE "AiUsageMode" AS ENUM (\'included\', \'workspace_key\')',
        'CREATE TYPE "AiUsageStatus" AS ENUM (\'admitted\', \'succeeded\', \'failed\')',
        'ALTER TABLE "Subscription" ADD COLUMN     "includedAiMonthlyOperations" INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE "AiProviderSetting" ADD COLUMN     "usageMode" "AiUsageMode" NOT NULL DEFAULT \'workspace_key\'',
        'CREATE TABLE "PublicGrowthDaily" ("id" TEXT NOT NULL, "day" DATE NOT NULL, CONSTRAINT "PublicGrowthDaily_pkey" PRIMARY KEY ("id"))',
        'CREATE TABLE "PublicGrowthTrustedEvent" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, CONSTRAINT "PublicGrowthTrustedEvent_pkey" PRIMARY KEY ("id"))',
        'CREATE TABLE "AiUsageRecord" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "usageMode" "AiUsageMode" NOT NULL, "status" "AiUsageStatus" NOT NULL DEFAULT \'admitted\', CONSTRAINT "AiUsageRecord_pkey" PRIMARY KEY ("id"))',
        'CREATE INDEX "PublicGrowthDaily_name_day_idx" ON "PublicGrowthDaily"("name", "day")',
        'CREATE UNIQUE INDEX "PublicGrowthDaily_day_name_locale_widthRange_uiVersion_demo_key" ON "PublicGrowthDaily"("day", "name", "locale", "widthRange", "uiVersion", "demoStep")',
        'CREATE INDEX "PublicGrowthTrustedEvent_createdAt_idx" ON "PublicGrowthTrustedEvent"("createdAt")',
        'CREATE UNIQUE INDEX "PublicGrowthTrustedEvent_name_deduplicationKey_key" ON "PublicGrowthTrustedEvent"("name", "deduplicationKey")',
        'CREATE INDEX "AiUsageRecord_organizationId_usageMode_createdAt_idx" ON "AiUsageRecord"("organizationId", "usageMode", "createdAt")',
        'CREATE INDEX "AiUsageRecord_organizationId_status_createdAt_idx" ON "AiUsageRecord"("organizationId", "status", "createdAt")',
        'CREATE INDEX "AiUsageRecord_createdAt_idx" ON "AiUsageRecord"("createdAt")',
        'ALTER TABLE "AiUsageRecord" ADD CONSTRAINT "AiUsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE',
      ];
      const sql = `${statements.join(';\n')};\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: [
          'Subscription',
          'AiProviderSetting',
          'PublicGrowthDaily',
          'PublicGrowthTrustedEvent',
          'AiUsageRecord',
        ],
        allowedEnums: ['AiUsageMode', 'AiUsageStatus'],
        mode: 'update',
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('15 explicitly selected statement(s)');
    });
  });

  test('allows a selected product change while leaving a Mastra drift out of the selection', () => {
    const statement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${statement}\nDROP TABLE "mastra_workflow_snapshot";\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('ignores DROP INDEX only when the structurally targeted index is Mastra-owned', () => {
    const statement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${statement}\nDROP INDEX "mastra_ai_spans_trace_idx";\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('allows an explicitly selected added column', () => {
    const statement = 'ALTER TABLE "TelegramUpdateFailureState" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0;';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('does not ignore a destructive User change merely because its constraint name starts with mastra_', () => {
    const statement = 'ALTER TABLE "User" DROP CONSTRAINT "mastra_legacy_fk";';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['User'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('destructive');
  });

  test('does not ignore an index on User merely because the index name starts with mastra_', () => {
    const statement = 'CREATE INDEX "mastra_shadow_idx" ON "User"("id");';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('absent from --allow-table');
  });

  test('requires exact SQL rather than normalising spaces inside a string literal', () => {
    const diffStatement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT DEFAULT \'two  spaces\';';
    const selectedStatement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT DEFAULT \'two spaces\';';
    const result = runGuard({
      diff: `${diffStatement}\n`,
      selected: `${selectedStatement}\n`,
      allowedTables: ['User'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not printed by the current migrate diff');
  });

  test('refuses CREATE INDEX CONCURRENTLY because apply uses one transaction', () => {
    const statement = 'CREATE INDEX CONCURRENTLY "User_id_idx" ON "User"("id");';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['User'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CONCURRENTLY');
  });

  test('refuses a destructive operation even for an explicitly allowed product table', () => {
    const statement = 'DROP TABLE "TelegramUpdateFailureState";';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('destructive');
  });

  test('refuses Mastra-owned storage even when it appears in the current diff', () => {
    const statement = 'CREATE TABLE "mastra_workflow_snapshot" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['mastra_workflow_snapshot'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Mastra-owned');
  });

  test('refuses a hand-written statement that is absent from the current diff', () => {
    const diffStatement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
    const selectedStatement = 'CREATE TABLE "UnexpectedTable" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${diffStatement}\n`,
      selected: `${selectedStatement}\n`,
      allowedTables: ['UnexpectedTable'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('current migrate diff');
  });

  test('refuses a diff statement for a table that was not explicitly selected', () => {
    const statement = 'CREATE TABLE "UnexpectedTable" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('absent from --allow-table');
  });

  test('refuses a non-additive alteration even for an explicitly selected table', () => {
    const statement = 'ALTER TABLE "TelegramUpdateFailureState" ALTER COLUMN "id" TYPE UUID;';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('allowed additive');
  });

  test('refuses an empty selection', () => {
    const result = runGuard({
      diff: 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);\n',
      selected: '',
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('selected SQL');
  });

  test('refuses an unknown operation in the current diff', () => {
    const statement = 'CREATE SCHEMA "unexpected";';
    const result = runGuard({
      diff: `${statement}\n`,
      selected: `${statement}\n`,
      allowedTables: ['User'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown schema operation');
  });

  test('refuses an unselected destructive drift for another product table', () => {
    const selectedStatement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
    const result = runGuard({
      diff: `${selectedStatement}\nDROP TABLE "User";\n`,
      selected: `${selectedStatement}\n`,
      allowedTables: ['TelegramUpdateFailureState'],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('current migrate diff contains a destructive');
  });

  test('refuses an incomplete selection for an explicitly selected table', () => {
    const table = 'TelegramUpdateFailureState';
    const createTable = `CREATE TABLE "${table}" ("id" TEXT NOT NULL PRIMARY KEY);`;
    const createIndex = `CREATE INDEX "${table}_id_idx" ON "${table}"("id");`;
    const result = runGuard({
      diff: `${createTable}\n${createIndex}\n`,
      selected: `${createTable}\n`,
      allowedTables: [table],
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('omits a statement');
  });

  describe('referential actions on a foreign key', () => {
    const createTable = 'CREATE TABLE "UserIdentity" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL);';

    test.each([
      'ON DELETE CASCADE ON UPDATE CASCADE',
      'ON DELETE RESTRICT ON UPDATE CASCADE',
      'ON DELETE SET NULL ON UPDATE NO ACTION',
      'ON DELETE SET DEFAULT ON UPDATE RESTRICT',
    ])('allows a foreign key printed with %s', (actions) => {
      const foreignKey =
        'ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" ' +
        `FOREIGN KEY ("userId") REFERENCES "User"("id") ${actions};`;
      const sql = `${createTable}\n${foreignKey}\n`;
      const result = runGuard({ diff: sql, selected: sql, allowedTables: ['UserIdentity'] });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('still refuses a DROP standing next to a referential action', () => {
      const statement =
        'ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" ' +
        'FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE, ' +
        'DROP COLUMN "legacyUserId";';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['UserIdentity'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('refuses a referential keyword that is not a referential action', () => {
      const statement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT DEFAULT \'ON DELETE ROWS\';';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['User'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });
  });

  describe('bootstrap requires a --from-empty diff', () => {
    test('refuses a diff that alters a table it does not create', () => {
      const statement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT;';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        mode: 'bootstrap',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--from-empty');
    });

    test('refuses an index on a table the diff does not create', () => {
      const statement = 'CREATE INDEX "User_email_idx" ON "User"("email");';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        mode: 'bootstrap',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--from-empty');
    });

    test('accepts an index on a table the same diff creates', () => {
      const sql =
        'CREATE TABLE "UserIdentity" ("id" TEXT NOT NULL PRIMARY KEY);\n' +
        'CREATE INDEX "UserIdentity_id_idx" ON "UserIdentity"("id");\n';
      const result = runGuard({ diff: sql, selected: sql, mode: 'bootstrap' });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });
  });

  describe('statement splitting', () => {
    test('does not split on a semicolon inside a string literal', () => {
      const statement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT DEFAULT \'a;b\';';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['User'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('keeps a doubled quote inside a literal intact', () => {
      const statement = 'ALTER TABLE "User" ADD COLUMN "note" TEXT DEFAULT \'it\'\'s;\';';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['User'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('reads a doubled quote inside a quoted identifier as one table name', () => {
      const statement = 'CREATE TABLE "We""ird" ("id" TEXT NOT NULL PRIMARY KEY);';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['We"ird'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('splits two statements written on one line', () => {
      const first = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY)';
      const second = 'DROP TABLE "User"';
      const result = runGuard({
        diff: `${first}; ${second};\n`,
        selected: `${first};\n`,
        allowedTables: ['TelegramUpdateFailureState'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('does not let a line comment glue a DROP onto a permitted statement', () => {
      const create = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL PRIMARY KEY);';
      const result = runGuard({
        diff: `-- CreateTable\n${create}\n-- DropTable\nDROP TABLE "User";\n`,
        selected: `-- CreateTable\n${create}\n`,
        allowedTables: ['TelegramUpdateFailureState'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    // A block comment collapses to a space, and the recognisers expect the
    // single spacing Prisma prints. A statement carrying a comment inside it is
    // therefore unrecognised and refused rather than parsed loosely. Prisma
    // never writes one, so this only closes a hand-edited file.
    test('refuses a statement carrying a block comment between its keywords', () => {
      const statement = 'CREATE TABLE /* note */ "TelegramUpdateFailureState" ("id" TEXT);';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['TelegramUpdateFailureState'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown schema operation');
    });

    test('keeps a dollar-quoted body as one statement', () => {
      const statement = 'DO $$ BEGIN DROP TABLE "User"; END $$;';
      const result = runGuard({
        diff: `${statement}\n`,
        selected: `${statement}\n`,
        allowedTables: ['User'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unknown schema operation');
    });

    test('refuses an unterminated string literal', () => {
      const result = runGuard({
        diff: 'CREATE TABLE "User" ("id" TEXT DEFAULT \'oops);\n',
        selected: 'CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);\n',
        allowedTables: ['User'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unterminated SQL literal');
    });

    test('refuses an unterminated block comment', () => {
      const result = runGuard({
        diff: 'CREATE TABLE "User" ("id" TEXT); /* oops\n',
        selected: 'CREATE TABLE "User" ("id" TEXT);\n',
        allowedTables: ['User'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unterminated block comment');
    });
  });

  describe('argument parsing', () => {
    let diffFile;
    let selectedFile;

    beforeAll(() => {
      const statement = 'CREATE TABLE "TelegramUpdateFailureState" ("id" TEXT NOT NULL);\n';
      diffFile = writeFixture('args-diff.sql', statement);
      selectedFile = writeFixture('args-selected.sql', statement);
    });

    test.each([
      ['no arguments at all', () => []],
      ['an unknown flag', () => ['--diff', diffFile, '--selected', selectedFile, '--force', 'yes']],
      ['a flag without its value', () => ['--diff', diffFile, '--selected']],
      ['a missing --selected', () => ['--diff', diffFile, '--allow-table', 'User']],
      ['a missing --diff', () => ['--selected', selectedFile, '--allow-table', 'User']],
      [
        'an unknown mode',
        () => ['--diff', diffFile, '--selected', selectedFile, '--mode', 'migrate'],
      ],
      ['update without --allow-table', () => ['--diff', diffFile, '--selected', selectedFile]],
      [
        'bootstrap together with --allow-table',
        () => [
          '--diff',
          diffFile,
          '--selected',
          selectedFile,
          '--mode',
          'bootstrap',
          '--allow-table',
          'TelegramUpdateFailureState',
        ],
      ],
      [
        'bootstrap together with --allow-enum',
        () => [
          '--diff',
          diffFile,
          '--selected',
          selectedFile,
          '--mode',
          'bootstrap',
          '--allow-enum',
          'AiUsageMode',
        ],
      ],
      [
        '--allow-enum without its value',
        () => ['--diff', diffFile, '--selected', selectedFile, '--allow-enum'],
      ],
    ])('refuses %s', (_name, buildArguments) => {
      const result = runGuardWithArguments(buildArguments());

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('usage: node validate-prisma-migration-sql.cjs');
      expect(result.stdout).toBe('');
    });

    test('accepts repeated --allow-table flags', () => {
      const result = runGuardWithArguments([
        '--diff',
        diffFile,
        '--selected',
        selectedFile,
        '--allow-table',
        'User',
        '--allow-table',
        'TelegramUpdateFailureState',
      ]);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('accepts repeated --allow-enum flags', () => {
      const sql =
        'CREATE TYPE "AiUsageMode" AS ENUM (\'included\', \'workspace_key\');\n' +
        'CREATE TYPE "AiUsageStatus" AS ENUM (\'admitted\', \'succeeded\', \'failed\');\n';
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedEnums: ['AiUsageMode', 'AiUsageStatus'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });

    test('accepts an update that names only an enum', () => {
      const sql = 'CREATE TYPE "AiUsageStatus" AS ENUM (\'admitted\', \'succeeded\', \'failed\');\n';
      const result = runGuard({ diff: sql, selected: sql, allowedEnums: ['AiUsageStatus'] });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });
  });

  /**
   * `content-factory-next-fn33.32`. Deleting a workspace together with its
   * content needs `ON DELETE CASCADE` on the Organization relations, and
   * PostgreSQL has no `ALTER CONSTRAINT` for a delete rule: `prisma migrate
   * diff` prints a drop of the foreign key followed by the same name added
   * back. Refusing that pair left the whole change with no reviewable path,
   * so the guard admits the drop — but only as one half of the pair.
   */
  describe('a foreign-key delete-rule swap', () => {
    const drop = 'ALTER TABLE "Tags" DROP CONSTRAINT "Tags_orgId_fkey";';
    const add =
      'ALTER TABLE "Tags" ADD CONSTRAINT "Tags_orgId_fkey" FOREIGN KEY ("orgId") ' +
      'REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;';

    test('passes when the same file adds the constraint back', () => {
      const sql = `-- DropForeignKey\n${drop}\n\n-- AddForeignKey\n${add}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('2 explicitly selected statement(s)');
    });

    test('refuses a drop the file never adds back', () => {
      const sql = `${drop}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('refuses a drop that is added back on another table', () => {
      const sql =
        `${drop}\n` +
        'ALTER TABLE "UsedCodes" ADD CONSTRAINT "Tags_orgId_fkey" FOREIGN KEY ("orgId") ' +
        'REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;\n';
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags', 'UsedCodes'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    // `CASCADE` on the drop takes every dependent object with the constraint,
    // which is a different operation from putting the same key back.
    test('refuses DROP CONSTRAINT ... CASCADE even when the name comes back', () => {
      const sql =
        'ALTER TABLE "Tags" DROP CONSTRAINT "Tags_orgId_fkey" CASCADE;\n' +
        `${add}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    // The operator runs the selected file, so that file has to restore what it
    // drops. An add left behind in the diff excuses nothing.
    test('refuses a selected drop whose add stayed in the diff', () => {
      const result = runGuard({
        diff: `${drop}\n${add}\n`,
        selected: `${drop}\n`,
        allowedTables: ['Tags'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('still refuses a table drop standing next to a swap', () => {
      const sql = `${drop}\n${add}\nDROP TABLE "Tags";\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('still refuses a column drop standing next to a swap', () => {
      const sql =
        `${drop}\n${add}\n` +
        'ALTER TABLE "Tags" DROP COLUMN "color";\n';
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['Tags'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('destructive');
    });

    test('holds the swapped table to --allow-table like any other statement', () => {
      const sql = `${drop}\n${add}\n`;
      const result = runGuard({
        diff: sql,
        selected: sql,
        allowedTables: ['UsedCodes'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--allow-table');
    });
  });
});
