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
  if (evidence.sourceColumns)
    return {
      version: module.exports.READER_REVIEW_WIRE_V5_VERSION,
      catalogue: evidence.catalogue.binding,
      sources: evidence.sources.map((row) => ({
        id: row[0],
        relevance: 'relevant',
      })),
      claims: [
        {
          text: summary.summary,
          kind: 'context',
          refs: [evidence.sources[0][5][0][0]],
          dates: [],
        },
      ],
      coverage: [
        { question: evidence.subject.slice(0, 500), status: 'supported' },
      ],
      entities: [],
    };
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
  version: module.exports.READER_REVIEW_WIRE_V3_VERSION,
  claims: output.claims.map(({ dates, ...claim }) => ({
    ...claim,
    dates: dates.map(({ kind, ref }) => ({
      kind,
      dateLiteral: ref.quote,
      ref,
    })),
  })),
  entities: output.entities.map(({ name, status, ref }) => ({
    subjectQuote: name,
    status,
    ref,
  })),
});

// Explicit v4 positives only; legacy v2/v3 invalid annotations are not repaired.
module.exports.syntheticReaderDateQuoteWire = (output) => {
  const anchored = module.exports.syntheticReaderAnchorWire(output);
  return {
    ...anchored,
    version: module.exports.READER_REVIEW_WIRE_VERSION,
    claims: anchored.claims.map(({ dates, ...claim }) => ({
      ...claim,
      dates: dates.map(({ dateLiteral, ...date }) => date),
    })),
  };
};

// Only a fake model port reselects IDs for legacy synthetic fixture assertions.
// Direct legacy compiler tests remain byte-for-byte inputs. Invalid legacy wire
// is passed through and the current production boundary rejects its version.
module.exports.syntheticReaderV5Fixture = (input, output, request) => {
  if (
    !output?.sources ||
    output.version === module.exports.READER_REVIEW_WIRE_V5_VERSION
  )
    return output;
  const packed = module.exports.packReaderReview(
    input.subject,
    input.sources,
    input.sources.map((s) => ({ sourceUrl: s.url, text: s.excerpt })),
    'Russian'
  );
  const legacy = module.exports.syntheticReaderWire(input, output);
  const compiled = packed && module.exports.compileReaderReview(packed, legacy);
  if (!compiled) return legacy;
  const literal = (ref) =>
    ref === null
      ? null
      : {
          source: ref.source,
          quote:
            packed.evidence.sources
              .find((s) => s.id === ref.source)
              ?.excerpt.slice(ref.start, ref.end) ?? '',
        };
  const v4 = module.exports.compileReaderReview(packed, {
    version: module.exports.READER_REVIEW_WIRE_VERSION,
    sources: compiled.sources,
    coverage: compiled.coverage,
    claims: compiled.claims.map((c) => ({
      text: c.text,
      kind: c.kind,
      refs: c.refs.map(literal),
      dates: c.dates.map((d) => ({ kind: d.kind, ref: literal(d.ref) })),
    })),
    entities: compiled.entities.map((e) => ({
      subjectQuote: e.name,
      status: e.status,
      ref: literal(e.ref),
    })),
  });
  if (
    !v4 ||
    JSON.stringify(v4.claims.map((c) => c.dates.map((d) => d.date))) !==
      JSON.stringify(compiled.claims.map((c) => c.dates.map((d) => d.date)))
  )
    return legacy;
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  const anchors = view.sources.flatMap((row) =>
    row[5].map((a) => ({
      id: a[0],
      source: row[0],
      quote: row[4].slice(a[1], a[2] + 1).join(''),
      date: a[3] === 'd',
    }))
  );
  const select = (ref, isDate = false, isClaim = false) => {
    if (ref === null) return null;
    const source = packed.evidence.sources.find((s) => s.id === ref.source);
    const quote = source?.excerpt.slice(ref.start, ref.end);
    const eligible = anchors.filter(
      (a) => a.source === ref.source && (!isDate || a.date)
    );
    const enclosing = eligible
      .filter((a) => quote && a.quote.includes(quote))
      .sort((a, b) => a.quote.length - b.quote.length);
    // Legacy fixtures sometimes cited the whole page. A synthetic current
    // model selects one contained core instead; this is not production remap.
    return (
      enclosing[0]?.id ??
      (isClaim
        ? eligible.find((a) => quote?.includes(a.quote))?.id
        : undefined) ??
      'Kzz'
    );
  };
  return {
    version: module.exports.READER_REVIEW_WIRE_V5_VERSION,
    catalogue: view.catalogue.binding,
    sources: compiled.sources,
    coverage: compiled.coverage,
    claims: compiled.claims.map((c) => ({
      text: c.text,
      kind: c.kind,
      refs: c.refs.map((r) => select(r, false, true)),
      dates: c.dates.map((d) => ({ kind: d.kind, ref: select(d.ref, true) })),
    })),
    entities: compiled.entities.map((e) => ({
      subjectQuote: e.name,
      status: e.status,
      ref: select(e.ref),
    })),
  };
};
module.exports.syntheticReaderModelEvidence = (request) => {
  const view = JSON.parse(request.split('Untrusted reader evidence:\n')[1]);
  if (!view.sourceColumns) return view;
  return {
    ...view,
    sources: view.sources.map((row) => ({
      id: row[0],
      title: row[1],
      publishedAt: row[2],
      clipped: row[3],
      excerpt: row[4].join(''),
    })),
  };
};
