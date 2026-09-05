import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerRequest,
} from '@nestjs/throttler';
import {
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import {
  resolveBackendLocale,
  translateBackendText,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';
import { createTransientClientTracker } from './transient-client-tracker';

export { createTransientClientTracker } from './transient-client-tracker';

/**
 * Every unauthenticated POST that either writes an account, sends mail, or
 * answers "does this address exist" needs a ceiling, and the ceiling has to
 * clear an ordinary person sharing an office NAT with colleagues.
 *
 * `login` is the loosest: it is the one a human retries after mistyping a
 * password, and ten attempts a minute still cuts online guessing from thousands
 * per minute to ten while leaving a fumbling person — and a colleague behind
 * the same address — plenty of room. It also caps the bcrypt work one caller
 * can order. `resend-activation` is the tightest of the mail senders because
 * one click is the normal case and a second is the impatient one; it is also
 * an account-enumeration oracle, and three answers a minute make sweeping an
 * address list impractical.
 */
const AUTH_THROTTLES = {
  '/auth/register': { limit: 1, ttl: 60_000 },
  '/auth/login': { limit: 10, ttl: 60_000 },
  '/auth/forgot': { limit: 5, ttl: 60_000 },
  '/auth/resend-activation': { limit: 3, ttl: 60_000 },
} as const;

type AuthThrottlePath = keyof typeof AUTH_THROTTLES;

function requestPath(req: Record<string, any>): string {
  const path = String(req.path || req.url || '').split('?', 1)[0];
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function authThrottlePath(
  req: Record<string, any>
): AuthThrottlePath | undefined {
  if (req.method !== 'POST') return undefined;
  const path = requestPath(req);
  return path in AUTH_THROTTLES ? (path as AuthThrottlePath) : undefined;
}

/**
 * `content-factory-next-5w6u`: the doors that spend a workspace's model budget
 * had no ceiling of any kind.
 *
 * There was accounting — `AiUsageService` writes a ledger row for every call —
 * and accounting is not a limit: it says afterwards what was spent, and the
 * bill has already happened. `content-factory-next-ni7x` put an allowance on
 * the subscription tiers, which answers «how much in a month» and says nothing
 * about how fast. A loop against `/copilot/agent` empties a month in an hour,
 * and the only thing that would notice is the invoice.
 *
 * Sixty a minute, per workspace, per door. It is a ceiling on a runaway
 * script, not a quota: a person writing with the assistant sends a handful of
 * messages a minute, and ten people in one workspace all working at once are
 * still nowhere near it. Deliberately loose, because a limit that interrupts
 * ordinary writing would be removed within a week and then there would be
 * none again.
 *
 * `POST` only, and only the doors that generate. `GET /copilot/credits` and
 * `GET /copilot/list` read what is already there; the screen polls them, and
 * throttling a poll breaks a page without protecting anything.
 */
const AI_THROTTLE = { limit: 60, ttl: 60_000 } as const;

const AI_PATHS = ['/content-intelligence/sources/search'] as const;
const AI_PREFIXES = ['/copilot/'] as const;
// The two source doors that also spend the model: reading a source into a
// material and drafting from it. `:id` sits in the middle, so these are
// patterns, not paths (review of the 05.09 wave).
const AI_PATTERNS = [
  /^\/content-intelligence\/sources\/[^/]+\/(sync|draft-material)$/,
] as const;

function isAiSpendingPath(req: Record<string, any>): boolean {
  if (req.method !== 'POST') return false;
  const path = requestPath(req);
  return (
    (AI_PATHS as readonly string[]).includes(path) ||
    AI_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    AI_PATTERNS.some((pattern) => pattern.test(path))
  );
}

/**
 * Counts a request against its organization, never against `req.ip`.
 *
 * The default tracker of `@nestjs/throttler` is the remote address, and the
 * deployment sits behind a shared Caddy without `trust proxy`, so every caller
 * arrives with the same address: one client would spend the whole bucket for
 * everybody. `AuthMiddleware` has already put the session organization on the
 * request by the time a guard runs; the address is only a fallback for a route
 * that has no organization at all.
 */
@Injectable()
export class ThrottlerByOrganizationGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const owner = req.org?.id || req.ip;
    return owner + '_' + (req.url?.indexOf('/posts') > -1 ? 'posts' : 'other');
  }
}

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerByOrganizationGuard {
  private readonly logger = new Logger(ThrottlerBehindProxyGuard.name);

  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      (request.method === 'POST' && request.url.includes('/public/v1/posts')) ||
      authThrottlePath(request) ||
      isAiSpendingPath(request)
    ) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>,
    _context?: ExecutionContext
  ): Promise<string> {
    if (authThrottlePath(req)) {
      return createTransientClientTracker(req);
    }

    // The workspace pays for the model call, so the workspace is what the
    // ceiling belongs to. `req.org` is on the request by the time a guard
    // runs; the transient client stands in only for a call that arrived with
    // no organisation at all, which these doors refuse anyway.
    if (isAiSpendingPath(req)) {
      return req.org?.id ? `${req.org.id}_ai` : createTransientClientTracker(req);
    }

    return super.getTracker(req);
  }

  protected override async handleRequest(
    request: ThrottlerRequest
  ): Promise<boolean> {
    const req = request.context.switchToHttp().getRequest<Request>();
    const path = authThrottlePath(req);
    if (path) {
      const throttle = AUTH_THROTTLES[path];
      return super.handleRequest({
        ...request,
        limit: throttle.limit,
        ttl: throttle.ttl,
        blockDuration: throttle.ttl,
      });
    }

    if (isAiSpendingPath(req)) {
      return super.handleRequest({
        ...request,
        limit: AI_THROTTLE.limit,
        ttl: AI_THROTTLE.ttl,
        blockDuration: AI_THROTTLE.ttl,
      });
    }

    return super.handleRequest(request);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = authThrottlePath(request);
    if (path) {
      this.logger.warn(`Auth throttle exhausted for POST ${path}`);
    }

    if (isAiSpendingPath(request)) {
      this.logger.warn(
        `AI throttle exhausted for POST ${requestPath(request)} in organization ${
          (request as any).org?.id ?? 'unknown'
        }`
      );
      // A code the screen can branch on, and a sentence in the language of
      // the person who is waiting. `super` would answer «ThrottlerException:
      // Too Many Requests», which tells a writer nothing about what to do.
      throw new HttpException(
        {
          code: 'ai_rate_limited',
          message: translateBackendText(
            'ai_rate_limited',
            resolveBackendLocale((request as any).user?.language)
          ),
        },
        429
      );
    }

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
