const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const old = require('./helpers/reader-source-review.cjs');
const current = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-proof-review-v9.ts'
);

// The real provider contract, not a fake server that accepts every schema:
// https://developers.openai.com/api/docs/guides/structured-outputs
const assertProviderSchema = (value) => {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object') {
    expect(value.additionalProperties).toBe(false);
    expect([...(value.required ?? [])].sort()).toEqual(
      Object.keys(value.properties ?? {}).sort()
    );
  }
  Object.values(value).forEach(assertProviderSchema);
};

test.each([1, 3, 5])(
  'active reader schema follows the provider required-field contract for %s sources',
  (count) => {
    const sources = Array.from({ length: count }, (_, i) => ({
      url: `https://example.test/schema-${i}`,
      title: `Synthetic ${i}`,
      publishedAt: null,
    }));
    const input = current.prepareReaderReviewV9(
      old.packReaderReview(
        'Что известно о Telegram?',
        sources,
        sources.map((source, i) => ({
          sourceUrl: source.url,
          text: `Telegram упомянут в учебном источнике ${i}.`,
        })),
        'Russian'
      )
    );
    expect(input).not.toBeNull();
    assertProviderSchema(current.readerReviewV9GenerationSchema(input));
  }
);
