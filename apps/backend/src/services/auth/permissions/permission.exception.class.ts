import { HttpException, HttpStatus } from '@nestjs/common';

export enum Sections {
  CHANNEL = 'channel',
  POSTS_PER_MONTH = 'posts_per_month',
  VIDEOS_PER_MONTH = 'videos_per_month',
  TEAM_MEMBERS = 'team_members',
  COMMUNITY_FEATURES = 'community_features',
  FEATURED_PLAN = 'featured_plan',
  AI = 'ai',
  IMPORT_FROM_CHANNELS = 'import_from_channels',
  ADMIN = 'admin',
  /**
   * The workspace's content, open to `EDITOR` and to both administrators.
   *
   * A section of its own rather than a softer reading of `ADMIN`: the two
   * answer different questions — who may change the workspace's shared
   * property, and who may make what it publishes — and a door that asked one
   * question with the other's name would be unreadable the next time somebody
   * moves a door between them (`content-factory-next-fn33.90`).
   */
  EDITOR = 'editor',
  WEBHOOKS = 'webhooks',
}

export enum AuthorizationActions {
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

/**
 * Sections a refusal on which no payment can lift. Everything else this
 * exception carries is a plan limit.
 */
const roleSections: ReadonlySet<Sections> = new Set([
  Sections.ADMIN,
  Sections.EDITOR,
]);

export class SubscriptionException extends HttpException {
  constructor(message: { section: Sections; action: AuthorizationActions }) {
    // 402 means "pay and you get it", and the frontend answers it with a
    // button into billing. A role is not sold, and on an instance with no
    // billing at all that button leads nowhere, so a role refusal is 403.
    super(
      message,
      roleSections.has(message.section)
        ? HttpStatus.FORBIDDEN
        : HttpStatus.PAYMENT_REQUIRED
    );
  }
}
