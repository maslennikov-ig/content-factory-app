import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { McpOAuthService } from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.service';
import {
  bearerChallenge,
  mcpUrls,
} from '@contentfactory/nestjs-libraries/database/prisma/oauth/mcp-oauth.rules';
import {
  isMcpEnabled,
  mcpCapabilityIdentity,
  type McpAuthExtra,
} from '@contentfactory/nestjs-libraries/chat/start.mcp';
import { runAsActingUser } from '@contentfactory/nestjs-libraries/user/acting.user';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';

/** What the bearer check leaves on an admitted `/mcp` request. */
export type McpRequest = Request & {
  auth?: {
    token: string;
    clientId: string;
    scopes: string[];
    expiresAt: number;
    extra: McpAuthExtra;
  };
  mcpIdentity?: CapabilityIdentity;
  mcpGrantId?: string;
  /** The body parser's bearer check for this token (`createMcpBodyParser`). */
  mcpBearerCheck?: { token: string; result: Awaited<ReturnType<McpOAuthService['authenticate']>> };
  /** Set instead of an identity; the controller answers it with a 401. */
  mcpRefusal?: { challenge: string; body: { error: string; error_description: string } };
};

const BEARER = /^Bearer\s+([^\s]+)\s*$/i;

/**
 * The only way into `/mcp` (`content-factory-next-kcxz.26`, premortem X3):
 * an MCP OAuth access token that is live, bound to this server's MCP URL and
 * held by an active person whose membership is not disabled. The role comes
 * from that membership now, never from the token, so a demoted member loses
 * tools on their next request.
 *
 * `AuthMiddleware` (the session) and `PublicAuthMiddleware` (the workspace API
 * key, `pos_` tokens) never run here: neither names a person with a role.
 *
 * A refusal becomes a 401 with `WWW-Authenticate: Bearer resource_metadata=…`,
 * the start of the client's OAuth discovery (RFC 9728 §5.1) — written by the
 * controller, once `McpThrottleGuard` has counted it per address. Everything the
 * request does afterwards runs as that person, so a paid call's ledger row
 * names them (premortem X2).
 */
@Injectable()
export class McpBearerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('MCP');

  constructor(private readonly _oauth: McpOAuthService) {}

  async use(req: McpRequest, res: Response, next: NextFunction) {
    const urls = mcpUrls();
    // Dark or unconfigured: the controller answers 404.
    if (!isMcpEnabled() || !urls) return next();

    const header = req.headers.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    // The body parser already asked for this very token (R2): its answer is reused.
    const checked = req.mcpBearerCheck;
    const result =
      checked && token && checked.token === token
        ? checked.result
        : await this._oauth.authenticate(token, urls);
    if ('refused' in result) {
      if (result.refused === 'not_mcp_token') {
        this.logger.warn('A non-MCP credential was presented to /mcp and refused.');
      }
      const missing = result.refused === 'missing';
      // Answered by the controller, after the throttler has counted it against
      // the caller's address (review W5-26 F4): refusals are throttled too.
      req.mcpRefusal = {
        challenge: bearerChallenge(urls, missing ? undefined : 'invalid_token'),
        body: {
          error: missing ? 'unauthorized' : 'invalid_token',
          error_description: missing
            ? 'Connect with OAuth: this server does not take API keys.'
            : 'The access token is not valid for this server; refresh it or connect again.',
        },
      };
      return next();
    }

    const identity = mcpCapabilityIdentity(result.identity);
    req.auth = {
      // Never the token itself: nothing downstream needs it.
      token: `grant:${result.identity.grantId}`,
      clientId: result.identity.clientId,
      scopes: result.identity.scopes,
      expiresAt: result.identity.expiresAt,
      extra: { identity },
    };
    req.mcpIdentity = identity;
    req.mcpGrantId = result.identity.grantId;
    runAsActingUser(identity.userId, next);
  }
}
