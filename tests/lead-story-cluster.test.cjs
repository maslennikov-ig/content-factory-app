const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { groupLeadStories } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-story-cluster.ts'
);
const saved = require('./fixtures/lead-story-provenance/saved-stories.json');
const item = (title, url, date = '2026-09-01') => ({
  title,
  externalId: url,
  sourceUrl: url,
  excerpt: null,
  publishedAt: date ? new Date(date) : null,
});
const pair = (a, b) =>
  saved.items
    .filter((x) => [a, b].includes(x.pointer))
    .map((x) => ({
      ...x,
      externalId: x.sourceUrl,
      publishedAt: new Date(x.publishedAt),
    }));
test.each([
  ['/leads/4', '/leads/5', 'Четырёхдневка'],
  ['/leads/13', '/leads/14', 'Маркетплейсы'],
])('saved positive %s %s retains both links', (a, b, topic) => {
  const result = groupLeadStories(pair(a, b), topic);
  expect(result).toHaveLength(1);
  expect(result[0].sourceRefsJson.sources).toHaveLength(2);
});
test('same topic different events remain separate', () =>
  expect(groupLeadStories(pair('/leads/0', '/leads/9'), 'AI Act')).toHaveLength(
    2
  ));
test('different languages and four-day gap need more direct evidence', () =>
  expect(
    groupLeadStories(pair('/leads/11', '/leads/12'), 'Маркетплейсы')
  ).toHaveLength(2));
test('complete link prevents transitive bridges and is input order independent', () => {
  const a = item('alpha bravo charlie delta echo', 'https://a.example/a');
  const b = item('alpha bravo charlie foxtrot golf', 'https://b.example/b');
  const c = item('charlie foxtrot golf hotel india', 'https://c.example/c');
  const result = groupLeadStories([a, b, c], 'topic');
  expect(result).toHaveLength(2);
  expect(groupLeadStories([c, b, a], 'topic')).toEqual(result);
  expect(
    result.some(
      (x) =>
        x.sourceRefsJson.sources.some((s) => s.url === a.sourceUrl) &&
        x.sourceRefsJson.sources.some((s) => s.url === c.sourceUrl)
    )
  ).toBe(false);
});
test('only topic words or no date cannot establish an event', () => {
  expect(
    groupLeadStories(
      [
        item('alpha bravo charlie', 'https://a.example'),
        item('alpha bravo charlie', 'https://b.example'),
      ],
      'alpha bravo charlie'
    )
  ).toHaveLength(2);
  expect(
    groupLeadStories(
      [
        item('alpha bravo charlie', 'https://a.example'),
        item('alpha bravo charlie', 'https://b.example', null),
      ],
      'other'
    )
  ).toHaveLength(2);
});
