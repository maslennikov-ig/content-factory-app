const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-source-review.ts'
);
// Synthetic structured model transport output for pre-existing admission tests.
// It is not production judgment logic or a live-quality assertion.
module.exports.syntheticReaderReview = (request, summary) => {
  if (typeof summary?.summary !== 'string' || !summary.summary.trim())
    return summary;
  const evidence = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  return {
    version: module.exports.READER_REVIEW_WIRE_VERSION,
    sources: evidence.sources.map(({ id }) => ({ id, relevance: 'relevant' })),
    claims: [
      {
        text: summary.summary,
        kind: 'context',
        refs: [
          {
            source: evidence.sources[0].id,
            quote: evidence.sources[0].excerpt,
          },
        ],
        dates: [],
      },
    ],
    coverage: [
      { question: evidence.subject.slice(0, 500), status: 'supported' },
    ],
    entities: [],
  };
};

// Convert only synthetic legacy model fixtures. Keep malformed coordinates or
// undeclared fields malformed so the actual new boundary still rejects them.
module.exports.syntheticReaderWire = (input, output) => {
  if (!output?.sources || output.version !== undefined) return output;
  const quoteRef = (ref) => {
    if (ref === null) return null;
    const { start, end, ...rest } = ref;
    const text = input.sources[Number(rest.source?.slice(1)) - 1]?.excerpt;
    const valid =
      typeof text === 'string' &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      start < end &&
      end <= text.length;
    return { ...rest, quote: valid ? text.slice(start, end) : '' };
  };
  return {
    ...output,
    version: module.exports.READER_REVIEW_WIRE_V2_VERSION,
    claims: output.claims?.map((claim) => ({
      ...claim,
      refs: claim.refs?.map(quoteRef),
      dates: claim.dates?.map((date) => ({ ...date, ref: quoteRef(date.ref) })),
    })),
    entities: output.entities?.map((entity) => ({
      ...entity,
      ref: quoteRef(entity.ref),
    })),
  };
};

// Explicit v3 fixtures only. Legacy malformed spans keep using the unchanged
// v2 converter above so new fixture convenience cannot repair old negatives.
module.exports.syntheticReaderAnchorWire = (output) => ({
  ...output,
  version: module.exports.READER_REVIEW_WIRE_VERSION,
  claims: output.claims.map(({ dates, ...claim }) => ({
    ...claim,
    dates: dates.map(({ kind, ref }) => ({ kind, dateLiteral: ref.quote, ref })),
  })),
  entities: output.entities.map(({ name, status, ref }) => ({
    subjectQuote: name,
    status,
    ref,
  })),
});
