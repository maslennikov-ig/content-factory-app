import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Post as PostBody } from '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto';
import {
  APPROVED_SUBMIT_FOR_ORDER,
  CreationMethod,
  Post,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import { v4 as uuidv4 } from 'uuid';
import { CreateTagDto } from '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto';
import { safeErrorLedgerPayload } from '@contentfactory/nestjs-libraries/database/prisma/errors/error-ledger.payload';
import type { ContentContextDraftBindingV1 } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);

function repositoryError(code: string, status: number, message: string): never {
  const error: any = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}

@Injectable()
export class PostsRepository {
  private readonly _logger = new Logger(PostsRepository.name);

  constructor(
    private _post: PrismaRepository<'post'>,
    private _popularPosts: PrismaRepository<'popularPosts'>,
    private _comments: PrismaRepository<'comments'>,
    private _tags: PrismaRepository<'tags'>,
    private _tagsPosts: PrismaRepository<'tagsPosts'>,
    private _errors: PrismaRepository<'errors'>,
    private _transaction?: PrismaTransaction
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
          deletedAt: null,
        },
        publishDate: {
          gte: dayjs.utc().subtract(2, 'day').toDate(),
          lt: dayjs.utc().toDate(),
        },
        state: 'QUEUE',
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        organizationId: true,
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
        publishDate: true,
      },
    });
  }

  getOldPosts(orgId: string, date: string) {
    return this._post.model.post.findMany({
      where: {
        integration: {
          refreshNeeded: false,
          inBetweenSteps: false,
          disabled: false,
        },
        organizationId: orgId,
        publishDate: {
          lte: dayjs(date).toDate(),
        },
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: {
        publishDate: 'desc',
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  updateImages(id: string, images: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        image: images,
      },
    });
  }

  getPostUrls(orgId: string, ids: string[]) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        releaseURL: true,
      },
    });
  }

  async getPosts(orgId: string, query: GetPostsDto) {
    // Use the provided start and end dates directly
    const startDate = dayjs.utc(query.startDate).toDate();
    const endDate = dayjs.utc(query.endDate).toDate();

    const list = await this._post.model.post.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                organizationId: orgId,
              },
            ],
          },
          {
            OR: [
              {
                publishDate: {
                  gte: startDate,
                  lte: endDate,
                },
              },
              {
                intervalInDays: {
                  not: null,
                },
              },
            ],
          },
        ],
        integration: {
          deletedAt: null,
          organizationId: orgId,
        },
        deletedAt: null,
        parentPostId: null,
        ...(query.customer
          ? {
              integration: {
                customerId: query.customer,
              },
            }
          : {}),
        ...(query.editorialStage
          ? { editorialStage: query.editorialStage }
          : {}),
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        releaseId: true,
        state: true,
        editorialStage: true,
        intervalInDays: true,
        group: true,
        creationMethod: true,
        tags: {
          select: {
            tag: true,
          },
        },
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
            name: true,
            picture: true,
          },
        },
      },
    });

    return list.reduce((all, post) => {
      if (!post.intervalInDays) {
        return [...all, post];
      }

      const addMorePosts = [];
      let startingDate = dayjs.utc(post.publishDate);
      while (dayjs.utc(endDate).isSameOrAfter(startingDate)) {
        if (dayjs(startingDate).isSameOrAfter(dayjs.utc(post.publishDate))) {
          addMorePosts.push({
            ...post,
            publishDate: startingDate.toDate(),
            actualDate: post.publishDate,
          });
        }

        startingDate = startingDate.add(post.intervalInDays, 'days');
      }

      return [...all, ...addMorePosts];
    }, [] as any[]);
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    const page = query.page || 0;
    const limit = query.limit || 20;
    const skip = page * limit;

    const stateFilter = query.state || 'all';
    const stateAndDate =
      stateFilter === 'scheduled'
        ? {
            state: State.QUEUE,
          }
        : stateFilter === 'draft'
        ? { state: State.DRAFT }
        : stateFilter === 'published'
        ? { state: State.PUBLISHED }
        : {
            state: {
              in: [State.QUEUE, State.DRAFT, State.PUBLISHED, State.ERROR],
            },
          };

    const orderDirection: 'asc' | 'desc' =
      stateFilter === 'published' ? 'desc' : 'asc';

    const where = {
      AND: [
        {
          OR: [
            {
              organizationId: orgId,
            },
          ],
        },
      ],
      ...stateAndDate,
      // Published posts were already posted (publishDate in the past), so fetch
      // all of them; everything else stays upcoming. Ordering handles the rest.
      ...(stateFilter === 'published'
        ? {}
        : { publishDate: { gte: dayjs.utc().toDate() } }),
      deletedAt: null as Date | null,
      parentPostId: null as string | null,
      intervalInDays: null as number | null,
      ...(query.editorialStage
        ? { editorialStage: query.editorialStage }
        : {}),

      integration: {
        deletedAt: null as any,
        organizationId: orgId,
        ...(query.customer
          ? {
              customerId: query.customer,
            }
          : {}),
      },
    };

    const [posts, total] = await Promise.all([
      this._post.model.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          publishDate: orderDirection,
        },
        select: {
          id: true,
          content: true,
          publishDate: true,
          releaseURL: true,
          releaseId: true,
          state: true,
          editorialStage: true,
          intervalInDays: true,
          group: true,
          creationMethod: true,
          tags: {
            select: {
              tag: true,
            },
          },
          integration: {
            select: {
              id: true,
              providerIdentifier: true,
              name: true,
              picture: true,
            },
          },
        },
      }),
      this._post.model.post.count({ where }),
    ]);

    return {
      posts,
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  async deletePost(orgId: string, group: string) {
    await this._post.model.post.updateMany({
      where: {
        organizationId: orgId,
        group,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return this._post.model.post.findFirst({
      where: {
        organizationId: orgId,
        group,
        parentPostId: null,
      },
      select: {
        id: true,
      },
    });
  }

  async getPostsByGroup(orgId: string, group: string) {
    const posts = await this._post.model.post.findMany({
      where: {
        group,
        organizationId: orgId,
        deletedAt: null,
      },
      include: {
        integration: true,
        tags: {
          select: {
            tag: true,
          },
        },
        contentOutputContexts: {
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            contentContextSnapshotId: true,
            brandProfileVersionId: true,
            usedCitationIds: true,
            validationStatus: true,
            snapshot: {
              select: {
                id: true,
                status: true,
                builtAt: true,
                expiresAt: true,
              },
            },
            brandProfileVersion: {
              select: {
                id: true,
                label: true,
                versionNumber: true,
                lifecycle: true,
              },
            },
          },
        },
      },
    });
    return posts.map(({ contentOutputContexts, ...post }: any) => ({
      ...post,
      contentOutputContext: contentOutputContexts[0]
        ? {
            contentContextSnapshotId:
              contentOutputContexts[0].contentContextSnapshotId,
            brandProfileVersionId:
              contentOutputContexts[0].brandProfileVersionId,
            usedCitationIds: Array.isArray(
              contentOutputContexts[0].usedCitationIds
            )
              ? contentOutputContexts[0].usedCitationIds
              : [],
            validationStatus: contentOutputContexts[0].validationStatus,
            context: contentOutputContexts[0].snapshot,
            profile: contentOutputContexts[0].brandProfileVersion,
          }
        : null,
    }));
  }

  getPost(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(orgId ? { organizationId: orgId } : {}),
        deletedAt: null,
      },
      include: {
        ...(includeIntegration
          ? {
              integration: true,
              tags: {
                select: {
                  tag: true,
                },
              },
            }
          : {}),
        childrenPost: true,
      },
    });
  }

  updatePost(id: string, postId: string, releaseURL: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state: 'PUBLISHED',
        releaseURL,
        releaseId: postId,
      },
    });
  }

  updateReleaseId(id: string, orgId: string, releaseId: string) {
    return this._post.model.post.update({
      where: {
        id,
        organizationId: orgId,
        releaseId: 'missing',
      },
      data: {
        releaseId: String(releaseId),
      },
    });
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const safeError = err ? safeErrorLedgerPayload(err) : undefined;
    const update = await this._post.model.post.update({
      where: {
        id,
      },
      data: {
        state,
        ...(safeError ? { error: safeError.message } : {}),
      },
      include: {
        integration: {
          select: {
            providerIdentifier: true,
          },
        },
      },
    });

    if (state === 'ERROR' && err && body) {
      try {
        await this._errors.model.errors.create({
          data: {
            message: safeError!.message,
            organizationId: update.organizationId,
            platform: update.integration.providerIdentifier,
            postId: update.id,
            body: safeError!.body,
          },
        });
      } catch {
        this._logger.warn(
          `Failed to persist publishing error metadata for post ${update.id}`
        );
      }
    }

    return update;
  }

  getErrorsByPostIds(postIds: string[]) {
    return this._errors.model.errors.findMany({
      where: {
        postId: { in: postIds },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    isDraft: boolean,
    action: 'schedule' | 'update' = 'schedule'
  ) {
    return this._post.model.post.update({
      where: {
        organizationId: orgId,
        id,
      },
      data: {
        publishDate: dayjs(date).toDate(),
        // schedule: set state to QUEUE (or DRAFT if it was a draft)
        // update: don't change the state
        ...(action === 'schedule'
          ? {
              state: isDraft ? 'DRAFT' : 'QUEUE',
              releaseId: null,
              releaseURL: null,
            }
          : {}),
      },
    });
  }

  countPostsFromDay(orgId: string, date: Date) {
    return this._post.model.post.count({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: date,
        },
        OR: [
          {
            deletedAt: null,
            state: {
              in: ['QUEUE'],
            },
          },
          {
            state: 'PUBLISHED',
          },
        ],
      },
    });
  }

  async createOrUpdatePost(
    state: 'draft' | 'schedule' | 'now' | 'update',
    orgId: string,
    date: string,
    body: PostBody,
    tags: { value: string; label: string }[],
    creationMethod: CreationMethod,
    inter?: number
  ) {
    const hasPerItemCitations = body.value.some(
      (item) => item.usedCitationIds !== undefined
    );
    if (
      !body.contentContextSnapshotId &&
      (body.brandProfileVersionId ||
        body.usedCitationIds !== undefined ||
        hasPerItemCitations)
    ) {
      repositoryError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        422,
        'Profile and citations require a server-issued content context'
      );
    }
    if (body.contentContextSnapshotId) {
      if (!['draft', 'update'].includes(state)) {
        repositoryError(
          'CONTENT_CONTEXT_DRAFT_ONLY',
          409,
          'Content intelligence output can only be saved as a draft'
        );
      }
      if (body.value.length > 1 && body.usedCitationIds !== undefined) {
        repositoryError(
          'CONTENT_CONTEXT_INPUT_INVALID',
          422,
          'Thread drafts require citations on each content item'
        );
      }
    }
    const requiresTenantTransaction = Boolean(
      body.contentContextSnapshotId ||
        body.group ||
        body.value.some((item) => item.id)
    );
    if (requiresTenantTransaction) {
      if (!this._transaction) {
        throw new Error(
          'Prisma transaction is required for scoped post writes'
        );
      }
      return (this._transaction.model as any).$transaction(
        async (client: any) => {
          let bindings: ContentContextDraftBindingV1[] | undefined;
          if (body.contentContextSnapshotId) {
            const { validateContentContextForDraft } = await import(
              '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize'
            );
            bindings = [];
            for (const value of body.value) {
              bindings.push(
                await validateContentContextForDraft(client, {
                  organizationId: orgId,
                  contentContextSnapshotId: body.contentContextSnapshotId,
                  requestedBrandProfileVersionId: body.brandProfileVersionId,
                  usedCitationIds:
                    value.usedCitationIds ??
                    (body.value.length === 1
                      ? body.usedCitationIds
                      : undefined),
                })
              );
            }
          }
          return this.createOrUpdatePostWithClient(
            client,
            state,
            orgId,
            date,
            body,
            tags,
            creationMethod,
            inter,
            bindings
          );
        },
        { isolationLevel: 'RepeatableRead', maxWait: 5_000, timeout: 10_000 }
      );
    }
    return this.createOrUpdatePostWithClient(
      {
        post: (this._post.model as any).post,
        tags: (this._tags.model as any).tags,
        tagsPosts: (this._tagsPosts.model as any).tagsPosts,
      },
      state,
      orgId,
      date,
      body,
      tags,
      creationMethod,
      inter
    );
  }

  /**
   * Creates every per-channel AutoPost V2 draft and advances the source
   * snapshot marker in one transaction. Temporal retries therefore observe
   * either no draft/no marker or the complete draft set/marker.
   */
  async createAutopostV2DraftAtomic(input: {
    organizationId: string;
    autoPostId: string;
    sourceSnapshotId: string;
    date: string;
    posts: PostBody[];
  }) {
    if (!this._transaction) {
      throw new Error('Prisma transaction is required for AutoPost V2');
    }
    return (this._transaction.model as any).$transaction(
      async (client: any) => {
        const autoPost = await client.autoPost.findFirst({
          where: {
            organizationId: input.organizationId,
            id: input.autoPostId,
            workflowVersion: 2,
            active: true,
            requiresAttention: false,
            deletedAt: null,
          },
          select: { id: true, lastUrl: true },
        });
        if (!autoPost || autoPost.lastUrl === input.sourceSnapshotId) {
          return { created: false, posts: [] as Post[] };
        }
        const created: Post[] = [];
        const { validateContentContextForDraft } = await import(
          '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize'
        );
        for (const body of input.posts) {
          const bindings: ContentContextDraftBindingV1[] = [];
          for (const value of body.value) {
            bindings.push(
              await validateContentContextForDraft(client, {
                organizationId: input.organizationId,
                contentContextSnapshotId: body.contentContextSnapshotId!,
                requestedBrandProfileVersionId: body.brandProfileVersionId,
                usedCitationIds: value.usedCitationIds || [],
              })
            );
          }
          const result = await this.createOrUpdatePostWithClient(
            client,
            'draft',
            input.organizationId,
            input.date,
            body,
            [],
            'AUTOPOST' as CreationMethod,
            undefined,
            bindings
          );
          created.push(...result.posts);
        }
        const advanced = await client.autoPost.updateMany({
          where: {
            organizationId: input.organizationId,
            id: input.autoPostId,
            workflowVersion: 2,
            lastUrl: autoPost.lastUrl,
            active: true,
            requiresAttention: false,
            deletedAt: null,
          },
          data: { lastUrl: input.sourceSnapshotId },
        });
        if (advanced.count !== 1) {
          repositoryError(
            'AUTOPOST_V2_CONFLICT',
            409,
            'AutoPost V2 state changed while creating its draft'
          );
        }
        return { created: true, posts: created };
      },
      { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 10_000 }
    );
  }

  private async createOrUpdatePostWithClient(
    client: any,
    state: 'draft' | 'schedule' | 'now' | 'update',
    orgId: string,
    date: string,
    body: PostBody,
    tags: { value: string; label: string }[],
    creationMethod: CreationMethod,
    inter?: number,
    contextBindings?: ContentContextDraftBindingV1[]
  ) {
    const posts: Post[] = [];
    const uuid = uuidv4();
    const requestedPostIds = [
      ...new Set(body.value.map((item) => item.id).filter(Boolean)),
    ] as string[];
    if (requestedPostIds.length) {
      const ownedPosts = await client.post.findMany({
        where: {
          organizationId: orgId,
          id: { in: requestedPostIds },
          deletedAt: null,
        },
        select: { id: true, state: true },
      });
      if (ownedPosts.length !== requestedPostIds.length) {
        repositoryError('POST_NOT_FOUND', 404, 'Post was not found');
      }
      if (
        contextBindings &&
        ownedPosts.some((post: any) => post.state && post.state !== 'DRAFT')
      ) {
        repositoryError(
          'CONTENT_CONTEXT_DRAFT_ONLY',
          409,
          'Content intelligence output can only update a draft'
        );
      }
    }
    const previousPost = body.group
      ? await client.post.findFirst({
          where: {
            organizationId: orgId,
            group: body.group,
            deletedAt: null,
            parentPostId: null,
          },
          select: { id: true },
        })
      : null;
    if (body.group && !previousPost) {
      repositoryError('POST_NOT_FOUND', 404, 'Post group was not found');
    }

    for (const [index, value] of body.value.entries()) {
      const contextBinding = contextBindings?.[index];
      const postId = value.id || uuidv4();
      const updateData = (type: 'create' | 'update') => ({
        publishDate: dayjs(date).toDate(),
        integration: {
          connect: {
            id: body.integration.id,
            organizationId: orgId,
          },
        },
        ...(posts?.[posts.length - 1]?.id
          ? {
              parentPost: {
                connect: {
                  id: posts[posts.length - 1]?.id,
                },
              },
            }
          : type === 'update'
          ? {
              parentPost: {
                disconnect: true,
              },
            }
          : {}),
        content: value.content,
        delay: value.delay || 0,
        group: uuid,
        intervalInDays: inter ? +inter : null,
        approvedSubmitForOrder: APPROVED_SUBMIT_FOR_ORDER.NO,
        ...(type === 'create' ? { creationMethod } : {}),
        ...(state === 'update'
          ? {}
          : {
              state:
                state === 'draft' ? ('DRAFT' as const) : ('QUEUE' as const),
            }),
        image: JSON.stringify(value.image),
        settings: JSON.stringify(body.settings),
        researchSources: JSON.stringify(body.researchSources || []),
        // Editorial stage, NOT delivery `state` above. Only written when the
        // caller sent it: omitting the field on an update must leave whatever
        // stage the post already had alone, not silently clear it.
        ...('editorialStage' in body
          ? { editorialStage: body.editorialStage ?? null }
          : {}),
        ...(contextBinding
          ? {
              contentContextSnapshot: {
                connect: {
                  organizationId_id: {
                    organizationId: orgId,
                    id: contextBinding.contentContextSnapshotId,
                  },
                },
              },
              ...(contextBinding.brandProfileVersionId
                ? {
                    brandProfileVersion: {
                      connect: {
                        organizationId_id: {
                          organizationId: orgId,
                          id: contextBinding.brandProfileVersionId,
                        },
                      },
                    },
                  }
                : type === 'update'
                ? { brandProfileVersion: { disconnect: true } }
                : {}),
            }
          : type === 'update'
          ? {
              contentContextSnapshot: { disconnect: true },
              brandProfileVersion: { disconnect: true },
            }
          : {}),
        organization: {
          connect: {
            id: orgId,
          },
        },
      });

      posts.push(
        await client.post.upsert({
          where: {
            organizationId_id: { organizationId: orgId, id: postId },
          },
          create: { id: postId, ...updateData('create') },
          update: {
            ...updateData('update'),
            lastMessage: {
              disconnect: true,
            },
            submittedForOrder: {
              disconnect: true,
            },
          },
        })
      );

      if (contextBinding) {
        const { writeContentContextDraftProvenance } = await import(
          '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.finalize'
        );
        await writeContentContextDraftProvenance(client, {
          organizationId: orgId,
          postId: posts[posts.length - 1].id,
          content: value.content,
          binding: contextBinding,
        });
      } else if (value.id) {
        await Promise.all([
          client.contentOutputContext.deleteMany({
            where: { organizationId: orgId, postId: value.id },
          }),
          client.draftEvidence.deleteMany({
            where: { organizationId: orgId, postId: value.id },
          }),
        ]);
      }

      if (posts.length === 1) {
        await client.tagsPosts.deleteMany({
          where: {
            post: {
              id: posts[0].id,
              organizationId: orgId,
            },
          },
        });

        if (tags.length) {
          const tagsList = await client.tags.findMany({
            where: {
              orgId: orgId,
              name: {
                in: tags.map((tag) => tag.label).filter((f) => f),
              },
            },
          });

          if (tagsList.length) {
            await client.post.update({
              where: {
                organizationId_id: {
                  organizationId: orgId,
                  id: posts[posts.length - 1].id,
                },
              },
              data: {
                tags: {
                  createMany: {
                    data: tagsList.map((tag: any) => ({
                      tagId: tag.id,
                    })),
                  },
                },
              },
            });
          }
        }
      }
    }

    if (body.group) {
      await client.post.updateMany({
        where: {
          organizationId: orgId,
          group: body.group,
          deletedAt: null,
        },
        data: {
          parentPostId: null,
          deletedAt: new Date(),
        },
      });
    }

    return { previousPost: previousPost?.id, posts };
  }

  async submit(id: string, order: string, buyerOrganizationId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        submittedForOrderId: order,
        approvedSubmitForOrder: 'WAITING_CONFIRMATION',
        submittedForOrganizationId: buyerOrganizationId,
      },
      select: {
        id: true,
        description: true,
        submittedForOrder: {
          select: {
            messageGroupId: true,
          },
        },
      },
    });
  }

  updateMessage(id: string, messageId: string) {
    return this._post.model.post.update({
      where: {
        id,
      },
      data: {
        lastMessageId: messageId,
      },
    });
  }

  getPostById(id: string, org?: string) {
    return this._post.model.post.findUnique({
      where: {
        id,
        ...(org ? { organizationId: org } : {}),
      },
      include: {
        integration: true,
        submittedForOrder: {
          include: {
            posts: {
              where: {
                state: 'PUBLISHED',
              },
            },
            ordersItems: true,
            seller: {
              select: {
                id: true,
                account: true,
              },
            },
          },
        },
      },
    });
  }

  findAllExistingCategories() {
    return this._popularPosts.model.popularPosts.findMany({
      select: {
        category: true,
      },
      distinct: ['category'],
    });
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
      },
      select: {
        topic: true,
      },
      distinct: ['topic'],
    });
  }

  findPopularPosts(category: string, topic?: string) {
    return this._popularPosts.model.popularPosts.findMany({
      where: {
        category,
        ...(topic ? { topic } : {}),
      },
      select: {
        content: true,
        hook: true,
      },
    });
  }

  createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._popularPosts.model.popularPosts.create({
      data: {
        category: 'category',
        topic: 'topic',
        content: 'content',
        hook: 'hook',
      },
    });
  }

  async getPostsCountsByDates(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs
  ) {
    const dates = await this._post.model.post.findMany({
      where: {
        deletedAt: null,
        organizationId: orgId,
        publishDate: {
          in: times.map((time) => {
            return date.clone().add(time, 'minutes').toDate();
          }),
        },
      },
    });

    return times.filter(
      (time) =>
        date.clone().add(time, 'minutes').isAfter(dayjs.utc()) &&
        !dates.find((dateFind) => {
          return (
            dayjs
              .utc(dateFind.publishDate)
              .diff(date.clone().startOf('day'), 'minutes') == time
          );
        })
    );
  }

  async getComments(postId: string) {
    return this._comments.model.comments.findMany({
      where: {
        postId,
        // The public preview stops showing a deleted post; its comments
        // stop with it (`content-factory-next-jjvz`).
        post: { deletedAt: null },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getTags(orgId: string) {
    return this._tags.model.tags.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.create({
      data: {
        orgId,
        name: body.name,
        color: body.color,
      },
    });
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._tags.model.tags.update({
      where: {
        id,
        // `orgId` was taken as a parameter and dropped: the tag was found by
        // id alone, so a signed-in person could rename and recolour another
        // workspace's tag if they knew its id. `deleteTag`, two methods down,
        // always filtered correctly — this was the odd one out.
        // Found 03.09.2026 by `tests/tenant-isolation.guard.test.cjs`.
        orgId,
      },
      data: {
        name: body.name,
        color: body.color,
      },
    });
  }

  deleteTag(id: string, orgId: string) {
    return this._tags.model.tags.update({
      where: {
        id,
        orgId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async createComment(
    orgId: string,
    userId: string,
    postId: string,
    content: string
  ) {
    // The comment carried the caller's organisation and any post id, so a
    // signed-in person could attach comments to another workspace's post.
    // The post has to be the caller's own — the same shape as `editTag`
    // above, closed the same day (`content-factory-next-jjvz`).
    const post = await this._post.model.post.findFirst({
      where: {
        id: postId,
        organizationId: orgId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this._comments.model.comments.create({
      data: {
        organizationId: orgId,
        userId,
        postId,
        content,
      },
    });
  }

  async getPostByForWebhookId(postId: string) {
    return this._post.model.post.findMany({
      where: {
        id: postId,
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  async getPostsSince(orgId: string, since: string) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        publishDate: {
          gte: new Date(since),
        },
        deletedAt: null,
        parentPostId: null,
      },
      select: {
        id: true,
        content: true,
        publishDate: true,
        releaseURL: true,
        state: true,
        integration: {
          select: {
            id: true,
            name: true,
            providerIdentifier: true,
            picture: true,
            type: true,
          },
        },
      },
    });
  }

  getProductionAnalyticsPosts(
    orgId: string,
    from: Date,
    to: Date,
    integrationId?: string
  ) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        parentPostId: null,
        publishDate: { gte: from, lte: to },
        state: { in: ['PUBLISHED', 'ERROR'] },
        ...(integrationId ? { integrationId } : {}),
      },
      select: {
        state: true,
        creationMethod: true,
        createdAt: true,
        publishDate: true,
        error: true,
        errors: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { message: true },
        },
      },
    });
  }
}
