const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v10.ts'
);
const split = (view, parts) =>
  Array.isArray(parts) ? parts : parts.split(view.partSeparator);
const virtualV9 = (view) => ({
  ...view,
  sourceColumns: ['id', 'title', 'publishedAt', 'clipped', 'parts', 'anchors'],
  bounds: Object.fromEntries(
    [
      'candidateCount',
      'presentedCount',
      'omittedCount',
      'excludedUrlCount',
    ].map((key, i) => [key, view.bounds[i]])
  ),
  catalogue: { version: 'v9', binding: view.catalogue.binding },
  subjectParts: split(view, view.subjectParts).map((part, i) => `${i}:${part}`),
  sources: view.sources.map((row) => [
    ...row.slice(0, 4),
    split(view, row[4]),
    row[5].map((ref, i) => `${i}:${ref}`),
  ]),
});

// Fake model port only. Malformed older wire is retained and still rejected.
module.exports.syntheticReaderV10Fixture = (input, output, request) => {
  if (output?.version === module.exports.READER_REVIEW_WIRE_V10_VERSION)
    return output;
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  const old = require('./reader-proof-review-v9.cjs');
  const fixture = old.syntheticReaderV9Fixture(
    input,
    output,
    'Untrusted reader evidence:\n' + JSON.stringify(virtualV9(view))
  );
  const parsed = old.readerReviewWireV9Schema.safeParse(fixture);
  if (!parsed.success) return fixture;
  const kinds = [
    'effective_from',
    'effective_until',
    'announced',
    'target',
    'as_of',
  ];
  const claims = [];
  for (const { dates, ...claim } of parsed.data.claims) {
    const slots = kinds.map(() => null);
    for (const { kind, ...date } of dates) {
      const index = kinds.indexOf(kind);
      if (index < 0 || slots[index] !== null) return fixture;
      slots[index] = date;
    }
    claims.push({ ...claim, dates: slots });
  }
  const entities = [];
  for (const entity of parsed.data.entities) {
    if (
      ['not_observed_in_presented_evidence', 'unknown_due_to_bounds'].includes(
        entity.mode
      )
    ) {
      if (entity.source !== null) return fixture;
      entities.push({ mode: entity.mode, subjectRef: entity.subjectRef });
      continue;
    }
    const source = view.sources.findIndex((row) => row[0] === entity.source);
    let proof;
    for (const row of (view.entityProofs[source] ?? '')
      .split(';')
      .filter(Boolean)) {
      const [o, f, d, n] = row.split(','),
        first = +f,
        min = first + (+d || 0),
        count = +n || 1;
      if (
        first === entity.subjectRef[0] &&
        entity.subjectRef[1] >= min &&
        entity.subjectRef[1] < min + count
      ) {
        proof = +o + entity.subjectRef[1] - min;
        break;
      }
    }
    if (proof === undefined) return fixture;
    entities.push({ mode: entity.mode, proof });
  }
  return {
    ...parsed.data,
    version: module.exports.READER_REVIEW_WIRE_V10_VERSION,
    claims,
    entities,
  };
};
module.exports.syntheticReaderV10Review = (view, summary) => ({
  version: module.exports.READER_REVIEW_WIRE_V10_VERSION,
  catalogue: view.catalogue.binding,
  sources: view.sources.map((row) => ({ id: row[0], relevance: 'relevant' })),
  claims: [
    {
      text: summary.summary,
      kind: 'context',
      refs: [{ source: view.sources[0][0], ref: 0 }],
      dates: [null, null, null, null, null],
    },
  ],
  coverage: [
    {
      question: split(view, view.subjectParts).join('').slice(0, 500),
      status: 'supported',
    },
  ],
  entities: [],
});
module.exports.syntheticReaderV10Evidence = (view) => ({
  ...view,
  subject: split(view, view.subjectParts).join(''),
  bounds: virtualV9(view).bounds,
  sources: view.sources.map((row) => ({
    id: row[0],
    title: row[1],
    publishedAt: row[2],
    clipped: row[3],
    excerpt: split(view, row[4]).join(''),
  })),
});
