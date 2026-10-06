// Real production module for suites that use their own TypeScript loaders.
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-subject-review.ts'
);
