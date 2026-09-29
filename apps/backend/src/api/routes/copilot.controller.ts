import {
  Controller,
  Get,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { WebResearchDto } from '@contentfactory/nestjs-libraries/dtos/copilot/web.research.dto';
import { ContentContextService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service';
import { HttpException } from '@nestjs/common';

/**
 * The media picker's credits and the research door. The old agent screen's
 * doors — `POST /copilot/agent`, `GET /copilot/list` and
 * `GET /copilot/:thread/list` — went on 27.09.2026: the agent chat lives at
 * `/agent` (`agent.controller.ts`, `content-factory-next-kcxz.8`). The post
 * editor's CopilotKit helper and its `POST /copilot/chat` went with W6
 * (`content-factory-next-kcxz.28`): the editor's «Спросить агента» opens the
 * agent chat with the composer filled instead.
 */
@Controller('/copilot')
export class CopilotController {
  constructor(
    private _webResearchService: WebResearchService,
    private readonly contentContexts: ContentContextService,
    private readonly _subscriptionService: SubscriptionService
  ) {}

  private assertContextMayGenerate(context: any) {
    if (context.generationPolicy === 'EVIDENCE_REQUIRED') {
      throw new HttpException(
        {
          code: 'CONTENT_EVIDENCE_REQUIRED',
          message: 'Current evidence is required before generation',
        },
        409
      );
    }
  }

  /** Image/video credits for the media picker (`ai.video.tsx`); gained a policy with kcxz.8 (D8). */
  @Get('/credits')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Post('/research')
  // The assistant writes the post, so it is the writer's door. The AI
  // allowance is named first — a workspace out of allowance hears about the
  // allowance (`content-factory-next-fn33.90`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.AI],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async research(
    @Body() body: WebResearchDto,
    @GetOrgFromRequest() organization: Organization,
    @Query('language') language?: 'ru' | 'en'
  ) {
    const context = await this.contentContexts.build(organization.id, {
      consumer: 'EDITOR',
      purpose: 'DRAFT_ASSIST',
      query: body.subject,
      language: language === 'ru' ? 'ru' : 'en',
      freshnessMode: 'PREFER_FRESH',
      brandProfileSelection: { mode: 'active' },
    });
    this.assertContextMayGenerate(context);
    return {
      ...context,
      brandProfileVersionId:
        context.profile.mode === 'resolved' ? context.profile.versionId : null,
    };
  }
}
