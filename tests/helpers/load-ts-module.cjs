const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..', '..');

/**
 * Compiles one repository `.ts` file and runs it with `mocks` standing in for
 * its imports.
 *
 * Four tests carry their own copy of this — `copilot.controller`,
 * `integration.content.language`, `autopost.research-enrichment` and
 * `integration.analytics.snapshot`. Those are left alone; anything new belongs
 * here. `load-tsx.cjs` next to this file is the other half of the job: it
 * renders components and follows relative imports, which this one has no use
 * for.
 *
 * `options.sources` maps an import request to another repository-relative
 * `.ts` file, compiled through this same loader. One call shares a single
 * instance of each of those, so module-level state — a memoized promise, say —
 * behaves the way it does at runtime instead of resetting on every import.
 *
 * `options.resolve` gets first refusal on every request and falls through when
 * it returns `undefined`. That is how a test counts, delays or fails loads of
 * a package it substitutes.
 */
function loadTypeScriptModule(relativePath, mocks = {}, options = {}) {
  const { sources = {}, resolve } = options;
  const loaded = new Map();

  const loadFile = (fileRelativePath) => {
    const cached = loaded.get(fileRelativePath);
    if (cached) {
      return cached.exports;
    }

    const filename = path.join(repositoryRoot, fileRelativePath);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2021,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
    }).outputText;

    const loadedModule = { exports: {} };
    loaded.set(fileRelativePath, loadedModule);

    const localRequire = (request) => {
      if (resolve) {
        const resolved = resolve(request);
        if (resolved !== undefined) {
          return resolved;
        }
      }
      if (Object.prototype.hasOwnProperty.call(mocks, request)) {
        return mocks[request];
      }
      if (Object.prototype.hasOwnProperty.call(sources, request)) {
        return loadFile(sources[request]);
      }
      return require(request);
    };

    new Function(
      'exports',
      'require',
      'module',
      '__filename',
      '__dirname',
      compiled
    )(
      loadedModule.exports,
      localRequire,
      loadedModule,
      filename,
      path.dirname(filename)
    );

    return loadedModule.exports;
  };

  return loadFile(relativePath);
}

module.exports = { loadTypeScriptModule, repositoryRoot };
