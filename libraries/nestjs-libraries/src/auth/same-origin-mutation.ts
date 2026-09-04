import { HttpException, Logger } from '@nestjs/common';
import { AuthService as AuthChecker } from '@contentfactory/helpers/auth/auth.service';
import type { Request } from 'express';

/**
 * One door for every state change a browser makes on behalf of the account it
 * is signed in as: a JSON body, an `Origin` that is our own front end, and a
 * session token that names the very account being changed.
 *
 * It exists because the same twenty lines had been written by hand three times
 * — identity mutations, invitation acceptance, pending-account rejection — and
 * had already begun to drift apart in their wording. A rule copied is a rule
 * that will be fixed in one place and left wrong in two.
 *
 * The identity comparison also closes impersonation for free: during an
 * impersonation session `user` is the account being viewed while the token
 * still carries the administrator, so the two never match and the mutation is
 * refused. That is deliberate — an administrator looking at an account must
 * not be able to change what it can sign in with, accept invitations for it,
 * or spend its invitations.
 */
export type SameOriginMutationBoundary = {
  /** How the deployment-fault log line names the refused action. */
  action: string;
  unavailableMessage: string;
  unavailableCode: string;
  forbiddenMessage: string;
  forbiddenCode: string;
};

export type SameOriginMutationLogger = { error(message: string): void };

const defaultLogger = new Logger('SameOriginMutation');

type MutationRequest = Pick<Request, 'headers'> & {
  cookies?: Record<string, string | undefined>;
};

/**
 * The account the session token names, or `null` when there is no readable
 * token. Never the account a route parameter or a body claims.
 */
export function requestUserIdFromJwt(req: MutationRequest): string | null {
  try {
    const auth = (req.headers.auth as string) || req.cookies?.auth;
    const payload = AuthChecker.verifyJWT(auth) as { id?: string } | null;
    return payload?.id || null;
  } catch {
    return null;
  }
}

export function assertSameOriginJsonMutation(
  userId: string,
  req: MutationRequest,
  boundary: SameOriginMutationBoundary,
  logger: SameOriginMutationLogger = defaultLogger
): void {
  const contentType = String(req.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();

  let expectedOrigin: string | null = null;
  try {
    expectedOrigin = process.env.FRONTEND_URL
      ? new URL(process.env.FRONTEND_URL).origin
      : null;
  } catch {
    expectedOrigin = null;
  }

  // Without a configured origin every request looks foreign, and the refusal
  // that follows is indistinguishable from an attack being blocked. Say which
  // it is: this is a deployment fault, not the caller's.
  if (!expectedOrigin) {
    logger.error(
      `FRONTEND_URL is missing or unparseable; refusing ${boundary.action} until it is set`
    );
    throw new HttpException(
      {
        message: boundary.unavailableMessage,
        code: boundary.unavailableCode,
      },
      500
    );
  }

  if (
    contentType !== 'application/json' ||
    req.headers.origin !== expectedOrigin ||
    requestUserIdFromJwt(req) !== userId
  ) {
    throw new HttpException(
      {
        message: boundary.forbiddenMessage,
        code: boundary.forbiddenCode,
      },
      403
    );
  }
}
