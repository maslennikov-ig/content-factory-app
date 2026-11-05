/**
 * Backend code must not load an `@contentfactory/...` module through runtime
 * `import()` or `require()`. `nest build` rewrites aliases only in static
 * imports; a literal runtime alias stays as written, and Node answers
 * "Cannot find module". That is how every post carrying a content context
 * failed to save with a 500 from August until 04.09.2026
 * (`content-factory-next-fn33.28.7`). Frontend code is not covered: Next.js
 * bundles dynamic imports and resolves the alias itself.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const trees = [
  'apps/backend/src',
  'apps/orchestrator/src',
  'libraries/nestjs-libraries/src',
  'libraries/helpers/src',
];

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      yield* files(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

function runtimeAliasLoads(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const hits = [];
  const visit = node => {
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const specifier = node.arguments[0];
      if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)) && specifier.text.startsWith('@contentfactory/')) {
        hits.push(ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return hits;
}

test('no backend-compiled file loads an @contentfactory module via import() or require()', () => {
  const offenders = [];
  for (const tree of trees) {
    const dir = path.join(root, tree);
    if (!fs.existsSync(dir)) continue;
    for (const file of files(dir)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const line of runtimeAliasLoads(source, file)) offenders.push(`${path.relative(root, file)}:${line}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('runtime scan catches the four lazy alias loads and import calls while excluding erased types and comments', () => {
  const thread = '@contentfactory/nestjs-libraries/chat/conductor/agent-threads.service';
  const controller = Array.from({length: 3}, (_, index) => `function path${index}() { const token = require('${thread}') as typeof import('${thread}'); }`).join('\n');
  expect(runtimeAliasLoads(controller, 'controller.ts')).toEqual([1, 2, 3]);
  expect(runtimeAliasLoads("const token = require('@contentfactory/nestjs-libraries/videos/video-access.service');", 'resolver.ts')).toEqual([1]);
  expect(runtimeAliasLoads("void import('@contentfactory/helpers/runtime');", 'dynamic.ts')).toEqual([1]);
  expect(runtimeAliasLoads([
    `type Token = typeof import('${thread}');`,
    `import type { AgentThreadsService } from '${thread}';`,
    `import { AgentThreadsService } from '${thread}';`,
    `// require('${thread}');`,
    `/* import('${thread}'); */`,
    "const relative = require('../../videos/video-access.service');",
  ].join('\n'), 'types-and-comments.ts')).toEqual([]);
});
