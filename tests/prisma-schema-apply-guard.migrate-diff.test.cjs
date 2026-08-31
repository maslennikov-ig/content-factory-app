// Runs the production SQL apply guard against SQL that Prisma actually prints
// for this repository's schema, rather than against hand-written fixtures.
//
// The guard once rejected every foreign key because it looked for the word
// DELETE anywhere in a statement, and Prisma writes `ON DELETE RESTRICT` on
// every foreign key it creates. The hand-written fixture in the sibling suite
// omitted those clauses, so the whole documented procedure was unusable while
// twenty-two tests stayed green. These tests read the SQL from Prisma so that
// the same class of mismatch cannot hide again.
//
// Nothing here connects to a database: `--from-empty` and
// `--from-schema-datamodel` both compare two schema files.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const guardScript = path.join(root, 'scripts/operations/validate-prisma-migration-sql.cjs');
const schemaPath = path.join(root, 'libraries/nestjs-libraries/src/database/prisma/schema.prisma');
const prismaCli = require.resolve('prisma/build/index.js');

// A failure to create the workspace must fail the suite. A skip here would
// report success while running nothing, which is the failure mode this file
// exists to prevent.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-prisma-migrate-diff-'));

afterAll(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

function migrateDiff(from, to) {
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'diff', ...from, ...to, '--script', '--exit-code'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );

  // 0 means no difference, 2 means a non-empty diff, 1 means the CLI failed.
  expect(result.stderr).not.toMatch(/Error/i);
  expect(result.status).toBe(2);
  return result.stdout;
}

// Splits printed SQL the way an operator selects statements by hand: on the
// statement terminator. The diffs used here contain no dollar-quoted body and
// no semicolon inside a literal, which is what makes this safe; the guard does
// the rigorous parsing.
function statementsOf(sql) {
  return sql
    .split(/;\r?\n/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function targetTableOf(statement) {
  const match =
    statement.match(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/i) ||
    statement.match(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/i) ||
    statement.match(/ALTER TABLE (?:ONLY )?"([^"]+)"/i) ||
    statement.match(/CREATE TYPE "([^"]+)"/i);
  if (!match) throw new Error(`unrecognised statement in printed SQL: ${statement.slice(0, 90)}`);
  return match[1];
}

function isMastra(statement) {
  return targetTableOf(statement).toLowerCase().startsWith('mastra_');
}

function writeSql(name, statements) {
  const file = path.join(workspace, name);
  fs.writeFileSync(file, `${statements.join(';\n')};\n`);
  return file;
}

function runGuard({ diffFile, selectedFile, mode, allowedTables = [], allowedEnums = [] }) {
  const args = [guardScript, '--diff', diffFile, '--selected', selectedFile];
  if (mode) args.push('--mode', mode);
  for (const table of allowedTables) args.push('--allow-table', table);
  for (const enumType of allowedEnums) args.push('--allow-enum', enumType);
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

// Removes a model block. It throws when the model is gone, so a schema rename
// fails this suite instead of quietly turning it into a test of nothing.
function removeModel(schema, model) {
  const block = new RegExp(`^model ${model} \\{[\\s\\S]*?^\\}\\n?`, 'm');
  if (!block.test(schema)) {
    throw new Error(`model ${model} is no longer in schema.prisma`);
  }
  return schema.replace(block, '');
}

// Same contract as removeModel, for an enum block.
function removeEnum(schema, name) {
  const block = new RegExp(`^enum ${name} \\{[\\s\\S]*?^\\}\\n?`, 'm');
  if (!block.test(schema)) {
    throw new Error(`enum ${name} is no longer in schema.prisma`);
  }
  return schema.replace(block, '');
}

// Removes one field line, matched with its type so that a field name shared by
// two models cannot be taken out of the wrong one. An absent line throws.
function removeFieldLine(schema, field, type) {
  const line = new RegExp(`^\\s*${field}\\s+${type}\\b.*$\\n`, 'm');
  if (!line.test(schema)) {
    throw new Error(`field ${field} ${type} is no longer in schema.prisma`);
  }
  return schema.replace(line, '');
}

// Removes the list fields that point at a model being taken out. Same rule: an
// absent field is a schema change this suite has to notice.
function removeRelationField(schema, model) {
  const field = new RegExp(`^\\s*\\w+\\s+${model}\\[\\]\\s*$\\n`, 'm');
  if (!field.test(schema)) {
    throw new Error(`no relation field for ${model} in schema.prisma`);
  }
  return schema.replace(new RegExp(`^\\s*\\w+\\s+${model}\\[\\]\\s*$\\n`, 'gm'), '');
}

// The state of the schema before tasks `content-factory-next-rmp` and
// `content-factory-next-omx` added their tables. Diffing forward from it prints
// the SQL an operator actually applies for this epic: two tables, each with a
// relation to an existing table and `onDelete: Cascade`, which is exactly what
// the old guard refused.
function schemaWithoutEpicTables() {
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = removeRelationField(schema, 'UserIdentity');
  schema = removeRelationField(schema, 'ProductEvent');
  schema = removeModel(schema, 'UserIdentity');
  schema = removeModel(schema, 'ProductEvent');
  return schema;
}

function schemaWithoutNewsletterDeliveryState() {
  let schema = fs.readFileSync(schemaPath, 'utf8');
  for (const field of [
    'newsletterDeliveryPendingAt',
    'newsletterDeliveredAt',
    'newsletterDeliveryLeaseId',
    'newsletterDeliveryLeaseExpiresAt',
  ]) {
    const type = field === 'newsletterDeliveryLeaseId' ? 'String' : 'DateTime';
    const line = new RegExp(`^\\s*${field}\\s+${type}\\?\\s*$\\n`, 'm');
    if (!line.test(schema)) {
      throw new Error(`${field} is no longer in schema.prisma`);
    }
    schema = schema.replace(line, '');
  }
  for (const fields of [
    'newsletterDeliveryPendingAt',
    'newsletterDeliveryLeaseExpiresAt, newsletterDeliveryPendingAt',
  ]) {
    const index = new RegExp(`^\\s*@@index\\(\\[${fields}\\]\\)\\s*$\\n`, 'm');
    if (!index.test(schema)) {
      throw new Error(`newsletter delivery index is missing: ${fields}`);
    }
    schema = schema.replace(index, '');
  }
  return schema;
}

// The schema as `main` has it, before the cloud-first SaaS slice. Diffing
// forward from it prints the fifteen statements the operator applies for this
// branch, two of which are `CREATE TYPE ... AS ENUM`. Before `--allow-enum`
// those two had to be applied by a separate `psql` outside the guard.
function schemaWithoutSaasSlice() {
  let schema = fs.readFileSync(schemaPath, 'utf8');
  schema = removeRelationField(schema, 'AiUsageRecord');
  schema = removeModel(schema, 'AiUsageRecord');
  schema = removeModel(schema, 'PublicGrowthDaily');
  schema = removeModel(schema, 'PublicGrowthTrustedEvent');
  schema = removeFieldLine(schema, 'usageMode', 'AiUsageMode');
  schema = removeFieldLine(schema, 'includedAiMonthlyOperations', 'Int');
  schema = removeEnum(schema, 'AiUsageMode');
  schema = removeEnum(schema, 'AiUsageStatus');
  return schema;
}

describe('Prisma production SQL apply guard against real migrate diff output', () => {
  describe('bootstrap over the whole repository schema', () => {
    let printed;

    beforeAll(() => {
      printed = migrateDiff(['--from-empty'], ['--to-schema-datamodel', schemaPath]);
    });

    test('the printed SQL really does carry referential actions on its foreign keys', () => {
      const foreignKeys = statementsOf(printed).filter((statement) =>
        /ADD CONSTRAINT .* FOREIGN KEY/i.test(statement)
      );

      expect(foreignKeys.length).toBeGreaterThan(0);
      for (const statement of foreignKeys) {
        expect(statement).toMatch(/ON DELETE /i);
        expect(statement).toMatch(/ON UPDATE /i);
      }
    });

    test('the schema no longer describes any Mastra storage', () => {
      // Eight `mastra_*` models used to sit in this schema; they arrived with
      // an upstream `prisma db pull` and described a database Mastra manages
      // itself. Nothing here owned them, so every diff carried them as noise.
      // If a future `db pull` puts them back, this is where it shows.
      expect(statementsOf(printed).filter(isMastra)).toEqual([]);
    });

    test('accepts the complete product selection', () => {
      const all = statementsOf(printed);

      expect(all.length).toBeGreaterThan(0);

      const result = runGuard({
        diffFile: writeSql('bootstrap-diff.sql', all),
        selectedFile: writeSql('bootstrap-selected.sql', all),
        mode: 'bootstrap',
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${all.length} explicitly selected statement(s)`);
    });

    test('still refuses a selection that keeps a Mastra table', () => {
      // The schema no longer prints one, so the statement is synthesised here.
      // The guard's refusal is what protects a database where Mastra storage
      // does live, and that has to keep working after the models are gone.
      const mastra =
        'CREATE TABLE "mastra_threads" ("id" TEXT NOT NULL, CONSTRAINT "mastra_threads_pkey" PRIMARY KEY ("id"))';
      const product = statementsOf(printed);

      expect(isMastra(mastra)).toBe(true);

      const result = runGuard({
        diffFile: writeSql('bootstrap-diff.sql', [...product, mastra]),
        selectedFile: writeSql('bootstrap-selected.sql', [...product, mastra]),
        mode: 'bootstrap',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Mastra-owned');
    });
  });

  describe('update with the two tables the epic adds', () => {
    let printed;

    beforeAll(() => {
      const probe = path.join(workspace, 'pre-epic-schema.prisma');
      fs.writeFileSync(probe, schemaWithoutEpicTables());
      printed = migrateDiff(
        ['--from-schema-datamodel', probe],
        ['--to-schema-datamodel', schemaPath]
      );
    });

    test('prints cascading foreign keys for both new tables', () => {
      expect(printed).toMatch(
        /ALTER TABLE "UserIdentity" ADD CONSTRAINT .* ON DELETE CASCADE ON UPDATE CASCADE/
      );
      expect(printed).toMatch(
        /ALTER TABLE "ProductEvent" ADD CONSTRAINT .* ON DELETE CASCADE ON UPDATE CASCADE/
      );
    });

    test('accepts both new tables when both are named by --allow-table', () => {
      const all = statementsOf(printed);
      const result = runGuard({
        diffFile: writeSql('update-diff.sql', all),
        selectedFile: writeSql('update-selected.sql', all),
        allowedTables: ['UserIdentity', 'ProductEvent'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`${all.length} explicitly selected statement(s)`);
    });

    test('refuses the same diff when one of the two tables is not named', () => {
      const all = statementsOf(printed);
      const result = runGuard({
        diffFile: writeSql('update-diff.sql', all),
        selectedFile: writeSql('update-selected.sql', all),
        allowedTables: ['UserIdentity'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-table');
    });

    test('refuses to run this update diff through the bootstrap block', () => {
      const all = statementsOf(printed);
      // A real update diff also alters tables it does not create; this one only
      // adds tables, so the check is strengthened with such a statement.
      const withExistingTable = [...all, 'ALTER TABLE "User" ADD COLUMN "note" TEXT'];
      const result = runGuard({
        diffFile: writeSql('update-diff.sql', withExistingTable),
        selectedFile: writeSql('update-selected.sql', withExistingTable),
        mode: 'bootstrap',
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--from-empty');
    });
  });

  describe('update with the cloud-first SaaS slice', () => {
    let printed;

    beforeAll(() => {
      const probe = path.join(workspace, 'pre-saas-slice-schema.prisma');
      fs.writeFileSync(probe, schemaWithoutSaasSlice());
      printed = migrateDiff(
        ['--from-schema-datamodel', probe],
        ['--to-schema-datamodel', schemaPath]
      );
    });

    test('prints the two enums the deploy had to apply by hand', () => {
      expect(printed).toContain(
        'CREATE TYPE "AiUsageMode" AS ENUM (\'included\', \'workspace_key\');'
      );
      expect(printed).toContain(
        'CREATE TYPE "AiUsageStatus" AS ENUM (\'admitted\', \'succeeded\', \'failed\');'
      );
    });

    test('accepts the whole slice in one pass with two enums and five tables', () => {
      const all = statementsOf(printed);
      // Prisma prefixes each statement with a `-- CreateEnum` style comment,
      // which `statementsOf` keeps in the same chunk, so the match is not anchored.
      const enums = all.filter((statement) => /CREATE TYPE "/i.test(statement));

      expect(enums).toHaveLength(2);
      expect(all).toHaveLength(15);

      const result = runGuard({
        diffFile: writeSql('saas-slice-diff.sql', all),
        selectedFile: writeSql('saas-slice-selected.sql', all),
        allowedTables: [
          'Subscription',
          'AiProviderSetting',
          'PublicGrowthDaily',
          'PublicGrowthTrustedEvent',
          'AiUsageRecord',
        ],
        allowedEnums: ['AiUsageMode', 'AiUsageStatus'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('15 explicitly selected statement(s)');
    });

    test('refuses the same slice when one enum is left unnamed', () => {
      const all = statementsOf(printed);
      const result = runGuard({
        diffFile: writeSql('saas-slice-diff.sql', all),
        selectedFile: writeSql('saas-slice-selected.sql', all),
        allowedTables: [
          'Subscription',
          'AiProviderSetting',
          'PublicGrowthDaily',
          'PublicGrowthTrustedEvent',
          'AiUsageRecord',
        ],
        allowedEnums: ['AiUsageMode'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-enum');
    });

    test('refuses the same slice when one table is left unnamed', () => {
      const all = statementsOf(printed);
      const result = runGuard({
        diffFile: writeSql('saas-slice-diff.sql', all),
        selectedFile: writeSql('saas-slice-selected.sql', all),
        allowedTables: [
          'Subscription',
          'AiProviderSetting',
          'PublicGrowthDaily',
          'PublicGrowthTrustedEvent',
        ],
        allowedEnums: ['AiUsageMode', 'AiUsageStatus'],
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent from --allow-table');
    });
  });

  describe('update with durable newsletter delivery state', () => {
    test('accepts the exact additive User diff when User is named', () => {
      const probe = path.join(workspace, 'pre-newsletter-delivery-schema.prisma');
      fs.writeFileSync(probe, schemaWithoutNewsletterDeliveryState());
      const printed = migrateDiff(
        ['--from-schema-datamodel', probe],
        ['--to-schema-datamodel', schemaPath]
      );
      expect(printed).toMatch(
        /ALTER TABLE "User" ADD COLUMN\s+"newsletterDeliveredAt" TIMESTAMP\(3\)/
      );
      expect(printed).toMatch(
        /ADD COLUMN\s+"newsletterDeliveryPendingAt" TIMESTAMP\(3\)/
      );
      expect(printed).toMatch(
        /ADD COLUMN\s+"newsletterDeliveryLeaseId" TEXT/
      );
      expect(printed).toMatch(
        /ADD COLUMN\s+"newsletterDeliveryLeaseExpiresAt" TIMESTAMP\(3\)/
      );
      expect(printed).toMatch(
        /CREATE INDEX "User_newsletterDeliveryPendingAt_idx" ON "User"/
      );
      expect(printed).toMatch(
        /CREATE INDEX "User_newsletterDeliveryLeaseExpiresAt_newsletterDeliveryPen_idx" ON "User"/
      );

      const all = statementsOf(printed);
      const result = runGuard({
        diffFile: writeSql('newsletter-delivery-diff.sql', all),
        selectedFile: writeSql('newsletter-delivery-selected.sql', all),
        allowedTables: ['User'],
      });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });
  });
});
