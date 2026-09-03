import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AppAbility,
  PermissionsService,
} from '@contentfactory/backend/services/auth/permissions/permissions.service';
import {
  AbilityPolicy,
  CHECK_POLICIES_KEY,
} from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import { Organization } from '@prisma/client';
import { Request } from 'express';
import { SubscriptionException } from './permission.exception.class';

/**
 * Doors that reach this guard without a session, and therefore without an
 * organization on the request. There is nothing here to check a policy
 * against: `check()` needs an organization id and a role, and both live on
 * `request.org`, which the auth middleware never set for these routes.
 *
 * Each entry must be a door the product itself never calls with a session.
 * `/integrations/provider` used to be on this list and was not such a door:
 * it matched `POST /integrations/provider/:id/connect`, the second step of
 * adding a channel, which the application calls from a signed-in browser
 * (`continue.integration.tsx`). Its `@CheckPolicies` never ran. The
 * unauthenticated half of that flow is a separate route,
 * `/integrations/public/provider/:id/connect`, which carries no policies at
 * all — so nothing needed the entry, and removing it puts the channel door
 * back under the guard.
 *
 * Matching is anchored to the start of the path rather than searched for
 * anywhere in it: a substring exemption grows silently as routes are added
 * beneath a matching name, which is exactly how the entry above came to cover
 * a door nobody meant to exempt.
 */
const UNAUTHENTICATED_PATHS = [
  /** `auth.controller.ts` — registration, login, password reset, OAuth entry. */
  '/auth',
  /** `no.auth.integrations.controller.ts` — the provider's own callback. */
  '/integrations/social-connect',
];

const isUnauthenticatedPath = (path: string) =>
  UNAUTHENTICATED_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _authorizationService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    if (isUnauthenticatedPath(request.path)) {
      return true;
    }

    const policyHandlers =
      this._reflector.get<AbilityPolicy[]>(
        CHECK_POLICIES_KEY,
        context.getHandler()
      ) || [];

    if (!policyHandlers || !policyHandlers.length) {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    const { org }: { org: Organization } = request;

    const refreshChannelId = typeof request.query?.refresh === 'string' ? request.query.refresh : undefined;

    // @ts-ignore
    const ability = await this._authorizationService.check(org.id, org.createdAt, org.users[0].role, policyHandlers, refreshChannelId);

    const item = policyHandlers.find(
      (handler) => !this.execPolicyHandler(handler, ability)
    );

    if (item) {
      throw new SubscriptionException({
        section: item[1],
        action: item[0],
      });
    }

    return true;
  }

  private execPolicyHandler(handler: AbilityPolicy, ability: AppAbility) {
    return ability.can(handler[0], handler[1]);
  }
}
