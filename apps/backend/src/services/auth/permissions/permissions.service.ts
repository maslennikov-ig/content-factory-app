import { Ability, AbilityBuilder, AbilityClass } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import dayjs from 'dayjs';
import { WebhooksService } from '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { AuthorizationActions, Sections } from './permission.exception.class';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  isOrganizationAdmin,
  isOrganizationEditor,
} from '@contentfactory/nestjs-libraries/user/organization.roles';

/**
 * The two sections that read a role, and the only place that says what each
 * one means.
 *
 * Before 05.09.2026 the rule for `ADMIN` was an inline `['ADMIN',
 * 'SUPERADMIN'].includes(...)` inside the loop below, which is how the same
 * list came to be written by hand in the controllers and on the screens.
 * Adding `EDITOR` with a second inline list would have doubled that. A door
 * names a section; the section names one predicate; the predicate lives in
 * `organization.roles.ts` and the browser reads the very same function.
 *
 * Everything not in this table is a plan limit and knows nothing about roles.
 */
const ROLE_SECTIONS: Partial<
  Record<Sections, (role: OrganizationRole) => boolean>
> = {
  [Sections.ADMIN]: isOrganizationAdmin,
  [Sections.EDITOR]: isOrganizationEditor,
};

export type AppAbility = Ability<[AuthorizationActions, Sections]>;

@Injectable()
export class PermissionsService {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _postsService: PostsService,
    private _integrationService: IntegrationService,
    private _webhooksService: WebhooksService
  ) {}
  async getPackageOptions(orgId: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionByOrganizationId(orgId);

    const tier =
      subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'PRO' : 'FREE');

    const { channel, ...all } = pricing[tier];
    return {
      subscription,
      options: {
        ...all,
        ...{ channel: tier === 'FREE' ? channel : -10 },
      },
    };
  }

  async check(
    orgId: string,
    created_at: Date,
    permission: OrganizationRole,
    requestedPermission: Array<[AuthorizationActions, Sections]>,
    refreshChannelId?: string
  ) {
    const { can, build } = new AbilityBuilder<
      Ability<[AuthorizationActions, Sections]>
    >(Ability as AbilityClass<AppAbility>);

    if (requestedPermission.length === 0) {
      for (const [action, section] of requestedPermission) {
        can(action, section);
      }
      return build({
        detectSubjectType: (item) =>
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          item.constructor,
      });
    }

    const packageOptions = process.env.STRIPE_PUBLISHABLE_KEY
      ? await this.getPackageOptions(orgId)
      : undefined;

    for (const [action, section] of requestedPermission) {
      // A role section is decided before the plan is even looked up: no plan
      // sells a role, and an instance with no billing at all must still
      // refuse. This is the one branch `packageOptions` never reaches.
      const holdsRole = ROLE_SECTIONS[section];
      if (holdsRole) {
        if (holdsRole(permission)) {
          can(action, section);
        }
        continue;
      }

      if (!packageOptions) {
        can(action, section);
        continue;
      }

      const { subscription, options } = packageOptions;

      // check for the amount of channels
      if (section === Sections.CHANNEL) {
        // Refreshing an existing channel doesn't add a new one, so skip the limit check
        // but only if the channel actually belongs to this org
        if (refreshChannelId) {
          const existingIntegration =
            await this._integrationService.getIntegrationById(
              orgId,
              refreshChannelId
            );
          if (existingIntegration) {
            can(action, section);
            continue;
          }
        }

        const totalChannels = (
          await this._integrationService.getIntegrationsList(orgId)
        ).filter((f) => !f.refreshNeeded).length;

        if (
          (options.channel && options.channel > totalChannels) ||
          (subscription?.totalChannels || 0) > totalChannels
        ) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.WEBHOOKS) {
        const totalWebhooks = await this._webhooksService.getTotal(orgId);
        if (totalWebhooks < options.webhooks) {
          can(AuthorizationActions.Create, section);
          continue;
        }
      }

      // check for posts per month
      if (section === Sections.POSTS_PER_MONTH) {
        const createdAt =
          (await this._subscriptionService.getSubscription(orgId))?.createdAt ||
          created_at;
        const totalMonthPast = Math.abs(
          dayjs(createdAt).diff(dayjs(), 'month')
        );
        const checkFrom = dayjs(createdAt).add(totalMonthPast, 'month');
        const count = await this._postsService.countPostsFromDay(
          orgId,
          checkFrom.toDate()
        );

        if (count < options.posts_per_month) {
          can(action, section);
          continue;
        }
      }

      if (section === Sections.TEAM_MEMBERS && options.team_members) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.COMMUNITY_FEATURES &&
        options.community_features
      ) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.FEATURED_PLAN &&
        options.featured_plan
      ) {
        can(action, section);
        continue;
      }

      if (section === Sections.AI && options.ai) {
        can(action, section);
        continue;
      }

      if (
        section === Sections.IMPORT_FROM_CHANNELS &&
        options.import_from_channels
      ) {
        can(action, section);
      }
    }

    return build({
      detectSubjectType: (item) =>
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        item.constructor,
    });
  }
}
