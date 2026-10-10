import { Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { ApplicationFailure, TypedSearchAttributes } from '@temporalio/common';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import { WebhooksService } from '@contentfactory/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  organizationId,
  postId as postIdAttribute,
} from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';

@Injectable()
@Activity()
export class PostActivityV108 {
  constructor(
    private posts: PostsService,
    private webhooks: WebhooksService,
    private temporal: TemporalService
  ) {}

  @ActivityMethod()
  async sendWebhooksV108(input: {
    localPostId: string;
    organizationId: string;
    integrationId: string;
  }) {
    const webhooks = (
      await this.webhooks.getWebhooks(input.organizationId)
    ).filter(
      (hook) =>
        hook.integrations.length === 0 ||
        hook.integrations.some((i) => i.integration.id === input.integrationId)
    );
    const summary = { delivered: 0, failed: 0, skipped: 0 };
    if (!webhooks.length) return summary;

    const post = await this.posts.getPostForWebhookV108(
      input.localPostId,
      input.organizationId,
      input.integrationId
    );
    if (!post) {
      summary.skipped = webhooks.length;
      console.warn('webhook_delivery_failed', { reason: 'post_unavailable' });
      throw ApplicationFailure.nonRetryable(
        'Webhook post unavailable',
        'webhook_post_unavailable',
        summary
      );
    }
    const { releaseId, ...publicPost } = post;
    const body = JSON.stringify([{ ...publicPost, providerPostId: releaseId }]);
    await Promise.all(
      webhooks.map(async (hook) => {
        try {
          const response = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Content-Factory-Webhook-Version': '2',
            },
            body,
            redirect: 'manual',
            signal: AbortSignal.timeout(30_000),
            // @ts-ignore — Node fetch supports Undici's dispatcher.
            dispatcher: getSsrfSafeDispatcher(),
          });
          // Release the connection without retaining the receiver's response text.
          await response.body?.cancel().catch(() => undefined);
          if (response.ok) {
            summary.delivered++;
          } else {
            summary.failed++;
            console.warn('webhook_delivery_failed', {
              reason: 'http_status',
              status: response.status,
            });
          }
        } catch {
          summary.failed++;
          console.warn('webhook_delivery_failed', { reason: 'transport' });
        }
      })
    );
    if (summary.failed) {
      throw ApplicationFailure.nonRetryable(
        'Webhook delivery failed',
        'webhook_delivery_failed',
        summary
      );
    }
    return summary;
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPostsV108() {
    for (const post of await this.posts.searchForMissingThreeHoursPosts()) {
      await this.temporal.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV108', {
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
