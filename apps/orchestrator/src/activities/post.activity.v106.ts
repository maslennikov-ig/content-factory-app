import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod, TemporalService } from 'nestjs-temporal-core';
import { ApplicationFailure, TypedSearchAttributes } from '@temporalio/common';
import { Integration, Post } from '@prisma/client';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { organizationId, postId as postIdAttribute } from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';
import { PUBLICATION_UNCERTAIN_V106, PUBLICATION_PREPARATION_FAILED_V106, PublicationKeyV106 } from '@contentfactory/nestjs-libraries/database/prisma/posts/publication-store.v106';
import type { PostDetails } from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';

type PublicationPostV106 = Pick<Post, 'id' | 'content' | 'settings' | 'image'>;

@Injectable()
@Activity()
export class PostActivityV106 {
  constructor(
    private posts: PostsService,
    private integrations: IntegrationManager,
    private subscriptions: SubscriptionService,
    private temporal: TemporalService
  ) {}

  @ActivityMethod()
  async getPostsListV106(orgId: string, postId: string, repeat: boolean) {
    const list = await this.posts.getPostsRecursively(postId, true, orgId);
    const root = list?.[0];
    if (!root || root.parentPostId || root.deletedAt ||
        (root.state !== 'QUEUE' && !(repeat && root.state === 'PUBLISHED'))) return [];
    return list.map(p => {
      // Keep persistence evidence out of workflow payloads and provider input.
      const { publicationJournal, error, childrenPost, ...rest } = p;
      return rest;
    });
  }

  private async publish(
    integration: Integration, posts: PublicationPostV106[], operationId: string,
    parent?: { postId: string; lastPostId?: string }
  ) {
    if (posts.length !== 1) throw ApplicationFailure.nonRetryable('One post per publication claim', 'publication_refused');
    const key: PublicationKeyV106 = {
      organizationId: integration.organizationId, integrationId: integration.id,
      postId: posts[0].id, operationId,
    };
    const existing = await this.posts.inspectPublicationV106(key);
    if (existing.status === 'confirmed') return existing.receipts;
    if (existing.status !== 'ready') {
      throw ApplicationFailure.nonRetryable(
        existing.status === 'uncertain' ? PUBLICATION_UNCERTAIN_V106 : 'Publication is no longer eligible',
        existing.status === 'uncertain' ? 'publication_uncertain' : 'publication_refused'
      );
    }
    let provider: ReturnType<IntegrationManager['getSocialIntegration']>;
    let details: PostDetails[];
    try {
      if (process.env.STRIPE_SECRET_KEY &&
          !await this.subscriptions.getSubscription(integration.organizationId)) {
        throw new Error('No active subscription');
      }
      provider = this.integrations.getSocialIntegration(integration.providerIdentifier);
      const tagged = await this.posts.updateTags(integration.organizationId, posts);
      details = await Promise.all(tagged.map(async p => ({
        id: p.id,
        message: stripHtmlValidation(provider.editor, p.content, true, false,
          !/<\/?[a-z][\s\S]*>/i.test(p.content), provider.mentionFormat),
        settings: JSON.parse(p.settings || '{}'),
        media: await this.posts.updateMedia(integration.organizationId, p.id,
          JSON.parse(p.image || '[]'), provider.convertToJPEG || false),
      })));
    } catch {
      // No publication claim or post/comment call has begun. The conditional
      // diagnostic cannot overwrite another invocation's claim or receipt.
      await this.posts.markPublicationPreparationFailureV106(key);
      throw ApplicationFailure.nonRetryable(PUBLICATION_PREPARATION_FAILED_V106, 'publication_preparation_failed');
    }
    // Claim immediately before the provider write, rechecking eligibility.
    // Preparation races cannot admit multiple sends or reset pending claims.
    const claim = await this.posts.claimPublicationV106(key);
    if (claim.status === 'confirmed') return claim.receipts;
    if (claim.status !== 'claimed') {
      throw ApplicationFailure.nonRetryable(
        claim.status === 'uncertain' ? PUBLICATION_UNCERTAIN_V106 : 'Publication is no longer eligible',
        claim.status === 'uncertain' ? 'publication_uncertain' : 'publication_refused'
      );
    }
    try {
      const receipts = parent
        ? await provider.comment(integration.internalId, parent.postId, parent.lastPostId,
            integration.token, details, integration)
        : await provider.post(integration.internalId, integration.token, details, integration);
      // This atomic write precedes every auxiliary operation and the activity
      // response. A lost response after it is recoverable without resending.
      return await this.posts.confirmPublicationV106(key, receipts);
    } catch {
      // Provider exceptions (including refresh requests) are not proof that no
      // external write occurred. Persist only the bounded diagnostic, no token
      // or raw provider exception; the durable pending claim is kept forever.
      await this.posts.markPublicationUncertainV106(key);
      throw ApplicationFailure.nonRetryable(PUBLICATION_UNCERTAIN_V106, 'publication_uncertain');
    }
  }

  @ActivityMethod()
  async postSocialV106(integration: Integration, posts: PublicationPostV106[], operationId: string) {
    return this.publish(integration, posts, operationId);
  }

  @ActivityMethod()
  async postCommentV106(postId: string, lastPostId: string | undefined, integration: Integration, posts: PublicationPostV106[], operationId: string) {
    return this.publish(integration, posts, operationId, { postId, lastPostId });
  }

  @ActivityMethod()
  async startPublicationStreakV106(key: PublicationKeyV106) {
    try {
      await this.temporal.client.getRawClient().workflow.start('streakWorkflow', {
        args: [{ organizationId: key.organizationId }],
        workflowId: `streak_${key.organizationId}`, taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
        typedSearchAttributes: new TypedSearchAttributes([{ key: organizationId, value: key.organizationId }]),
      });
      return { started: true };
    } catch {
      await this.posts.recordPublicationStreakFailureV106(key);
      return { started: false };
    }
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPostsV106() {
    for (const post of await this.posts.searchForMissingThreeHoursPosts()) {
      await this.temporal.client.getRawClient().workflow.signalWithStart('postWorkflowV106', {
        workflowId: `post_${post.id}`, taskQueue: 'main', signal: 'poke', signalArgs: [],
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [{ taskQueue: post.integration.providerIdentifier.split('-')[0].toLowerCase(),
          postId: post.id, organizationId: post.organizationId }],
        typedSearchAttributes: new TypedSearchAttributes([
          { key: postIdAttribute, value: post.id }, { key: organizationId, value: post.organizationId },
        ]),
      });
    }
  }
}
