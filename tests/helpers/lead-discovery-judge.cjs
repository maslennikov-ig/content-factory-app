/**
 * The real
 * `libraries/nestjs-libraries/src/content-intelligence/leads/lead-discovery-judge.ts`,
 * compiled, for any suite that loads a source file importing it.
 *
 * Same reason as `encyclopedic-reference.cjs` beside it: `web.research.service.ts`
 * calls the discovery judge inside the research operation
 * (`content-factory-next-75xn.23`), twenty suites load that service through
 * their own loaders, and none of them should have to name a module they do not
 * test. The real module is handed over rather than a stub. The judge reaches a
 * model client only when a discovery sweep actually calls it, through a lazy
 * import, so loading it here costs nothing and touches no network.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-discovery-judge.ts'
);
