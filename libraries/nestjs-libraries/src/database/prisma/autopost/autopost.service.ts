import { Injectable, Logger } from '@nestjs/common';
import { AutopostRepository } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository';
import {
  AutopostDraftV2Dto,
  AutopostDto,
} from '@contentfactory/nestjs-libraries/dtos/autopost/autopost.dto';
import dayjs from 'dayjs';
import { END, START, StateGraph } from '@langchain/langgraph';
import { AutoPost, Integration } from '@prisma/client';
import { BaseMessage } from '@langchain/core/messages';
import striptags from 'striptags';
import { ChatOpenAI, DallEAPIWrapper } from '@langchain/openai';
import { JSDOM } from 'jsdom';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  voiceInstructionLines,
  type EffectiveVoice,
} from '@contentfactory/nestjs-libraries/agent/voice-directives';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import Parser from 'rss-parser';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';
import {
  getChatModel,
  getImageModel,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import {
  ContentLanguage,
  contentLanguageInstruction,
} from '@contentfactory/nestjs-libraries/dtos/content.language';
import {
  WebResearchResult,
  WebResearchService,
  WebSearchNotConfigured,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';
import { fetchSafePublicHttpsUrl } from '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.fetch';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { ContentContextService } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service';
import type { ContentContextEnvelopeResultV1 } from '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.types';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';
import type { ResolvedBrandProfileContextV1 } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { PostsRepository } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.repository';
const parser = new Parser();

interface WorkflowChannelsState {
  messages: BaseMessage[];
  integrations: Integration[];
  body: AutoPost;
  description: string;
  research?: WebResearchResult;
  image: string;
  id: string;
  load: {
    date: string;
    url: string;
    description: string;
  };
}

const generateContent = (maximumCharacters: number) =>
  z.object({
    socialMediaPostContent: z
      .string()
      .describe(
        'Content for the social media post, at most ' +
          maximumCharacters +
          ' characters'
      ),
  });

const dallePrompt = z.object({
  generatedTextToBeSentToDallE: z
    .string()
    .describe('Generated prompt from description to be sent to DallE'),
});

const groundedAutoPostContent = z.object({
  content: z.string(),
  usedCitationIds: z.array(z.string()),
});

@Injectable()
export class AutopostService {
  private readonly logger = new Logger(AutopostService.name);

  constructor(
    private _autopostsRepository: AutopostRepository,
    private _temporalService: TemporalService,
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _integrationManager: IntegrationManager,
    private _webResearchService: WebResearchService,
    private readonly aiUsage: AiUsageService,
    private readonly contentContexts: ContentContextService,
    private readonly brandProfileContexts: BrandProfileContextService,
    private readonly brandProfiles: BrandProfileRepository,
    private readonly postsRepository: PostsRepository
  ) {}

  private maximumCharacters(integrations: Integration[], withPicture: boolean) {
    if (integrations.length === 0) {
      throw new Error('Autopost has no target channels.');
    }

    // A channel whose provider is no longer registered must not take the whole
    // run down; the remaining channels still have a budget.
    const targets = integrations
      .map((integration) => ({
        integration,
        provider: this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        ),
      }))
      .filter((target) => !!target.provider);

    if (targets.length === 0) {
      throw new Error('Autopost has no target channel with a known provider.');
    }

    return Math.min(
      ...targets.map(({ integration, provider }) => {
        let additionalSettings: unknown[] = [];
        try {
          additionalSettings = JSON.parse(
            integration.additionalSettings || '[]'
          );
        } catch {
          additionalSettings = [];
        }

        // With a picture the text may travel as a media caption, which is a
        // much shorter field than a message on the providers that have one.
        const captionMaximum = withPicture
          ? provider.maxCaptionLength?.()
          : undefined;
        return captionMaximum ?? provider.maxLength(additionalSettings);
      })
    );
  }

  async stopAll(org: string) {
    const getAll = (await this.getAutoposts(org)).filter((f) => f.active);
    for (const autopost of getAll) {
      await this.changeActive(org, autopost.id, false);
    }
  }

  getAutoposts(orgId: string) {
    return this._autopostsRepository.getAutoposts(orgId);
  }

  async createAutopost(orgId: string, body: AutopostDto, id?: string) {
    const data = await this._autopostsRepository.createAutopost(
      orgId,
      body,
      id
    );

    await this.processCron(body.active, orgId, data.id);

    return data;
  }

  async createAutopostDraftV2(orgId: string, body: AutopostDraftV2Dto) {
    const data = await this.brandProfiles.withPinnedPublishedVersionWrite(
      orgId,
      body.brandProfileVersionId,
      (client) =>
        this._autopostsRepository.createAutopostDraftV2(client, orgId, body)
    );
    try {
      await this.processCronV2(body.active, orgId, data.id);
    } catch (cause: any) {
      if (
        cause?.name === 'WorkflowExecutionAlreadyStartedError' ||
        cause?.code === 'WORKFLOW_EXECUTION_ALREADY_STARTED'
      ) {
        return data;
      }
      await this._autopostsRepository.markDraftV2RequiresAttention(
        orgId,
        data.id
      );
      this.logger.error(
        `AutoPost V2 workflow could not start for ${data.id}; attention is required.`
      );
      const error: any = new Error('AutoPost V2 workflow is unavailable');
      error.code = 'AUTOPOST_V2_WORKFLOW_UNAVAILABLE';
      error.status = 503;
      error.cause = cause;
      throw error;
    }
    return data;
  }

  async changeActive(orgId: string, id: string, active: boolean) {
    const data = await this._autopostsRepository.changeActive(
      orgId,
      id,
      active
    );
    try {
      await (data.workflowVersion === 2
        ? this.processCronV2(active, orgId, id)
        : this.processCron(active, orgId, id));
    } catch (error) {
      if (data.workflowVersion === 2) {
        await this._autopostsRepository.markDraftV2RequiresAttention(orgId, id);
        this.logger.error(
          `AutoPost V2 workflow state could not change for ${id}; attention is required.`
        );
      }
      throw error;
    }
    return data;
  }

  async processCron(active: boolean, orgId: string, id: string) {
    if (active) {
      try {
        return this._temporalService.client
          .getRawClient()
          ?.workflow.start('autoPostWorkflow', {
            workflowId: `autopost-${id}`,
            taskQueue: 'main',
            args: [{ id, immediately: true }],
            typedSearchAttributes: new TypedSearchAttributes([
              {
                key: organizationId,
                value: orgId,
              },
            ]),
          });
      } catch (err) {}
    }

    try {
      return await this._temporalService.terminateWorkflow(`autopost-${id}`);
    } catch (err) {
      return false;
    }
  }

  async processCronV2(active: boolean, orgId: string, id: string) {
    const workflowId = `autopost-draft-v2-${id}`;
    if (active) {
      const temporal = this._temporalService.client.getRawClient();
      if (!temporal) {
        throw new Error('Temporal client is unavailable');
      }
      return temporal.workflow.start('autoPostDraftV2Workflow', {
        workflowId,
        taskQueue: 'main',
        args: [{ id, organizationId: orgId, immediately: true }],
        typedSearchAttributes: new TypedSearchAttributes([
          { key: organizationId, value: orgId },
        ]),
      });
    }
    try {
      return await this._temporalService.terminateWorkflow(workflowId);
    } catch {
      return false;
    }
  }

  async deleteAutopost(orgId: string, id: string) {
    const data = await this._autopostsRepository.deleteAutopost(orgId, id);
    await (data.workflowVersion === 2
      ? this.processCronV2(false, orgId, id)
      : this.processCron(false, orgId, id));
    return data;
  }

  async loadXML(url: string) {
    try {
      // `parser.parseURL` fetches through Node's own `http.get`/`https.get` and
      // follows redirects itself, so neither the URL guard nor the pinning
      // dispatcher would ever see the feed. The body is fetched here — the same
      // way `loadUrl` below does it — and only then handed to the parser.
      const xml = await (await fetchSafePublicHttpsUrl(url)).text();
      const { items } = await parser.parseString(xml);
      const findLast = items.reduce(
        (all: any, current: any) => {
          if (dayjs(current.pubDate).isAfter(all.pubDate)) {
            return current;
          }
          return all;
        },
        { pubDate: dayjs().subtract(100, 'years') }
      );

      return {
        success: true,
        date: findLast.pubDate,
        url: findLast.link,
        description: striptags(
          findLast?.['content:encoded'] ||
            findLast?.content ||
            findLast?.description ||
            ''
        )
          .replace(/\n/g, ' ')
          .trim(),
      };
    } catch (err) {
      /** sent **/
    }

    return { success: false };
  }

  static state = () =>
    new StateGraph<WorkflowChannelsState>({
      channels: {
        messages: {
          reducer: (currentState, updateValue) =>
            currentState.concat(updateValue),
          default: (): BaseMessage[] => [],
        },
        body: null,
        description: null,
        research: null,
        load: null,
        image: null,
        integrations: null,
        id: null,
      },
    });

  async loadUrl(url: string) {
    try {
      const loadDom = new JSDOM(
        await (await fetchSafePublicHttpsUrl(url)).text()
      );
      loadDom.window.document
        .querySelectorAll('script')
        .forEach((s) => s.remove());
      loadDom.window.document
        .querySelectorAll('style')
        .forEach((s) => s.remove());
      // remove all html, script and styles
      return striptags(loadDom.window.document.body.innerHTML);
    } catch (err) {
      return '';
    }
  }

  async enrichWithResearch(state: WorkflowChannelsState) {
    if (!state.body.researchEnabled || !state.body.generateContent) {
      return {};
    }

    const subject = [state.load.description, state.load.url]
      .filter(Boolean)
      .join('\n\n');
    try {
      return {
        research: await this._webResearchService.research(
          state.body.organizationId,
          subject
        ),
      };
    } catch (error) {
      if (!(error instanceof WebSearchNotConfigured)) {
        this.logger.warn(
          'Optional autopost web research failed; continuing with the feed item.'
        );
      }
      return {};
    }
  }

  private researchText(research?: WebResearchResult) {
    if (!research) return '';
    return [
      research.summary,
      ...research.facts.map(
        (fact) => `${fact.text} (source: ${fact.sourceUrl})`
      ),
      ...research.sources.map(
        (source) =>
          `${source.title}: ${source.url}${
            source.publishedAt ? ` (${source.publishedAt})` : ''
          }`
      ),
    ]
      .filter(Boolean)
      .join('\n');
  }

  async generateDescription(state: WorkflowChannelsState) {
    if (!state.body.generateContent) {
      return {
        ...state,
        description: state.body.content,
      };
    }

    const description =
      state.load.description || (await this.loadUrl(state.load.url));
    if (!description) {
      return {
        ...state,
        description: '',
      };
    }

    const providerMaximum = this.maximumCharacters(
      state.integrations,
      !!state.body.addPicture
    );
    const sourceSuffixLength = ('\n\n' + state.load.url).length;
    const contentMaximum = Math.max(1, providerMaximum - sourceSuffixLength);
    const language = (state.body.language || 'en') as ContentLanguage;
    const research = this.researchText(state.research);
    const structuredOutput = (
      await getChatModel(state.body.organizationId, 0.7)
    ).withStructuredOutput(generateContent(contentMaximum));
    const basePrompt = `
        You are an assistant that gets raw 'description' of a content and generate a social media post content.
        Rules:
        - Final post maximum: ${providerMaximum} characters including the source URL
        - Generated content maximum: ${contentMaximum} characters; use the space needed to explain the material well
        - ${contentLanguageInstruction(language)}
        - Separate paragraphs with a blank line (\\n\\n); the text is published exactly as written
        - Don't add hashtags
        - Add emojis when needed
        
        'description':
        {content}
      `;
    const researchPrompt = research
      ? `${basePrompt}

        <!-- BEGIN verified web research -->
        {research}
        <!-- END verified web research -->

        Use only relevant, non-conflicting research facts. Do not invent facts
        or imply that uncited claims came from the research.
      `
      : basePrompt;
    const { socialMediaPostContent } = await ChatPromptTemplate.fromTemplate(
      researchPrompt
    )
      .pipe(structuredOutput)
      .invoke(
        research
          ? {
              content: description,
              research,
            }
          : { content: description }
      );

    return {
      ...state,
      description: socialMediaPostContent,
    };
  }

  async generatePicture(state: WorkflowChannelsState) {
    const structuredOutput = (
      await getChatModel(state.body.organizationId, 0.7)
    ).withStructuredOutput(dallePrompt);
    const { generatedTextToBeSentToDallE } =
      await ChatPromptTemplate.fromTemplate(
        `
        You are an assistant that gets description and generate a prompt that will be sent to DallE to generate pictures.
        
        content:
        {content}
      `
      )
        .pipe(structuredOutput)
        .invoke({
          content: state.load.description || state.description,
        });

    const image = await (
      await getImageModel(state.body.organizationId)
    ).invoke(generatedTextToBeSentToDallE);

    return { ...state, image };
  }

  async schedulePost(state: WorkflowChannelsState) {
    const nextTime = await this._postsService.findFreeDateTime(
      state.integrations[0].organizationId
    );

    await this._postsService.createPost(
      state.integrations[0].organizationId,
      {
        date: nextTime + 'Z',
        order: makeId(10),
        shortLink: false,
        type: 'draft',
        tags: [],
        posts: state.integrations.map((i) => ({
          settings: {
            __type: i.providerIdentifier as any,
            title: '',
            tags: [],
            subreddit: [],
          },
          group: makeId(10),
          researchSources: state.research?.sources || [],
          integration: { id: i.id },
          value: [
            {
              id: makeId(10),
              delay: 0,
              // Published verbatim: expanding line breaks here would push the
              // post past the budget the prompt was given, by one character per
              // break.
              content: state.description + '\n\n' + state.load.url,
              image: !state.image
                ? []
                : [
                    {
                      id: makeId(10),
                      name: makeId(10),
                      path: state.image,
                      organizationId: state.integrations[0].organizationId,
                    },
                  ],
            },
          ],
        })),
      },
      'AUTOPOST'
    );
  }

  async updateUrl(state: WorkflowChannelsState) {
    await this._autopostsRepository.updateUrl(state.id, state.load.url);
  }

  /**
   * Facts and quotations from outside, and nothing else.
   *
   * The brand voice used to be the first line of this block, under the words
   * "untrusted reference data" — the same defect the draft generator carried,
   * in a second place. Untrusted means material the product fetched on
   * somebody else's behalf; the voice is authorised by the space itself and is
   * an instruction. It now goes in with the instructions, above.
   */
  private renderContentContext(context: ContentContextEnvelopeResultV1) {
    return [
      'BEGIN SERVER CONTENT CONTEXT (untrusted reference data)',
      ...context.facts.map(
        (fact) => `[${fact.citationId}] FACT: ${fact.statement}`
      ),
      ...context.evidence.map(
        (evidence) =>
          `[${evidence.citationId}] EVIDENCE: ${evidence.title}\n${evidence.excerpt}`
      ),
      'END SERVER CONTENT CONTEXT',
    ].join('\n');
  }

  async startAutopostDraftV2(organizationId: string, id: string) {
    const autoPost = await this._autopostsRepository.getAutopostDraftV2(
      organizationId,
      id
    );
    if (!autoPost || !autoPost.active || autoPost.requiresAttention) {
      return { type: 'draft' as const, created: false };
    }
    const source = autoPost.contentSource;
    if (
      !source ||
      source.organizationId !== organizationId ||
      source.desiredState !== 'ACTIVE' ||
      source.archivedAt ||
      source.purgedAt ||
      !source.currentSnapshotId
    ) {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return {
        type: 'draft' as const,
        created: false,
        errorCode: 'CONTENT_EVIDENCE_REQUIRED' as const,
      };
    }
    if (autoPost.lastUrl === source.currentSnapshotId) {
      return { type: 'draft' as const, created: false };
    }

    let contentContext: ContentContextEnvelopeResultV1;
    try {
      contentContext = await this.contentContexts.build(organizationId, {
        consumer: 'AUTOPOST',
        purpose: 'DRAFT_CREATE',
        query: autoPost.content || autoPost.title,
        language: autoPost.language === 'ru' ? 'ru' : 'en',
        freshnessMode: 'REQUIRE_CURRENT',
        sourceIds: [source.id],
        brandProfileSelection: {
          mode: 'version',
          versionId: autoPost.brandProfileVersionId!,
        },
      });
    } catch (error: any) {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return {
        type: 'draft' as const,
        created: false,
        errorCode:
          (error?.response?.code || error?.code) ===
          'BRAND_PROFILE_VERSION_UNAVAILABLE'
            ? ('BRAND_PROFILE_VERSION_UNAVAILABLE' as const)
            : ('CONTENT_EVIDENCE_REQUIRED' as const),
      };
    }
    if (contentContext.generationPolicy === 'EVIDENCE_REQUIRED') {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return {
        type: 'draft' as const,
        created: false,
        errorCode: 'CONTENT_EVIDENCE_REQUIRED' as const,
      };
    }
    let resolvedBrandProfile: ResolvedBrandProfileContextV1;
    try {
      resolvedBrandProfile = await this.brandProfileContexts.resolve(
        organizationId,
        {
          mode: 'version',
          versionId: autoPost.brandProfileVersionId!,
        }
      );
    } catch {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return {
        type: 'draft' as const,
        created: false,
        errorCode: 'BRAND_PROFILE_VERSION_UNAVAILABLE' as const,
      };
    }

    let generated = {
      content: autoPost.content || autoPost.title,
      usedCitationIds: [] as string[],
    };
    if (autoPost.generateContent) {
      generated = await this.aiUsage.executeAiOperation(
        organizationId,
        'autopost',
        async () => {
          const model = (
            await getChatModel(organizationId, 0.7)
          ).withStructuredOutput(groundedAutoPostContent);
          const output = await ChatPromptTemplate.fromTemplate(
            `Create one social media draft from the server context.
             ${contentLanguageInstruction(
               autoPost.language === 'ru' ? 'ru' : 'en'
             )}
             {voice}
             Return only citation ids actually used.
             {context}`
          )
            .pipe(model)
            .invoke({
              // A template value and not an interpolation: the lines carry the
              // author's own prose, and a brace in it would be read as a
              // placeholder and fail the draft.
              voice: voiceInstructionLines(
                (resolvedBrandProfile.effectiveVoice || {}) as EffectiveVoice
              )
                .map((line) => `- ${line}`)
                .join('\n             '),
              context: this.renderContentContext(contentContext),
            });
          return {
            content: output.content || '',
            usedCitationIds: output.usedCitationIds || [],
          };
        }
      );
    }
    const allowedCitationIds = new Set([
      ...contentContext.facts.map((item) => item.citationId),
      ...contentContext.evidence.map((item) => item.citationId),
    ]);
    const usedCitationIds = [...new Set(generated.usedCitationIds)].filter(
      (citationId) => allowedCitationIds.has(citationId)
    );
    if (
      usedCitationIds.length !== new Set(generated.usedCitationIds).size ||
      (autoPost.generateContent &&
        allowedCitationIds.size > 0 &&
        usedCitationIds.length === 0)
    ) {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return {
        type: 'draft' as const,
        created: false,
        errorCode: 'CONTENT_CONTEXT_CITATIONS_INVALID' as const,
      };
    }

    const integrations = await this._integrationService.getIntegrationsList(
      organizationId
    );
    const requestedIntegrations = JSON.parse(autoPost.integrations || '[]');
    const selected = integrations.filter((integration) =>
      requestedIntegrations.some((item: any) => item.id === integration.id)
    );
    if (!selected.length) {
      await this._autopostsRepository.markDraftV2RequiresAttention(
        organizationId,
        id
      );
      return { type: 'draft' as const, created: false };
    }
    const nextTime = await this._postsService.findFreeDateTime(organizationId);
    const brandProfileVersionId =
      contentContext.profile.mode === 'resolved'
        ? contentContext.profile.versionId
        : undefined;
    const result = await this.postsRepository.createAutopostV2DraftAtomic({
      organizationId,
      autoPostId: id,
      sourceSnapshotId: source.currentSnapshotId,
      date: nextTime + 'Z',
      posts: selected.map((integration) => ({
        group: undefined as any,
        settings: {
          __type: integration.providerIdentifier as any,
          title: '',
          tags: [],
          subreddit: [],
        },
        researchSources: contentContext.evidence
          .filter((evidence) => evidence.url)
          .map((evidence) => ({
            title: evidence.title,
            url: evidence.url!,
            publishedAt: evidence.publishedAt || undefined,
          })),
        integration: { id: integration.id },
        contentContextSnapshotId: contentContext.contentContextSnapshotId,
        brandProfileVersionId,
        value: [
          {
            id: undefined as any,
            delay: 0,
            content: generated.content,
            image: [],
            usedCitationIds,
          },
        ],
      })),
    });
    return { type: 'draft' as const, ...result };
  }

  async startAutopost(id: string) {
    const getPost = await this._autopostsRepository.getAutopost(id);
    if (!getPost || !getPost.active) {
      return;
    }

    const load = await this.loadXML(getPost.url);
    if (!load.success || load.url === getPost.lastUrl) {
      return;
    }

    const integrations = await this._integrationService.getIntegrationsList(
      getPost.organizationId
    );

    const parseIntegrations = JSON.parse(getPost.integrations || '[]') || [];
    const neededIntegrations = integrations.filter((i) =>
      parseIntegrations.some((ii: any) => ii.id === i.id)
    );

    const integrationsToSend =
      parseIntegrations.length === 0 ? integrations : neededIntegrations;
    if (integrationsToSend.length === 0) {
      return;
    }

    const state = AutopostService.state();
    const workflow = state
      .addNode('enrich-with-research', this.enrichWithResearch.bind(this))
      .addNode('generate-description', this.generateDescription.bind(this))
      .addNode('generate-picture', this.generatePicture.bind(this))
      .addNode('schedule-post', this.schedulePost.bind(this))
      .addNode('update-url', this.updateUrl.bind(this))
      .addEdge(START, 'enrich-with-research')
      .addEdge('enrich-with-research', 'generate-description')
      .addConditionalEdges(
        'generate-description',
        (state: WorkflowChannelsState) => {
          if (!state.description) {
            return 'schedule-post';
          }
          if (state.body.addPicture) {
            return 'generate-picture';
          }
          return 'schedule-post';
        }
      )
      .addEdge('generate-picture', 'schedule-post')
      .addEdge('schedule-post', 'update-url')
      .addEdge('update-url', END);

    const app = workflow.compile();
    await this.aiUsage.executeAiOperation(
      getPost.organizationId,
      'autopost',
      () =>
        app.invoke({
          messages: [],
          id,
          body: getPost,
          load,
          integrations: integrationsToSend,
        })
    );
  }
}
