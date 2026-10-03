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
    sources: evidence.sources.map(({ id }) => ({ id, relevance: 'relevant' })),
    claims: [
      {
        text: summary.summary,
        kind: 'context',
        refs: [
          {
            source: evidence.sources[0].id,
            start: 0,
            end: Math.min(100, evidence.sources[0].excerpt.length),
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
