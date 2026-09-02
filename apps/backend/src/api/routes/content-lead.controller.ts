import { Body, Controller, Get, HttpException, Param, Post, Query } from '@nestjs/common';
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
  CreateContentLeadSubscriptionDto,
  ListContentLeadsDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-lead.dto';
import { ContentLeadService } from '@contentfactory/nestjs-libraries/content-intelligence/leads/content-lead.service';

/** Same reading as `content-brief.controller.ts` and `content-source.controller.ts`: the server's own `{code, message}`, never a generic wrapper. */
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
        message: error instanceof Error ? error.message : 'Lead request failed',
      },
      error.status
    );
  }
  throw error;
}

/**
 * «Откуда идеи»: subscriptions and the leads they bring back.
 *
 * The organisation comes from the request and from nowhere else, same as
 * every other controller under `/content-intelligence` — a subscription or a
 * lead belonging to another workspace is the one mistake this surface must
 * not be able to make.
 */
@ApiTags('Content intelligence leads')
@Controller('/content-intelligence/leads')
export class ContentLeadController {
  constructor(private readonly leads: ContentLeadService) {}

  @Get('/subscriptions')
  async listSubscriptions(@GetOrgFromRequest() organization: Organization) {
    try {
      return await this.leads.listSubscriptions(organization.id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Get('/subscriptions/linkable-autoposts')
  async listLinkableAutoPosts(@GetOrgFromRequest() organization: Organization) {
    try {
      return { autoPosts: await this.leads.listAutoPostsToLink(organization.id) };
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/subscriptions')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async createSubscription(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateContentLeadSubscriptionDto
  ) {
    try {
      return await this.leads.createSubscription(organization.id, user.id, body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/subscriptions/:id/archive')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async archiveSubscription(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.leads.archiveSubscription(organization.id, id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/subscriptions/:id/check')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async check(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string
  ) {
    try {
      return await this.leads.checkSubscription(organization.id, id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Get('/queue')
  async queue(
    @GetOrgFromRequest() organization: Organization,
    @Query() query: ListContentLeadsDto
  ) {
    try {
      return await this.leads.listLeads(organization.id, {
        status: query.status,
        subscriptionId: query.subscriptionId,
      });
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/dismiss')
  async dismiss(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      return await this.leads.dismissLead(organization.id, id, user.id);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/:id/accept')
  async accept(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      return await this.leads.acceptLead(organization.id, id, user.id);
    } catch (error) {
      safeHttpError(error);
    }
  }
}
