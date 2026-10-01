const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { pageAttributions } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-source-attribution.ts'
);
const { assertLeadSourceRefs, readLeadSourceRefs, mergeLeadSourceRefs } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/leads/lead-source-refs.ts'
  );
const fromUrl = 'https://cryptorank.io/news/feed/story';
const envelope = (urls = [fromUrl]) => ({
  version: 1,
  sources: urls.map((url) => ({
    url,
    canonicalUrl: url,
    primaryStatus: 'UNKNOWN',
  })),
  attributions: [],
  truncated: false,
});
test('source-labelled markup makes an unverified claim, never primary proof', () => {
  const result = pageAttributions(
    '<p>Источник: <a href="https://incrypted.com/story">Incrypted</a></p><p><a href="https://forkast.news/story">Original source</a></p>',
    fromUrl
  );
  expect(result.attributions).toHaveLength(2);
  expect(
    result.attributions.every((a) => a.state === 'CLAIMED_UNVERIFIED')
  ).toBe(true);
});
test('domain hints, script markup, navigation and unsafe protocols are not source evidence', () => {
  expect(
    pageAttributions(
      '<nav><a href="https://incrypted.com">Source</a></nav><script><a href="https://forkast.news">Source</a></script><a href="https://incrypted.com">Incrypted</a><a href="javascript:alert(1)">Source</a><a href="http://forkast.news">Source</a>',
      fromUrl
    ).attributions
  ).toEqual([]);
});
test('parser is bounded, deduplicates and states evidence truncation', () => {
  const html = Array.from(
    { length: 55 },
    (_, i) => `<a href="https://source.example/${i}">Source</a>`
  ).join('');
  const result = pageAttributions(html, fromUrl);
  expect(result.attributions).toHaveLength(50);
  expect(result.truncated).toBe(true);
  expect(
    pageAttributions(
      '<a href="https://source.example/' + 'a'.repeat(2048) + '">Source</a>',
      fromUrl
    ).attributions
  ).toEqual([]);
  expect(pageAttributions(null, fromUrl)).toEqual({
    attributions: [],
    truncated: false,
  });
});
test.each([
  null,
  { version: 99 },
  { ...envelope(), evidenceId: 'foreign' },
  {
    ...envelope(),
    sources: [{ ...envelope().sources[0], organizationId: 'foreign' }],
  },
  envelope(['javascript:alert(1)']),
  envelope(Array.from({ length: 51 }, (_, i) => `https://source.example/${i}`)),
])('strict reads fallback and strict writes refuse %j', (value) => {
  expect(readLeadSourceRefs(value)).toBeNull();
  expect(() => assertLeadSourceRefs(value)).toThrow('INVALID_LEAD_SOURCE_REFS');
});
test('source union is idempotent and cannot silently discard stored article URLs', () => {
  expect(mergeLeadSourceRefs(envelope(), envelope())).toEqual(envelope());
  const fifty = envelope(
    Array.from({ length: 50 }, (_, i) => `https://source.example/${i}`)
  );
  expect(() => mergeLeadSourceRefs(fifty, envelope())).toThrow(
    'LEAD_SOURCE_REFS_CAP_REACHED'
  );
});
test('archived CryptoRank notes without fetched evidence remain unconfirmed', () => {
  const saved = require('./fixtures/lead-story-provenance/saved-stories.json');
  for (const pointer of ['/leads/1', '/leads/8']) {
    const row = saved.items.find((x) => x.pointer === pointer);
    expect(row.archivedClaim).toBe('CLAIMED_UNVERIFIED');
    expect(pageAttributions(null, row.sourceUrl).attributions).toEqual([]);
  }
});

test('canonical repeats retain attribution while preserving a single found article link', () => {
  const old = {
    ...envelope(),
    sources: [
      {
        url: fromUrl + '?utm_source=old',
        canonicalUrl: fromUrl,
        primaryStatus: 'UNKNOWN',
      },
    ],
    attributions: [
      {
        fromUrl: fromUrl + '?utm_source=old',
        targetUrl: 'https://original.example/story',
        state: 'CLAIMED_UNVERIFIED',
      },
    ],
  };
  const newer = {
    ...envelope(),
    sources: [
      {
        url: fromUrl,
        canonicalUrl: fromUrl,
        primaryStatus: 'VERIFIED_PRIMARY',
      },
    ],
  };
  const merged = mergeLeadSourceRefs(old, newer);
  expect(merged.sources).toHaveLength(1);
  expect(merged.attributions).toEqual([
    {
      fromUrl,
      targetUrl: 'https://original.example/story',
      state: 'CLAIMED_UNVERIFIED',
    },
  ]);
  expect(merged.sources[0].primaryStatus).toBe('VERIFIED_PRIMARY');
});
test('source context does not mark unrelated later links as attribution', () => {
  expect(
    pageAttributions(
      '<p>Source: <a href="https://source.example/a">A</a> and also read <a href="https://source.example/b">B</a></p>',
      fromUrl
    ).attributions.map((a) => a.targetUrl)
  ).toEqual(['https://source.example/a']);
});

test('malformed status objects cannot throw out of the defensive reader',()=>{
 const malformed={...envelope(),sources:[{...envelope().sources[0],primaryStatus:{toString:null}}]};expect(()=>readLeadSourceRefs(malformed)).not.toThrow();expect(readLeadSourceRefs(malformed)).toBeNull();
});

test('known reprint recognition is confined to confirmed CryptoRank feed routes',()=>{
 const {isKnownLeadReprint}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/leads/lead-source-refs.ts');
 const saved=require('./fixtures/lead-story-provenance/saved-stories.json');
 for(const row of saved.items.filter(row=>['/leads/1','/leads/8'].includes(row.pointer))){expect(isKnownLeadReprint(row.sourceUrl)).toBe(true);expect(isKnownLeadReprint(row.sourceUrl.replace('cryptorank.io','www.cryptorank.io'))).toBe(true);}
 for(const url of ['https://cryptorank.io/news/original','https://cryptorank.io/news/feed','https://cryptorank.io/currencies/bitcoin','https://blog.cryptorank.io/news/feed/slug','https://cryptorank.io.evil.example/news/feed/slug','https://www.cryptorank.io.evil.example/news/feed/slug','javascript:alert(1)',null])expect(isKnownLeadReprint(url)).toBe(false);
});
