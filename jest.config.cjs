/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  // A suite that writes into apps/** or libraries/** breaks a `next dev` or
  // `nest start --watch` running beside it. Refused where it happens, so the
  // failure names the test rather than surfacing later as a dead stand.
  setupFiles: ['<rootDir>/tests/helpers/source-tree-guard.cjs'],
  // One ESM-only package sits behind the compose modal, which several suites
  // now reach through the Content section. Stubbed here so no suite has to
  // know about it.
  moduleNameMapper: {
    '^react-hotkeys-hook$': '<rootDir>/tests/helpers/react-hotkeys-hook.stub.cjs',
  },
  testMatch: ['**/*.test.cjs'],
  // These suites deliberately use Node's native test runner. Jest cannot
  // safely execute node:test inside its own lifecycle (especially async TLS
  // and transpiled module fixtures), so the root test script runs them in a
  // separate, explicit zero-concurrency step.
  testPathIgnorePatterns: [
    '/tests/brand-profile.contract.test.cjs$',
    '/tests/content-context.builder.test.cjs$',
    '/tests/content-intelligence.consumer-backend.test.cjs$',
    '/tests/content-intelligence.persistence.test.cjs$',
    '/tests/content-search-evidence.test.cjs$',
    '/tests/content-source-fetch-gateway.test.cjs$',
    '/tests/content-source-registry.postgres.test.cjs$',
    '/tests/content-source-registry.test.cjs$',
    '/tests/editorial-stage.tag-migration.test.cjs$',
    '/tests/post.content-context.test.cjs$',
  ],
};
