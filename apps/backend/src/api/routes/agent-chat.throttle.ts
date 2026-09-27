import { ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import {
  resolveBackendLocale,
  translateBackendText,
} from '@contentfactory/nestjs-libraries/locale/backend-strings';

/**
 * A ceiling on `POST /agent/chat` per person (`content-factory-next-kcxz.8`,
 * premortem A3).
 *
 * Every model-running request opens one `agent` operation of the workspace's
 * allowance, so a loop — a script, or a client that resubmits on its own —
 * drains a month in minutes. The ceiling belongs to the person, not the
 * workspace: ten colleagues chatting at once must not starve each other, and
 * one runaway tab must not starve them either.
 *
 * Twenty a minute: a person answers a card or types a message every few
 * seconds at the very most. Reads — the thread list, the history, the pending
 * cards — are free and polled by the screen, so they are not throttled.
 */
export const AGENT_CHAT_THROTTLE = { limit: 20, ttl: 60_000 } as const;

/** One bucket per person inside one workspace. */
export const agentChatTracker = (req: Record<string, any>) =>
  req.org?.id && req.user?.id
    ? `agent-chat:${req.org.id}:${req.user.id}`
    : `agent-chat:${req.ip ?? 'unknown'}`;

@Injectable()
export class AgentChatThrottleGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AgentChatThrottleGuard.name);

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return agentChatTracker(req);
  }

  protected override async handleRequest(
    request: ThrottlerRequest
  ): Promise<boolean> {
    return super.handleRequest({
      ...request,
      limit: AGENT_CHAT_THROTTLE.limit,
      ttl: AGENT_CHAT_THROTTLE.ttl,
      blockDuration: AGENT_CHAT_THROTTLE.ttl,
    });
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    _detail: ThrottlerLimitDetail
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();
    this.logger.warn(
      `Agent chat throttle exhausted in organization ${request?.org?.id ?? 'unknown'}`
    );
    // The same code and sentence as the other doors that spend the model.
    throw new HttpException(
      {
        code: 'ai_rate_limited',
        message: translateBackendText(
          'ai_rate_limited',
          resolveBackendLocale(request?.user?.language)
        ),
      },
      429
    );
  }
}
