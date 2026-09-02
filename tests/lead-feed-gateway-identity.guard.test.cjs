require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `LeadFeedGateway.check` used to fall back to `${url}#${index}` as an
 * item's `externalId` when the parsed feed item had no `locator.identity`
 * (no id/guid/link). `ContentLeadRepository.upsertLeads` inserts with
 * `createMany({ skipDuplicates: true })` on `(organizationId,
 * subscriptionId, externalId)` — see `content-lead-dismissal-guard.
 * test.cjs`, the whole point of that uniqueness is that a dismissed lead's
 * identity is remembered forever. A position-derived id breaks that: once
 * item at index 1 is dismissed, whatever new item a later check happens to
 * place at index 1 is silently swallowed as "the same lead, already seen" —
 * even though it is unrelated content the person never saw.
 *
 * The fix replaces the index fallback with a `sha256` of
 * `url | title | publishedAt-ISO-or-empty`, so a genuinely different item
 * gets its own identity regardless of where the feed happens to place it on
 * a given pass.
 *
 * This drives the real `LeadFeedGateway.check` end to end against a stub
 * `SourceFetchGateway` and the real `parseSourcePayload`, so it exercises
 * the actual identity derivation, not a re-description of it.
 */

const { LeadFeedGateway } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-feed.gateway.ts',
  {
    '@nestjs/common': {
      Injectable: () => (target) => target,
      Optional: () => () => {},
    },
    // Only used as a constructor parameter's type in the real file — a
    // stand-in class is enough, the test never constructs a real one; it
    // hands `LeadFeedGateway` a `fetch` stub directly. Not loading the real
    // file avoids pulling in `undici`'s real socket machinery for a test
    // that only cares about identity derivation.
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-fetch.gateway':
      { SourceFetchGateway: class {} },
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/content-intelligence/source-registry/errors':
        'libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts',
      // network-policy.ts, source-access-policy.ts and source-parser.ts all
      // import `SourceRegistryError` with this same relative specifier.
      './errors':
        'libraries/nestjs-libraries/src/content-intelligence/source-registry/errors.ts',
      '@contentfactory/nestjs-libraries/content-intelligence/source-registry/network-policy':
        'libraries/nestjs-libraries/src/content-intelligence/source-registry/network-policy.ts',
      '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-access-policy':
        'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-access-policy.ts',
      '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-parser':
        'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-parser.ts',
    },
  }
);

const FEED_URL = 'https://example.test/feed.xml';

// Items with no <guid> and no <link> — the case that forces the fallback
// identity path. `<item>` order is what "index" would have used.
const rssFeed = (items) => `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Feed</title>
${items
  .map(
    (item) => `<item><title>${item.title}</title><description>${
      item.excerpt
    }</description></item>`
  )
  .join('\n')}
</channel></rss>`;

function makeGateway(body) {
  const fetchStub = {
    fetch: jest.fn(async (url, kind) => {
      if (kind === 'ROBOTS') {
        // An empty robots.txt (nothing disallowed) — `assertRobotsAllowed`
        // reads its `body` as a `Buffer`, not a string.
        return {
          body: Buffer.from(''),
          contentType: 'text/plain',
          charset: 'utf-8',
        };
      }
      return {
        body: Buffer.from(body, 'utf-8'),
        contentType: 'application/rss+xml',
        charset: 'utf-8',
      };
    }),
  };
  return new LeadFeedGateway(fetchStub, { enabled: true, deniedDomains: [] });
}

test('two items with no id/guid/link get different identities, never a shared position-derived one', async () => {
  const gateway = makeGateway(
    rssFeed([
      { title: 'Первая новость', excerpt: 'про первое' },
      { title: 'Вторая новость', excerpt: 'про второе' },
    ])
  );

  const result = await gateway.check(FEED_URL, 'RSS');

  expect(result.disabled).toBe(false);
  expect(result.items).toHaveLength(2);
  const [first, second] = result.items;
  expect(first.externalId).not.toEqual(second.externalId);
  // Not the old position-derived shape.
  expect(first.externalId).not.toMatch(/#\d+$/);
  expect(second.externalId).not.toMatch(/#\d+$/);
});

test('the same item content produces the same identity across two separate checks (stable, not index-derived)', async () => {
  const feedPass1 = rssFeed([
    { title: 'Заголовок A', excerpt: 'A' },
    { title: 'Заголовок B', excerpt: 'B' },
  ]);
  // Second pass: A drops off (e.g. it scrolled out of the feed window) and
  // B moves up to A's old position (index 0); a brand-new item C takes B's
  // old position (index 1).
  const feedPass2 = rssFeed([
    { title: 'Заголовок B', excerpt: 'B' },
    { title: 'Заголовок C', excerpt: 'C' },
  ]);

  const resultA = await makeGateway(feedPass1).check(FEED_URL, 'RSS');
  const resultB = await makeGateway(feedPass2).check(FEED_URL, 'RSS');

  const bFirstPass = resultA.items.find((i) => i.title === 'Заголовок B');
  const bSecondPass = resultB.items.find((i) => i.title === 'Заголовок B');
  const cSecondPass = resultB.items.find((i) => i.title === 'Заголовок C');

  // B kept its identity even though its index in the feed moved.
  expect(bSecondPass.externalId).toEqual(bFirstPass.externalId);
  // C, brand-new content that happens to now sit where A used to, gets its
  // own identity rather than colliding with anything already seen.
  const aFirstPass = resultA.items.find((i) => i.title === 'Заголовок A');
  expect(cSecondPass.externalId).not.toEqual(aFirstPass.externalId);
});
