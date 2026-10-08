const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/research/reader-summary.ts'
);
