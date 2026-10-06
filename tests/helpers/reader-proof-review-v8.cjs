const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v8.ts'
);

// Fake transport only: valid historical fixtures keep their exact local refs.
// Current malformed output and rejected legacy fixtures are never repaired.
module.exports.syntheticReaderV8Fixture = (input, output, request) => {
  if (output?.version === module.exports.READER_REVIEW_WIRE_V8_VERSION)
    return output;
  const v7 = require('./reader-proof-review.cjs');
  const fixture = v7.syntheticReaderV7Fixture(input, output, request);
  if (fixture?.version !== v7.READER_REVIEW_WIRE_V7_VERSION) return fixture;
  return {
    ...fixture,
    version: module.exports.READER_REVIEW_WIRE_V8_VERSION,
    claims: fixture.claims.map(({ proofs, ...claim }) => ({
      ...claim,
      proofs: Object.entries(proofs).map(([source, proof]) => ({
        source,
        ...proof,
      })),
    })),
  };
};
