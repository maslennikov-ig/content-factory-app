const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v11.ts'
);
const old = require('./reader-proof-review-v10.cjs');
const virtualV10 = (view) => ({
  ...view,
  catalogue: { ...view.catalogue, version: 'v10' },
});
const literalCoverage = (view, output) => {
  const parsed = old.readerReviewWireV10Schema.safeParse(output);
  if (!parsed.success) return output;
  const subject = (
    Array.isArray(view.subjectParts)
      ? view.subjectParts
      : view.subjectParts.split(view.partSeparator)
  ).join('');
  const coverage = [];
  for (const row of parsed.data.coverage) {
    const start = subject.indexOf(row.question);
    if (start < 0) return output;
    let offset = 0;
    for (let i = 0; i < start; i++) offset += Math.min(500, subject.length - i);
    coverage.push({
      ref: offset + row.question.length - 1,
      status: row.status,
    });
  }
  return {
    ...parsed.data,
    version: module.exports.READER_REVIEW_WIRE_V11_VERSION,
    coverage,
  };
};
// Fake model fixtures only; production never re-encodes rejected legacy output.
module.exports.syntheticReaderV11Fixture = (input, output, request) => {
  if (output?.version === module.exports.READER_REVIEW_WIRE_V11_VERSION)
    return output;
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  return literalCoverage(
    view,
    old.syntheticReaderV10Fixture(
      input,
      output,
      'Untrusted reader evidence:\n' + JSON.stringify(virtualV10(view))
    )
  );
};
module.exports.syntheticReaderV11Review = (view, summary) =>
  literalCoverage(
    view,
    old.syntheticReaderV10Review(virtualV10(view), summary)
  );
module.exports.syntheticReaderV11Evidence = (view) => ({
  ...old.syntheticReaderV10Evidence(virtualV10(view)),
  catalogue: view.catalogue,
});
