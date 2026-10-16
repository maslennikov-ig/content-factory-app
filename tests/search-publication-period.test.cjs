'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { exaPublicationPeriod, invokeTavilyPeriodSearch } = loadWithMocks('libraries/nestjs-libraries/src/openai/search-publication-period.ts');
const period = { start: '2025-09-01T21:00:00.000Z', end: '2025-09-04T20:59:59.999Z' };
test('Exa receives exact anchored publication bounds; no period means no new filter', () => {
  expect(exaPublicationPeriod(period)).toEqual({ startPublishedDate: period.start, endPublishedDate: period.end });
  expect(exaPublicationPeriod()).toEqual({});
});
test('pinned Tavily adapter uses supported anchored calendar bounds and retains usage', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ results: [], usage: { credits: 1 } }) }));
  const result = await invokeTavilyPeriodSearch({ apiKey: 'fixture', query: 'a topic', period, topic: 'general', depth: 'advanced', maxResults: 8, fetchImpl });
  const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
  expect(body).toEqual(expect.objectContaining({ start_date: '2025-09-01', end_date: '2025-09-04', filter_by_published_date: true, include_published_date: true, include_usage: true }));
  expect(body).not.toHaveProperty('time_range');
  expect(result.usage.credits).toBe(1);
});
test('HTTP status survives for existing fallback policy', async () => {
  await expect(invokeTavilyPeriodSearch({ apiKey: 'fixture', query: 'topic', period, topic: 'news', depth: 'basic', maxResults: 5,
    fetchImpl: async () => ({ ok: false, status: 429 }) })).rejects.toMatchObject({ status: 429 });
});
