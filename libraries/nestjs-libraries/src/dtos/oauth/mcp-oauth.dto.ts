import { Allow, IsIn, IsString } from 'class-validator';

/**
 * Bodies of the MCP OAuth doors (`content-factory-next-kcxz.26`). The fields
 * are only admitted here (`@Allow`, so the global `whitelist` keeps them);
 * `McpOAuthService` checks them and answers in RFC 6749/7591 error shapes,
 * which a client parses, instead of the pipe's own 400.
 */

/** RFC 7591 registration request (JSON). */
export class McpClientRegistrationDto {
  @Allow()
  client_name?: unknown;

  @Allow()
  redirect_uris?: unknown;

  @Allow()
  token_endpoint_auth_method?: unknown;

  @Allow()
  grant_types?: unknown;

  @Allow()
  response_types?: unknown;

  @Allow()
  scope?: unknown;
}

/** Token request, form-urlencoded or JSON. */
export class McpTokenRequestDto {
  @Allow()
  grant_type?: unknown;

  @Allow()
  client_id?: unknown;

  @Allow()
  code?: unknown;

  @Allow()
  code_verifier?: unknown;

  @Allow()
  redirect_uri?: unknown;

  @Allow()
  refresh_token?: unknown;

  @Allow()
  resource?: unknown;

  @Allow()
  scope?: unknown;
}

/** The authorization request the consent page forwards. */
export class McpAuthorizeQueryDto {
  @Allow()
  client_id?: unknown;

  @Allow()
  redirect_uri?: unknown;

  @Allow()
  response_type?: unknown;

  @Allow()
  code_challenge?: unknown;

  @Allow()
  code_challenge_method?: unknown;

  @Allow()
  resource?: unknown;

  @Allow()
  scope?: unknown;

  @Allow()
  state?: unknown;
}

export class McpAuthorizeDecisionDto extends McpAuthorizeQueryDto {
  @IsString()
  @IsIn(['approve', 'deny'])
  action!: 'approve' | 'deny';

  /** The workspace the consent page showed (review W5-26 F5). */
  @Allow()
  workspace_id?: unknown;
}
