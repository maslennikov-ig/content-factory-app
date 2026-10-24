/** Identity of evidence actually returned, not the model's search/read phrasing.
 * The execution owner hashes this value; it never retains source bodies here.
 * undefined means this is not a research operation: use the ordinary identity.
 */
export const researchProgressIdentity = (toolName: string, _input: unknown, output: unknown): unknown | undefined => {
  if (!['piece.read', 'piece_read', 'research.search', 'research_search'].includes(toolName)) return undefined;
  if (!output || typeof output !== 'object') return undefined;
  const result = output as Record<string, any>;
  const summary = result.summary?.untrustedData?.value ?? result.summary ?? result;
  if (!summary || typeof summary !== 'object') return undefined;
  if (toolName === 'piece.read' || toolName === 'piece_read') {
    if (summary.part !== 'research_source' && summary.part !== 'research_fact' && summary.part !== 'research_assessment') return undefined;
    return ['research-read', {
      source: summary.sourceUrl ?? summary.url ?? [summary.snapshotKey, summary.sourceIndex],
      factKey: summary.factKey,
      revision: summary.revision,
      offset: summary.offset,
      text: summary.text,
      status: summary.status,
    }];
  }
  if (result.ok === false) return ['research-search-failure', result.code, result.reason];
  // A provider may reorder the same sources or issue a new snapshot id. Neither
  // creates new evidence. Dates and assessment remain part of real progress.
  const sorted = (rows: unknown[]) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return ['research-search', {
    sources: sorted((Array.isArray(summary.sources) ? summary.sources : []).map((source: any) => ({
      url: source.url, revision: source.revision, publishedAt: source.publishedAt,
      excerpt: source.excerpt, totalCharacters: source.totalCharacters,
    }))),
    facts: sorted((Array.isArray(summary.facts) ? summary.facts : []).map((fact: any) => ({
      statement: fact.statement ?? fact.text, quote: fact.quote, sourceUrl: fact.sourceUrl,
      status: fact.status, dateProvenance: fact.dateProvenance,
    }))),
    assessment: summary.assessment && { status: summary.assessment.status, periodStatus: summary.assessment.periodStatus,
      requestedDate: summary.assessment.requestedDate, requestedPeriod: summary.assessment.requestedPeriod,
      claimDisposition: summary.assessment.claimDisposition },
    outcome: summary.outcome,
  }];
};
