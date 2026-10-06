const { loadTypeScriptModule } = require('./load-ts-module.cjs');
module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review.ts'
);

// Fake model transport only. Retain every direct legacy compiler fixture.
// A malformed legacy wire is never repaired into an accepted current output.
module.exports.syntheticReaderV7Fixture = (input, output, request) => {
  const old = require('./reader-source-review.cjs');
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  if (output?.version === module.exports.READER_REVIEW_WIRE_V7_VERSION)
    return output;
  const subject = view.subjectParts
    .map((r) => r.slice(r.indexOf(':') + 1))
    .join('');
  const original = old.packReaderReview(
    input.subject,
    input.sources,
    input.sources.map((s) => ({ sourceUrl: s.url, text: s.excerpt })),
    'Russian'
  );
  if (!original) return output;
  const { createHash } = require('node:crypto');
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  original.evidence = {
    subject,
    requestedDate: view.requestedDate,
    bounds: view.bounds,
    sources: view.sources.map((r, i) => {
      const excerpt = r[4].join('');
      return {
        ...original.evidence.sources[i],
        id: r[0],
        title: r[1],
        publishedAt: r[2],
        clipped: r[3],
        excerpt,
        excerptSha256: hash(excerpt),
      };
    }),
  };
  const base = old.prepareReaderReviewV5(original);
  if (!base) throw new Error('Synthetic v7 source catalogue unavailable');
  const virtual = {
    ...base.catalogue.view,
    catalogue: { version: 'v5', binding: view.catalogue.binding },
  };
  for (let i = 0; i < view.sources.length; i++) {
    const row = view.sources[i],
      expected = base.catalogue.view.sources[i];
    const decoded = row[5].map((a, n) => {
      const [index, first, last, date] = a.split(':');
      if (+index !== n) throw new Error('Synthetic local anchor order changed');
      const id = expected[5][n]?.[0];
      return date === undefined
        ? [id, +first, +last]
        : [id, +first, +last, 'd'];
    });
    if (
      JSON.stringify(row[4]) !== JSON.stringify(expected[4]) ||
      JSON.stringify(decoded) !== JSON.stringify(expected[5])
    )
      throw new Error('Synthetic v7 source/date catalogue changed');
  }
  const legacy = old.syntheticReaderV5Fixture(
    input,
    output,
    'Untrusted reader evidence:\n' + JSON.stringify(virtual)
  );
  const parsed = old.readerReviewWireV5Schema.safeParse(legacy);
  if (!parsed.success) return legacy;
  const anchors = new Map();
  virtual.sources.forEach((row) => {
    let date = 0;
    row[5].forEach((a, index) =>
      anchors.set(a[0], {
        source: row[0],
        index,
        date: a[3] === 'd' ? date++ : null,
      })
    );
  });
  const claims = [];
  for (const { refs, dates, ...claim } of parsed.data.claims) {
    const proofs = {};
    for (const id of refs) {
      const a = anchors.get(id);
      if (!a) return legacy;
      (proofs[a.source] ??= { refs: [], dates: [] }).refs.push(a.index);
    }
    for (const d of dates) {
      const a = anchors.get(d.ref);
      if (!a || a.date === null || !proofs[a.source]) return legacy;
      proofs[a.source].dates.push({ kind: d.kind, ref: a.date });
    }
    claims.push({ ...claim, proofs });
  }
  let offset = 0;
  const positions = view.subjectParts.map((r, index) => {
    const start = offset;
    offset += r.slice(r.indexOf(':') + 1).length;
    return { index, start, end: offset };
  });
  const entities = [];
  for (const { subjectQuote, ref, ...entity } of parsed.data.entities) {
    const start = subject.indexOf(subjectQuote);
    const first = positions.find((p) => p.start === start),
      last = positions.find((p) => p.end === start + subjectQuote.length);
    if (
      start < 0 ||
      subject.indexOf(subjectQuote, start + 1) !== -1 ||
      !first ||
      !last ||
      (ref !== null && !anchors.has(ref))
    )
      return legacy;
    entities.push({
      ...entity,
      subjectRef: [first.index, last.index],
      source: ref === null ? null : anchors.get(ref).source,
    });
  }
  return {
    ...parsed.data,
    version: module.exports.READER_REVIEW_WIRE_V7_VERSION,
    claims,
    entities,
  };
};
