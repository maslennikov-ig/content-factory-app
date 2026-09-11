/**
 * The real
 * `libraries/nestjs-libraries/src/content-intelligence/research/competitive-intelligence-egress.ts`,
 * compiled, for any suite that loads a source file importing it.
 *
 * Mapped in `jest.config.cjs` rather than stubbed per suite, and it hands over
 * the real module on purpose. Until 11.09.2026 `web.research.service.ts`
 * carried a hand-written copy of the same denial order as a fallback for the
 * alias the suites could not resolve, so every suite exercised the copy and
 * none exercised the policy the product ships. One module, one order.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/research/competitive-intelligence-egress.ts'
);
