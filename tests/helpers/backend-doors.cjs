'use strict';

/**
 * Every backend route that carries `@CheckPolicies`, read from the TypeScript
 * parser rather than from a search through the source text.
 *
 * Lived inside `roles-matrix.guard.test.cjs` until 05.09.2026, when a second
 * test needed the same list (`content-factory-next-fn33.90`): the matrix guard
 * asks whether the document tells the truth about the doors, and
 * `role-doors.three-roles.test.cjs` asks what each of the three roles gets
 * when it knocks. Two readings of the same decorators would be two things to
 * keep in step, and the reading is the part that has been wrong before.
 *
 * A decorator is read as a decorator, so every policy on a handler is seen and
 * not just the first — that was the defect behind the first edition of the
 * matrix. Aliases are followed one hop, which is how the facts and the brand
 * profile stopped being invisible.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const ROUTE_ROOTS = [
  'apps/backend/src/api/routes',
  'apps/backend/src/public-api/routes',
];

const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch']);

const typeScriptFiles = (directory) => {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return typeScriptFiles(child);
    return entry.name.endsWith('.ts') ? [child] : [];
  });
};

const literalOf = (node) =>
  node && ts.isStringLiteralLike(node) ? node.text : '';

/**
 * The file's own policy aliases: `const adminUpdate = [Update, Sections.ADMIN]`
 * and the like, which two controllers declare once and share across routes.
 *
 * Without this the reading was a `Sections\.(\w+)` match on the decorator's
 * argument text, and an argument that is a name rather than an array matched
 * nothing. The handler was dropped as policy-free, and twenty doors — every
 * fact, every piece of evidence, the whole brand profile — were invisible
 * without anything failing.
 *
 * Only file-level `const` declarations are followed, and only one hop. A
 * policy assembled at runtime is not a policy this file can read, and
 * pretending otherwise would put the silence back.
 */
const policyAliases = (source) => {
  const aliases = new Map();
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      aliases.set(declaration.name.text, declaration.initializer.getText());
    }
  });
  return aliases;
};

/** The sections one `@CheckPolicies` argument names, alias or literal. */
const sectionsOfArgument = (argument, aliases) => {
  const text = argument.getText();
  const direct = text.match(/Sections\.(\w+)/);
  if (direct) return [direct[1]];

  const name = text.replace(/\s+as\s+\w+$/, '').trim();
  const aliased = aliases.get(name);
  const followed = aliased && aliased.match(/Sections\.(\w+)/);
  return followed ? [followed[1]] : [];
};

/** Every route handler that carries `@CheckPolicies`, with its sections. */
const doorsWithPolicies = () => {
  const doors = [];

  for (const relative of ROUTE_ROOTS.flatMap(typeScriptFiles)) {
    const source = ts.createSourceFile(
      relative,
      read(relative),
      ts.ScriptTarget.Latest,
      true
    );
    const aliases = policyAliases(source);

    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node)) return;

      let prefix = null;
      for (const decorator of ts.getDecorators(node) || []) {
        const call = decorator.expression;
        if (
          ts.isCallExpression(call) &&
          call.expression.getText() === 'Controller'
        ) {
          prefix = literalOf(call.arguments[0]);
        }
      }
      if (prefix === null) return;

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;

        let method;
        let route = '';
        let sections;
        for (const decorator of ts.getDecorators(member) || []) {
          const call = decorator.expression;
          if (!ts.isCallExpression(call)) continue;
          const name = call.expression.getText();
          if (HTTP_METHODS.has(name)) {
            method = name.toUpperCase();
            route = literalOf(call.arguments[0]);
          }
          if (name === 'CheckPolicies') {
            sections = call.arguments.flatMap((argument) =>
              sectionsOfArgument(argument, aliases)
            );
          }
        }

        if (!method || !sections?.length) continue;
        doors.push({
          method,
          path: `${prefix}${route}`.replace(/\/$/, '') || '/',
          sections,
          file: relative,
        });
      }
    });
  }

  return doors.sort((left, right) =>
    `${left.path} ${left.method}`.localeCompare(`${right.path} ${right.method}`)
  );
};

module.exports = { doorsWithPolicies, root, read };
