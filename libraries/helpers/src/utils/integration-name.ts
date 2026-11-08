/** Workspace alias is presentation only; provider identity keeps its own name. */
export function integrationDisplayName(integration: {
  name: string;
  displayName?: string | null;
}): string {
  return integration.displayName?.trim() || integration.name;
}

/** Keep every consumer of a channel label consistent, including older screens. */
export function withIntegrationDisplayName<
  T extends {
    name: string;
    displayName?: string | null;
    originalName?: string;
  }
>(integration: T) {
  return {
    ...integration,
    originalName: integration.originalName ?? integration.name,
    name: integrationDisplayName(integration),
  };
}
