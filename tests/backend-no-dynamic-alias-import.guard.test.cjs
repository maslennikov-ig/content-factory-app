/**
 * Backend code must not load an `@contentfactory/...` module through a dynamic
 * `import()`. `nest build` rewrites the alias only in static imports; the
 * string inside `import()` stays as written, and at runtime Node answers
 * "Cannot find module". That is how every post carrying a content context
 * failed to save with a 500 from August until 04.09.2026
 * (`content-factory-next-fn33.28.7`). Frontend code is not covered: Next.js
 * bundles dynamic imports and resolves the alias itself.
 */
const fs = require('node:fs');
const path = require('node:path');

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

test('no backend-compiled file loads an @contentfactory module via import()', () => {
  const offenders = [];
  for (const tree of trees) {
    const dir = path.join(root, tree);
    if (!fs.existsSync(dir)) continue;
    for (const file of files(dir)) {
      const source = fs.readFileSync(file, 'utf8');
      const hit = /\bimport\(\s*['"`]@contentfactory\//.exec(source);
      if (hit) {
        const line = source.slice(0, hit.index).split('\n').length;
        offenders.push(`${path.relative(root, file)}:${line}`);
      }
    }
  }
  expect(offenders).toEqual([]);
});
