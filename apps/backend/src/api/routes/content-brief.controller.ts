import { Body, Controller, Get, HttpException, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  CreateBriefDraftDto,
  EvaluateBriefDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-brief.dto';
import { ContentBriefService } from '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.service';

/**
 * The refusal keeps its name and its subject.
 *
 * A screen branches on the code; a person reads the message. Printing
 * "что-то пошло не так" over a server that named the reason throws the reason
 * away.
 */
function safeHttpError(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'status' in error &&
    typeof error.code === 'string' &&
    typeof error.status === 'number'
  ) {
    throw new HttpException(
      {
        code: error.code,
        message: error instanceof Error ? error.message : 'Brief request failed',
        ...('subject' in error && typeof error.subject === 'string'
          ? { subject: error.subject }
          : {}),
      },
      error.status
    );
  }
  throw error;
}

const language = (value?: string) => (value === 'en' ? 'en' : 'ru');

/**
 * The brief gate and the topic radar.
 *
 * The organisation comes from the request and from nowhere else — a body may
 * carry anything, and a topic list or a fact belonging to another workspace is
 * the one mistake this surface must not be able to make.
 *
 * No route here reaches a platform. `draft` prepares a post in the `DRAFT`
 * state; publishing is the same path as for any other post.
 */
@ApiTags('Content intelligence brief')
@Controller('/content-intelligence/brief')
export class ContentBriefController {
  constructor(private readonly brief: ContentBriefService) {}

  @Get('/radar')
  async radar(
    @GetOrgFromRequest() organization: Organization,
    @Query('language') requested?: string
  ) {
    try {
      return await this.brief.radar(organization.id, language(requested));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/evaluate')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  async evaluate(
    @GetOrgFromRequest() organization: Organization,
    @Body() body: EvaluateBriefDto
  ) {
    try {
      return await this.brief.evaluate(
        organization.id,
        body,
        language(body?.language)
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/draft')
  // Two policies, read with AND: the plan limit answers first so a workspace
  // out of posts hears about the plan, and the role second
  // (`docs/product/roles-matrix.md`, `content-factory-next-fn33.90`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async draft(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateBriefDraftDto
  ) {
    try {
      return await this.brief.draft(
        organization.id,
        body,
        language(body?.language),
        // The author of the library piece this draft is cut from. From the
        // request and nowhere else, for the same reason the organisation is.
        user.id
      );
    } catch (error) {
      safeHttpError(error);
    }
  }
}
