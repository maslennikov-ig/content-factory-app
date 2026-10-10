import type { PostActivityV108 } from '@contentfactory/orchestrator/activities/post.activity.v108';
import type { PostActivityV106 } from '@contentfactory/orchestrator/activities/post.activity.v106';
import type { PostActivity } from '@contentfactory/orchestrator/activities/post.activity';
import {
  ActivityFailure,
  ApplicationFailure,
  startChild,
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
  workflowInfo,
  isCancellation,
} from '@temporalio/workflow';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { capitalize, sortBy } from 'lodash';
import { PostResponse } from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { TypedSearchAttributes } from '@temporalio/common';
import { postId as postIdSearchParam } from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';

const proxyTaskQueue = (taskQueue: string) => {
  return proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    taskQueue,
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });
};

const { getPost, inAppNotification, changeState, isCommentable } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '10 minute',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '2 minutes',
    },
  });

const { getPostsListV106, startPublicationStreakV106 } =
  proxyActivities<PostActivityV106>({
    startToCloseTimeout: '10 minute',
    retry: { maximumAttempts: 3 },
  });

const { sendWebhooksV108 } = proxyActivities<PostActivityV108>({
  startToCloseTimeout: '10 minute',
  retry: { maximumAttempts: 1 },
});

const poke = defineSignal('poke');

const iterate = Array.from({ length: 5 });

export async function postWorkflowV108({
  taskQueue,
  postId,
  organizationId,
  postNow = false,
}: {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
}) {
  // Dynamic task queue, for concurrency
  const {
    getIntegrationById,
    refreshTokenWithCause,
    internalPlugs,
    globalPlugs,
    processInternalPlug,
    processPlug,
  } = proxyTaskQueue(taskQueue);

  const { postSocialV106, postCommentV106 } = proxyActivities<PostActivityV106>(
    {
      startToCloseTimeout: '10 minute',
      taskQueue,
      retry: {
        maximumAttempts: 3,
        backoffCoefficient: 1,
        initialInterval: '2 minutes',
      },
    }
  );
  // Stable across activity retries and workflow runs; repeat children represent
  // explicit new publications and have distinct workflow IDs.
  const operationId = postNow
    ? `repeat:${workflowInfo().workflowId}`
    : 'initial';

  let poked = false;
  setHandler(poke, () => {
    poked = true;
  });

  const startTime = new Date();
  // get all the posts and comments to post
  const firstPost = await getPost(organizationId, postId);

  // in case doesn't exists for some reason, fail it
  if (!firstPost) {
    await changeState(postId, 'ERROR', 'No Post');
    return;
  }

  if (!postNow && firstPost.state !== 'QUEUE') {
    return;
  }

  // if it's a repeatable post, we should ignore this.
  if (!postNow) {
    await sleep(
      dayjs(firstPost.publishDate).isBefore(dayjs())
        ? 0
        : dayjs(firstPost.publishDate).diff(dayjs(), 'millisecond')
    );
  }

  const postsListBefore = await getPostsListV106(
    organizationId,
    postId,
    postNow
  );
  const [post] = postsListBefore;

  if (!post) {
    return;
  }

  // if refresh is needed from last time, let's inform the user
  if (post.integration?.refreshNeeded) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because you need to reconnect it. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Refresh channel needed',
      postsListBefore
    );
    return;
  }

  // if it's disabled, inform the user
  if (post.integration?.disabled) {
    await inAppNotification(
      post.organizationId,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name}`,
      `We couldn't post to ${post.integration?.providerIdentifier} for ${post?.integration?.name} because it's disabled. Please enable it and try again.`,
      true,
      false,
      'info'
    );

    await changeState(
      postsListBefore[0].id,
      'ERROR',
      'Channel disabled',
      postsListBefore
    );
    return;
  }

  // Do we need to post comment for this social?
  const toComment: boolean =
    postsListBefore.length === 1
      ? false
      : await isCommentable(post.integration);

  const postsList = toComment ? postsListBefore : [postsListBefore[0]];

  // list of all the saved results
  const postsResults: PostResponse[] = [];

  for (let i = 0; i < postsList.length; i++) {
    let receipt: PostResponse[];
    try {
      if (i === 0) {
        receipt = await postSocialV106(
          post.integration as Integration,
          [postsList[i]],
          operationId
        );
      } else {
        if (postsList[i].delay) {
          await sleep(60000 * Math.max(0, Number(postsList[i].delay ?? 0)));
        }
        receipt = await postCommentV106(
          postsResults[0].postId,
          postsResults.length === 1 ? undefined : postsResults[i - 1].postId,
          post.integration,
          [postsList[i]],
          operationId
        );
      }
    } catch {
      // The activity keeps the pending claim and visible uncertainty. Never
      // refresh-and-repeat a write whose external effect is not known.
      return false;
    }
    postsResults.push(...receipt);
    if (i === 0) {
      try {
        await startPublicationStreakV106({
          organizationId,
          postId: post.id,
          integrationId: post.integration.id,
          operationId,
        });
      } catch {
        // Auxiliary failure cannot invalidate confirmation or reschedule a write.
        console.warn('Confirmed publication: streak update failed');
      }
      try {
        await inAppNotification(
          post.integration.organizationId,
          `Your post has been published on ${capitalize(
            post.integration.providerIdentifier
          )}`,
          `Your post has been published on ${capitalize(
            post.integration.providerIdentifier
          )} at ${postsResults[0].releaseURL}`,
          true,
          true
        );
      } catch {
        console.warn('Confirmed publication: notification failed');
      }
    }
  }

  // send webhooks for the post
  try {
    await sendWebhooksV108({
      localPostId: post.id,
      organizationId: post.organizationId,
      integrationId: post.integration.id,
    });
  } catch (error) {
    if (isCancellation(error)) throw error;
    // Delivery is auxiliary: its failed activity remains visible in history,
    // while the confirmed publication and its remaining actions continue.
    console.warn('webhook_delivery_failed', { reason: 'activity_failure' });
  }

  // All plug offsets share this origin; discovery and action time count toward them.
  const delayedPhaseStartedAt = Date.now();

  // load internal plugs like repost by other users
  const internalPlugsList = await internalPlugs(
    post.integration,
    JSON.parse(post.settings)
  );

  // load global plugs, like repost a post if it gets to a certain number of likes
  const globalPlugsList = (await globalPlugs(post.integration)).reduce(
    (all, current) => {
      for (let i = 1; i <= current.totalRuns; i++) {
        all.push({
          ...current,
          delay: current.delay * i,
        });
      }

      return all;
    },
    []
  );

  // Check if the post is repeatable
  const repeatPost = !post.intervalInDays
    ? []
    : [
        {
          type: 'repeat-post',
          dueAt:
            startTime.getTime() + post.intervalInDays * 24 * 60 * 60 * 1000,
        },
      ];

  // Sort absolute deadlines, keeping repeat's workflow-entry base intact.
  const list = sortBy(
    [
      ...[...internalPlugsList, ...globalPlugsList].map((action) => ({
        ...action,
        dueAt: delayedPhaseStartedAt + Number(action.delay ?? 0),
      })),
      ...repeatPost,
    ],
    'dueAt'
  );

  // process all the plugs in order, we are using while because in some cases we need to remove items from the list
  while (list.length > 0) {
    // get the next to process
    const { dueAt, ...todo } = list.shift();

    // sleep(0) still creates a Temporal timer; overdue actions need no timer.
    const remainingDelay = Math.max(0, dueAt - Date.now());
    if (remainingDelay > 0) {
      await sleep(remainingDelay);
    }

    // process internal plug
    if (todo.type === 'internal-plug') {
      for (const _ of iterate) {
        try {
          await processInternalPlug({ ...todo, post: postsResults[0].postId });
        } catch (err) {
          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'refresh_token'
          ) {
            const refresh = await refreshTokenWithCause(
              await getIntegrationById(organizationId, todo.integration),
              err?.cause?.message || ''
            );
            if (!refresh || !refresh.accessToken) {
              break;
            }

            continue;
          }

          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'bad_body'
          ) {
            break;
          }

          continue;
        }
        break;
      }
    }

    // process global plug
    if (todo.type === 'global') {
      for (const _ of iterate) {
        try {
          const process = await processPlug({
            ...todo,
            postId: postsResults[0].postId,
          });
          if (process) {
            const toDelete = list
              .reduce((all, current, index) => {
                if (current.plugId === todo.plugId) {
                  all.push(index);
                }

                return all;
              }, [])
              .reverse();

            for (const index of toDelete) {
              list.splice(index, 1);
            }
          }
        } catch (err) {
          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'refresh_token'
          ) {
            const refresh = await refreshTokenWithCause(
              post.integration,
              err?.cause?.message || ''
            );
            if (!refresh || !refresh.accessToken) {
              break;
            }

            continue;
          }

          if (
            err instanceof ActivityFailure &&
            err.cause instanceof ApplicationFailure &&
            err.cause.type === 'bad_body'
          ) {
            break;
          }

          continue;
        }

        break;
      }
    }

    // process repeat post in a new workflow, this is important so the other plugs can keep running
    if (todo.type === 'repeat-post') {
      await startChild(postWorkflowV108, {
        parentClosePolicy: 'ABANDON',
        args: [
          {
            taskQueue,
            postId,
            organizationId,
            postNow: true,
          },
        ],
        workflowId: `post_${post.id}_${makeId(10)}`,
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: postIdSearchParam,
            value: postId,
          },
        ]),
      });
    }
  }
}
