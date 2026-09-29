import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The OAuth rules of the MCP entrance (`content-factory-next-kcxz.26`, spec
 * §4.10, ADR-0012). Pure functions, no database: what the authorization
 * server advertises, which redirects it accepts, how PKCE and the `resource`
 * binding are checked, and how a token is hashed before it is stored.
 *
 * Clients: Claude (custom connector, Claude Code) and ChatGPT (connector,
 * developer mode) register themselves (RFC 7591) as public clients, send PKCE
 * S256 on every authorization and `resource=<MCP URL>` (RFC 8707), refresh on
 * a 401 and expect refresh tokens to rotate. Version-grounded in
 * `.codex/stages/content-factory-next-kcxz/evidence/mcp-w5-docs-2026-09-28.md` §2.
 */

export const MCP_SCOPE = 'mcp';
/** Asked for by clients that want a refresh token (Claude adds it when listed). */
export const MCP_OFFLINE_SCOPE = 'offline_access';
export const MCP_SCOPES = [MCP_SCOPE, MCP_OFFLINE_SCOPE] as const;

/** Every client id this server issues starts so; the consent page routes by it. */
export const MCP_CLIENT_ID_PREFIX = 'mcp_';
export const MCP_ACCESS_TOKEN_PREFIX = 'mcpa_';
export const MCP_REFRESH_TOKEN_PREFIX = 'mcpr_';

export const MCP_CODE_TTL_MS = 10 * 60 * 1000;
/** Short-lived access (1 h); clients refresh on a 401 or before expiry. */
export const MCP_ACCESS_TTL_SECONDS = 60 * 60;
export const MCP_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Registration is anonymous, so a client row is kept small (review W5-26 F3). */
export const MCP_REDIRECT_URIS_MAX = 5;
export const MCP_REDIRECT_URI_MAX_LENGTH = 512;
export const MCP_CLIENT_NAME_MAX = 100;
/** The whole registration body, as JSON. Claude's and ChatGPT's are well under 1 KB. */
export const MCP_CLIENT_METADATA_MAX_BYTES = 4096;
/**
 * Swept on each registration (walk review F3): a grant whose code was never
 * exchanged, and a registered client with no grant row left, go after this.
 */
export const MCP_UNUSED_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * A revoked grant, or one whose refresh token expired, goes this long after
 * — kept so far so a replayed code or rotated refresh token is still
 * recognised as one for a while (walk review F3).
 */
export const MCP_DEAD_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export { mcpUrls, type McpUrls } from './mcp-urls';
import { trimSlash, type McpUrls } from './mcp-urls';

/** RFC 9728 protected-resource metadata. */
export const protectedResourceMetadata = (urls: McpUrls) => ({
  resource: urls.resource,
  authorization_servers: [urls.issuer],
  scopes_supported: [...MCP_SCOPES],
  bearer_methods_supported: ['header'],
  resource_name: 'Content Factory',
});

/** RFC 8414 authorization-server metadata. */
export const authorizationServerMetadata = (urls: McpUrls) => ({
  issuer: urls.issuer,
  authorization_endpoint: urls.authorizationEndpoint,
  token_endpoint: urls.tokenEndpoint,
  registration_endpoint: urls.registrationEndpoint,
  scopes_supported: [...MCP_SCOPES],
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
  // RFC 9207: the authorization response carries `iss`.
  authorization_response_iss_parameter_supported: true,
});

/** `WWW-Authenticate` of a refused `/mcp` request (RFC 6750 §3, RFC 9728 §5.1). */
export const bearerChallenge = (
  urls: McpUrls,
  error?: 'invalid_token' | 'invalid_request'
) =>
  [
    'Bearer',
    [
      ...(error ? [`error="${error}"`] : []),
      `resource_metadata="${urls.resourceMetadata}"`,
      `scope="${MCP_SCOPE}"`,
    ].join(', '),
  ].join(' ');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A redirect a client may register: `https` anywhere, or `http` on a loopback
 * host (Claude Code, local inspectors) — never a fragment, credentials or
 * another scheme.
 */
export const validRedirectUri = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    value.length > MCP_REDIRECT_URI_MAX_LENGTH ||
    !URL.canParse(value)
  ) {
    return false;
  }
  const url = new URL(value);
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return !!url.hostname;
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
};

/**
 * The presented redirect equals a registered one, or — loopback only (RFC 8252
 * §7.3) — equals it but for the port, which a native client picks at run time.
 */
export const redirectMatches = (registered: readonly string[], presented: unknown) => {
  if (!validRedirectUri(presented)) return false;
  if (registered.includes(presented)) return true;
  const asked = new URL(presented);
  if (!LOOPBACK_HOSTS.has(asked.hostname)) return false;
  return registered.some((entry) => {
    if (!validRedirectUri(entry)) return false;
    const known = new URL(entry);
    return (
      LOOPBACK_HOSTS.has(known.hostname) &&
      known.protocol === asked.protocol &&
      known.hostname === asked.hostname &&
      known.pathname === asked.pathname &&
      known.search === asked.search
    );
  });
};

/** The host the consent page names («… вернёт вас на claude.ai»). */
export const redirectHost = (uri: string) => new URL(uri).host;

const base64url = (buffer: Buffer) => buffer.toString('base64url');

/** RFC 7636 §4.1: 43–128 unreserved characters. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** A S256 challenge is 32 bytes in base64url, 43 characters. */
const CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export const validCodeChallenge = (value: unknown): value is string =>
  typeof value === 'string' && CHALLENGE.test(value);

export const pkceChallengeOf = (verifier: string) =>
  base64url(createHash('sha256').update(verifier).digest());

export const pkceMatches = (verifier: unknown, challenge: string | null | undefined) => {
  if (typeof verifier !== 'string' || !VERIFIER.test(verifier) || !challenge) return false;
  const expected = Buffer.from(challenge);
  const actual = Buffer.from(pkceChallengeOf(verifier));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/** What is stored for a code or token: its SHA-256, never the value. */
export const hashSecret = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export const newSecret = (prefix: string) => `${prefix}${base64url(randomBytes(32))}`;

export const newClientId = () => `${MCP_CLIENT_ID_PREFIX}${base64url(randomBytes(18))}`;

/**
 * The `resource` a client names is this server's MCP URL (a trailing slash
 * forgiven). A client that names none gets it bound anyway: there is only one
 * resource here.
 */
export const resourceMatches = (presented: unknown, expected: string) =>
  presented === undefined ||
  presented === null ||
  presented === '' ||
  (typeof presented === 'string' && trimSlash(presented) === trimSlash(expected));

/**
 * The granted scope: `mcp`, plus `offline_access` when asked for. Anything
 * else is ignored rather than refused — clients send what the metadata lists.
 */
export const grantedScope = (asked: unknown) => {
  const words = typeof asked === 'string' ? asked.split(/\s+/).filter(Boolean) : [];
  return [MCP_SCOPE, ...(words.includes(MCP_OFFLINE_SCOPE) ? [MCP_OFFLINE_SCOPE] : [])].join(' ');
};

/** RFC 6749 error bodies. */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'invalid_target'
  | 'access_denied'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata';

export class McpOAuthError extends Error {
  constructor(
    readonly error: OAuthErrorCode,
    readonly description: string,
    readonly status = 400
  ) {
    super(description);
  }

  body() {
    return { error: this.error, error_description: this.description };
  }
}
