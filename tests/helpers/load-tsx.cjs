const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..', '..');

/**
 * Loads a `.tsx` or `.ts` source file so a test can render it.
 *
 * Some rules only exist in a component's output. `ChannelMark` proved that: it
 * shipped a regression where three providers all rendered as `LI`, and no
 * source-text fence could have seen it. Rendering the component is how those
 * rules get checked.
 *
 * Relative imports are followed through this same loader, resolved against the
 * importing file rather than against the test. Without that a primitive built
 * on a sibling — and they should be, that is what a primitive family is —
 * cannot be loaded at all.
 *
 * Workspace imports are followed too. `@contentfactory/*` is a tsconfig path,
 * resolved by webpack and by nothing else, so `require` cannot see it and a
 * component that crosses a workspace boundary — which every shared primitive
 * eventually does — would be unloadable. The map below is the same one
 * `tsconfig.base.json` declares. Everything else falls through to `require`.
 */
const cache = new Map();

const CANDIDATE_SUFFIXES = ['', '.tsx', '.ts', '/index.tsx', '/index.ts'];

const WORKSPACE_ALIASES = [
  ['@contentfactory/backend/', 'apps/backend/src/'],
  ['@contentfactory/frontend/', 'apps/frontend/src/'],
  ['@contentfactory/helpers/', 'libraries/helpers/src/'],
  ['@contentfactory/nestjs-libraries/', 'libraries/nestjs-libraries/src/'],
  ['@contentfactory/react/', 'libraries/react-shared-libraries/src/'],
  ['@contentfactory/plugins/', 'libraries/plugins/src/'],
  ['@contentfactory/orchestrator/', 'apps/orchestrator/src/'],
  ['@contentfactory/extension/', 'apps/extension/src/'],
];

function resolveWorkspace(request) {
  for (const [alias, target] of WORKSPACE_ALIASES) {
    if (!request.startsWith(alias)) continue;
    const base = path.resolve(
      repositoryRoot,
      target + request.slice(alias.length)
    );
    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = base + suffix;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    throw new Error(`cannot resolve workspace import ${request}`);
  }
  return null;
}

function resolveSibling(fromDirectory, request) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = path.resolve(fromDirectory, request + suffix);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`cannot resolve ${request} from ${fromDirectory}`);
}

function loadFile(filename) {
  const cached = cache.get(filename);
  if (cached) return cached.exports;

  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const loaded = { exports: {} };
  cache.set(filename, loaded);

  const directory = path.dirname(filename);
  // Only source needs transpiling; JSON is data and `require` reads it.
  const take = (resolved) =>
    resolved.endsWith('.json') ? require(resolved) : loadFile(resolved);

  const localRequire = (request) => {
    if (request.startsWith('.')) {
      return take(resolveSibling(directory, request));
    }
    const workspace = resolveWorkspace(request);
    return workspace ? take(workspace) : require(request);
  };

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, directory);

  return loaded.exports;
}

/** @param relativePath path from the repository root. */
const loadTypeScriptModule = (relativePath) =>
  loadFile(path.resolve(repositoryRoot, relativePath));

module.exports = { loadTypeScriptModule };
