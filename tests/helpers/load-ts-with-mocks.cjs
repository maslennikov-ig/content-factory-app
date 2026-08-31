'use strict';

/**
 * A TypeScript loader that takes substitutes.
 *
 * `load-tsx.cjs` beside it follows every workspace import to its real file,
 * which is right for a component and wrong for anything that reaches the
 * database on the way in. A caller that needs the generation node or the voice
 * resolver needs them with their Nest providers replaced and nothing else
 * changed — the tests do, and so does the measurement stand in
 * `scripts/evidence/voice-eval`, which must run the shipped prompt rather than
 * a copy of it.
 *
 * `ref` reads the file from a git commit instead of the working tree, so a
 * variant can be pinned to the behaviour it is named after.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');

const WORKSPACE_ALIASES = [
  ['@contentfactory/backend/', 'apps/backend/src/'],
  ['@contentfactory/helpers/', 'libraries/helpers/src/'],
  ['@contentfactory/nestjs-libraries/', 'libraries/nestjs-libraries/src/'],
  ['@contentfactory/react/', 'libraries/react-shared-libraries/src/'],
];
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const resolveWorkspace = (request) => {
  for (const [alias, target] of WORKSPACE_ALIASES) {
    if (!request.startsWith(alias)) continue;
    const base = path.resolve(REPO, target + request.slice(alias.length));
    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = base + suffix;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    throw new Error(`cannot resolve workspace import ${request}`);
  }
  return null;
};

const resolveSibling = (fromDirectory, request) => {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = path.resolve(fromDirectory, request + suffix);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`cannot resolve ${request} from ${fromDirectory}`);
};

const compile = (source, filename) =>
  ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

const evaluate = (source, filename, mocks, cache) => {
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const directory = path.dirname(filename);

  const take = (resolved) => {
    if (cache.has(resolved)) return cache.get(resolved).exports;
    if (resolved.endsWith('.json')) return require(resolved);
    return evaluate(
      fs.readFileSync(resolved, 'utf8'),
      resolved,
      mocks,
      cache
    );
  };

  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (request.startsWith('.')) return take(resolveSibling(directory, request));
    const workspace = resolveWorkspace(request);
    return workspace ? take(workspace) : require(request);
  };

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compile(source, filename)
  )(loaded.exports, localRequire, loaded, filename, directory);

  return loaded.exports;
};

const sourceOf = (relativePath, ref) =>
  ref
    ? execFileSync('git', ['show', `${ref}:${relativePath}`], {
        cwd: REPO,
        encoding: 'utf8',
        maxBuffer: 1 << 26,
      })
    : fs.readFileSync(path.join(REPO, relativePath), 'utf8');

/**
 * @param relativePath path from the repository root
 * @param mocks import specifier -> module object
 * @param ref optional git ref the file itself is read from
 */
const loadWithMocks = (relativePath, mocks = {}, ref) =>
  evaluate(
    sourceOf(relativePath, ref),
    path.join(REPO, relativePath),
    mocks,
    new Map()
  );

module.exports = { loadWithMocks, REPO };
