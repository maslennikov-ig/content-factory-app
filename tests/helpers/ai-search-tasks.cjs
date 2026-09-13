/**
 * The real `libraries/nestjs-libraries/src/openai/ai.search-tasks.ts`,
 * compiled, for any suite that loads a source file importing it.
 *
 * Mapped in `jest.config.cjs` rather than stubbed per suite, for the reason
 * `research-egress.cjs` records: this module decides which engine a key is
 * spent at, and a stub would let every suite agree with a routing the product
 * does not ship. It is importless, so compiling it costs nothing.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.search-tasks.ts'
);
