import { Injectable } from '@nestjs/common';
import { McpOAuthRepository } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.repository';
import {
  grantedScope,
  hashSecret,
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_ACCESS_TTL_SECONDS,
  MCP_CLIENT_ID_PREFIX,
  MCP_CLIENT_METADATA_MAX_BYTES,
  MCP_CLIENT_NAME_MAX,
  MCP_CODE_TTL_MS,
  MCP_REDIRECT_URIS_MAX,
  MCP_REFRESH_TOKEN_PREFIX,
  MCP_REFRESH_TTL_MS,
  MCP_DEAD_GRANT_TTL_MS,
  MCP_UNUSED_TTL_MS,
  McpOAuthError,
  type McpUrls,
  newClientId,
  newSecret,
  pkceMatches,
  redirectHost,
  redirectMatches,
  resourceMatches,
  validCodeChallenge,
  validRedirectUri,
} from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules';

/**
 * The MCP authorization server (`content-factory-next-kcxz.26`, spec §4.10):
 * dynamic registration of public clients, the consent step, the code and
 * refresh grants, and the check `/mcp` runs on every request.
 *
 * It extends the product's OAuth rather than replacing it: the third-party app
 * flow (`OAuthService`, `/oauth/authorize`, `/oauth/token`) is untouched, and
 * an MCP connection is listed and revoked in the same «approved apps» place.
 */

type Clock = () => Date;

export type McpAuthorizeRequest = {
  client_id?: unknown;
  redirect_uri?: unknown;
  response_type?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  resource?: unknown;
  scope?: unknown;
  state?: unknown;
};

export type McpTokenRequest = {
  grant_type?: unknown;
  client_id?: unknown;
  code?: unknown;
  code_verifier?: unknown;
  redirect_uri?: unknown;
  refresh_token?: unknown;
  resource?: unknown;
};

/** Why a bearer was refused; the door says only `invalid_token`. */
export type McpBearerRefusal =
  | 'missing'
  | 'not_mcp_token'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'wrong_audience'
  | 'inactive_user'
  | 'not_member';

export type McpBearerIdentity = {
  grantId: string;
  clientId: string;
  scopes: string[];
  /** Seconds since the epoch, as the MCP SDK's `AuthInfo` wants it. */
  expiresAt: number;
  organizationId: string;
  organizationCreatedAt: string;
  userId: string;
  role: 'USER' | 'EDITOR' | 'ADMIN' | 'SUPERADMIN';
  userLanguage: unknown;
  userTimezone: unknown;
};

const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPERADMIN'] as const;
const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

@Injectable()
export class McpOAuthService {
  private now: Clock = () => new Date();

  constructor(private _repository: McpOAuthRepository) {}

  /** Tests move time; nothing else calls this. */
  useClock(clock: Clock) {
    this.now = clock;
  }

  /** RFC 7591: a public client with its redirects. */
  async register(body: Record<string, unknown>) {
    if (Buffer.byteLength(JSON.stringify(body ?? {})) > MCP_CLIENT_METADATA_MAX_BYTES) {
      throw new McpOAuthError('invalid_client_metadata', 'The client metadata is too large.');
    }
    const redirects = body?.redirect_uris;
    if (
      !Array.isArray(redirects) ||
      !redirects.length ||
      redirects.length > MCP_REDIRECT_URIS_MAX ||
      !redirects.every(validRedirectUri)
    ) {
      throw new McpOAuthError(
        'invalid_redirect_uri',
        'redirect_uris must list 1–5 https URLs of at most 512 characters, or http on localhost/127.0.0.1.'
      );
    }
    const method = body.token_endpoint_auth_method;
    if (method !== undefined && method !== 'none') {
      throw new McpOAuthError(
        'invalid_client_metadata',
        'Only public clients are registered here: token_endpoint_auth_method must be "none".'
      );
    }
    const grants = body.grant_types;
    if (
      grants !== undefined &&
      (!Array.isArray(grants) ||
        !grants.every((grant) => grant === 'authorization_code' || grant === 'refresh_token'))
    ) {
      throw new McpOAuthError(
        'invalid_client_metadata',
        'grant_types may name authorization_code and refresh_token only.'
      );
    }
    const responses = body.response_types;
    if (
      responses !== undefined &&
      (!Array.isArray(responses) || !responses.every((type) => type === 'code'))
    ) {
      throw new McpOAuthError('invalid_client_metadata', 'response_types may name code only.');
    }
    const name =
      (str(body.client_name) ?? '').replace(/\s+/g, ' ').trim().slice(0, MCP_CLIENT_NAME_MAX) ||
      'MCP client';

    await this._repository.sweepUnused(
      new Date(this.now().getTime() - MCP_UNUSED_TTL_MS),
      new Date(this.now().getTime() - MCP_DEAD_GRANT_TTL_MS)
    );
    const client = await this._repository.createClient({
      clientId: newClientId(),
      name,
      redirectUris: [...new Set(redirects as string[])],
    });
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /**
   * Checks an authorization request before the person sees it. The client and
   * its redirect are checked first: until both are known good, nothing may be
   * sent back to the redirect (RFC 6749 §4.1.2.1).
   */
  async checkAuthorization(query: McpAuthorizeRequest, urls: McpUrls) {
    const clientId = str(query.client_id);
    const client =
      clientId && clientId.startsWith(MCP_CLIENT_ID_PREFIX)
        ? await this._repository.findClient(clientId)
        : null;
    if (!client) {
      throw new McpOAuthError('invalid_client', 'Unknown client_id.');
    }
    const redirectUri = str(query.redirect_uri);
    if (!redirectMatches(client.redirectUris, redirectUri)) {
      throw new McpOAuthError('invalid_request', 'redirect_uri is not registered for this client.');
    }
    // From here on a problem goes back to the client on its redirect.
    const back = { redirectUri: redirectUri!, state: str(query.state) };
    if (query.response_type !== 'code') {
      return { refused: { ...back, error: 'unsupported_response_type' as const } };
    }
    if (query.code_challenge_method !== 'S256' || !validCodeChallenge(query.code_challenge)) {
      return {
        refused: { ...back, error: 'invalid_request' as const, description: 'PKCE S256 is required.' },
      };
    }
    if (!resourceMatches(query.resource, urls.resource)) {
      return {
        refused: { ...back, error: 'invalid_target' as const, description: 'Unknown resource.' },
      };
    }
    return {
      client: { id: client.id, clientId: client.clientId, name: client.name },
      redirectUri: redirectUri!,
      redirectHost: redirectHost(redirectUri!),
      codeChallenge: query.code_challenge as string,
      scope: grantedScope(query.scope),
      state: back.state,
    };
  }

  /** The person said yes: a code bound to them, the workspace, PKCE and the resource. */
  async approve(
    checked: {
      client: { id: string };
      redirectUri: string;
      codeChallenge: string;
      scope: string;
    },
    person: { userId: string; organizationId: string },
    urls: McpUrls
  ) {
    const code = newSecret('mcpc_');
    await this._repository
      .createGrant({
      clientId: checked.client.id,
      userId: person.userId,
      organizationId: person.organizationId,
      resource: urls.resource,
      scope: checked.scope,
      redirectUri: checked.redirectUri,
      codeHash: hashSecret(code),
      codeChallenge: checked.codeChallenge,
      codeExpiresAt: new Date(this.now().getTime() + MCP_CODE_TTL_MS),
    })
      .catch((error: unknown) => {
        // The client was swept between the check and the decision (R1): a
        // foreign-key refusal, answered in words rather than a 500.
        if ((error as { code?: unknown })?.code === 'P2003') {
          throw new McpOAuthError(
            'invalid_client',
            'This assistant’s registration has expired; start connecting again from the assistant.'
          );
        }
        throw error;
      });
    return code;
  }

  /** The redirect of an authorization response, with `iss` (RFC 9207). */
  redirectWith(
    redirectUri: string,
    params: Record<string, string | undefined>,
    urls: McpUrls
  ) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries({ ...params, iss: urls.issuer })) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  async token(body: McpTokenRequest, urls: McpUrls) {
    if (body.grant_type === 'authorization_code') return this.exchangeCode(body, urls);
    if (body.grant_type === 'refresh_token') return this.refresh(body, urls);
    throw new McpOAuthError(
      'unsupported_grant_type',
      'Only authorization_code and refresh_token are supported.'
    );
  }

  private async clientOf(body: McpTokenRequest) {
    const clientId = str(body.client_id);
    const client = clientId ? await this._repository.findClient(clientId) : null;
    if (!client) throw new McpOAuthError('invalid_client', 'Unknown client_id.', 401);
    return client;
  }

  private async exchangeCode(body: McpTokenRequest, urls: McpUrls) {
    const client = await this.clientOf(body);
    const code = str(body.code);
    const grant = code ? await this._repository.findByCode(hashSecret(code)) : null;
    const dead = new McpOAuthError('invalid_grant', 'The code is unknown, used or expired.');
    if (!grant || grant.revokedAt || grant.clientId !== client.id) throw dead;
    // Everything a valid exchange proves comes first (review W5-26 R3): only a
    // code that is still live and whose verifier matches can revoke anything,
    // so a leaked code alone (browser history) cannot end a connection.
    if (!grant.codeExpiresAt || grant.codeExpiresAt <= this.now()) throw dead;
    if (str(body.redirect_uri) !== grant.redirectUri) {
      throw new McpOAuthError('invalid_grant', 'redirect_uri differs from the authorization request.');
    }
    if (!pkceMatches(body.code_verifier, grant.codeChallenge)) {
      throw new McpOAuthError('invalid_grant', 'PKCE verification failed.');
    }
    if (!resourceMatches(body.resource, grant.resource) || grant.resource !== urls.resource) {
      throw new McpOAuthError('invalid_target', 'The resource differs from the one authorized.');
    }
    // A second exchange of a valid code — sequential or the loser of two
    // parallel ones — revokes what the code produced (RFC 6749 §4.1.2). A
    // client that retries the token request after a network error loses the
    // connection too and authorizes again: the RFC's choice, kept.
    if (grant.codeUsedAt || !(await this._repository.consumeCode(grant.id, grant.codeHash!))) {
      await this._repository.revoke(grant.id);
      throw dead;
    }
    await this.personStillMay(grant);
    return this.issue(grant.id, grant.scope);
  }

  private async refresh(body: McpTokenRequest, urls: McpUrls) {
    const client = await this.clientOf(body);
    const presented = str(body.refresh_token);
    const dead = new McpOAuthError('invalid_grant', 'The refresh token is unknown, used, revoked or expired.');
    if (!presented) throw dead;
    const hash = hashSecret(presented);
    const grant = await this._repository.findByRefresh(hash);
    if (!grant) {
      // A refresh token that was already rotated away came back: it leaked or
      // was replayed. The whole connection goes (OAuth 2.1 §4.3.1).
      const replayed = await this._repository.findByRotatedRefresh(hash);
      if (replayed) await this._repository.revoke(replayed.id);
      throw dead;
    }
    if (grant.revokedAt || grant.clientId !== client.id) throw dead;
    if (!grant.refreshExpiresAt || grant.refreshExpiresAt <= this.now()) throw dead;
    if (!resourceMatches(body.resource, grant.resource) || grant.resource !== urls.resource) {
      throw new McpOAuthError('invalid_target', 'The resource differs from the one authorized.');
    }
    await this.personStillMay(grant);
    return this.issue(grant.id, grant.scope, hash);
  }

  /** A refresh is refused to a person who may no longer use the workspace. */
  private async personStillMay(grant: {
    userId: string;
    organizationId: string;
    user: { activated: boolean; blockedAt: Date | null };
  }) {
    const membership = await this._repository.membership(grant.userId, grant.organizationId);
    if (!grant.user.activated || grant.user.blockedAt || !membership || membership.disabled) {
      throw new McpOAuthError('invalid_grant', 'This person no longer has access to the workspace.');
    }
  }

  private async issue(grantId: string, scope: string, replacing?: string) {
    const accessToken = newSecret(MCP_ACCESS_TOKEN_PREFIX);
    const refreshToken = newSecret(MCP_REFRESH_TOKEN_PREFIX);
    const now = this.now().getTime();
    const written = await this._repository.setTokens(
      grantId,
      {
        accessTokenHash: hashSecret(accessToken),
        accessExpiresAt: new Date(now + MCP_ACCESS_TTL_SECONDS * 1000),
        refreshTokenHash: hashSecret(refreshToken),
        refreshExpiresAt: new Date(now + MCP_REFRESH_TTL_MS),
      },
      replacing
    );
    if (!written) {
      throw new McpOAuthError('invalid_grant', 'The grant changed while it was being used; start again.');
    }
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: MCP_ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
      scope,
    };
  }

  /**
   * The check behind `/mcp`, on every request: a live MCP access token for
   * this resource, an active person, a membership that is not disabled — and
   * the role read from that membership now, never from the token.
   */
  async authenticate(
    token: string | undefined,
    urls: McpUrls
  ): Promise<{ identity: McpBearerIdentity } | { refused: McpBearerRefusal }> {
    if (!token) return { refused: 'missing' };
    // The workspace API key and the third-party `pos_` tokens never open MCP
    // (premortem X3): they name no person.
    if (!token.startsWith(MCP_ACCESS_TOKEN_PREFIX)) return { refused: 'not_mcp_token' };
    const grant = await this._repository.findByAccess(hashSecret(token));
    if (!grant) return { refused: 'unknown' };
    if (grant.revokedAt) return { refused: 'revoked' };
    if (!grant.accessExpiresAt || grant.accessExpiresAt <= this.now()) {
      return { refused: 'expired' };
    }
    if (grant.resource !== urls.resource) return { refused: 'wrong_audience' };
    if (!grant.user.activated || grant.user.blockedAt) return { refused: 'inactive_user' };
    const membership = await this._repository.membership(grant.userId, grant.organizationId);
    if (!membership || membership.disabled) return { refused: 'not_member' };
    const role = (ROLES as readonly string[]).includes(membership.role)
      ? (membership.role as McpBearerIdentity['role'])
      : 'USER';
    return {
      identity: {
        grantId: grant.id,
        clientId: grant.client.clientId,
        scopes: grant.scope.split(' ').filter(Boolean),
        expiresAt: Math.floor(grant.accessExpiresAt.getTime() / 1000),
        organizationId: grant.organizationId,
        organizationCreatedAt: new Date(grant.organization.createdAt).toISOString(),
        userId: grant.userId,
        role,
        userLanguage: grant.user.language,
        userTimezone: grant.user.timezone,
      },
    };
  }

  /** The «approved apps» rows for the person's live MCP connections. */
  async approvedConnections(userId: string) {
    const grants = await this._repository.listLive(userId, this.now());
    return grants.map((grant) => ({
      id: `mcp:${grant.id}`,
      kind: 'mcp' as const,
      createdAt: grant.createdAt,
      oauthApp: {
        name: grant.client.name,
        description: `MCP · ${grant.organization.name}`,
        picture: null,
      },
    }));
  }

  /** `true` when the id was an MCP connection of this person and is now revoked. */
  async revokeConnection(userId: string, id: string) {
    const { count } = await this._repository.revokeOwn(userId, id);
    return count === 1;
  }
}
