const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v9.ts'
);

// Fake model port only. Direct legacy fixtures and malformed wire stay intact.
module.exports.syntheticReaderV9Fixture = (input, output, request) => {
  if (output?.version === module.exports.READER_REVIEW_WIRE_V9_VERSION)
    return output;
  const old = require('./reader-proof-review-v8.cjs');
  const fixture = old.syntheticReaderV8Fixture(input, output, request);
  const parsed = old.readerReviewWireV8Schema.safeParse(fixture);
  if (!parsed.success) return fixture;
  const claims = [];
  for (const { proofs, ...claim } of parsed.data.claims) {
    if (new Set(proofs.map((p) => p.source)).size !== proofs.length)
      return fixture;
    const refs = proofs.flatMap((p) =>
      p.refs.map((ref) => ({ source: p.source, ref }))
    );
    const dates = proofs.flatMap((p) =>
      p.dates.map((d) => ({
        ...d,
        via: refs.findIndex((r) => r.source === p.source),
      }))
    );
    if (refs.length > 2 || dates.length > 5 || dates.some((d) => d.via < 0))
      return fixture;
    claims.push({ ...claim, refs, dates });
  }
  return {
    ...parsed.data,
    version: module.exports.READER_REVIEW_WIRE_V9_VERSION,
    claims,
    entities: parsed.data.entities.map(({ status, ...entity }) => ({
      ...entity,
      mode: status === 'supported_claim' ? 'claim_candidate' : status,
    })),
  };
};
