import { ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import { createTransientClientTracker } from '@contentfactory/nestjs-libraries/throttler/transient-client-tracker';

/**
 * A ceiling on `/mcp` per connection (`content-factory-next-kcxz.26`,
 * premortem X2): one bucket per workspace, person and OAuth grant — the
 * pattern of `AgentChatThrottleGuard`, with the token's grant added so two
 * assistants of one person do not starve each other.
 *
 * Stateless Streamable HTTP spends a request per JSON-RPC message (initialize,
 * list, each call), so the ceiling is looser than the chat's: sixty a minute.
 * Paid calls are bounded by the allowance as well; this stops a loop.
 * A refused request (no or a bad token) is counted too, per client address
 * (review W5-26 F4). One person with several connections gets sixty per
 * connection, by design (F8): the allowance bounds what they cost.
 */
export const MCP_THROTTLE = { limit: 60, ttl: 60_000 } as const;

export const mcpTracker = (req: Record<string, any>) => {
  const identity = req.mcpIdentity;
  return identity?.organizationId && identity?.userId && req.mcpGrantId
    ? `mcp:${identity.organizationId}:${identity.userId}:${req.mcpGrantId}`
    : `mcp:${createTransientClientTracker(req)}`;
};

@Injectable()
export class McpThrottleGuard extends ThrottlerGuard {
  private readonly logger = new Logger(McpThrottleGuard.name);

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return mcpTracker(req);
  }

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...request,
      limit: MCP_THROTTLE.limit,
      ttl: MCP_THROTTLE.ttl,
      blockDuration: MCP_THROTTLE.ttl,
    });
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    _detail: ThrottlerLimitDetail
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    this.logger.warn(
      `MCP throttle exhausted in organization ${request?.mcpIdentity?.organizationId ?? 'unknown'}`
    );
    throw new HttpException(
      { code: 'mcp_rate_limited', message: 'Too many MCP requests; wait a minute.' },
      429
    );
  }
}

/**
 * The unauthenticated OAuth doors of MCP, per client address (review W5-26
 * F3). Registration is anonymous and writes a row: ten an hour is more than
 * any assistant needs (it registers once). Tokens are exchanged and refreshed
 * by Claude and ChatGPT from shared egress addresses, so their ceiling is
 * wider: 120 a minute.
 */
export const MCP_REGISTRATION_THROTTLE = { limit: 10, ttl: 3_600_000 } as const;
export const MCP_TOKEN_THROTTLE = { limit: 120, ttl: 60_000 } as const;

/**
 * The transient tracker is an address hash that changes every minute; stamped
 * with the start of the window instead of now, it stays one key for the
 * window, so a one-hour ceiling counts the whole hour.
 */
const perAddress = (prefix: string, req: Record<string, any>, windowMs = 60_000) =>
  `${prefix}:${createTransientClientTracker(req, Math.floor(Date.now() / windowMs) * windowMs)}`;

@Injectable()
export class McpRegistrationThrottleGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return perAddress('mcp-register', req, MCP_REGISTRATION_THROTTLE.ttl);
  }

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...request,
      limit: MCP_REGISTRATION_THROTTLE.limit,
      ttl: MCP_REGISTRATION_THROTTLE.ttl,
      blockDuration: MCP_REGISTRATION_THROTTLE.ttl,
    });
  }
}

@Injectable()
export class McpTokenThrottleGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return perAddress('mcp-token', req);
  }

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...request,
      limit: MCP_TOKEN_THROTTLE.limit,
      ttl: MCP_TOKEN_THROTTLE.ttl,
      blockDuration: MCP_TOKEN_THROTTLE.ttl,
    });
  }
}

/**
 * The consent decision writes a grant row (review W5-26 recheck): twenty a
 * minute per person in a workspace — a person clicks Allow once per
 * connection.
 */
export const MCP_CONSENT_THROTTLE = { limit: 20, ttl: 60_000 } as const;

@Injectable()
export class McpConsentThrottleGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return req.org?.id && req.user?.id
      ? `mcp-consent:${req.org.id}:${req.user.id}`
      : perAddress('mcp-consent', req);
  }

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest({
      ...request,
      limit: MCP_CONSENT_THROTTLE.limit,
      ttl: MCP_CONSENT_THROTTLE.ttl,
      blockDuration: MCP_CONSENT_THROTTLE.ttl,
    });
  }
}
