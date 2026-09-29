/**
 * The public URLs of the MCP entrance (`content-factory-next-kcxz.26`). No
 * imports of its own: the frontend layout reads it too, to show the MCP block
 * only where the backend answers (review W5-26 R5).
 */

export type McpUrls = {
  /** The backend's public base, e.g. `https://host/api`; also the issuer. */
  issuer: string;
  /** The protected resource: `${issuer}/mcp`, exactly as clients call it. */
  resource: string;
  resourceMetadata: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
};

export const trimSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * The public URLs, from the envs the app already has: `MCP_URL` (the one the
 * public-API page shows) or else `NEXT_PUBLIC_BACKEND_URL`, and
 * `FRONTEND_URL` for the consent page. `null` when either is missing: then no
 * MCP route answers, rather than advertising a guessed address.
 */
export const mcpUrls = (env: NodeJS.ProcessEnv = process.env): McpUrls | null => {
  const backend = (env.MCP_URL || env.NEXT_PUBLIC_BACKEND_URL || '').trim();
  const frontend = (env.FRONTEND_URL || '').trim();
  if (!backend || !frontend || !URL.canParse(backend) || !URL.canParse(frontend)) {
    return null;
  }
  const issuer = trimSlash(backend);
  return {
    issuer,
    resource: `${issuer}/mcp`,
    // Served by the backend under its own base, so it is reachable wherever
    // the backend is; `/mcp`'s 401 names it (RFC 9728 §5.1).
    resourceMetadata: `${issuer}/.well-known/oauth-protected-resource/mcp`,
    authorizationEndpoint: `${trimSlash(frontend)}/oauth/authorize`,
    tokenEndpoint: `${issuer}/oauth/mcp/token`,
    registrationEndpoint: `${issuer}/oauth/mcp/register`,
  };
};
