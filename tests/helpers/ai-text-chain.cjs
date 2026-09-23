/**
 * The real `libraries/nestjs-libraries/src/openai/ai.text-chain.ts`, compiled,
 * for any suite that loads a source file importing it.
 *
 * Mapped in `jest.config.cjs` for the reason `ai-search-tasks.cjs` records.
 * This module is the transport every text call leaves through and the ledger
 * of what it cost (`content-factory-next-97dq.55`). A stub would let a suite
 * agree with a chain the product does not ship. It imports only
 * `node:async_hooks`.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/ai.text-chain.ts'
);
