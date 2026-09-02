const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/**
 * `run-public-funnel-database-proof.cjs` builds its throwaway database from a
 * hand-written `CREATE TABLE`, not from `schema.prisma`. That is deliberate —
 * the proof exists to exercise the real Nest runtime against real PostgreSQL
 * without a Prisma migration step in the way — but it means the fixture and the
 * schema are two copies of one fact, and copies drift.
 *
 * They drifted twice. `User.language` was added and forgotten, and on
 * 02.09.2026 three Telegram columns were added and forgotten. Both times the
 * proof failed several layers from the omission, as
 *
 *     The column `User.telegramChatId` does not exist in the current database
 *
 * raised from inside `organization.repository.ts` — which reads as a broken
 * repository, not as a stale fixture. The second time it was reported as a
 * pre-existing failure unrelated to the change that caused it, and believed,
 * until a full run at root contradicted it.
 *
 * Prisma selects every column a model declares, so a column missing here is
 * not a partial fixture: it is a proof that cannot run. This guard names the
 * missing column directly, in the file that has to change.
 */

const SCALAR_TYPES = new Set([
  'String',
  'Int',
  'Boolean',
  'DateTime',
  'Float',
  'Decimal',
  'BigInt',
  'Json',
  'Bytes',
]);

function schemaText() {
  return fs.readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    ),
    'utf8'
  );
}

function proofText() {
  return fs.readFileSync(
    path.join(root, 'scripts/evidence/run-public-funnel-database-proof.cjs'),
    'utf8'
  );
}

/** Enum names declared in the schema; a field of one is a column, not a relation. */
function enumNames(schema) {
  return new Set([...schema.matchAll(/\nenum\s+(\w+)\s*\{/g)].map((m) => m[1]));
}

/**
 * The scalar columns of one model. A list type (`Post[]`) is a relation and
 * has no column; a named model type is a relation too. What is left is what
 * PostgreSQL has to provide.
 */
function scalarColumns(schema, model) {
  const block = schema.match(new RegExp(`\\nmodel ${model} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) {
    throw new Error(`schema.prisma no longer declares a model named ${model}`);
  }

  const enums = enumNames(schema);
  const columns = [];
  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

    const field = line.match(/^(\w+)\s+(\w+)(\[\])?/);
    if (!field) continue;

    const [, name, type, isList] = field;
    if (isList) continue;
    if (!SCALAR_TYPES.has(type) && !enums.has(type)) continue;

    columns.push(name);
  }

  return columns;
}

/**
 * Column names from the fixture's `CREATE TABLE`. The type may be a bare
 * keyword (`TEXT`) or a quoted enum (`"Provider"`), so the name is taken as
 * the first quoted identifier on a line rather than by matching the type.
 */
function fixtureColumns(proof, table) {
  const block = proof.match(
    new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`)
  );
  if (!block) {
    throw new Error(
      `the funnel proof no longer creates a table named ${table}; this guard needs updating with it`
    );
  }

  const columns = [];
  for (const rawLine of block[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;
    // Skip table-level constraints, which also start with a quoted name.
    if (/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)\b/i.test(line)) continue;

    const name = line.match(/^"(\w+)"/);
    if (name) columns.push(name[1]);
  }

  return columns;
}

describe('the funnel proof builds a User table the schema can actually use', () => {
  test('every scalar column of the User model exists in the fixture', () => {
    const schema = schemaText();
    const declared = scalarColumns(schema, 'User');
    const built = new Set(fixtureColumns(proofText(), 'User'));

    // Sanity: if the parsing above ever silently stops finding fields, the
    // comparison would pass by being empty rather than by being right.
    expect(declared.length).toBeGreaterThan(20);

    const missing = declared.filter((column) => !built.has(column));
    expect({
      missing,
      hint: missing.length
        ? 'Add these columns to CREATE TABLE "User" in scripts/evidence/run-public-funnel-database-proof.cjs. Prisma selects every column the model declares, so the proof cannot run without them.'
        : 'in step',
    }).toEqual({ missing: [], hint: 'in step' });
  });
});
