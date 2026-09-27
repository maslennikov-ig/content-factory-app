import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Body,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Request, Response } from 'express';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  hasAiProvider,
  AiProviderNotConfigured,
  requireActiveAiConfig,
} from '@contentfactory/nestjs-libraries/openai/ai.provider.config';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { getOpenAiClient } from '@contentfactory/nestjs-libraries/openai/ai.clients';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { WebResearchService } from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { WebResearchDto } from '@contentfactory/nestjs-libraries/dtos/copilot/web.research.dto';
import { ContentContextService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service';
import { HttpException } from '@nestjs/common';

/**
 * `@copilotkit/runtime` pulls in roughly 2 800 modules and tens of megabytes of
 * heap, and none of it is reachable until an organization has a model key. Load
 * it on the first chat request instead of at boot. Nothing this module
 * exports appears in a decorated signature, so no `design:*` metadata changes.
 */
const copilotRuntime = () => import('@copilotkit/runtime');

const aiProviderUnavailable = () => new AiProviderNotConfigured();

/**
 * CopilotKit 1.10 streams from `beta.chat`, while OpenAI SDK 6 moved the same
 * helper to the stable `chat` namespace. Keep the organization-scoped client
 * and add only the compatibility alias CopilotKit reads.
 */
const copilotCompatibleClient = (
  client: Awaited<ReturnType<typeof getOpenAiClient>>
) => {
  const beta = client.beta as typeof client.beta & {
    chat?: typeof client.chat;
  };
  if (!beta.chat) {
    Object.defineProperty(beta, 'chat', { value: client.chat });
  }
  return client;
};

/**
 * The post editor's helper (`/copilot/chat`, `components/copilot/*`) and the
 * research door. The old agent screen's doors — `POST /copilot/agent`,
 * `GET /copilot/list` and `GET /copilot/:thread/list`
 * — went with it on 27.09.2026: the agent chat lives at `/agent`
 * (`agent.controller.ts`, `content-factory-next-kcxz.8`).
 */
@Controller('/copilot')
export class CopilotController {
  constructor(
    private _webResearchService: WebResearchService,
    private readonly aiUsage: AiUsageService,
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

  @Post('/chat')
  // The editor's writing helper: a member who may not write a post may not
  // spend the workspace allowance talking about one
  // (`content-factory-next-fn33.90.1`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.AI],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async chatAgent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (!(await hasAiProvider(organization.id))) {
      Logger.warn(
        'No language model provider configured, chat functionality will not work'
      );
      throw aiProviderUnavailable();
    }

    return this.aiUsage.executeAiOperation(
      organization.id,
      'copilot_chat',
      async () => {
        const {
          CopilotRuntime,
          OpenAIAdapter,
          copilotRuntimeNodeHttpEndpoint,
        } = await copilotRuntime();

        const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
          endpoint: '/copilot/chat',
          runtime: new CopilotRuntime(),
          serviceAdapter: new OpenAIAdapter({
            // CopilotKit bundles its own copy of the openai package, so the two
            // client types are structurally different builds of the same class.
            openai: copilotCompatibleClient(
              await getOpenAiClient(organization.id)
            ) as any,
            model: (await requireActiveAiConfig(organization.id)).textModel,
          }),
        });

        return copilotRuntimeHandler(req, res);
      }
    );
  }
}
