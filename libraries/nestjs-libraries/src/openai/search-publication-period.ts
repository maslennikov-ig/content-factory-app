/** Publication constraints narrow discovery only. They never establish an event's date. */
export type SearchPublicationPeriod = { start?: string; end: string };

export const exaPublicationPeriod = (period?: SearchPublicationPeriod) => period
  ? { ...(period.start ? { startPublishedDate: period.start } : {}), endPublishedDate: period.end }
  : {};

/**
 * The pinned LangChain Tavily tool accepts only a relative timeRange. Use the
 * documented HTTP fields for anchored/historical requests, preserving the
 * existing adapter's response/usage/error handling and routing.
 * Sources checked 2026-10-16:
 * https://exa.ai/docs/reference/search (startPublishedDate/endPublishedDate)
 * https://docs.tavily.com/documentation/api-reference/endpoint/search
 * (start_date/end_date/filter_by_published_date/include_published_date).
 */
export const invokeTavilyPeriodSearch = async (input: {
  apiKey: string;
  query: string;
  period: SearchPublicationPeriod;
  topic: 'news' | 'general';
  depth: 'basic' | 'advanced';
  maxResults: number;
  country?: string;
  fetchImpl?: typeof fetch;
}): Promise<unknown> => {
  const response = await (input.fetchImpl || fetch)('https://api.tavily.com/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: input.query, topic: input.topic, search_depth: input.depth,
      max_results: input.maxResults, include_answer: true, include_raw_content: true,
      include_usage: true, include_published_date: true, filter_by_published_date: true,
      // Tavily's bounds have day precision; event admission retains exact instants.
      ...(input.period.start ? { start_date: input.period.start.slice(0, 10) } : {}),
      end_date: input.period.end.slice(0, 10),
      ...(input.topic === 'general' && input.country ? { country: input.country } : {}),
    }),
  });
  if (!response.ok) {
    const error = new Error(`Tavily search failed with status ${response.status}`) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
};
