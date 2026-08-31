import {
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerRequest,
} from '@nestjs/throttler';
import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
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
      authThrottlePath(request)
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

    return super.getTracker(req);
  }

  protected override async handleRequest(
    request: ThrottlerRequest
  ): Promise<boolean> {
    const req = request.context.switchToHttp().getRequest<Request>();
    const path = authThrottlePath(req);
    if (!path) return super.handleRequest(request);

    const throttle = AUTH_THROTTLES[path];
    return super.handleRequest({
      ...request,
      limit: throttle.limit,
      ttl: throttle.ttl,
      blockDuration: throttle.ttl,
    });
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

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
