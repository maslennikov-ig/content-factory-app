#!/usr/bin/env node

const fs = require('node:fs');

function fail(message) {
  process.stderr.write(`Prisma SQL apply guard: ${message}\n`);
  process.exitCode = 1;
}

function usage() {
  fail(
    'usage: node validate-prisma-migration-sql.cjs --diff <migrate-diff.sql> ' +
      '--selected <own-change.sql> [--mode update --allow-table <table> ... ' +
      '[--allow-enum <EnumType> ...] | --mode bootstrap]\n' +
      '  --allow-enum names one enum type that `CREATE TYPE ... AS ENUM` may create in\n' +
      '  update mode. It admits nothing else: `ALTER TYPE ... ADD VALUE` stays refused\n' +
      '  because a value added inside a transaction cannot be used in that same\n' +
      '  transaction, and apply runs in one.\n' +
      '  `ALTER TABLE ... DROP CONSTRAINT ...` passes only when the same file adds the\n' +
      '  same constraint back as a FOREIGN KEY; that pair is how a delete rule is\n' +
      '  changed. DROP TABLE and DROP COLUMN stay refused.'
  );
}

function parseArguments(argv) {
  const options = { allowTables: [], allowEnums: [], mode: 'update' };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !['--diff', '--selected', '--allow-table', '--allow-enum', '--mode'].includes(flag) ||
      !value
    ) {
      usage();
      return null;
    }
    index += 1;
    if (flag === '--diff') options.diff = value;
    if (flag === '--selected') options.selected = value;
    if (flag === '--allow-table') options.allowTables.push(value);
    if (flag === '--allow-enum') options.allowEnums.push(value);
    if (flag === '--mode') options.mode = value;
  }

  // `update` works from an explicit list and needs at least one name on it;
  // which kind of name depends on the diff, and a diff that only adds an enum
  // has no table to name. `bootstrap` takes no list at all.
  const namedNothing = options.allowTables.length === 0 && options.allowEnums.length === 0;
  if (
    !options.diff ||
    !options.selected ||
    !['update', 'bootstrap'].includes(options.mode) ||
    (options.mode === 'update' && namedNothing) ||
    (options.mode === 'bootstrap' && !namedNothing)
  ) {
    usage();
    return null;
  }
  return options;
}

function splitStatements(sql) {
  const statements = [];
  let statement = '';
  let quote = null;
  let dollarQuote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (dollarQuote) {
      if (sql.startsWith(dollarQuote, index)) {
        statement += dollarQuote;
        index += dollarQuote.length - 1;
        dollarQuote = null;
      } else {
        statement += character;
      }
      continue;
    }

    if (quote === "'") {
      statement += character;
      if (character === "'" && next === "'") {
        statement += next;
        index += 1;
      } else if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === '"') {
      statement += character;
      if (character === '"' && next === '"') {
        statement += next;
        index += 1;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }

    if (character === '-' && next === '-') {
      const end = sql.indexOf('\n', index + 2);
      if (end === -1) break;
      statement += ' ';
      index = end;
      continue;
    }

    if (character === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) throw new Error('unterminated block comment');
      statement += ' ';
      index = end + 1;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      statement += character;
      continue;
    }

    if (character === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarQuote = match[0];
        statement += dollarQuote;
        index += dollarQuote.length - 1;
        continue;
      }
    }

    if (character === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
      continue;
    }
    statement += character;
  }

  if (quote || dollarQuote) throw new Error('unterminated SQL literal');
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

// Prisma prints a referential action on every foreign key it creates:
// `... REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE`.
// The words DELETE and UPDATE there are part of the constraint definition, not
// an operation on data, so they are removed from a copy of the statement before
// the destructive-keyword check. Only this exact shape is removed; a real
// `DELETE FROM` or `UPDATE ... SET` keeps its keyword and is still refused.
const REFERENTIAL_ACTION =
  /\bON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|RESTRICT|NO\s+ACTION|SET\s+NULL|SET\s+DEFAULT)\b/gi;

function withoutReferentialActions(statement) {
  return statement.replace(REFERENTIAL_ACTION, ' ');
}

function isDestructiveStatement(statement) {
  return /\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|GRANT|REVOKE)\b/i.test(
    withoutReferentialActions(statement)
  );
}

function objectName(identifier) {
  const lastPart = identifier.trim().split('.').at(-1);
  return lastPart.replace(/^"|"$/g, '').replaceAll('""', '"');
}

const IDENTIFIER = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)(?:\\.(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*))?';

function targetForStatement(statement) {
  const createType = new RegExp(`^CREATE TYPE (${IDENTIFIER}) AS ENUM\\s*\\(`, 'i');
  const createTable = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?(${IDENTIFIER})\\s*\\(`, 'i');
  const createIndex = new RegExp(`^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(${IDENTIFIER}) ON (${IDENTIFIER})\\s*\\(`, 'i');
  const alterTable = new RegExp(`^ALTER TABLE (?:ONLY )?(${IDENTIFIER})(?=\\s|$)`, 'i');
  const dropTable = new RegExp(`^DROP TABLE (?:IF EXISTS )?(${IDENTIFIER})(?=\\s|$)`, 'i');
  const dropIndex = new RegExp(`^DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(${IDENTIFIER})(?=\\s|$)`, 'i');

  // `DROP INDEX` names no table, so its target is the index itself. That kind
  // exists for one reachable case: skipping a Mastra-owned index drop, which is
  // recognised before the destructive check. A `DROP INDEX` on any other index
  // is refused as destructive and never reaches the allow-list; removing an
  // index of ours is a separate migration plan, not a step of this procedure.
  for (const [kind, expression, capture] of [
    ['type', createType, 1],
    ['table', createTable, 1],
    ['table', createIndex, 2],
    ['table', alterTable, 1],
    ['table', dropTable, 1],
    ['index', dropIndex, 1],
  ]) {
    const match = statement.match(expression);
    if (match) return { kind, name: objectName(match[capture]) };
  }
  return null;
}

function isAllowedAdditiveStatement(statement) {
  const createTable = new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?${IDENTIFIER}\\s*\\(`, 'i');
  const createIndex = new RegExp(`^CREATE (?:UNIQUE )?INDEX ${IDENTIFIER} ON ${IDENTIFIER}\\s*\\(`, 'i');
  const alterAdd = new RegExp(`^ALTER TABLE (?:ONLY )?${IDENTIFIER} ADD (?:COLUMN |CONSTRAINT )`, 'i');
  return createTable.test(statement) || createIndex.test(statement) || alterAdd.test(statement);
}

function isCreateEnumStatement(statement) {
  return new RegExp(`^CREATE TYPE ${IDENTIFIER} AS ENUM\\s*\\(`, 'i').test(statement);
}

// Changing the delete rule of a foreign key has no `ALTER CONSTRAINT` in
// PostgreSQL, so `prisma migrate diff` prints the only shape there is: drop the
// constraint and add it again with the new rule. That drop removes no table, no
// column and no row — the constraint is back under the same name a few
// statements later — and refusing it would leave a whole class of change with
// no reviewable path at all.
//
// It is admitted only as one half of that pair. `constraintSwaps` holds
// `table::constraint` for every `ADD CONSTRAINT ... FOREIGN KEY` in the *same*
// file, so a drop whose constraint is never added back stays refused, and so
// does `DROP CONSTRAINT ... CASCADE`, which would take dependent objects with
// it. `DROP TABLE` and `DROP COLUMN` are untouched by this and stay refused.
const DROP_CONSTRAINT = new RegExp(
  `^ALTER TABLE (?:ONLY )?(${IDENTIFIER}) DROP CONSTRAINT (?:IF EXISTS )?(${IDENTIFIER})\\s*$`,
  'i'
);
const ADD_FOREIGN_KEY = new RegExp(
  `^ALTER TABLE (?:ONLY )?(${IDENTIFIER}) ADD CONSTRAINT (${IDENTIFIER}) FOREIGN KEY\\b`,
  'i'
);

function foreignKeySwapNames(statements) {
  const names = new Set();
  for (const statement of statements) {
    const match = statement.match(ADD_FOREIGN_KEY);
    if (match) names.add(`${objectName(match[1])}::${objectName(match[2])}`);
  }
  return names;
}

function isForeignKeySwapDrop(statement, constraintSwaps) {
  const match = statement.match(DROP_CONSTRAINT);
  if (!match) return false;
  return constraintSwaps.has(`${objectName(match[1])}::${objectName(match[2])}`);
}

// `CREATE TYPE ... AS ENUM` adds a type and touches no row, so it is additive
// in both modes. What differs is how the operator authorises it: `bootstrap`
// takes the whole non-Mastra diff, `update` requires the type to be named by
// `--allow-enum`, which `targetIsAllowedInMode` checks.
function isAllowedShape(statement, constraintSwaps) {
  return (
    isCreateEnumStatement(statement) ||
    isAllowedAdditiveStatement(statement) ||
    isForeignKeySwapDrop(statement, constraintSwaps)
  );
}

// `ALTER TYPE ... ADD VALUE` is additive, and it is still refused in both
// modes. PostgreSQL cannot use a value added by the running transaction, and
// before 12 it refuses the statement inside a transaction outright; apply runs
// everything in one transaction. Adding a value is therefore its own step with
// its own plan, not something this procedure can carry.
function isEnumValueAddition(statement) {
  return new RegExp(`^ALTER TYPE ${IDENTIFIER} ADD VALUE\\b`, 'i').test(statement);
}

// `bootstrap` takes no `--allow-table`, so the list of tables it may touch has
// to come from the diff itself. A `--from-empty` diff creates every table it
// then indexes or constrains; a diff taken against a live database does not.
// Requiring that property is what stops the bootstrap block from being pasted
// into an update, where it would run without an explicit table list.
function createdTableNames(diffStatements) {
  const created = new Set();
  for (const statement of diffStatements) {
    const target = targetForStatement(statement);
    if (!target || target.kind !== 'table') continue;
    if (new RegExp(`^CREATE TABLE (?:IF NOT EXISTS )?${IDENTIFIER}\\s*\\(`, 'i').test(statement)) {
      created.add(target.name);
    }
  }
  return created;
}

function targetIsAllowedInMode(target, options, createdTables) {
  if (options.mode === 'bootstrap') {
    if (target.kind === 'type') return true;
    return target.kind === 'table' && createdTables.has(target.name);
  }
  if (target.kind === 'type') return options.allowEnums.includes(target.name);
  return target.kind === 'table' && options.allowTables.includes(target.name);
}

function isMastraOwnedTarget(target) {
  return target.name.toLowerCase().startsWith('mastra_');
}

function isConcurrentIndex(statement) {
  return /^CREATE (?:UNIQUE )?INDEX CONCURRENTLY\b/i.test(statement);
}

function unknownTargetMessage(target, options) {
  if (options.mode === 'bootstrap') {
    return 'touches a table the current diff does not create; bootstrap requires a --from-empty diff';
  }
  return target.kind === 'type'
    ? `creates the enum type ${target.name}, which is absent from --allow-enum`
    : 'touches a table absent from --allow-table';
}

function validate(options) {
  const diffStatements = splitStatements(fs.readFileSync(options.diff, 'utf8'));
  const selectedStatements = splitStatements(fs.readFileSync(options.selected, 'utf8'));
  if (selectedStatements.length === 0) throw new Error('selected SQL contains no statements');

  const createdTables = createdTableNames(diffStatements);
  // Each file authorises its own drops. A drop in the selected SQL is not
  // excused by an add that stayed behind in the diff: the operator runs the
  // selected file, and that file alone has to put the constraint back.
  const diffConstraintSwaps = foreignKeySwapNames(diffStatements);
  const selectedConstraintSwaps = foreignKeySwapNames(selectedStatements);
  const createdEnums = new Set();
  const remainingDiffStatements = new Map();
  for (const statement of diffStatements) {
    if (isEnumValueAddition(statement)) {
      throw new Error(
        'current migrate diff contains ALTER TYPE ... ADD VALUE, which cannot be used in the transaction that adds it'
      );
    }
    const target = targetForStatement(statement);
    if (!target) throw new Error('current migrate diff contains an unknown schema operation');
    if (isMastraOwnedTarget(target)) continue;
    if (
      !isForeignKeySwapDrop(statement, diffConstraintSwaps) &&
      isDestructiveStatement(statement)
    ) {
      throw new Error('current migrate diff contains a destructive or data-changing operation');
    }
    if (isConcurrentIndex(statement)) {
      throw new Error('current migrate diff contains CREATE INDEX CONCURRENTLY, which cannot run in one transaction');
    }
    if (!isAllowedShape(statement, diffConstraintSwaps)) {
      throw new Error('current migrate diff contains an operation that is not allowed additive schema operation');
    }
    if (!targetIsAllowedInMode(target, options, createdTables)) {
      throw new Error(`current migrate diff ${unknownTargetMessage(target, options)}`);
    }
    if (target.kind === 'type') createdEnums.add(target.name);
    remainingDiffStatements.set(statement, (remainingDiffStatements.get(statement) ?? 0) + 1);
  }

  for (const statement of selectedStatements) {
    if (isEnumValueAddition(statement)) {
      throw new Error(
        'selected SQL contains ALTER TYPE ... ADD VALUE, which cannot be used in the transaction that adds it'
      );
    }
    const target = targetForStatement(statement);
    if (!target) throw new Error('selected SQL contains an unknown schema operation');
    if (isMastraOwnedTarget(target)) throw new Error('selected SQL references Mastra-owned storage');
    if (
      !isForeignKeySwapDrop(statement, selectedConstraintSwaps) &&
      isDestructiveStatement(statement)
    ) {
      throw new Error('selected SQL contains a destructive or data-changing operation');
    }
    if (isConcurrentIndex(statement)) {
      throw new Error('selected SQL contains CREATE INDEX CONCURRENTLY, which cannot run in one transaction');
    }
    const count = remainingDiffStatements.get(statement) ?? 0;
    if (count === 0) throw new Error('selected statement is not printed by the current migrate diff');
    remainingDiffStatements.set(statement, count - 1);

    if (!isAllowedShape(statement, selectedConstraintSwaps)) {
      throw new Error('selected SQL is not an allowed additive schema operation');
    }

    if (!targetIsAllowedInMode(target, options, createdTables)) {
      throw new Error(`selected SQL ${unknownTargetMessage(target, options)}`);
    }
  }

  // A named enum the diff does not create means the command line and the diff
  // describe different changes — most often a block copied from a runbook for a
  // slice that is already applied. An unused `--allow-table` is tolerated
  // because it grants nothing on its own; `--allow-enum` is the one flag that
  // lets a statement through without a table to check it against, so it is only
  // accepted when the operator can point at the statement it authorises.
  for (const enumType of options.allowEnums) {
    if (!createdEnums.has(enumType)) {
      throw new Error(`--allow-enum ${enumType} names a type the current migrate diff does not create`);
    }
  }

  if ([...remainingDiffStatements.values()].some((count) => count !== 0)) {
    throw new Error('selected SQL omits a statement from the current migrate diff');
  }

  process.stdout.write(`SQL apply guard passed: ${selectedStatements.length} explicitly selected statement(s).\n`);
}

const options = parseArguments(process.argv.slice(2));
if (options) {
  try {
    validate(options);
  } catch (error) {
    fail(error.message);
  }
}
