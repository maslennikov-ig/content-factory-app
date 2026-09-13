'use strict';

/**
 * `content-factory-next-75xn.23` (F14). The date a lead is announced with.
 *
 * On 13.09.2026 the owner's pass dated forty leads by hand and found that the
 * product knew the date of ten. The other thirty carried «свежее за 30 дней»
 * over pages that had no date at all — among them evergreen explainers and a
 * list of a hundred speech topics. The rule is now the opposite: no date, no
 * lead. This suite pins the three signals that supply one and, just as
 * importantly, what must never pass for a date.
 *
 * Pure by construction: HTML in, a date or nothing out. No fetch, no network,
 * no clock beyond the one each test hands in.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const {
  pageDate,
  pageDateFromMeta,
  pageDateFromJsonLd,
  pageDateFromUrl,
  believableDate,
} = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-page-date.ts'
);

const NOW = new Date('2026-09-13T12:00:00.000Z');
const day = (value) => new Date(value).toISOString().slice(0, 10);

describe('signal one: what the page says about itself in its meta tags', () => {
  test('article:published_time is read', () => {
    const html = `<html><head>
      <meta property="og:title" content="Комиссии выросли">
      <meta property="article:published_time" content="2026-09-07T09:30:00+03:00">
    </head><body>…</body></html>`;

    expect(day(pageDateFromMeta(html, NOW))).toBe('2026-09-07');
  });

  test('the og: prefixed spelling and the plain name= ones are read too', () => {
    const og = '<meta property="og:article:published_time" content="2026-09-01">';
    const named = "<meta name='pubdate' content='2026-08-30T10:00:00Z'>";
    const dashed = '<meta name="publish-date" content="2026-08-29">';

    expect(day(pageDateFromMeta(og, NOW))).toBe('2026-09-01');
    expect(day(pageDateFromMeta(named, NOW))).toBe('2026-08-30');
    expect(day(pageDateFromMeta(dashed, NOW))).toBe('2026-08-29');
  });

  test('a modification date is not a publication date', () => {
    const html =
      '<meta property="article:modified_time" content="2026-09-10T10:00:00Z">';

    expect(pageDateFromMeta(html, NOW)).toBeNull();
  });
});

describe('signal two: schema.org markup', () => {
  test('datePublished of a NewsArticle is read', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"NewsArticle","headline":"x",
       "datePublished":"2026-09-05T08:00:00Z"}
    </script>`;

    expect(day(pageDateFromJsonLd(html, NOW))).toBe('2026-09-05');
  });

  test('it is found inside @graph, where most CMS put it', () => {
    const html = `<script type='application/ld+json'>
      {"@graph":[{"@type":"WebSite","name":"Site"},
                 {"@type":["BlogPosting","CreativeWork"],
                  "datePublished":"2026-08-28"}]}
    </script>`;

    expect(day(pageDateFromJsonLd(html, NOW))).toBe('2026-08-28');
  });

  test('the date of the website that embeds the article is not the article’s date', () => {
    const html = `<script type="application/ld+json">
      {"@type":"WebSite","datePublished":"2011-01-01"}
    </script>`;

    expect(pageDateFromJsonLd(html, NOW)).toBeNull();
  });

  test('a publisher’s broken JSON costs nothing: the next block still answers', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Article",,,}</script>
      <script type="application/ld+json">{"@type":"Article","datePublished":"2026-09-02"}</script>`;

    expect(day(pageDateFromJsonLd(html, NOW))).toBe('2026-09-02');
  });
});

describe('signal three: the address', () => {
  test('a dated path is read, in both spellings', () => {
    expect(day(pageDateFromUrl('https://news.example/2026/09/03/topic', NOW))).toBe(
      '2026-09-03'
    );
    expect(
      day(pageDateFromUrl('https://news.example/blog/2026-08-25-topic.html', NOW))
    ).toBe('2026-08-25');
  });

  test('a number that is not a date is not one', () => {
    // Version numbers and identifiers in a path are the false positive this
    // signal exists to avoid: `/2026/13/45/` is not a day.
    expect(pageDateFromUrl('https://docs.example/2026/13/45/page', NOW)).toBeNull();
    expect(pageDateFromUrl('https://docs.example/sdk/1/48/0', NOW)).toBeNull();
    expect(pageDateFromUrl('https://docs.example/release-notes-2026', NOW)).toBeNull();
  });
});

describe('what is never a date', () => {
  test('an unparseable string, a future date and an absurd year are all refused', () => {
    expect(believableDate('вчера', NOW)).toBeNull();
    expect(believableDate('2027-01-01T00:00:00Z', NOW)).toBeNull();
    expect(believableDate('1970-01-01', NOW)).toBeNull();
    // A publisher's clock may run ahead of ours by hours; that is not a
    // reason to throw the row away.
    expect(day(believableDate('2026-09-13T20:00:00Z', NOW))).toBe('2026-09-13');
  });

  test('a page with none of the three signals has no date, and none is invented', () => {
    expect(pageDate('<html><body><p>Текст без даты</p></body></html>', 'https://x.example/a', NOW)).toBeNull();
    expect(pageDate('', 'https://x.example/a', NOW)).toBeNull();
    expect(pageDate(null, 'https://x.example/a', NOW)).toBeNull();
  });
});

describe('the order the three are asked in', () => {
  test('a meta tag beats schema.org, and schema.org beats the address', () => {
    const everything = `
      <meta property="article:published_time" content="2026-09-07">
      <script type="application/ld+json">{"@type":"Article","datePublished":"2026-09-05"}</script>`;
    const url = 'https://news.example/2026/09/01/topic';

    expect(day(pageDate(everything, url, NOW))).toBe('2026-09-07');
    expect(
      day(
        pageDate(
          '<script type="application/ld+json">{"@type":"Article","datePublished":"2026-09-05"}</script>',
          url,
          NOW
        )
      )
    ).toBe('2026-09-05');
    expect(day(pageDate('<html></html>', url, NOW))).toBe('2026-09-01');
  });
});
