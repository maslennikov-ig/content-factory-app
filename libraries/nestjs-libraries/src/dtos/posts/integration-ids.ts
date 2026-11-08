/** Accept a comma separated query or repeated query parameters. */
export const transformIntegrationIds = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : value;

export function integrationIdsFilter(query: {
  integrationId?: string;
  integrationIds?: string[];
}) {
  return query.integrationIds?.length
    ? {
        id: {
          in: query.integrationIds,
          ...(query.integrationId ? { equals: query.integrationId } : {}),
        },
      }
    : query.integrationId
    ? { id: query.integrationId }
    : {};
}
