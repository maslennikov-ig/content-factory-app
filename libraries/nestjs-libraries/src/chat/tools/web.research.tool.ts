import { Injectable, Logger } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentToolInterface } from '@contentfactory/nestjs-libraries/chat/agent.tool.interface';
import { checkAuth } from '@contentfactory/nestjs-libraries/chat/auth.context';
import {
  WebResearchService,
  WebSearchNotConfigured,
} from '@contentfactory/nestjs-libraries/openai/web.research.service';

@Injectable()
export class WebResearchTool implements AgentToolInterface {
  private readonly logger = new Logger(WebResearchTool.name);

  constructor(private _webResearchService: WebResearchService) {}

  name = 'webResearchTool';

  run() {
    return createTool({
      id: this.name,
      description: `Research a subject on the web and return normalized facts with source URLs and publication dates.
Use it when the user asks for current or externally verifiable material before writing a post.
If the result says search is unavailable, tell the user that web research is disabled and continue only with information the user supplied; do not imply that the answer is current.`,
      mcp: {
        annotations: {
          title: 'Web Research',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        subject: z.string().min(1).describe('The subject to research'),
      }),
      outputSchema: z.object({
        available: z.boolean(),
        provider: z.enum(['tavily', 'openrouter', 'mixed']).optional(),
        summary: z.string().optional(),
        facts: z
          .array(
            z.object({
              text: z.string(),
              sourceUrl: z.string().url(),
            })
          )
          .optional(),
        sources: z
          .array(
            z.object({
              title: z.string(),
              url: z.string().url(),
              publishedAt: z.string().nullable(),
              provider: z.enum(['tavily', 'openrouter']),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organization = JSON.parse(
          (context?.requestContext as any)?.get('organization') || '{}'
        );
        if (!organization.id) {
          return { available: false, error: 'Organization is unavailable.' };
        }

        try {
          return {
            available: true,
            ...(await this._webResearchService.research(
              organization.id,
              inputData.subject
            )),
          };
        } catch (error) {
          if (error instanceof WebSearchNotConfigured) {
            return {
              available: false,
              error:
                'Web research is disabled for this workspace. I cannot verify current information; enable search in Settings → AI provider or provide the source material.',
            };
          }

          // A rate limit or a timeout at the search provider is a temporary
          // outage of one optional capability, not a reason to fail the whole
          // conversation turn.
          this.logger.warn('Web research call failed', error);
          return {
            available: false,
            error:
              'Web research did not answer this time. I cannot verify current information; try again later or provide the source material.',
          };
        }
      },
    });
  }
}
