'use strict';
// Real compiled implementation for suites whose historical loader resolves aliases through Jest.
module.exports = require('./load-ts-with-mocks.cjs').loadWithMocks(
  'libraries/nestjs-libraries/src/openai/search-publication-period.ts'
);
