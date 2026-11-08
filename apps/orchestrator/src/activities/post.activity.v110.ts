import { Context } from '@temporalio/activity';
import { publicProviderDiagnosticV110 } from '@contentfactory/nestjs-libraries/integrations/social/provider-error-diagnostic';
import { Inject, Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { ApplicationFailure, TypedSearchAttributes } from '@temporalio/common';
import { Integration, Post } from '@prisma/client';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import {
  organizationId,
  postId as postIdAttribute,
} from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';
import {
  PUBLICATION_UNCERTAIN_V106,
  PUBLICATION_PREPARATION_FAILED_V106,
  PublicationKeyV106,
} from '@contentfactory/nestjs-libraries/database/prisma/posts/publication-store.v106';
import type {
  PostDetails,
  PostResponse,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';

import {
  SOCIAL_FACTORY_PUBLICATION_GUARD,
  type SocialFactoryPublicationGuard,
} from '@contentfactory/nestjs-libraries/content-intelligence/social-factory/publishing/publication-guard';

type PublicationStageV110 =
  | 'inspect'
  | 'preparing'
  | 'claiming'
  | 'submitting'
  | 'confirming'
  | 'confirmed';

type PublicationPostV106 = Pick<Post, 'id' | 'content' | 'settings' | 'image'>;

@Injectable()
@Activity()
export class PostActivityV110 {
  constructor(
    private posts: PostsService,
    private integrations: IntegrationManager,
    private subscriptions: SubscriptionService,
    private temporal: TemporalService,
    @Inject(SOCIAL_FACTORY_PUBLICATION_GUARD)
    private publicationGuard: SocialFactoryPublicationGuard
  ) {}

  @ActivityMethod()
  async getPostsListV110(orgId: string, postId: string, repeat: boolean) {
    const list = await this.posts.getPostsRecursively(postId, true, orgId);
    const root = list?.[0];
    if (
      !root ||
      root.parentPostId ||
      root.deletedAt ||
      (root.state !== 'QUEUE' && !(repeat && root.state === 'PUBLISHED'))
    )
      return [];
    return list.map((p) => {
      // Keep persistence evidence out of workflow payloads and provider input.
      const { publicationJournal, error, childrenPost, ...rest } = p;
      return rest;
    });
  }

  private async publish(
    integration: Integration,
    posts: PublicationPostV106[],
    operationId: string,
    parent?: { postId: string; lastPostId?: string }
  ) {
    const context = Context.current();
    let stage: PublicationStageV110 = 'inspect';
    const heartbeat = () => {
      try {
        context.heartbeat({ version: 'publication-heartbeat/v1', stage });
      } catch {
        /* Diagnostics cannot discard a received provider receipt. */
      }
    };
    const setStage = (next: PublicationStageV110) => {
      stage = next;
      heartbeat();
    };
    heartbeat();
    const timer = setInterval(heartbeat, 15_000);
    timer.unref();
    try {
      if (posts.length !== 1)
        throw ApplicationFailure.nonRetryable(
          'One post per publication claim',
          'publication_refused'
        );
      const key: PublicationKeyV106 = {
        organizationId: integration.organizationId,
        integrationId: integration.id,
        postId: posts[0].id,
        operationId,
      };
      context.cancellationSignal.throwIfAborted();
      const existing = await this.posts.inspectPublicationV106(key);
      if (existing.status === 'confirmed') {
        setStage('confirmed');
        const receipts = await this.posts.confirmPublicationV110(key, existing.receipts);
        await this.publicationGuard.syncReceipt(
          integration.organizationId,
          key.postId,
          receipts
        );
        return receipts;
      }
      if (existing.status !== 'ready') {
        if (existing.status === 'uncertain') await this.posts.markPublicationUncertainV110(key);
        throw ApplicationFailure.nonRetryable(
          existing.status === 'uncertain'
            ? PUBLICATION_UNCERTAIN_V106
            : 'Publication is no longer eligible',
          existing.status === 'uncertain'
            ? 'publication_uncertain'
            : 'publication_refused'
        );
      }
      setStage('preparing');
      context.cancellationSignal.throwIfAborted();
      let provider: ReturnType<IntegrationManager['getSocialIntegration']>;
      let details: PostDetails[];
      try {
        if (
          process.env.STRIPE_SECRET_KEY &&
          !(await this.subscriptions.getSubscription(
            integration.organizationId
          ))
        ) {
          throw new Error('No active subscription');
        }
        const fresh = await this.posts.getPostById(
          key.postId,
          key.organizationId
        );
        if (
          !fresh ||
          fresh.deletedAt ||
          fresh.integrationId !== key.integrationId ||
          fresh.organizationId !== key.organizationId
        ) {
          throw new Error('Authoritative post unavailable');
        }
        integration = fresh.integration;
        provider = this.integrations.getSocialIntegration(
          integration.providerIdentifier
        );
        const tagged = await this.posts.updateTags(integration.organizationId, [
          fresh,
        ]);
        details = await Promise.all(
          tagged.map(async (p) => ({
            id: p.id,
            message: stripHtmlValidation(
              provider.editor,
              p.content,
              true,
              false,
              !/<\/?[a-z][\s\S]*>/i.test(p.content),
              provider.mentionFormat
            ),
            settings: JSON.parse(p.settings || '{}'),
            media: await this.posts.updateMedia(
              integration.organizationId,
              p.id,
              JSON.parse(p.image || '[]'),
              provider.convertToJPEG || false
            ),
          }))
        );
      } catch {
        // Cancellation before a durable claim leaves the post ready for recovery.
        context.cancellationSignal.throwIfAborted();
        // No publication claim or post/comment call has begun. The conditional
        // diagnostic cannot overwrite another invocation's claim or receipt.
        await this.posts.markPublicationPreparationFailureV106(key);
        throw ApplicationFailure.nonRetryable(
          PUBLICATION_PREPARATION_FAILED_V106,
          'publication_preparation_failed'
        );
      }
      // Claim immediately before the provider write, rechecking eligibility.
      // Preparation races cannot admit multiple sends or reset pending claims.
      setStage('claiming');
      context.cancellationSignal.throwIfAborted();
      const claim = await this.publicationGuard.claimSend(key, details[0]);
      if (claim.status === 'confirmed') {
        setStage('confirmed');
        const receipts = await this.posts.confirmPublicationV110(key, claim.receipts);
        await this.publicationGuard.syncReceipt(
          integration.organizationId,
          key.postId,
          receipts
        );
        return receipts;
      }
      if (claim.status !== 'claimed') {
        if (claim.status === 'uncertain') await this.posts.markPublicationUncertainV110(key);
        throw ApplicationFailure.nonRetryable(
          claim.status === 'uncertain'
            ? PUBLICATION_UNCERTAIN_V106
            : 'Publication is no longer eligible',
          claim.status === 'uncertain'
            ? 'publication_uncertain'
            : 'publication_refused'
        );
      }
      let confirmed: PostResponse[];
      try {
        // Once claimed, cancellation is uncertain even if no response arrived.
        setStage('submitting');
        context.cancellationSignal.throwIfAborted();
        const receipts = parent
          ? await provider.comment(
              integration.internalId,
              parent.postId,
              parent.lastPostId,
              integration.token,
              details,
              integration
            )
          : await provider.post(
              integration.internalId,
              integration.token,
              details,
              integration
            );
        // This atomic write precedes every auxiliary operation and the activity
        // response. A lost response after it is recoverable without resending.
        // Never check cancellation or pass its signal after the provider returned:
        // a received remote ID must reach the atomic durable receipt first.
        setStage('confirming');
        confirmed = await this.posts.confirmPublicationV110(key, receipts);
        setStage('confirmed');
      } catch (error) {
        // Provider exceptions (including refresh requests) are not proof that no
        // external write occurred. Persist only the bounded diagnostic, no token
        // or raw provider exception; the durable pending claim is kept forever.
        await this.posts.markPublicationUncertainV110(key, publicProviderDiagnosticV110(integration.providerIdentifier, error));
        await this.publicationGuard
          .syncUncertain(integration.organizationId, key.postId)
          .catch(() => {
            console.warn('campaign_publication_sync_failed', {
              reason: 'uncertain_projection',
            });
          });
        throw ApplicationFailure.nonRetryable(
          PUBLICATION_UNCERTAIN_V106,
          'publication_uncertain'
        );
      }
      // Projection is auxiliary: a failed campaign update must never resend a confirmed post.
      await this.publicationGuard.syncReceipt(
        integration.organizationId,
        key.postId,
        confirmed
      );
      return confirmed;
    } finally {
      clearInterval(timer);
    }
  }

  @ActivityMethod()
  async postSocialV110(
    integration: Integration,
    posts: PublicationPostV106[],
    operationId: string
  ) {
    return this.publish(integration, posts, operationId);
  }

  @ActivityMethod()
  async postCommentV110(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: PublicationPostV106[],
    operationId: string
  ) {
    return this.publish(integration, posts, operationId, {
      postId,
      lastPostId,
    });
  }

  @ActivityMethod()
  async startPublicationStreakV110(key: PublicationKeyV106) {
    try {
      await this.temporal.client
        .getRawClient()
        .workflow.start('streakWorkflow', {
          args: [{ organizationId: key.organizationId }],
          workflowId: `streak_${key.organizationId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          typedSearchAttributes: new TypedSearchAttributes([
            { key: organizationId, value: key.organizationId },
          ]),
        });
      return { started: true };
    } catch {
      await this.posts.recordPublicationStreakFailureV106(key);
      return { started: false };
    }
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPostsV111() {
    for (const post of await this.posts.searchForMissingThreeHoursPosts()) {
      await this.temporal.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV110', {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          signalArgs: [],
          workflowIdConflictPolicy: 'USE_EXISTING',
          args: [
            {
              taskQueue: post.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            { key: postIdAttribute, value: post.id },
            { key: organizationId, value: post.organizationId },
          ]),
        });
    }
  }
}
