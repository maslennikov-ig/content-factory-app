'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');

const transformerSource = fs.readFileSync(__filename, 'utf8');

/** Convert module syntax only; dependency implementations and errors stay real. */
module.exports = {
  getCacheKey(source, filename, options) {
    return crypto.createHash('sha256')
      .update(transformerSource)
      .update(ts.version)
      .update(options.configString)
      .update(filename)
      .update(source)
      .digest('hex');
  },
  process(source, filename) {
    const compiled = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        allowJs: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        sourceMap: true,
        inlineSources: true,
      },
    });
    return { code: compiled.outputText, map: compiled.sourceMapText };
  },
};
