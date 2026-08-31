import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
  Body,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@contentfactory/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
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
import type { BrandProfileSelectionV1 } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { HttpException } from '@nestjs/common';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
  contentLanguage: 'en' | 'ru';
  contentContext: string;
  brandProfileContext: string;
  contentIntelligenceMode: 'content-intelligence/v1';
};

/**
 * `@copilotkit/runtime` pulls in roughly 2 800 modules and tens of megabytes of
 * heap, and none of it is reachable until an organization has a model key. Load
 * it on the first chat or agent request instead of at boot. Nothing this module
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

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService,
    private _webResearchService: WebResearchService,
    private readonly aiUsage: AiUsageService,
    private readonly contentContexts: ContentContextService,
    private readonly brandProfileContexts: BrandProfileContextService
  ) {}

  private contentRequest(req: Request) {
    const properties = req?.body?.variables?.properties || {};
    const requested = properties.contentIntelligence || {};
    const rawMessages = Array.isArray(req?.body?.messages)
      ? req.body.messages
      : [];
    const lastUserMessage = [...rawMessages]
      .reverse()
      .find((message: any) => message?.role === 'user')?.content;
    const query = String(
      requested.query ||
        properties.contentRequest ||
        lastUserMessage ||
        'Draft assistance'
    ).slice(0, 4_000);
    const selection = requested.brandProfileSelection;
    const brandProfileSelection: BrandProfileSelectionV1 =
      selection?.mode === 'version' && typeof selection.versionId === 'string'
        ? { mode: 'version', versionId: selection.versionId.slice(0, 128) }
        : selection?.mode === 'none'
        ? { mode: 'none' }
        : { mode: 'active' };
    const ids = (value: unknown) =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 64)
        : undefined;
    return {
      query,
      language:
        properties.contentLanguage === 'ru' ? ('ru' as const) : ('en' as const),
      freshnessMode:
        requested.freshnessMode === 'REQUIRE_CURRENT' ||
        requested.freshnessMode === 'HISTORICAL'
          ? requested.freshnessMode
          : ('PREFER_FRESH' as const),
      brandProfileSelection,
      sourceIds: ids(requested.sourceIds),
      factIds: ids(requested.factIds),
      userMaterialEvidenceIds: ids(requested.userMaterialEvidenceIds),
    };
  }

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

  @Post('/research')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
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

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    const context = await this.contentContexts.build(organization.id, {
      consumer: 'AGENT',
      purpose: 'DRAFT_ASSIST',
      ...this.contentRequest(req),
    });
    this.assertContextMayGenerate(context);
    const brandProfileContext =
      context.profile.mode === 'resolved'
        ? await this.brandProfileContexts.resolve(organization.id, {
            mode: 'version',
            versionId: context.profile.versionId,
          })
        : undefined;
    if (!(await hasAiProvider(organization.id))) {
      Logger.warn(
        'No language model provider configured, chat functionality will not work'
      );
      throw aiProviderUnavailable();
    }
    return this.aiUsage.executeAiOperation(
      organization.id,
      'agent',
      async () => {
        const {
          CopilotRuntime,
          OpenAIAdapter,
          copilotRuntimeNextJSAppRouterEndpoint,
        } = await copilotRuntime();

        const mastra = await this._mastraService.mastra();
        const requestContext = new RequestContext<ChannelsContext>();
        requestContext.set(
          'integrations',
          req?.body?.variables?.properties?.integrations || []
        );
        requestContext.set(
          'contentLanguage',
          req?.body?.variables?.properties?.contentLanguage === 'ru'
            ? 'ru'
            : 'en'
        );

        requestContext.set('organization', JSON.stringify(organization));
        requestContext.set('contentContext', JSON.stringify(context));
        requestContext.set(
          'brandProfileContext',
          JSON.stringify(brandProfileContext || {})
        );
        requestContext.set(
          'contentIntelligenceMode',
          'content-intelligence/v1'
        );
        requestContext.set('ui', 'true');

        const agents = MastraAgent.getLocalAgents({
          resourceId: organization.id,
          mastra,
          requestContext: requestContext as any,
        });

        const runtime = new CopilotRuntime({
          agents,
        });

        const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
          endpoint: '/copilot/agent',
          runtime,
          // properties: req.body.variables.properties,
          serviceAdapter: new OpenAIAdapter({
            // CopilotKit bundles its own copy of the openai package, so the two
            // client types are structurally different builds of the same class.
            openai: copilotCompatibleClient(
              await getOpenAiClient(organization.id)
            ) as any,
            model: (await requireActiveAiConfig(organization.id)).textModel,
          }),
        });

        return copilotRuntimeHandler.handleRequest(req, res);
      }
    );
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('content-factory').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('content-factory').getMemory();
    const list = await memory.listThreads({
      filter: { resourceId: organization.id },
      perPage: 100000,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}
