const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * `AGENTS.md`/`CLAUDE.md`: "Never mutate an existing Temporal workflow or
 * activity contract used upstream. Add a versioned workflow/activity and
 * migrate callers." (content-factory-next-7q9d shipped an uncommitted diff
 * that broke exactly this rule — a fifth argument was added straight to
 * `EmailActivity.sendEmail` and to what `sendEmailWorkflow` passes it,
 * instead of adding `EmailActivityV2`/`sendEmailWorkflowV2`. Temporal
 * replays a workflow execution's history against whatever code is currently
 * deployed; a workflow already mid-history when that ships would replay a
 * different number of arguments than history already recorded for the same
 * point in its code, which is a nondeterminism error — possibly discovered
 * only in production, on a workflow that was fine before the deploy.)
 *
 * This guard freezes the parameter list of every `@ActivityMethod()` on
 * every `@Activity()` class, and of every exported top-level function in
 * every workflow file, as of the last time the rule was respected —
 * `tests/temporal-contract-signature.baseline.json`. A change to an
 * existing entry's signature fails here, before it ever reaches a running
 * workflow. Adding a NEW activity or workflow file, or a new method on one,
 * requires a new baseline entry — regenerate it (see `EXTRACT` below) and
 * review the diff like any other contract change: a new entry is fine, a
 * changed one is exactly the mistake this guard exists to catch.
 *
 * To regenerate after a legitimate addition:
 *   node -e "require('./tests/temporal-contract-signature.guard.test.cjs').writeBaseline()"
 * then diff the result — every existing key must be untouched.
 */

const ACTIVITIES_DIR = 'apps/orchestrator/src/activities';
const WORKFLOWS_DIR = 'apps/orchestrator/src/workflows';
const BASELINE_PATH = path.join(
  __dirname,
  'temporal-contract-signature.baseline.json'
);

function paramSignature(param) {
  const name = param.name.getText().replace(/\s+/g, ' ');
  const optional = !!param.questionToken || !!param.initializer;
  const type = param.type ? param.type.getText().replace(/\s+/g, ' ') : null;
  return `${name}${optional ? '?' : ''}${type ? ':' + type : ''}`;
}

function hasDecoratorNamed(node, name) {
  const decorators = ts.canHaveDecorators(node)
    ? ts.getDecorators(node)
    : undefined;
  if (!decorators) return false;
  return decorators.some((d) => {
    const expr = d.expression;
    const callee = ts.isCallExpression(expr) ? expr.expression : expr;
    return ts.isIdentifier(callee) && callee.text === name;
  });
}

function parse(fileRelativePath) {
  const filename = path.join(repositoryRoot, fileRelativePath);
  const sourceText = fs.readFileSync(filename, 'utf8');
  return ts.createSourceFile(
    filename,
    sourceText,
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TS
  );
}

// Every `@ActivityMethod()` on every `@Activity()`-decorated class: the
// activity contract Temporal records an ActivityTaskScheduled input against.
function extractActivitySignatures(fileRelativePath) {
  const out = {};
  ts.forEachChild(parse(fileRelativePath), (node) => {
    if (ts.isClassDeclaration(node) && hasDecoratorNamed(node, 'Activity')) {
      const className = node.name ? node.name.text : '(anonymous)';
      node.members.forEach((member) => {
        if (
          ts.isMethodDeclaration(member) &&
          hasDecoratorNamed(member, 'ActivityMethod')
        ) {
          const methodName = member.name.getText();
          out[`${className}.${methodName}`] = member.parameters.map(
            paramSignature
          );
        }
      });
    }
  });
  return out;
}

// Every exported top-level function in a workflow file: the workflow's own
// start-argument contract.
function extractWorkflowSignatures(fileRelativePath) {
  const out = {};
  ts.forEachChild(parse(fileRelativePath), (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers &&
      node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      out[node.name.text] = node.parameters.map(paramSignature);
    }
  });
  return out;
}

function listTsFiles(dirRelativePath) {
  const dir = path.join(repositoryRoot, dirRelativePath);
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(
        ...listTsFiles(path.join(dirRelativePath, entry.name)).map((f) => f)
      );
    } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
      out.push(path.join(dirRelativePath, entry.name));
    }
  }
  return out;
}

function extractCurrent() {
  const activities = {};
  for (const file of listTsFiles(ACTIVITIES_DIR)) {
    activities[file] = extractActivitySignatures(file);
  }
  const workflows = {};
  for (const file of listTsFiles(WORKFLOWS_DIR)) {
    workflows[file] = extractWorkflowSignatures(file);
  }
  return { activities, workflows };
}

function writeBaseline() {
  fs.writeFileSync(
    BASELINE_PATH,
    JSON.stringify(extractCurrent(), null, 2) + '\n'
  );
}
module.exports = { writeBaseline };

describe('Temporal workflow/activity contracts are versioned, not mutated', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const current = extractCurrent();

  for (const kind of ['activities', 'workflows']) {
    describe(kind, () => {
      for (const [file, methods] of Object.entries(baseline[kind])) {
        describe(file, () => {
          for (const [member, params] of Object.entries(methods)) {
            test(`${member} keeps its recorded parameter list`, () => {
              const currentParams = current[kind]?.[file]?.[member];
              if (currentParams === undefined) {
                throw new Error(
                  `${file}: "${member}" existed in the frozen Temporal contract ` +
                    `baseline and is now gone. If it was replaced by a versioned ` +
                    `successor, the old one must still exist and keep running — ` +
                    `see AGENTS.md/CLAUDE.md. If it was deleted on purpose, that ` +
                    'decision needs a project record, not a silent baseline drop.'
                );
              }
              expect({ member, params: currentParams }).toEqual({
                member,
                params,
              });
            });
          }
        });
      }
    });
  }

  test('every activity method and workflow entrypoint on disk is in the baseline', () => {
    const missing = [];
    for (const kind of ['activities', 'workflows']) {
      for (const [file, methods] of Object.entries(current[kind])) {
        for (const member of Object.keys(methods)) {
          if (baseline[kind]?.[file]?.[member] === undefined) {
            missing.push(`${kind}/${file}: ${member}`);
          }
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        'New activity method(s) or workflow entrypoint(s) are not in ' +
          'tests/temporal-contract-signature.baseline.json yet. A brand-new ' +
          'file or method is fine — regenerate the baseline (see this file\'s ' +
          'header comment) and review the diff to confirm it only ADDS ' +
          `entries:\n${missing.join('\n')}`
      );
    }
  });
});
