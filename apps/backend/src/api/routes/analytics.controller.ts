import { Controller, Get, Param, Query } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import {
  PlanAheadDto,
  ProductionAnalyticsDto,
} from '@contentfactory/nestjs-libraries/dtos/analytics/production.analytics.dto';

@ApiTags('Analytics')
@Controller('/analytics')
export class AnalyticsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

  @Get('/production')
  async getProductionAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Query() query: ProductionAnalyticsDto
  ) {
    return this._postsService.getProductionAnalytics(
      org.id,
      query.days,
      query.integrationId
    );
  }

  /**
   * The plan ahead for the calendar header and Analytics → Производство
   * (`97dq.59`; counts in posts since `97dq.73`, `plan-ahead/v2`). Read-only and without a policy, like `/production` beside
   * it: any member of the workspace reads it; the organisation comes from the
   * request. Declared before `/:integration`, which would otherwise take it.
   */
  @Get('/ahead')
  async getPlanAhead(
    @GetOrgFromRequest() org: Organization,
    @Query() query: PlanAheadDto
  ) {
    return this._postsService.getPlanAhead(org.id, query);
  }

  @Get('/:integration')
  async getIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Get('/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }
}
