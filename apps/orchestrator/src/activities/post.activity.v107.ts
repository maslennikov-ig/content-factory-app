import { Injectable } from '@nestjs/common';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import {
  organizationId,
  postId as postIdAttribute,
} from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';

@Injectable()
@Activity()
export class PostActivityV107 {
  constructor(private posts: PostsService, private temporal: TemporalService) {}

  @ActivityMethod()
  async searchForMissingThreeHoursPostsV107() {
    for (const post of await this.posts.searchForMissingThreeHoursPosts()) {
      await this.temporal.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV107', {
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
