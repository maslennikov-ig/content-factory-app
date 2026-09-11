/**
 * The real
 * `libraries/nestjs-libraries/src/content-intelligence/research/encyclopedic-reference.ts`,
 * compiled, for any suite that loads a source file importing it.
 *
 * Same reason as `research-egress.cjs` beside it: `web.research.service.ts`
 * now opens the keyless Wikipedia/Wikidata lane, twenty suites load that
 * service through their own loaders, and none of them should have to name a
 * module they do not test. The real module is handed over rather than a stub,
 * so no suite exercises a private copy of the lane. It reaches the network
 * only when a caller omits `fetchImpl`, which the service does only outside
 * tests.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/research/encyclopedic-reference.ts'
);
